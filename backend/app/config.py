"""Environment-driven settings (no external deps; loads .env if present).

Values are read from os.environ on each access so tests can monkeypatch env
vars and spin up a fresh app without reload gymnastics.
"""
from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _load_env() -> None:
    env = BACKEND_DIR / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


_load_env()


class Settings:
    @property
    def port(self) -> int:
        return int(os.environ.get("PORT", "8000"))

    @property
    def dev_auth(self) -> bool:
        return os.environ.get("DEV_AUTH", "1") == "1"

    @property
    def data_dir(self) -> Path:
        return Path(os.environ.get("DATA_DIR", str(BACKEND_DIR / "data")))

    @property
    def db_path(self) -> str:
        return os.environ.get("DB_PATH", str(self.data_dir / "ring.db"))

    @property
    def chatlab_base_url(self) -> str:
        return os.environ.get("CHATLAB_BASE_URL", "http://172.20.0.250:3110").rstrip("/")

    @property
    def chatlab_token(self) -> str:
        return os.environ.get("CHATLAB_TOKEN",
                              "clb_bc2bbc0aa58797e8a65538031c1606663793aed4a3fd15ebb0135da63e46e487").strip()

    @property
    def chatlab_enabled(self) -> bool:
        return bool(self.chatlab_token)

    # --- Companion (single-person AI partner mode, OpenAI-compatible API) ---
    @property
    def openai_base_url(self) -> str:
        return os.environ.get("OPENAI_BASE_URL", "https://api.stepfun.com/step_plan/v1").rstrip("/")

    @property
    def openai_api_key(self) -> str:
        return os.environ.get("OPENAI_API_KEY",
                              "or47nXFQUKcQb7ArN2lU6Zb7KKOYHdWG8sDFZTmGBdWCdyl8LLK2Vwe5fMudR5qY").strip()

    @property
    def companion_model(self) -> str:
        return os.environ.get("COMPANION_MODEL", "step-3.7-flash").strip()

    @property
    def companion_enabled(self) -> bool:
        return bool(self.openai_api_key)

    # --- ASR (background speech-to-text on decoded recordings) ---
    @property
    def asr_enabled(self) -> bool:
        return os.environ.get("ASR_ENABLED", "1") == "1"

    @property
    def asr_model(self) -> str:
        return os.environ.get("ASR_MODEL", "base").strip()

    @property
    def asr_device(self) -> str:
        return os.environ.get("ASR_DEVICE", "cpu").strip()

    @property
    def asr_compute_type(self) -> str:
        return os.environ.get("ASR_COMPUTE_TYPE", "int8").strip()

    @property
    def asr_language(self) -> str:
        # Empty -> let the model auto-detect the spoken language.
        return os.environ.get("ASR_LANGUAGE", "zh").strip()

    @property
    def asr_workers(self) -> int:
        return int(os.environ.get("ASR_WORKERS", "1"))


settings = Settings()
