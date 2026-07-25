"""Decode ring recording `.bin` (length-prefixed Speex) into WAV bytes.

The heavy lifting lives in the vendored SDK at `refs/ring_sound.py` (see
refs/README.md §7). We load it by path so the single-file SDK stays untouched,
and expose one small helper for the HTTP layer. Decoding needs ffmpeg on PATH;
when it is missing the SDK raises SpeexDecoderUnavailable.
"""
from __future__ import annotations

import importlib.util
import sys
from dataclasses import dataclass

from .config import BACKEND_DIR

_SDK_PATH = BACKEND_DIR / "refs" / "ring_sound.py"

_WAV_HEADER_SIZE = 44


def _load_sdk():
    spec = importlib.util.spec_from_file_location("ring_sound", _SDK_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load ring_sound SDK from {_SDK_PATH}")
    module = importlib.util.module_from_spec(spec)
    # Register before exec: the SDK uses `from __future__ import annotations`
    # dataclasses, whose field resolution looks the module up in sys.modules.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


_sdk = _load_sdk()

# Re-export the SDK error types so callers can catch decode failures without
# reaching into the vendored module themselves.
AudioDecodeError = _sdk.AudioDecodeError
SpeexDecoderUnavailable = _sdk.SpeexDecoderUnavailable


@dataclass(frozen=True)
class DecodedAudio:
    wav_bytes: bytes
    source_type: str
    duration_ms: int


def decode_bin_to_wav(raw: bytes) -> DecodedAudio:
    """Decode raw ring `.bin` bytes into a playable WAV.

    Raises SpeexDecoderUnavailable (ffmpeg missing) or AudioDecodeError (data
    not recognizable as WAV/Speex).
    """
    playable = _sdk.build_playable_audio(raw)
    wav_bytes = playable.bytes

    duration_ms = 0
    cfg = playable.pcm_config
    if cfg is not None:
        byte_rate = cfg.sample_rate * cfg.channels * (cfg.bit_depth // 8)
        pcm_len = max(0, len(wav_bytes) - _WAV_HEADER_SIZE)
        if byte_rate:
            duration_ms = int(pcm_len * 1000 / byte_rate)

    return DecodedAudio(
        wav_bytes=wav_bytes,
        source_type=playable.source_type,
        duration_ms=duration_ms,
    )
