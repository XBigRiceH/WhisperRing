"""Background speech-to-text (ASR) for decoded ring recordings.

Once a recording's `.bin` is decoded to WAV, the HTTP handler hands the WAV off
to a small dedicated thread pool here so transcription never blocks the upload
response. A worker runs faster-whisper on the WAV, then writes the transcript
back onto the recording's row (`asr_text` / `asr_status`), keeping the text
linked to its source recording by primary key.
"""
from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from . import chatlab, pairing
from .config import settings
from .db import Recording, User, get_session, now_ms

logger = logging.getLogger(__name__)

# Dedicated pool: transcription is CPU-heavy and must stay off the request path.
_executor: Optional[ThreadPoolExecutor] = None
_executor_lock = threading.Lock()

# faster-whisper models are not safe to call concurrently, so a single loaded
# instance is shared across jobs and guarded by this lock (also guards load).
_model = None
_model_lock = threading.Lock()


def _get_executor() -> ThreadPoolExecutor:
    global _executor
    if _executor is None:
        with _executor_lock:
            if _executor is None:
                _executor = ThreadPoolExecutor(
                    max_workers=max(1, settings.asr_workers),
                    thread_name_prefix="asr",
                )
    return _executor


def _get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                # Imported lazily so the app still starts if the (heavy)
                # dependency or model download is unavailable.
                from faster_whisper import WhisperModel

                _model = WhisperModel(
                    settings.asr_model,
                    device=settings.asr_device,
                    compute_type=settings.asr_compute_type,
                )
    return _model


def transcribe(wav_path: str) -> str:
    """Run speech-to-text on a WAV file and return the transcript text."""
    model = _get_model()
    language = settings.asr_language or None
    # Serialize model calls: one shared instance, not concurrency-safe.
    with _model_lock:
        segments, _info = model.transcribe(wav_path, language=language)
        return "".join(segment.text for segment in segments).strip()


def _push_to_chatlab(rec: Recording) -> None:
    """After a successful transcription, mirror the transcript into the couple's
    two ChatLab perspective sessions (one per '本人' identity, so each partner's
    analysis/recall pulls from their own view). Best-effort: any failure here
    must not fail the ASR job whose transcript is already persisted."""
    if not settings.chatlab_enabled or not rec.asr_text or not rec.user_id:
        return
    if rec.chatlab_pushed:  # already mirrored -> don't push the same transcript twice
        return
    couple = pairing.couple_for_user(rec.user_id)
    if couple is None:  # unpaired user -> no private session to push into
        return
    partner_uid = pairing.partner_id(couple, rec.user_id)
    with get_session() as session:
        me = session.get(User, rec.user_id)
        partner = session.get(User, partner_uid)
    my_name = me.nickname if me and me.nickname else rec.user_id
    partner_name = partner.nickname if partner and partner.nickname else partner_uid

    base_session = couple.chatlab_session or chatlab.couple_session_id(couple.id)
    perspectives = chatlab.couple_perspectives(
        base_session, rec.user_id, my_name, partner_uid, partner_name
    )
    # platformMessageId = recording id makes ChatLab dedupe re-pushes deterministically.
    # The transcript is text, so push it as a text message (not a voice message).
    message = chatlab.build_message(
        sender=rec.user_id,
        timestamp_s=int((rec.uploaded_at or now_ms()) / 1000),
        text=rec.asr_text,
        platform_message_id=rec.id,
        account_name=my_name,
        msg_type=chatlab.TYPE_TEXT,
    )
    results = chatlab.push_to_perspectives_sync(perspectives, [message])
    if not chatlab.all_pushed(results):
        # 某个视角没推成（禁用/异常）-> 不打标记，等重试把两边补齐；
        # ChatLab 按 platformMessageId 去重，重推已成功的一侧是安全的。
        for r in results:
            if r.get("error"):
                logger.error("ChatLab push failed for recording %s (session %s): %s",
                             rec.id, r.get("session"), r.get("error"))
        return

    # Push succeeded (both perspectives) -> record it so we never re-push.
    with get_session() as session:
        row = session.get(Recording, rec.id)
        if row is not None:
            row.chatlab_pushed = 1
            session.add(row)
    rec.chatlab_pushed = 1


def _run_job(rid: str, wav_path: str) -> None:
    try:
        text: Optional[str] = transcribe(wav_path)
        status, error = "done", None
    except Exception as exc:  # noqa: BLE001 - persist any failure, keep the pool alive
        logger.exception("ASR failed for recording %s", rid)
        text, status, error = None, "failed", str(exc)

    with get_session() as session:
        rec = session.get(Recording, rid)
        if rec is None:  # recording deleted while queued
            return
        rec.asr_text = text
        rec.asr_status = status
        rec.asr_error = error
        session.add(rec)

    # Transcript is committed above; now mirror it into ChatLab (best-effort).
    if status == "done":
        _push_to_chatlab(rec)


def submit(rid: str, wav_path: str) -> None:
    """Queue a decoded recording for background transcription (non-blocking)."""
    if not settings.asr_enabled:
        return
    _get_executor().submit(_run_job, rid, wav_path)


def shutdown() -> None:
    """Stop the pool on app shutdown; safe to call when never started."""
    global _executor
    if _executor is not None:
        _executor.shutdown(wait=False)
        _executor = None
