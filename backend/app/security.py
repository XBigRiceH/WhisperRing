"""Dev auth: the bearer token IS the userId (gated by DEV_AUTH). No crypto —
first-cut/local only. Real auth replaces get_current_user later.

Temporary policy: requests without an Authorization header are all mapped to a
single shared guest user (auto-created on demand), so the API is usable without
login during development."""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status

from .config import settings
from .db import User, get_session, now_ms

GUEST_USER_ID = "usr_guest"
GUEST_NICKNAME = "临时用户"


def _ensure_guest_user() -> str:
    with get_session() as session:
        if session.get(User, GUEST_USER_ID) is None:
            session.add(
                User(id=GUEST_USER_ID, label="guest", nickname=GUEST_NICKNAME, created_at=now_ms())
            )
    return GUEST_USER_ID


def _user_id_from_bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    return authorization.split(" ", 1)[1].strip()


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    if not settings.dev_auth:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "production auth not configured")
    # Temporary: no header -> shared guest user.
    if not authorization or not authorization.strip():
        return _ensure_guest_user()
    user_id = _user_id_from_bearer(authorization)
    with get_session() as session:
        exists = session.get(User, user_id) is not None
    if not exists:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "unknown user")
    return user_id


def user_id_from_token(token: str) -> str | None:
    """For the WebSocket handshake, which passes the token as a query param."""
    if not token:
        return _ensure_guest_user()
    with get_session() as session:
        exists = session.get(User, token) is not None
    return token if exists else None


CurrentUser = Depends(get_current_user_id)
