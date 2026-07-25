"""F1 思念 relay: persist a MissYouEvent and deliver it to the partner over WS."""
from __future__ import annotations

import asyncio

from fastapi import HTTPException
from sqlmodel import col, func, select

from . import companion, pairing, preset
from .db import Companion, MemoryItem, MissYouEvent, User, get_session, new_id, now_ms
from .realtime import manager


def _nickname(session, user_id: str) -> str | None:
    user = session.get(User, user_id)
    return user.nickname if user else None


# 持有后台任务引用，防止被事件循环 GC 提前回收
_background_tasks: set[asyncio.Task] = set()


def _spawn(coro) -> None:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def send_miss_you(
    from_user_id: str, trigger_type: str, memory: str | None = None
) -> dict:
    couple = pairing.couple_for_user(from_user_id)
    if couple is None:
        raise HTTPException(409, "not paired yet")
    to_user_id = pairing.partner_id(couple, from_user_id)
    quote = memory if memory is not None else preset.random_quote()
    created_at = now_ms()
    event_id = new_id("evt_")
    memory_id = new_id("mem_")

    with get_session() as session:
        from_nick = _nickname(session, from_user_id)
        partner_is_ai = session.get(Companion, to_user_id) is not None
        session.add(
            MemoryItem(
                id=memory_id, couple_id=couple.id, type="quote", content=quote,
                created_at=created_at,
            )
        )
        session.add(
            MissYouEvent(
                id=event_id, couple_id=couple.id, from_user_id=from_user_id,
                to_user_id=to_user_id, trigger_type=trigger_type, memory_item_id=memory_id,
                created_at=created_at, delivered_at=None, read_at=None,
            )
        )

    if partner_is_ai:
        # 伴侣是 AI：思念内容作为聊天消息发进 AI 对话，事件直接标记已读，
        # 再把 AI 的第一条回复作为一条 miss_you 回推给人类端。
        return await _miss_you_to_companion(
            couple.id, from_user_id, to_user_id, event_id, quote, trigger_type, created_at
        )

    payload = {
        "type": "miss_you",
        "eventId": event_id,
        "fromUserId": from_user_id,
        "fromNickname": from_nick,
        "memory": quote,
        "triggerType": trigger_type,
        "createdAt": created_at,
    }
    delivered = await manager.send_to(to_user_id, payload)
    if delivered:
        # 实时推送成功即视为对方已读；事件本身已落库，保证历史记录可拉取。
        with get_session() as session:
            event = session.get(MissYouEvent, event_id)
            if event is not None:
                event.delivered_at = now_ms()
                event.read_at = event.delivered_at
                session.add(event)

    return {
        "id": event_id,
        "fromUserId": from_user_id,
        "toUserId": to_user_id,
        "triggerType": trigger_type,
        "memory": quote,
        "createdAt": created_at,
        "delivered": delivered,
    }


async def _miss_you_to_companion(
    couple_id: str,
    from_user_id: str,
    ai_user_id: str,
    event_id: str,
    quote: str,
    trigger_type: str,
    created_at: int,
) -> dict:
    """AI 伴侣分支：AI 即刻"收到"，事件直接标已读；思念文案进入 AI 聊天上下文，
    第一条 AI 回复在后台生成，落库成 AI -> 人 的 miss_you 事件并实时推送给人类端。"""
    read_at = now_ms()
    with get_session() as session:
        event = session.get(MissYouEvent, event_id)
        if event is not None:
            event.delivered_at = read_at
            event.read_at = read_at
            session.add(event)

    # AI 回复走后台任务，不阻塞已读反馈的返回
    _spawn(_companion_reply_task(couple_id, from_user_id, ai_user_id, quote))

    return {
        "id": event_id,
        "fromUserId": from_user_id,
        "toUserId": ai_user_id,
        "triggerType": trigger_type,
        "memory": quote,
        "createdAt": created_at,
        "delivered": True,
        "reply": None,
    }


async def _companion_reply_task(
    couple_id: str, from_user_id: str, ai_user_id: str, quote: str
) -> None:
    """后台任务：思念内容作为一条用户聊天消息发给 AI（同时写入 CompanionMessage
    双方记录），AI 回复落库并作为 miss_you 实时推送给人类端。"""
    reply = await companion.generate_reply(from_user_id, ai_user_id, couple_id, quote)
    if not reply:
        return
    reply_created = now_ms()
    reply_event_id = new_id("evt_")
    reply_memory_id = new_id("mem_")
    with get_session() as session:
        ai_nick = _nickname(session, ai_user_id)
        session.add(
            MemoryItem(
                id=reply_memory_id, couple_id=couple_id, type="quote", content=reply,
                created_at=reply_created,
            )
        )
        session.add(
            MissYouEvent(
                id=reply_event_id, couple_id=couple_id, from_user_id=ai_user_id,
                to_user_id=from_user_id, trigger_type="ai_reply",
                memory_item_id=reply_memory_id, created_at=reply_created,
                delivered_at=None, read_at=None,
            )
        )
    payload = {
        "type": "miss_you",
        "eventId": reply_event_id,
        "fromUserId": ai_user_id,
        "fromNickname": ai_nick,
        "memory": reply,
        "triggerType": "ai_reply",
        "createdAt": reply_created,
    }
    reply_delivered = await manager.send_to(from_user_id, payload)
    if reply_delivered:
        with get_session() as session:
            reply_event = session.get(MissYouEvent, reply_event_id)
            if reply_event is not None:
                reply_event.delivered_at = now_ms()
                reply_event.read_at = reply_event.delivered_at
                session.add(reply_event)


async def debug_send_double_click(
    to_user_id: str,
    from_user_id: str | None = None,
    memory: str | None = None,
    trigger_type: str = "button_double",
) -> dict:
    """Debug helper: push a double-click (miss_you) event straight to a target
    user's live socket(s), bypassing pairing. The event is persisted (marked
    read when delivered live) so it also shows up in the history endpoint."""
    created_at = now_ms()
    event_id = new_id("evt_")
    memory_id = new_id("mem_")
    quote = memory if memory is not None else preset.random_quote()
    with get_session() as session:
        from_nick = _nickname(session, from_user_id) if from_user_id else None
        session.add(
            MemoryItem(id=memory_id, couple_id=None, type="quote", content=quote,
                       created_at=created_at)
        )
        session.add(
            MissYouEvent(
                id=event_id, couple_id=None, from_user_id=from_user_id,
                to_user_id=to_user_id, trigger_type=trigger_type, memory_item_id=memory_id,
                created_at=created_at, delivered_at=None, read_at=None,
            )
        )
    payload = {
        "type": "miss_you",
        "eventId": event_id,
        "fromUserId": from_user_id,
        "fromNickname": from_nick,
        "memory": quote,
        "triggerType": trigger_type,
        "createdAt": created_at,
    }
    delivered = await manager.send_to(to_user_id, payload)
    if delivered:
        with get_session() as session:
            event = session.get(MissYouEvent, event_id)
            if event is not None:
                event.delivered_at = now_ms()
                event.read_at = event.delivered_at
                session.add(event)
    return {
        "eventId": event_id,
        "toUserId": to_user_id,
        "fromUserId": from_user_id,
        "triggerType": trigger_type,
        "memory": quote,
        "createdAt": created_at,
        "online": manager.is_online(to_user_id),
        "delivered": delivered,
    }


def miss_you_stats(user_id: str) -> dict:
    """Counts of miss-you events the user has sent and received."""
    with get_session() as session:
        sent = session.exec(
            select(func.count()).select_from(MissYouEvent)
            .where(MissYouEvent.from_user_id == user_id)
        ).one()
        received = session.exec(
            select(func.count()).select_from(MissYouEvent)
            .where(MissYouEvent.to_user_id == user_id)
        ).one()
    return {"sent": sent, "received": received}


def all_events_for(user_id: str) -> list[dict]:
    """All miss-you events ever addressed to user_id, read or not (newest first)."""
    with get_session() as session:
        rows = session.exec(
            select(MissYouEvent, MemoryItem.content, User.nickname)
            .join(MemoryItem, MissYouEvent.memory_item_id == MemoryItem.id, isouter=True)
            .join(User, MissYouEvent.from_user_id == User.id, isouter=True)
            .where(MissYouEvent.to_user_id == user_id)
            .order_by(col(MissYouEvent.created_at).desc())
        ).all()
        return [
            {
                "id": event.id,
                "fromUserId": event.from_user_id,
                "fromNickname": from_nickname,
                "memory": memory,
                "triggerType": event.trigger_type,
                "createdAt": event.created_at,
                "deliveredAt": event.delivered_at,
                "readAt": event.read_at,
            }
            for event, memory, from_nickname in rows
        ]


def events_since(user_id: str, since_ms: int) -> list[dict]:
    """Offline fallback: undelivered/newer events addressed to user_id."""
    with get_session() as session:
        rows = session.exec(
            select(MissYouEvent, MemoryItem.content, User.nickname)
            .join(MemoryItem, MissYouEvent.memory_item_id == MemoryItem.id, isouter=True)
            .join(User, MissYouEvent.from_user_id == User.id, isouter=True)
            .where(MissYouEvent.to_user_id == user_id, col(MissYouEvent.created_at) > since_ms)
            .order_by(MissYouEvent.created_at.asc())
        ).all()
        result = []
        for event, memory, from_nickname in rows:
            if event.delivered_at is None:
                event.delivered_at = now_ms()
                session.add(event)
            result.append(
                {
                    "id": event.id,
                    "fromUserId": event.from_user_id,
                    "fromNickname": from_nickname,
                    "memory": memory,
                    "triggerType": event.trigger_type,
                    "createdAt": event.created_at,
                }
            )
    return result
