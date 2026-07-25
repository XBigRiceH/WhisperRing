from fastapi import APIRouter

from ..db import User, get_session, new_id, now_ms
from ..schemas import DevLoginRequest, DevLoginResponse

router = APIRouter(tags=["auth"])


@router.post("/auth/dev-login", response_model=DevLoginResponse)
def dev_login(req: DevLoginRequest) -> DevLoginResponse:
    user_id = new_id("usr_")
    nickname = req.nickname or req.deviceLabel or "用户"
    with get_session() as session:
        session.add(
            User(id=user_id, label=req.deviceLabel, nickname=nickname, created_at=now_ms())
        )
    # Dev-only: the bearer token is simply the userId.
    return DevLoginResponse(userId=user_id, token=user_id, nickname=nickname)
