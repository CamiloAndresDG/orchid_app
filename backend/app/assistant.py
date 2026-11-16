"""ORCHID Guide: AI chat grounded in the platform's sources.

Providers (ASSISTANT_PROVIDER): an OpenAI model on Microsoft Foundry (gpt-5-mini, the default), Claude on
Microsoft Foundry, or the Claude API directly.

Flow per question: the model decides which tools to query, the server runs them with ORCHID's code,
the model answers citing the results, and the server streams the text (SSE) to the browser along with the list
of sources that were actually consulted.
"""
import json
import logging
from datetime import date
from functools import lru_cache
from typing import Literal

import anthropic
from anthropic import BetaRefusalFallbackMiddleware
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .accounts import current_user
from .assistant_prompt import SYSTEM_PROMPT
from .assistant_tools import STATUS, STATUS_EN, TOOLS, ToolContext, run_tool
from .i18n import LANG, t
from .config import (ASSISTANT_DAILY_LIMIT, ASSISTANT_FALLBACK_MODEL, ASSISTANT_MODEL, ASSISTANT_PROVIDER,
                     AZURE_OPENAI_API_VERSION, FOUNDRY_RESOURCE, FOUNDRY_RESOURCE_ID, FOUNDRY_TOKEN_SCOPE,
                     assistant_enabled)
from .db import AssistantUsage, User, get_db

log = logging.getLogger("orchid.assistant")
router = APIRouter(prefix="/assistant")

MAX_TOOL_ROUNDS = 8      # cap on tool round trips per question
MAX_TOKENS = 32000       # with streaming there's no timeout risk; the requested answers are short


def _azure_token_provider():
    # No keys: managed identity on Azure Container Apps, `az login` locally.
    from azure.identity import DefaultAzureCredential, get_bearer_token_provider

    return get_bearer_token_provider(DefaultAzureCredential(), FOUNDRY_TOKEN_SCOPE)


@lru_cache(maxsize=1)
def _foundry_key() -> str:
    """Foundry resource key read with the backend's identity (Contributor role) through the Azure API.
    Used when the subscription doesn't allow assigning the data role. Lives only in memory: never stored or logged."""
    import httpx
    from azure.identity import DefaultAzureCredential

    token = DefaultAzureCredential().get_token("https://management.azure.com/.default").token
    r = httpx.post(f"https://management.azure.com{FOUNDRY_RESOURCE_ID}/listKeys?api-version=2023-05-01",
                   headers={"Authorization": f"Bearer {token}"}, timeout=30)
    r.raise_for_status()
    return r.json()["key1"]


def _foundry_auth() -> dict:
    return {"api_key": _foundry_key()} if FOUNDRY_RESOURCE_ID else {"azure_ad_token_provider": _azure_token_provider()}


@lru_cache(maxsize=1)
def _client() -> anthropic.Anthropic:
    middleware = [BetaRefusalFallbackMiddleware([{"model": ASSISTANT_FALLBACK_MODEL}])] if ASSISTANT_FALLBACK_MODEL else None
    if ASSISTANT_PROVIDER == "foundry":
        return anthropic.AnthropicFoundry(resource=FOUNDRY_RESOURCE, middleware=middleware, timeout=300,
                                          **_foundry_auth())
    return anthropic.Anthropic(middleware=middleware, timeout=300)


@lru_cache(maxsize=1)
def _openai_client():
    from openai import AzureOpenAI

    return AzureOpenAI(azure_endpoint=f"https://{FOUNDRY_RESOURCE}.cognitiveservices.azure.com/",
                       api_version=AZURE_OPENAI_API_VERSION, timeout=300, max_retries=2, **_foundry_auth())


# ---------- Schemas ----------


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class MapPoint(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class ChatRequest(BaseModel):
    messages: list[Turn] = Field(min_length=1, max_length=20)
    map_point: MapPoint | None = None
    lang: Literal["es", "en"] | None = None  # if missing, the one from Accept-Language


# ---------- Endpoints ----------


@router.get("/status")
def status():
    return {"enabled": assistant_enabled(), "daily_limit": ASSISTANT_DAILY_LIMIT}


def _plot_snapshot(user: User) -> dict | None:
    p = user.plot
    if p is None:
        return None
    return {"name": p.name, "acres": "" if p.acres is None else f"{p.acres:g}", "irrigated": p.irrigated,
            "point": {"lat": p.lat, "lon": p.lon} if p.lat is not None and p.lon is not None else None,
            "history": p.history or [], "econ": p.econ or {}}


def _count_question(db: Session, user: User) -> int:
    """Adds one question to today's count and returns how many are left. 429 if none are left."""
    today = date.today()
    row = db.get(AssistantUsage, (user.id, today))
    used = row.count if row else 0
    if used >= ASSISTANT_DAILY_LIMIT:
        raise HTTPException(429, t(f"Llegaste al límite de {ASSISTANT_DAILY_LIMIT} preguntas por hoy. Vuelve mañana.",
                                   f"You reached the limit of {ASSISTANT_DAILY_LIMIT} questions for today. Come back tomorrow."))
    if row is None:
        row = AssistantUsage(user_id=user.id, day=today, count=0)
        db.add(row)
    row.count = used + 1
    db.commit()
    return ASSISTANT_DAILY_LIMIT - row.count


@router.post("/chat")
def chat(req: ChatRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not assistant_enabled():
        raise HTTPException(503, t("La Guía todavía no está configurada en este servidor.", "The Guide isn't set up on this server yet."))
    if req.messages[-1].role != "user":
        raise HTTPException(400, t("El último mensaje debe ser del agricultor.", "The last message must be from the farmer."))
    remaining = _count_question(db, user)
    # Everything the generator needs is read now: the database session doesn't live through the streaming.
    ctx = ToolContext(plot=_plot_snapshot(user), map_point=req.map_point.model_dump() if req.map_point else None,
                      lang=req.lang or LANG.get())
    stream = _stream_openai if ASSISTANT_PROVIDER == "azure_openai" else _stream
    return StreamingResponse(stream(req.messages, ctx, remaining), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------- Conversation with Claude ----------


def _sse(obj: dict) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


def _session_note(ctx: ToolContext) -> str:
    """Context for this conversation. It goes in the user message so it doesn't break the fixed prompt's cache."""
    has_plot = bool(ctx.plot and ctx.plot.get("point"))
    lines = [f"Fecha de hoy: {date.today().isoformat()}.",
             "El agricultor tiene un terreno guardado en ORCHID (consúltalo con mi_terreno)." if has_plot
             else "El agricultor todavía no guardó un terreno en ORCHID."]
    if ctx.map_point:
        lines.append("Tiene un punto marcado en el mapa (aparece en mi_terreno).")
    if ctx.lang == "en":
        lines.append("Idioma: el agricultor usa ORCHID en inglés. Responde en inglés claro y sencillo (el mismo rol y las "
                     "mismas reglas), aunque los datos de las herramientas vengan en español.")
    else:
        lines.append("Idioma: responde en español.")
    return "<contexto_de_la_sesion>\n" + "\n".join(lines) + "\n</contexto_de_la_sesion>"


def _build_messages(turns: list[Turn], ctx: ToolContext) -> list[dict]:
    msgs: list[dict] = [{"role": t.role, "content": t.content} for t in turns]
    # The conversation must start with the user; stray replies at the start are dropped.
    while msgs and msgs[0]["role"] != "user":
        msgs.pop(0)
    last = msgs[-1]
    last["content"] = [{"type": "text", "text": _session_note(ctx)}, {"type": "text", "text": last["content"]}]
    return msgs


def _echo_content(content: list) -> list:
    """Turn content to send back to Claude. If there was a switch to the fallback model mid-answer, the reasoning
    and tool blocks before the last `fallback` block are dropped (that block stays in place), as the API requires."""
    idx = [i for i, b in enumerate(content) if getattr(b, "type", None) == "fallback"]
    if not idx:
        return list(content)
    cut = idx[-1]
    drop = {"thinking", "redacted_thinking", "tool_use"}
    return [b for i, b in enumerate(content) if i >= cut or getattr(b, "type", None) not in drop]


MSG = {
    "es": {
        "retry": "Reintentando…",
        "refusal": "No puedo ayudar con esa consulta. Puedo responder sobre tu terreno, el clima, el suelo y los cultivos.",
        "cut": "(La respuesta quedó cortada. Pídeme que la resuma.)",
        "unfinished": "(No pude terminar la consulta. Intenta con una pregunta más corta.)",
        "steps": "(La consulta necesitó demasiados pasos. Prueba a dividir la pregunta.)",
        "busy": "La Guía está muy ocupada en este momento. Intenta de nuevo en un minuto.",
        "conn": "No pudimos conectar con el servicio de IA. Intenta de nuevo.",
        "api": "El servicio de IA respondió con un error. Intenta de nuevo más tarde.",
        "auth": "El servicio de IA no aceptó la conexión. Intenta de nuevo en un momento.",
        "fail": "Algo falló al preparar la respuesta. Intenta de nuevo.",
        "data": "Consultando datos",
    },
    "en": {
        "retry": "Retrying…",
        "refusal": "I can't help with that. I can answer about your field, the weather, the soil and crops.",
        "cut": "(The answer got cut off. Ask me to summarize it.)",
        "unfinished": "(I couldn't finish the lookup. Try a shorter question.)",
        "steps": "(The lookup took too many steps. Try splitting the question.)",
        "busy": "The Guide is very busy right now. Try again in a minute.",
        "conn": "We couldn't reach the AI service. Try again.",
        "api": "The AI service returned an error. Try again later.",
        "auth": "The AI service didn't accept the connection. Try again in a moment.",
        "fail": "Something went wrong preparing the answer. Try again.",
        "data": "Getting data",
    },
}


def _msg(ctx: ToolContext, key: str) -> str:
    return MSG["en" if ctx.lang == "en" else "es"][key]


def _status(ctx: ToolContext, name: str) -> str:
    table = STATUS_EN if ctx.lang == "en" else STATUS
    return table.get(name, _msg(ctx, "data")) + "…"


def _run_tool(name, args, ctx: ToolContext, call_id):
    """Runs the tool with the conversation's language (the streaming runs outside the request context)."""
    token = LANG.set(ctx.lang)
    try:
        return run_tool(name, args, ctx, call_id)
    finally:
        LANG.reset(token)


def _stream(turns: list[Turn], ctx: ToolContext, remaining: int):
    messages = _build_messages(turns, ctx)
    client = _client()
    try:
        # No BetaFallbackState: its context variable doesn't survive between streaming chunks. The middleware
        # still retries every rejected request with the fallback model.
        for _ in range(MAX_TOOL_ROUNDS):
            final = None
            for attempt in range(2):
                try:
                    with client.beta.messages.stream(
                        model=ASSISTANT_MODEL,
                        max_tokens=MAX_TOKENS,
                        system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
                        tools=TOOLS,
                        messages=messages,
                        thinking={"type": "adaptive"},
                        output_config={"effort": "medium"},
                    ) as stream:
                        for event in stream:
                            if event.type == "text":
                                yield _sse({"type": "text", "text": event.text})
                        final = stream.get_final_message()
                    break
                except ValueError:
                    # Tool JSON the SDK couldn't parse (eager streaming): the round is retried once.
                    if attempt == 1:
                        raise
                    yield _sse({"type": "status", "text": _msg(ctx, "retry")})
            content = _echo_content(final.content)
            messages.append({"role": "assistant", "content": content})

            if final.stop_reason == "refusal":
                yield _sse({"type": "text", "text": "\n\n" + _msg(ctx, "refusal")})
                break
            tool_uses = [b for b in content if b.type == "tool_use"]
            if not tool_uses:
                if final.stop_reason == "max_tokens":
                    yield _sse({"type": "text", "text": "\n\n" + _msg(ctx, "cut")})
                break
            if final.stop_reason == "max_tokens":
                # The tool input may arrive truncated: it isn't run.
                yield _sse({"type": "text", "text": "\n\n" + _msg(ctx, "unfinished")})
                break
            results = []
            for tu in tool_uses:
                yield _sse({"type": "status", "text": _status(ctx, tu.name)})
                results.append(_run_tool(tu.name, tu.input, ctx, tu.id))
            messages.append({"role": "user", "content": results})
        else:
            yield _sse({"type": "text", "text": "\n\n" + _msg(ctx, "steps")})
    except anthropic.RateLimitError:
        yield _sse({"type": "error", "text": _msg(ctx, "busy")})
    except anthropic.APIConnectionError:
        yield _sse({"type": "error", "text": _msg(ctx, "conn")})
    except anthropic.APIStatusError as e:
        log.warning("Error del servicio de IA: %s %s", e.status_code, getattr(e, "message", ""))
        yield _sse({"type": "error", "text": _msg(ctx, "api")})
    except Exception:  # noqa: BLE001 - the browser always gets a clean close
        log.exception("Fallo inesperado en la Guía")
        yield _sse({"type": "error", "text": _msg(ctx, "fail")})
    yield _sse({"type": "sources", "items": ctx.sources()})
    yield _sse({"type": "done", "remaining": remaining})


# ---------- Azure OpenAI (gpt-5-mini) ----------

OPENAI_TOOLS = [{"type": "function", "function": {"name": t["name"], "description": t["description"],
                                                  "parameters": t["input_schema"]}} for t in TOOLS]


def _stream_openai(turns: list[Turn], ctx: ToolContext, remaining: int):
    import openai

    msgs: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    msgs += [{"role": t.role, "content": t.content} for t in turns]
    while len(msgs) > 1 and msgs[1]["role"] != "user":
        msgs.pop(1)
    msgs[-1] = {"role": "user", "content": _session_note(ctx) + "\n\n" + msgs[-1]["content"]}
    client = _openai_client()
    try:
        for _ in range(MAX_TOOL_ROUNDS):
            text, calls, finish = "", {}, None
            stream = client.chat.completions.create(
                model=ASSISTANT_MODEL, messages=msgs, tools=OPENAI_TOOLS, stream=True,
                max_completion_tokens=16000,  # includes the model's internal reasoning
                reasoning_effort="low",
            )
            for chunk in stream:
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                d = choice.delta
                if d is not None and d.content:
                    text += d.content
                    yield _sse({"type": "text", "text": d.content})
                for tc in (d.tool_calls or []) if d is not None else []:
                    c = calls.setdefault(tc.index, {"id": "", "name": "", "args": ""})
                    if tc.id:
                        c["id"] = tc.id
                    if tc.function and tc.function.name:
                        c["name"] += tc.function.name
                    if tc.function and tc.function.arguments:
                        c["args"] += tc.function.arguments
                finish = choice.finish_reason or finish
            if finish == "content_filter":
                yield _sse({"type": "text", "text": "\n\n" + _msg(ctx, "refusal")})
                break
            ordered = [calls[i] for i in sorted(calls)]
            assistant_msg = {"role": "assistant", "content": text or None}
            if ordered:
                assistant_msg["tool_calls"] = [{"id": c["id"], "type": "function",
                                                "function": {"name": c["name"], "arguments": c["args"] or "{}"}}
                                               for c in ordered]
            msgs.append(assistant_msg)
            if not ordered:
                if finish == "length":
                    yield _sse({"type": "text", "text": "\n\n" + _msg(ctx, "cut")})
                break
            if finish == "length":
                yield _sse({"type": "text", "text": "\n\n" + _msg(ctx, "unfinished")})
                break
            for c in ordered:
                yield _sse({"type": "status", "text": _status(ctx, c["name"])})
                try:
                    args = json.loads(c["args"] or "{}")
                except json.JSONDecodeError:
                    args = c["args"]  # run_tool rejects it as invalid input and the model can correct it
                r = _run_tool(c["name"], args, ctx, c["id"])
                msgs.append({"role": "tool", "tool_call_id": c["id"], "content": r["content"]})
        else:
            yield _sse({"type": "text", "text": "\n\n" + _msg(ctx, "steps")})
    except openai.RateLimitError:
        yield _sse({"type": "error", "text": _msg(ctx, "busy")})
    except openai.APIConnectionError:
        yield _sse({"type": "error", "text": _msg(ctx, "conn")})
    except openai.BadRequestError as e:
        if "content_filter" in str(e) or "content management policy" in str(e):
            yield _sse({"type": "text", "text": _msg(ctx, "refusal")})
        else:
            log.warning("Petición rechazada por Azure OpenAI: %s", e)
            yield _sse({"type": "error", "text": _msg(ctx, "api")})
    except openai.AuthenticationError:
        # Key rotated or permission removed: the next question reads the key again.
        _foundry_key.cache_clear()
        _openai_client.cache_clear()
        yield _sse({"type": "error", "text": _msg(ctx, "auth")})
    except openai.APIStatusError as e:
        log.warning("Error de Azure OpenAI: %s", e)
        yield _sse({"type": "error", "text": _msg(ctx, "api")})
    except Exception:  # noqa: BLE001 - the browser always gets a clean close
        log.exception("Fallo inesperado en la Guía")
        yield _sse({"type": "error", "text": _msg(ctx, "fail")})
    yield _sse({"type": "sources", "items": ctx.sources()})
    yield _sse({"type": "done", "remaining": remaining})
