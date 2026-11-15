"""Idioma de la respuesta: español (por defecto) o inglés.

El navegador manda el idioma elegido en Accept-Language. Un middleware lo guarda en una variable de contexto
para que cualquier función que arme texto para el agricultor elija con `t(es, en)` sin pasar el idioma a mano.
Las cachés en disco que guardan textos usan `cache_suffix()` para no mezclar idiomas.
"""
import contextvars
from typing import Callable, TypeVar

LANG: contextvars.ContextVar[str] = contextvars.ContextVar("lang", default="es")

R = TypeVar("R")


def parse(header: str | None) -> str:
    """Primer idioma de la cabecera: inglés si empieza por 'en'; cualquier otra cosa, español."""
    first = (header or "").split(",")[0].strip().lower()
    return "en" if first.startswith("en") else "es"


def lang() -> str:
    return LANG.get()


def t(es: str, en: str) -> str:
    """El texto en el idioma de la petición en curso."""
    return en if LANG.get() == "en" else es


def cache_suffix() -> str:
    """Sufijo para claves de caché con texto. Vacío en español, así las cachés ya guardadas siguen sirviendo."""
    return "" if LANG.get() == "es" else f"_{LANG.get()}"


def in_ctx(fn: Callable[..., R]) -> Callable[..., R]:
    """Envuelve una función para correrla en otro hilo con el idioma de la petición (los hilos no heredan el contexto)."""
    ctx = contextvars.copy_context()

    def run(*a, **k):
        return ctx.copy().run(fn, *a, **k)

    return run


class LangMiddleware:
    """Middleware ASGI: fija el idioma de la petición a partir de Accept-Language."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        header = next((v.decode("latin-1") for k, v in scope.get("headers", []) if k == b"accept-language"), None)
        token = LANG.set(parse(header))
        try:
            await self.app(scope, receive, send)
        finally:
            LANG.reset(token)
