from fastapi import APIRouter, HTTPException
from sqlmodel import select

from .. import chatlab, pairing, recall
from ..db import RecallMessage, get_session, new_id, now_ms
from ..schemas import (RecallAnswerResponse, RecallAskRequest,
                       RecallHistoryResponse, RecallMessageDTO)
from ..security import CurrentUser

router = APIRouter(tags=["recall"])


def _save(couple_id: str, role: str, text: str) -> None:
    with get_session() as s:
        s.add(RecallMessage(id=new_id("rmsg_"), couple_id=couple_id, role=role,
                            text=text, created_at=now_ms()))


@router.post("/recall/ask", response_model=RecallAnswerResponse)
async def ask(req: RecallAskRequest, user_id: str = CurrentUser) -> RecallAnswerResponse:
    couple = pairing.couple_for_user(user_id)
    if couple is None:
        raise HTTPException(409, "not paired")
    # 回忆检索也用提问者『本人』视角的 session。
    base = couple.chatlab_session or chatlab.couple_session_id(couple.id)
    session_id = chatlab.owner_session_id(base, user_id)
    _save(couple.id, "user", req.question)
    ans = await recall.answer(session_id, req.question)
    _save(couple.id, "ai", ans)
    return RecallAnswerResponse(answer=ans)


@router.get("/recall/history", response_model=RecallHistoryResponse)
def history(limit: int = 50, user_id: str = CurrentUser) -> RecallHistoryResponse:
    couple = pairing.couple_for_user(user_id)
    if couple is None:
        return RecallHistoryResponse(messages=[])
    with get_session() as s:
        rows = s.exec(
            select(RecallMessage)
            .where(RecallMessage.couple_id == couple.id)
            .order_by(RecallMessage.created_at)
        ).all()
    rows = rows[-limit:]
    return RecallHistoryResponse(messages=[
        RecallMessageDTO(role=r.role or "user", text=r.text or "", createdAt=r.created_at or 0)
        for r in rows
    ])
