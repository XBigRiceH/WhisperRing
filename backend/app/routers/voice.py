from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError

from .. import chatlab, pairing
from ..config import settings
from ..db import User, VoiceRecord, get_session, new_id, now_ms
from ..schemas import MessageRequest, MessageResponse
from ..security import CurrentUser

router = APIRouter(tags=["voice"])


@router.post("/voice")
async def upload_voice(
        ringId: str = Form(...),
        fileIndex: int = Form(...),
        recordTime: int = Form(0),
        file: UploadFile = File(...),
        user_id: str = CurrentUser,
) -> dict:
    """Store the raw Speex .bin and create a VoiceRecord(pending). Speex decode +
    ASR are the real-hardware path (deferred); the ChatLab analysis path in the
    first cut is fed via POST /messages with already-transcribed text."""
    data = await file.read()
    voice_dir = settings.data_dir / "voice"
    voice_dir.mkdir(parents=True, exist_ok=True)
    path = voice_dir / f"{ringId}_{fileIndex}.bin"
    path.write_bytes(data)

    couple = pairing.couple_for_user(user_id)
    vid = new_id("vrec_")
    try:
        with get_session() as session:
            session.add(
                VoiceRecord(
                    id=vid,
                    ring_id=ringId,
                    user_id=user_id,
                    couple_id=couple.id if couple else None,
                    file_index=fileIndex,
                    record_time=recordTime,
                    raw_bin_path=str(path),
                    asr_status="pending",
                    chatlab_pushed=0,
                    created_at=now_ms(),
                )
            )
    except IntegrityError:
        raise HTTPException(409, "recording already uploaded (ring_id, file_index)")
    return {"id": vid, "asrStatus": "pending", "bytes": len(data)}


@router.get("/voice/{vid}")
def get_voice(vid: str, user_id: str = CurrentUser) -> dict:
    with get_session() as session:
        record = session.get(VoiceRecord, vid)
    if record is None:
        raise HTTPException(404, "not found")
    return {"id": record.id, "asrStatus": record.asr_status, "asrText": record.asr_text,
            "chatlabPushed": bool(record.chatlab_pushed)}


@router.post("/messages", response_model=MessageResponse)
async def push_message(req: MessageRequest, user_id: str = CurrentUser) -> MessageResponse:
    """First-cut ChatLab entrypoint: a (transcribed) text message -> ChatLab Format
    -> real push into the couple's two perspective sessions (keyed
    couple_{coupleId}_{userId}, one per '本人' identity)."""
    couple = pairing.couple_for_user(user_id)
    if couple is None:
        raise HTTPException(409, "not paired")
    partner_uid = pairing.partner_id(couple, user_id)
    with get_session() as session:
        me = session.get(User, user_id)
        partner = session.get(User, partner_uid)
    my_name = me.nickname if me and me.nickname else user_id
    partner_name = partner.nickname if partner and partner.nickname else partner_uid

    # 双视角：同一条消息推两个 session，分别以两人为『本人』(ownerId)，
    # 这样分析/回忆拉取时各自都能以自己的身份看这段关系。
    base_session = couple.chatlab_session or chatlab.couple_session_id(couple.id)
    perspectives = chatlab.couple_perspectives(
        base_session, user_id, my_name, partner_uid, partner_name
    )
    pmid = f"ring-{user_id}-{req.fileIndex}" if req.fileIndex is not None else f"msg-{new_id('')[:12]}"
    message = chatlab.build_message(
        sender=user_id,
        timestamp_s=int(now_ms() / 1000),
        text=req.text,
        platform_message_id=pmid,
        account_name=my_name,
        msg_type=chatlab.TYPE_TEXT,
    )
    # ChatLab push is best-effort: an analytics outage must not fail the user's
    # message (or block the AI reply below).
    results = await chatlab.push_to_perspectives(perspectives, [message])
    pushed = chatlab.all_pushed(results)

    # 伴侣是 AI -> 生成并返回即时回复（并把两侧对话记进 CompanionMessage）
    from .. import companion
    from ..db import Companion
    with get_session() as s:
        is_ai = s.get(Companion, partner_uid) is not None
    reply = None
    if is_ai:
        reply = await companion.generate_reply(user_id, partner_uid, couple.id, req.text)
        if reply:
            # AI 的回复也推进 ChatLab（供分析），sender=AI；同样双视角、best-effort
            ai_msg = chatlab.build_message(
                sender=partner_uid, timestamp_s=int(now_ms() / 1000), text=reply,
                platform_message_id=f"ai-{new_id('')[:12]}", account_name=partner_name,
                msg_type=chatlab.TYPE_TEXT,
            )
            await chatlab.push_to_perspectives(perspectives, [ai_msg])
    return MessageResponse(pushed=pushed,
                           detail=None if pushed else "ChatLab disabled (no token)",
                           reply=reply)
