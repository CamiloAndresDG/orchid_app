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

# Base de datos. En Azure: postgresql+psycopg://usuario:clave@servidor:5432/fieldshift?sslmode=require
# Sin DATABASE_URL se usa SQLite local (backend/data/fieldshift.db) para desarrollar sin Postgres.
_LOCAL_DB = Path(__file__).resolve().parent.parent / "data" / "fieldshift.db"
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if not DATABASE_URL:
    _LOCAL_DB.parent.mkdir(parents=True, exist_ok=True)
    DATABASE_URL = f"sqlite:///{_LOCAL_DB.as_posix()}"
elif DATABASE_URL.startswith(("postgres://", "postgresql://")):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL.split("://", 1)[1]

# Días que dura una sesión iniciada.
SESSION_DAYS = int(os.environ.get("SESSION_DAYS", "30"))
