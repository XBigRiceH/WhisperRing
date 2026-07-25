from fastapi import APIRouter, HTTPException

from .. import chatlab, pairing
from ..security import CurrentUser

router = APIRouter(tags=["analysis"])


def _session_for(user_id: str) -> str:
    couple = pairing.couple_for_user(user_id)
    if couple is None:
        raise HTTPException(409, "not paired")
    # 与推送一致：读调用者『本人』视角的 session（推送时两个视角各写了一份）。
    base = couple.chatlab_session or chatlab.couple_session_id(couple.id)
    return chatlab.owner_session_id(base, user_id)


@router.get("/analysis/overview")
async def overview(user_id: str = CurrentUser) -> dict:
    session_id = _session_for(user_id)
    data = await chatlab.get_overview(session_id)
    return {"session": session_id, "overview": data}


@router.get("/analysis/dashboard")
async def dashboard(
        user_id: str = CurrentUser,
        startTs: int | None = None,
        endTs: int | None = None,
) -> dict:
    """Full analytics payload for the dashboard — every ChatLab metric in one
    round-trip. startTs/endTs are optional; the default window spans all history."""
    session_id = _session_for(user_id)
    return await chatlab.get_dashboard(session_id, startTs, endTs)
