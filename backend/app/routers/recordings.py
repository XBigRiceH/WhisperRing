"""Ring recording pipeline: accept a `.bin` Speex upload, decode it to WAV in
the data directory, and expose list + download endpoints. Each recording is
bound to the uploading user and the upload time."""
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import col, select

from .. import asr, pairing
from ..audio import AudioDecodeError, SpeexDecoderUnavailable, decode_bin_to_wav
from ..config import settings
from ..db import Recording, get_session, new_id, now_ms
from ..schemas import RecordingResponse
from ..security import CurrentUser

router = APIRouter(prefix="/recordings", tags=["recordings"])


def _recordings_dir():
    path = settings.data_dir / "recordings"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _to_response(rec: Recording) -> RecordingResponse:
    download_url = f"/recordings/{rec.id}/download" if rec.wav_path else None
    return RecordingResponse(
        id=rec.id,
        userId=rec.user_id,
        originalFilename=rec.original_filename,
        durationMs=rec.duration_ms,
        sourceType=rec.source_type,
        decodeStatus=rec.decode_status,
        decodeError=rec.decode_error,
        binSize=rec.bin_size,
        wavSize=rec.wav_size,
        uploadedAt=rec.uploaded_at,
        downloadUrl=download_url,
        asrStatus=rec.asr_status,
        asrText=rec.asr_text,
        asrError=rec.asr_error,
    )


@router.post("", response_model=RecordingResponse)
async def upload_recording(
        file: UploadFile = File(...),
        user_id: str = CurrentUser,
) -> RecordingResponse:
    """Receive a ring `.bin` (length-prefixed Speex) recording, save the raw
    bytes, decode to a `.wav` alongside it, and persist a row bound to the
    uploading user and upload time. The raw `.bin` is always kept; if ffmpeg is
    missing or the data is not decodable the row is stored with decodeStatus
    'failed' so the recording is not lost (see refs/README.md §7.1)."""
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "empty upload")

    rid = new_id("rec_")
    uploaded_at = now_ms()
    base = _recordings_dir() / rid
    bin_path = base.with_suffix(".bin")
    bin_path.write_bytes(raw)

    wav_path = None
    wav_size = None
    duration_ms = None
    source_type = None
    decode_status = "decoded"
    decode_error = None
    asr_status = None
    try:
        decoded = decode_bin_to_wav(raw)
        out = base.with_suffix(".wav")
        out.write_bytes(decoded.wav_bytes)
        wav_path = str(out)
        wav_size = len(decoded.wav_bytes)
        duration_ms = decoded.duration_ms
        source_type = decoded.source_type
        # WAV is ready -> mark it queued for the background ASR pool below.
        if settings.asr_enabled:
            asr_status = "pending"
    except (SpeexDecoderUnavailable, AudioDecodeError) as exc:
        decode_status = "failed"
        decode_error = str(exc)

    with get_session() as session:
        rec = Recording(
            id=rid, user_id=user_id, original_filename=file.filename, bin_path=str(bin_path),
            wav_path=wav_path, bin_size=len(raw), wav_size=wav_size, duration_ms=duration_ms,
            source_type=source_type, decode_status=decode_status, decode_error=decode_error,
            uploaded_at=uploaded_at, asr_status=asr_status,
        )
        session.add(rec)

    # Hand the decoded WAV to the dedicated ASR thread pool after the row is
    # committed, so the worker can find and update it without blocking here.
    if wav_path and asr_status == "pending":
        asr.submit(rid, wav_path)
    return _to_response(rec)


def _visible_user_ids(user_id: str) -> list[str]:
    """The caller plus their paired partner (if any) — recordings uploaded by
    either side are visible to both."""
    ids = [user_id]
    couple = pairing.couple_for_user(user_id)
    if couple is not None:
        ids.append(pairing.partner_id(couple, user_id))
    return ids


@router.get("", response_model=list[RecordingResponse])
def list_recordings(user_id: str = CurrentUser) -> list[RecordingResponse]:
    """List recordings uploaded by the current user or their partner, newest first."""
    with get_session() as session:
        records = session.exec(
            select(Recording).where(col(Recording.user_id).in_(_visible_user_ids(user_id)))
            .order_by(Recording.uploaded_at.desc())
        ).all()
    return [_to_response(rec) for rec in records]


@router.get("/{rid}/download")
def download_recording(rid: str, user_id: str = CurrentUser) -> FileResponse:
    """Download the decoded WAV for a recording owned by the current user or
    their partner (mirrors the list visibility)."""
    with get_session() as session:
        rec = session.get(Recording, rid)
    if rec is None:
        raise HTTPException(404, "not found")
    if rec.user_id not in _visible_user_ids(user_id):
        raise HTTPException(403, "not your recording")
    if not rec.wav_path:
        raise HTTPException(409, f"recording not decoded: {rec.decode_error or 'unknown'}")
    filename = f"{rid}.wav"
    return FileResponse(rec.wav_path, media_type="audio/wav", filename=filename)
