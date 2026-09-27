"""Environment-driven settings. No secrets live in code."""
import os
from datetime import timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
STATIC = ROOT / "static"
load_dotenv(ROOT / ".env")


def env(key: str, default: str = "") -> str:
    return (os.getenv(key) or default).strip()


def env_bool(key: str, default: bool) -> bool:
    v = env(key)
    return default if not v else v.lower() in ("1", "true", "yes", "on")


PORT = int(env("PORT", "8765"))
USER_NAME = env("SABHA_USER_NAME") or "you"
IST = timezone(timedelta(hours=5, minutes=30), "IST")

QDRANT_URL = env("QDRANT_URL")
QDRANT_API_KEY = env("QDRANT_API_KEY")
QDRANT_PATH = env("QDRANT_PATH", str(DATA / "qdrant_local"))
EMBED_MODEL = env("EMBED_MODEL", "BAAI/bge-small-en-v1.5")
SEED_ON_START = env_bool("SEED_ON_START", True)
SEED_FILE = DATA / "seed_memories.json"

LYZR_API_KEY = env("LYZR_API_KEY")
LYZR_BASE_URL = env("LYZR_BASE_URL", "https://agent-prod.studio.lyzr.ai").rstrip("/")
LYZR_PROVIDER = env("LYZR_PROVIDER", "OpenAI")
LYZR_MODEL = env("LYZR_MODEL", "gpt-4o-mini")
LYZR_CREDENTIAL_ID = env("LYZR_CREDENTIAL_ID", "lyzr_openai")
LYZR_USER_ID = env("LYZR_USER_ID", "sabha-user")
LYZR_AGENTS_FILE = DATA / "lyzr_agents.json"

OMI_API_KEY = env("OMI_API_KEY")
OMI_BASE_URL = env("OMI_BASE_URL", "https://api.omi.me").rstrip("/")
WEBHOOK_KEY = env("SABHA_WEBHOOK_KEY")

TUNNEL = env("TUNNEL", "cloudflared").lower()
PUBLIC_URL = env("PUBLIC_URL").rstrip("/")

AUTO_ADVANCE_SECONDS = float(env("AUTO_ADVANCE_SECONDS", "15"))
