"""Response language: Spanish (default) or English.

The browser sends the chosen language in Accept-Language. A middleware stores it in a context variable
so any function that builds text for the farmer can pick with `t(es, en)` without passing the language around.
Disk caches that store text use `cache_suffix()` so languages don't get mixed.
"""
import contextvars
from typing import Callable, TypeVar

LANG: contextvars.ContextVar[str] = contextvars.ContextVar("lang", default="es")

R = TypeVar("R")


def parse(header: str | None) -> str:
    """First language in the header: English if it starts with 'en'; anything else, Spanish."""
    first = (header or "").split(",")[0].strip().lower()
    return "en" if first.startswith("en") else "es"


def lang() -> str:
    return LANG.get()


def t(es: str, en: str) -> str:
    """The text in the current request's language."""
    return en if LANG.get() == "en" else es


def cache_suffix() -> str:
    """Suffix for cache keys holding text. Empty in Spanish, so the caches already stored keep working."""
    return "" if LANG.get() == "es" else f"_{LANG.get()}"


def in_ctx(fn: Callable[..., R]) -> Callable[..., R]:
    """Wraps a function to run it in another thread with the request's language (threads don't inherit the context)."""
    ctx = contextvars.copy_context()

    def run(*a, **k):
        return ctx.copy().run(fn, *a, **k)

    return run


class LangMiddleware:
    """ASGI middleware: sets the request's language from Accept-Language."""

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
