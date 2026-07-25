from fastapi import APIRouter, HTTPException
from sqlmodel import select

from .. import pairing
from ..db import Companion, CompanionMessage, get_session
from ..schemas import (CompanionMessageDTO, CompanionResponse,
                       CreateCompanionRequest, HistoryResponse)
from ..security import CurrentUser

router = APIRouter(tags=["companion"])


@router.post("/companion", response_model=CompanionResponse)
def create_companion(req: CreateCompanionRequest, user_id: str = CurrentUser) -> CompanionResponse:
    couple, ai_id = pairing.create_ai_companion(user_id, req.name, req.gender, req.traits)
    return CompanionResponse(coupleId=couple.id, aiUserId=ai_id, name=req.name,
                             gender=req.gender, traits=req.traits)


@router.get("/companion/me", response_model=CompanionResponse)
def companion_me(user_id: str = CurrentUser) -> CompanionResponse:
    couple = pairing.couple_for_user(user_id)
    if couple is None:
        raise HTTPException(404, "not paired")
    ai_id = pairing.partner_id(couple, user_id)
    with get_session() as s:
        comp = s.get(Companion, ai_id)
    if comp is None:
        raise HTTPException(404, "partner is not an AI companion")
    return CompanionResponse(coupleId=couple.id, aiUserId=ai_id, name=comp.name or "",
                             gender=comp.gender or "female",
                             traits=(comp.traits or "").split(",") if comp.traits else [])


@router.get("/companion/history", response_model=HistoryResponse)
def companion_history(limit: int = 50, user_id: str = CurrentUser) -> HistoryResponse:
    couple = pairing.couple_for_user(user_id)
    if couple is None:
        return HistoryResponse(messages=[])
    with get_session() as s:
        rows = s.exec(
            select(CompanionMessage)
            .where(CompanionMessage.couple_id == couple.id)
            .order_by(CompanionMessage.created_at)
        ).all()
    rows = rows[-limit:]
    return HistoryResponse(messages=[
        CompanionMessageDTO(role=r.role or "user", text=r.text or "", createdAt=r.created_at or 0)
        for r in rows
    ])


@router.post("/couples/leave")
def leave(user_id: str = CurrentUser) -> dict:
    pairing.leave_couple(user_id)
    return {"ok": True}
