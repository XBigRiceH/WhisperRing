"""F4 唯一性配对: invite-code generation/acceptance + couple lookup helpers."""
from __future__ import annotations

import random
import string

from fastapi import HTTPException
from sqlmodel import or_, select

from .db import Couple, InviteCode, User, get_session, new_id, now_ms

INVITE_TTL_MS = 24 * 3600 * 1000


def _gen_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def couple_for_user(user_id: str) -> Couple | None:
    with get_session() as session:
        return session.exec(
            select(Couple).where(
                or_(Couple.user_a_id == user_id, Couple.user_b_id == user_id)
            )
        ).first()


def partner_id(couple: Couple, user_id: str) -> str:
    return couple.user_b_id if couple.user_a_id == user_id else couple.user_a_id


def create_invite(user_id: str) -> tuple[str, int]:
    if couple_for_user(user_id):
        raise HTTPException(409, "already paired")
    expires_at = now_ms() + INVITE_TTL_MS
    with get_session() as session:
        # a fresh code each call; keep it simple (no reuse) for the first cut
        code = _gen_code()
        while session.get(InviteCode, code) is not None:
            code = _gen_code()
        session.add(
            InviteCode(code=code, inviter_user_id=user_id, expires_at=expires_at, consumed=0)
        )
    return code, expires_at


def create_ai_companion(user_id: str, name: str, gender: str, traits: list[str]) -> tuple[Couple, str]:
    """Pair the caller with a freshly created AI companion. Returns (couple, ai_user_id).
    The AI is a User row (label='ai') plus a Companion row holding its persona."""
    if couple_for_user(user_id):
        raise HTTPException(409, "already paired")
    from . import companion as companion_mod
    from .db import Companion
    with get_session() as session:
        ai_id = new_id("ai_")
        session.add(User(id=ai_id, label="ai", nickname=name, created_at=now_ms()))
        prompt = companion_mod.render_system_prompt(name, gender, traits)
        session.add(Companion(ai_user_id=ai_id, owner_user_id=user_id, name=name,
                              gender=gender, traits=",".join(traits),
                              system_prompt=prompt, created_at=now_ms()))
        couple_id = new_id("cpl_")
        couple = Couple(id=couple_id, user_a_id=user_id, user_b_id=ai_id,
                        unique_code=new_id("")[:8].upper(),
                        chatlab_session=f"couple_{couple_id}", status="active",
                        paired_at=now_ms())
        session.add(couple)
    return couple, ai_id


def leave_couple(user_id: str) -> None:
    """Dissolve the caller's current couple so they can switch partner. If the
    partner is an AI companion, clean up that synthetic user + companion."""
    couple = couple_for_user(user_id)
    if couple is None:
        return
    partner = partner_id(couple, user_id)
    from .db import Companion
    with get_session() as session:
        row = session.get(Couple, couple.id)
        if row is not None:
            session.delete(row)
        partner_user = session.get(User, partner)
        if partner_user is not None and partner_user.label == "ai":
            comp = session.get(Companion, partner)
            if comp is not None:
                session.delete(comp)
            session.delete(partner_user)


def accept_invite(user_id: str, code: str) -> Couple:
    with get_session() as session:
        invite = session.get(InviteCode, code.strip().upper())
        if invite is None:
            raise HTTPException(404, "invalid code")
        if invite.consumed:
            raise HTTPException(409, "code already used")
        if invite.expires_at < now_ms():
            raise HTTPException(410, "code expired")
        inviter = invite.inviter_user_id
        if inviter == user_id:
            raise HTTPException(400, "cannot pair with yourself")

        # neither side may already be paired
        for uid in (inviter, user_id):
            existing = session.exec(
                select(Couple).where(or_(Couple.user_a_id == uid, Couple.user_b_id == uid))
            ).first()
            if existing:
                raise HTTPException(409, "one of the users is already paired")

        couple_id = new_id("cpl_")
        unique_code = new_id("")[:8].upper()
        chatlab_session = f"couple_{couple_id}"
        couple = Couple(
            id=couple_id,
            user_a_id=inviter,
            user_b_id=user_id,
            unique_code=unique_code,
            chatlab_session=chatlab_session,
            status="active",
            paired_at=now_ms(),
        )
        session.add(couple)
        invite.consumed = 1
        session.add(invite)
        return couple
