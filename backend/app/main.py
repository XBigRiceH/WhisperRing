from contextlib import asynccontextmanager

from fastapi import FastAPI

from . import asr
from .db import init_db
from .routers import analysis, auth, companion, couples, events, realtime_ws, recall, recordings, rings, voice


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    yield
    # Drain the background ASR thread pool on shutdown.
    asr.shutdown()


def create_app() -> FastAPI:
    app = FastAPI(title="思念 / Ring backend", version="0.1.0", lifespan=_lifespan)
    init_db()

    for module in (auth, rings, couples, companion, events, realtime_ws, analysis, recall, recordings, voice):
        app.include_router(module.router)

    @app.get("/healthz")
    def healthz() -> dict:
        return {"ok": True}

    return app


app = create_app()
