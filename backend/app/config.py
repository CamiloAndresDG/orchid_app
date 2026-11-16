"""Configuration from environment variables (local and Azure)."""
import os
from pathlib import Path


def _load_dotenv() -> None:
    """Locally reads backend/.env (KEY=value). Doesn't override variables already set; on Azure they come from the secrets."""
    path = Path(__file__).resolve().parent.parent / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()

# Cache folder. On Azure an Azure Files share is mounted here.
CACHE_DIR = Path(os.environ.get("CACHE_DIR") or Path(__file__).resolve().parent.parent / "cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Origins allowed to call the API, comma-separated.
ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

# NASA Earthdata token (https://urs.earthdata.nasa.gov, expires after 60 days): SMAP, GPM IMERG, NLDAS and SRTM.
EARTHDATA_TOKEN = os.environ.get("EARTHDATA_TOKEN", "").strip()
if len(EARTHDATA_TOKEN) < 20:
    EARTHDATA_TOKEN = ""  # empty or placeholder ("-") = no token

# Server's USDA QuickStats key (optional). If set, the user doesn't need their own.
QUICKSTATS_KEY = os.environ.get("QUICKSTATS_KEY", "").strip()
if len(QUICKSTATS_KEY) < 8:
    QUICKSTATS_KEY = ""  # empty or placeholder ("-") = no server key

# Database. On Azure: postgresql+psycopg://user:password@server:5432/orchid?sslmode=require
# Without DATABASE_URL, local SQLite (backend/instance/orchid.db) is used to develop without Postgres.
# (backend/data belongs to the ETL and is versioned: don't put the accounts database there.)
_LOCAL_DB = Path(__file__).resolve().parent.parent / "instance" / "orchid.db"
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if not DATABASE_URL:
    _LOCAL_DB.parent.mkdir(parents=True, exist_ok=True)
    DATABASE_URL = f"sqlite:///{_LOCAL_DB.as_posix()}"
elif DATABASE_URL.startswith(("postgres://", "postgresql://")):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL.split("://", 1)[1]

# Days a signed-in session lasts.
SESSION_DAYS = int(os.environ.get("SESSION_DAYS", "30"))

# ---------- AI Guide ----------
# "azure_openai": OpenAI model deployed on Microsoft Foundry (Azure), e.g. gpt-5-mini. Default.
# "foundry": Claude deployed on Microsoft Foundry (requires Claude quota in the subscription).
# "anthropic": Claude API directly (reads ANTHROPIC_API_KEY or an `ant auth login` profile).
# On Azure all of them authenticate with the backend's managed identity; locally, with `az login`.
ASSISTANT_PROVIDER = os.environ.get("ASSISTANT_PROVIDER", "azure_openai").strip().lower()
FOUNDRY_RESOURCE = os.environ.get("FOUNDRY_RESOURCE", "").strip()  # e.g. orchid-ai-f0dbd8
FOUNDRY_TOKEN_SCOPE = os.environ.get("FOUNDRY_TOKEN_SCOPE", "https://cognitiveservices.azure.com/.default")
AZURE_OPENAI_API_VERSION = os.environ.get("AZURE_OPENAI_API_VERSION", "2025-04-01-preview")
# ARM id of the Foundry resource (/subscriptions/.../accounts/orchid-ai-...). If set, the backend reads the resource
# key with its identity (the Contributor role is enough) and keeps it only in memory; otherwise it uses Entra ID tokens
# (requires the Cognitive Services User data role).
FOUNDRY_RESOURCE_ID = os.environ.get("FOUNDRY_RESOURCE_ID", "").strip()
# Deployment name (Foundry) or model name (direct API).
ASSISTANT_MODEL = os.environ.get("ASSISTANT_MODEL", "").strip() or (
    "gpt-5-mini" if ASSISTANT_PROVIDER == "azure_openai" else "claude-opus-5-5")
# Claude only: fallback model if the main one rejects a request (SDK middleware). Empty = no fallback.
ASSISTANT_FALLBACK_MODEL = os.environ.get("ASSISTANT_FALLBACK_MODEL", "claude-opus-4-8").strip()
ASSISTANT_DAILY_LIMIT = int(os.environ.get("ASSISTANT_DAILY_LIMIT", "30"))


def assistant_enabled() -> bool:
    if ASSISTANT_PROVIDER in ("azure_openai", "foundry"):
        return bool(FOUNDRY_RESOURCE)
    if ASSISTANT_PROVIDER == "anthropic":
        return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_PROFILE"))
    return False
