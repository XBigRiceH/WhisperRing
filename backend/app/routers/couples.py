from fastapi import APIRouter, HTTPException

from .. import pairing
from ..db import User, get_session
from ..schemas import AcceptRequest, CoupleResponse, InviteResponse
from ..security import CurrentUser

router = APIRouter(tags=["couples"])


def _couple_response(couple, user_id: str) -> CoupleResponse:
    partner = pairing.partner_id(couple, user_id)
    with get_session() as session:
        partner_user = session.get(User, partner)
    return CoupleResponse(
        coupleId=couple.id,
        uniqueCode=couple.unique_code,
        partnerUserId=partner,
        partnerNickname=partner_user.nickname if partner_user else None,
        chatlabSession=couple.chatlab_session,
    )


@router.post("/couples/invite", response_model=InviteResponse)
def invite(user_id: str = CurrentUser) -> InviteResponse:
    code, expires_at = pairing.create_invite(user_id)
    return InviteResponse(code=code, expiresAt=expires_at)


@router.post("/couples/accept", response_model=CoupleResponse)
def accept(req: AcceptRequest, user_id: str = CurrentUser) -> CoupleResponse:
    couple = pairing.accept_invite(user_id, req.code)
    return _couple_response(couple, user_id)


@router.get("/couples/me", response_model=CoupleResponse)
def my_couple(user_id: str = CurrentUser) -> CoupleResponse:
    couple = pairing.couple_for_user(user_id)
    if couple is None:
        raise HTTPException(404, "not paired")
    return _couple_response(couple, user_id)
