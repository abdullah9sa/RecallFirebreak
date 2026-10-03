"""LLM / environment configuration.

Reads .env (gitignored). Supported variables (case-insensitive names accepted):
  ai_studio_key / GEMINI_API_KEY   Google AI Studio key
  condense_api  / CONDENSE_API_KEY Condense key (optional)
  LLM_BASE_URL                     OpenAI-compatible base URL (default: Gemini's)
  LLM_MODEL                        model name (default: gemini-2.5-flash)

To route through Condense, set LLM_BASE_URL to the Condense OpenAI-compatible
endpoint from your Condense dashboard and set LLM_API_KEY if it uses a
different key than the provider.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _env(*names: str, default: str = "") -> str:
    for n in names:
        for candidate in (n, n.upper(), n.lower()):
            v = os.getenv(candidate)
            if v:
                return v
    return default


GEMINI_API_KEY = _env("GEMINI_API_KEY", "ai_studio_key")
CONDENSE_API_KEY = _env("CONDENSE_API_KEY", "condense_api", default="ck_sub_ragSH")
CONDENSE_BASE_URL = _env("CONDENSE_BASE_URL", default="https://api.condense.chat/openai/v1").rstrip("/")

DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
LLM_BASE_URL = _env("LLM_BASE_URL", default=DEFAULT_BASE_URL).rstrip("/")
LLM_API_KEY = _env("LLM_API_KEY", default=GEMINI_API_KEY)
LLM_MODEL = _env("LLM_MODEL", default="gemini-3.8-flash")
LLM_TIMEOUT_S = float(_env("LLM_TIMEOUT_S", default="45"))
MAX_AGENT_STEPS = 10
