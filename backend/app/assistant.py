"""Guía de Orchid: chat con IA anclado a las fuentes de la plataforma.

Proveedores (ASSISTANT_PROVIDER): un modelo de OpenAI en Microsoft Foundry (gpt-5-mini, predeterminado), Claude en
Microsoft Foundry o el API directo de Claude.

Flujo por pregunta: el modelo decide qué herramientas consultar, el servidor las ejecuta con el código de Orchid,
el modelo responde citando los resultados, y el servidor envía al navegador el texto (SSE) y la lista de fuentes
que de verdad se consultaron.
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
from .assistant_tools import STATUS, TOOLS, ToolContext, run_tool
from .config import (ASSISTANT_DAILY_LIMIT, ASSISTANT_FALLBACK_MODEL, ASSISTANT_MODEL, ASSISTANT_PROVIDER,
                     AZURE_OPENAI_API_VERSION, FOUNDRY_RESOURCE, FOUNDRY_TOKEN_SCOPE, assistant_enabled)
from .db import AssistantUsage, User, get_db

log = logging.getLogger("orchid.assistant")
router = APIRouter(prefix="/assistant")

MAX_TOOL_ROUNDS = 8      # tope de idas y vueltas con herramientas por pregunta
MAX_TOKENS = 32000       # con streaming no hay riesgo de timeout; las respuestas pedidas son cortas


def _azure_token_provider():
    # Sin claves: identidad administrada en Azure Container Apps, `az login` en local.
    from azure.identity import DefaultAzureCredential, get_bearer_token_provider

    return get_bearer_token_provider(DefaultAzureCredential(), FOUNDRY_TOKEN_SCOPE)


@lru_cache(maxsize=1)
def _client() -> anthropic.Anthropic:
    middleware = [BetaRefusalFallbackMiddleware([{"model": ASSISTANT_FALLBACK_MODEL}])] if ASSISTANT_FALLBACK_MODEL else None
    if ASSISTANT_PROVIDER == "foundry":
        return anthropic.AnthropicFoundry(resource=FOUNDRY_RESOURCE, azure_ad_token_provider=_azure_token_provider(),
                                          middleware=middleware, timeout=300)
    return anthropic.Anthropic(middleware=middleware, timeout=300)


@lru_cache(maxsize=1)
def _openai_client():
    from openai import AzureOpenAI

    return AzureOpenAI(azure_endpoint=f"https://{FOUNDRY_RESOURCE}.cognitiveservices.azure.com/",
                       azure_ad_token_provider=_azure_token_provider(), api_version=AZURE_OPENAI_API_VERSION,
                       timeout=300, max_retries=2)


# ---------- Esquemas ----------


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class MapPoint(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class ChatRequest(BaseModel):
    messages: list[Turn] = Field(min_length=1, max_length=20)
    map_point: MapPoint | None = None


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
    """Suma una pregunta al día de hoy y devuelve cuántas quedan. 429 si ya no quedan."""
    today = date.today()
    row = db.get(AssistantUsage, (user.id, today))
    used = row.count if row else 0
    if used >= ASSISTANT_DAILY_LIMIT:
        raise HTTPException(429, f"Llegaste al límite de {ASSISTANT_DAILY_LIMIT} preguntas por hoy. Vuelve mañana.")
    if row is None:
        row = AssistantUsage(user_id=user.id, day=today, count=0)
        db.add(row)
    row.count = used + 1
    db.commit()
    return ASSISTANT_DAILY_LIMIT - row.count


@router.post("/chat")
def chat(req: ChatRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not assistant_enabled():
        raise HTTPException(503, "La Guía todavía no está configurada en este servidor.")
    if req.messages[-1].role != "user":
        raise HTTPException(400, "El último mensaje debe ser del agricultor.")
    remaining = _count_question(db, user)
    # Todo lo que el generador necesita se lee ahora: la sesión de base de datos no vive durante el streaming.
    ctx = ToolContext(plot=_plot_snapshot(user), map_point=req.map_point.model_dump() if req.map_point else None)
    stream = _stream_openai if ASSISTANT_PROVIDER == "azure_openai" else _stream
    return StreamingResponse(stream(req.messages, ctx, remaining), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------- Conversación con Claude ----------


def _sse(obj: dict) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


def _session_note(ctx: ToolContext) -> str:
    """Contexto de esta conversación. Va en el mensaje del usuario para no romper la caché del prompt fijo."""
    has_plot = bool(ctx.plot and ctx.plot.get("point"))
    lines = [f"Fecha de hoy: {date.today().isoformat()}.",
             "El agricultor tiene un terreno guardado en Orchid (consúltalo con mi_terreno)." if has_plot
             else "El agricultor todavía no guardó un terreno en Orchid."]
    if ctx.map_point:
        lines.append("Tiene un punto marcado en el mapa (aparece en mi_terreno).")
    return "<contexto_de_la_sesion>\n" + "\n".join(lines) + "\n</contexto_de_la_sesion>"


def _build_messages(turns: list[Turn], ctx: ToolContext) -> list[dict]:
    msgs: list[dict] = [{"role": t.role, "content": t.content} for t in turns]
    # La conversación debe empezar con el usuario; se descartan respuestas sueltas al inicio.
    while msgs and msgs[0]["role"] != "user":
        msgs.pop(0)
    last = msgs[-1]
    last["content"] = [{"type": "text", "text": _session_note(ctx)}, {"type": "text", "text": last["content"]}]
    return msgs


def _echo_content(content: list) -> list:
    """Contenido del turno para reenviarlo a Claude. Si hubo cambio al modelo de respaldo a mitad de respuesta,
    se omiten los bloques de razonamiento y de herramienta anteriores al último bloque `fallback` (que se conserva
    en su lugar), como exige el API."""
    idx = [i for i, b in enumerate(content) if getattr(b, "type", None) == "fallback"]
    if not idx:
        return list(content)
    cut = idx[-1]
    drop = {"thinking", "redacted_thinking", "tool_use"}
    return [b for i, b in enumerate(content) if i >= cut or getattr(b, "type", None) not in drop]


def _stream(turns: list[Turn], ctx: ToolContext, remaining: int):
    messages = _build_messages(turns, ctx)
    client = _client()
    try:
        # Sin BetaFallbackState: su variable de contexto no sobrevive entre fragmentos del streaming. El middleware
        # igual reintenta cada petición rechazada con el modelo de respaldo.
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
                    # JSON de una herramienta que el SDK no pudo leer (eager streaming): se repite la ronda una vez.
                    if attempt == 1:
                        raise
                    yield _sse({"type": "status", "text": "Reintentando…"})
            content = _echo_content(final.content)
            messages.append({"role": "assistant", "content": content})

            if final.stop_reason == "refusal":
                yield _sse({"type": "text", "text": "\n\nNo puedo ayudar con esa consulta. Puedo responder sobre "
                                                    "tu terreno, el clima, el suelo y los cultivos."})
                break
            tool_uses = [b for b in content if b.type == "tool_use"]
            if not tool_uses:
                if final.stop_reason == "max_tokens":
                    yield _sse({"type": "text", "text": "\n\n(La respuesta quedó cortada. Pídeme que la resuma.)"})
                break
            if final.stop_reason == "max_tokens":
                # La entrada de la herramienta puede venir truncada: no se ejecuta.
                yield _sse({"type": "text", "text": "\n\n(No pude terminar la consulta. Intenta con una pregunta más corta.)"})
                break
            results = []
            for tu in tool_uses:
                yield _sse({"type": "status", "text": STATUS.get(tu.name, "Consultando datos") + "…"})
                results.append(run_tool(tu.name, tu.input, ctx, tu.id))
            messages.append({"role": "user", "content": results})
        else:
            yield _sse({"type": "text", "text": "\n\n(La consulta necesitó demasiados pasos. Prueba a dividir la pregunta.)"})
    except anthropic.RateLimitError:
        yield _sse({"type": "error", "text": "La Guía está muy ocupada en este momento. Intenta de nuevo en un minuto."})
    except anthropic.APIConnectionError:
        yield _sse({"type": "error", "text": "No pudimos conectar con el servicio de IA. Intenta de nuevo."})
    except anthropic.APIStatusError as e:
        log.warning("Error del servicio de IA: %s %s", e.status_code, getattr(e, "message", ""))
        yield _sse({"type": "error", "text": "El servicio de IA respondió con un error. Intenta de nuevo más tarde."})
    except Exception:  # noqa: BLE001 - el navegador siempre recibe un cierre limpio
        log.exception("Fallo inesperado en la Guía")
        yield _sse({"type": "error", "text": "Algo falló al preparar la respuesta. Intenta de nuevo."})
    yield _sse({"type": "sources", "items": ctx.sources()})
    yield _sse({"type": "done", "remaining": remaining})


# ---------- Azure OpenAI (gpt-5-mini) ----------

OPENAI_TOOLS = [{"type": "function", "function": {"name": t["name"], "description": t["description"],
                                                  "parameters": t["input_schema"]}} for t in TOOLS]
REFUSAL = ("No puedo ayudar con esa consulta. Puedo responder sobre tu terreno, el clima, el suelo y los cultivos.")


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
                max_completion_tokens=16000,  # incluye el razonamiento interno del modelo
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
                yield _sse({"type": "text", "text": "\n\n" + REFUSAL})
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
                    yield _sse({"type": "text", "text": "\n\n(La respuesta quedó cortada. Pídeme que la resuma.)"})
                break
            if finish == "length":
                yield _sse({"type": "text", "text": "\n\n(No pude terminar la consulta. Intenta con una pregunta más corta.)"})
                break
            for c in ordered:
                yield _sse({"type": "status", "text": STATUS.get(c["name"], "Consultando datos") + "…"})
                try:
                    args = json.loads(c["args"] or "{}")
                except json.JSONDecodeError:
                    args = c["args"]  # run_tool lo rechaza como entrada inválida y el modelo puede corregirla
                r = run_tool(c["name"], args, ctx, c["id"])
                msgs.append({"role": "tool", "tool_call_id": c["id"], "content": r["content"]})
        else:
            yield _sse({"type": "text", "text": "\n\n(La consulta necesitó demasiados pasos. Prueba a dividir la pregunta.)"})
    except openai.RateLimitError:
        yield _sse({"type": "error", "text": "La Guía está muy ocupada en este momento. Intenta de nuevo en un minuto."})
    except openai.APIConnectionError:
        yield _sse({"type": "error", "text": "No pudimos conectar con el servicio de IA. Intenta de nuevo."})
    except openai.BadRequestError as e:
        if "content_filter" in str(e) or "content management policy" in str(e):
            yield _sse({"type": "text", "text": REFUSAL})
        else:
            log.warning("Petición rechazada por Azure OpenAI: %s", e)
            yield _sse({"type": "error", "text": "El servicio de IA respondió con un error. Intenta de nuevo más tarde."})
    except openai.APIStatusError as e:
        log.warning("Error de Azure OpenAI: %s", e)
        yield _sse({"type": "error", "text": "El servicio de IA respondió con un error. Intenta de nuevo más tarde."})
    except Exception:  # noqa: BLE001 - el navegador siempre recibe un cierre limpio
        log.exception("Fallo inesperado en la Guía")
        yield _sse({"type": "error", "text": "Algo falló al preparar la respuesta. Intenta de nuevo."})
    yield _sse({"type": "sources", "items": ctx.sources()})
    yield _sse({"type": "done", "remaining": remaining})
