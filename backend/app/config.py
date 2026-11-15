"""Configuración por variables de entorno (local y Azure)."""
import os
from pathlib import Path

# Carpeta de caché. En Azure se monta un recurso compartido de Azure Files aquí.
CACHE_DIR = Path(os.environ.get("CACHE_DIR") or Path(__file__).resolve().parent.parent / "cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Orígenes que pueden llamar al API, separados por coma.
ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

# Clave de USDA QuickStats del servidor (opcional). Si existe, el usuario no necesita la suya.
QUICKSTATS_KEY = os.environ.get("QUICKSTATS_KEY", "").strip()
if len(QUICKSTATS_KEY) < 8:
    QUICKSTATS_KEY = ""  # vacío o marcador ("-") = sin clave del servidor

# Base de datos. En Azure: postgresql+psycopg://usuario:clave@servidor:5432/orchid?sslmode=require
# Sin DATABASE_URL se usa SQLite local (backend/instance/orchid.db) para desarrollar sin Postgres.
# (backend/data es del ETL y se versiona: no mezclar ahí la base de cuentas.)
_LOCAL_DB = Path(__file__).resolve().parent.parent / "instance" / "orchid.db"
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if not DATABASE_URL:
    _LOCAL_DB.parent.mkdir(parents=True, exist_ok=True)
    DATABASE_URL = f"sqlite:///{_LOCAL_DB.as_posix()}"
elif DATABASE_URL.startswith(("postgres://", "postgresql://")):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL.split("://", 1)[1]

# Días que dura una sesión iniciada.
SESSION_DAYS = int(os.environ.get("SESSION_DAYS", "30"))

# ---------- Guía de IA (Claude) ----------
# "foundry": Claude desplegado en Microsoft Foundry (Azure), autenticado con identidad administrada / az login.
# "anthropic": API directo de Claude (lee ANTHROPIC_API_KEY o un perfil de `ant auth login`).
ASSISTANT_PROVIDER = os.environ.get("ASSISTANT_PROVIDER", "foundry").strip().lower()
FOUNDRY_RESOURCE = os.environ.get("FOUNDRY_RESOURCE", "").strip()  # p. ej. orchid-ai-f0dbd8
FOUNDRY_TOKEN_SCOPE = os.environ.get("FOUNDRY_TOKEN_SCOPE", "https://cognitiveservices.azure.com/.default")
# En Foundry el modelo es el nombre del despliegue.
ASSISTANT_MODEL = os.environ.get("ASSISTANT_MODEL", "claude-opus-5-5").strip()
# Modelo de respaldo si el principal rechaza una petición (middleware del SDK). Vacío = sin respaldo.
ASSISTANT_FALLBACK_MODEL = os.environ.get("ASSISTANT_FALLBACK_MODEL", "claude-opus-4-8").strip()
ASSISTANT_DAILY_LIMIT = int(os.environ.get("ASSISTANT_DAILY_LIMIT", "30"))


def assistant_enabled() -> bool:
    if ASSISTANT_PROVIDER == "foundry":
        return bool(FOUNDRY_RESOURCE)
    if ASSISTANT_PROVIDER == "anthropic":
        return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_PROFILE"))
    return False
