from fastapi import APIRouter, HTTPException
from sqlalchemy import func
from sqlmodel import or_, select

from ..db import Ring, get_session, new_id, now_ms
from ..schemas import BindRingRequest, RingResponse
from ..security import CurrentUser

router = APIRouter(tags=["rings"])


def _to_response(ring: Ring) -> RingResponse:
    return RingResponse(
        id=ring.id, mac=ring.mac, sn=ring.sn, model=ring.model, uniqueNo=ring.unique_no
    )


@router.post("/rings/bind", response_model=RingResponse)
def bind_ring(req: BindRingRequest, user_id: str = CurrentUser) -> RingResponse:
    with get_session() as session:
        dup = session.exec(
            select(Ring).where(or_(Ring.mac == req.mac, Ring.sn == req.sn))
        ).first()
        if dup:
            raise HTTPException(409, "ring already bound (mac/sn must be unique)")
        count = session.exec(select(func.count()).select_from(Ring)).one()
        unique_no = f"RING-{count + 1:06d}"
        ring = Ring(
            id=new_id("rng_"), mac=req.mac, sn=req.sn, cpuid=req.cpuid, model=req.model,
            firmware=req.firmware, owner_user_id=user_id, unique_no=unique_no,
            bound_at=now_ms(), last_battery=None, last_seen_at=None,
        )
        session.add(ring)
    return _to_response(ring)


@router.get("/rings/me", response_model=RingResponse)
def my_ring(user_id: str = CurrentUser) -> RingResponse:
    with get_session() as session:
        ring = session.exec(
            select(Ring).where(Ring.owner_user_id == user_id)
            .order_by(Ring.bound_at.desc()).limit(1)
        ).first()
    if ring is None:
        raise HTTPException(404, "no ring bound")
    return _to_response(ring)


@router.delete("/rings/{ring_id}")
def unbind_ring(ring_id: str, user_id: str = CurrentUser) -> dict:
    with get_session() as session:
        ring = session.get(Ring, ring_id)
        if ring is None:
            raise HTTPException(404, "ring not found")
        if ring.owner_user_id != user_id:
            raise HTTPException(403, "not your ring")
        session.delete(ring)
    return {"unbound": ring_id}
