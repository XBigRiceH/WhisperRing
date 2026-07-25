"""Thin ChatLab client. Pushes ChatLab-Format messages and reads analysis back.

Real integration (per the plan): POST /api/v1/imports/:sessionId to ingest, and
GET /api/v1/sessions/:id/stats/overview to read stats. Gated on CHATLAB_TOKEN —
when unset, calls return {"disabled": True} so the rest of the app still runs.
"""
from __future__ import annotations

import asyncio
import time

import httpx

from .config import settings

# Very early epoch (2010-01-01) so the default dashboard window captures all
# history — the ChatLab analytics endpoints all take a [startTs, endTs] range.
DASHBOARD_START_TS = 1262304000

# ChatLab Format version this client speaks (see Push 导入协议).
CHATLAB_VERSION = "0.0.2"
GENERATOR = "vibewedding-ring/1.0"

# ChatLab message type ids (see ChatLab Format docs)
TYPE_TEXT = 0
TYPE_VOICE = 2


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.chatlab_token}",
        "Content-Type": "application/json",
    }


def couple_session_id(couple_id: str) -> str:
    """一对情侣的 ChatLab session 基础键；每人的视角 session 在其上派生。"""
    return f"couple_{couple_id}"


def owner_session_id(base_session: str, owner_id: str) -> str:
    """某个人视角的 session id：同一对情侣、两个身份，各一个独立 session。
    推送时两个都写，拉取时各用自己的（owner 即『本人』）。"""
    return f"{base_session}_{owner_id}"


def couple_perspectives(base_session: str, a_id: str, a_name: str,
                        b_id: str, b_name: str) -> list[tuple[str, dict, list[dict]]]:
    """把一对情侣的私聊展开成两个视角 session：分别以 A、B 为『本人』(ownerId)，
    session 名叫对方昵称。返回 [(session_id, meta, members), ...] 共两条。"""
    perspectives: list[tuple[str, dict, list[dict]]] = []
    members = [
        {"platformId": a_id, "accountName": a_name},
        {"platformId": b_id, "accountName": b_name},
    ]
    for me_id, partner_name in ((a_id, b_name), (b_id, a_name)):
        meta = {
            "name": partner_name,
            "platform": "unknown",
            "type": "private",
            "ownerId": me_id,
        }
        perspectives.append((owner_session_id(base_session, me_id), meta, members))
    return perspectives


def build_message(sender: str, timestamp_s: int, text: str | None,
                  platform_message_id: str, account_name: str | None = None,
                  msg_type: int = TYPE_VOICE) -> dict:
    message = {
        "sender": sender,
        "timestamp": timestamp_s,
        "type": msg_type,
        "content": text,
        "platformMessageId": platform_message_id,
    }
    if account_name:
        message["accountName"] = account_name
    return message


def _import_payload(meta: dict, members: list[dict], messages: list[dict],
                    options: dict | None) -> dict:
    payload = {
        "chatlab": {
            "version": CHATLAB_VERSION,
            "exportedAt": int(time.time()),
            "generator": GENERATOR,
        },
        "meta": meta,
        "members": members,
        "messages": messages,
    }
    if options:
        payload["options"] = options
    return payload


async def push_messages(session_id: str, meta: dict, members: list[dict],
                        messages: list[dict], options: dict | None = None) -> dict:
    if not settings.chatlab_enabled:
        return {"disabled": True}
    url = f"{settings.chatlab_base_url}/api/v1/imports/{session_id}"
    payload = _import_payload(meta, members, messages, options)
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(url, json=payload, headers=_headers())
        resp.raise_for_status()
        return resp.json()


def push_messages_sync(session_id: str, meta: dict, members: list[dict],
                       messages: list[dict], options: dict | None = None) -> dict:
    """Blocking variant for worker threads (e.g. the ASR pool) that cannot await."""
    if not settings.chatlab_enabled:
        return {"disabled": True}
    url = f"{settings.chatlab_base_url}/api/v1/imports/{session_id}"
    payload = _import_payload(meta, members, messages, options)
    with httpx.Client(timeout=20) as client:
        resp = client.post(url, json=payload, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def push_to_perspectives(perspectives: list[tuple[str, dict, list[dict]]],
                               messages: list[dict],
                               options: dict | None = None) -> list[dict]:
    """把同一批消息写进每个视角 session（情侣 = 推两次）。每一侧独立尝试：
    单侧失败记为 {"error": ...} 而不是抛出，另一侧照常推。"""
    results: list[dict] = []
    for session_id, meta, members in perspectives:
        try:
            results.append(await push_messages(session_id, meta, members, messages, options))
        except Exception as exc:  # noqa: BLE001 - 单侧失败不拖垮另一侧
            results.append({"error": str(exc), "session": session_id})
    return results


def push_to_perspectives_sync(perspectives: list[tuple[str, dict, list[dict]]],
                              messages: list[dict],
                              options: dict | None = None) -> list[dict]:
    """push_to_perspectives 的阻塞版，给不能 await 的工作线程（如 ASR 池）用。"""
    results: list[dict] = []
    for session_id, meta, members in perspectives:
        try:
            results.append(push_messages_sync(session_id, meta, members, messages, options))
        except Exception as exc:  # noqa: BLE001 - 单侧失败不拖垮另一侧
            results.append({"error": str(exc), "session": session_id})
    return results


def all_pushed(results: list[dict]) -> bool:
    """两个视角都真正推成功才算成功（disabled/error 都不算）。"""
    return bool(results) and all(
        not r.get("disabled") and not r.get("error") for r in results
    )


async def get_overview(session_id: str) -> dict:
    if not settings.chatlab_enabled:
        return {"disabled": True, "reason": "CHATLAB_TOKEN not set"}
    url = f"{settings.chatlab_base_url}/api/v1/sessions/{session_id}/stats/overview"
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def get_messages(session_id: str, keyword: str | None = None,
                       start_time: int | None = None, end_time: int | None = None,
                       limit: int = 100, page: int = 1) -> list[dict]:
    """拉取一个 session 的消息（分页/关键词/时间窗）。best-effort：未接入或出错返回 []。
    归一化为 {sender, senderName, timestamp, type, content}。"""
    if not settings.chatlab_enabled:
        return []
    params: dict = {"page": page, "limit": min(max(1, limit), 1000)}
    if keyword:
        params["keyword"] = keyword
    if start_time is not None:
        params["startTime"] = start_time
    if end_time is not None:
        params["endTime"] = end_time
    url = f"{settings.chatlab_base_url}/api/v1/sessions/{session_id}/messages"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url, params=params, headers=_headers())
            resp.raise_for_status()
            body = resp.json()
    except Exception:
        return []
    raw = (body.get("data") or {}).get("messages") or []
    out = []
    for m in raw:
        out.append({
            "sender": m.get("senderPlatformId") or m.get("sender") or "",
            "senderName": m.get("senderName") or m.get("accountName") or "",
            "timestamp": int(m.get("timestamp") or 0),
            "type": int(m.get("type") or 0),
            "content": m.get("content") or "",
        })
    return out


# --- Dashboard: the ChatLab web UI's internal /_web analytics API ---------------
# These are the endpoints the ChatLab dashboard itself calls (see 硬件/apis.md).
# They are same-origin/Referer-gated rather than Bearer-authenticated, so we
# mirror the working curl: a Referer header, no Authorization.

def _web_headers() -> dict:
    return {"Accept": "*/*", "Referer": f"{settings.chatlab_base_url}/"}


async def _web_get(client: httpx.AsyncClient, path: str, params: dict):
    resp = await client.get(
        f"{settings.chatlab_base_url}/_web{path}", params=params, headers=_web_headers()
    )
    resp.raise_for_status()
    return resp.json()


async def _web_post(client: httpx.AsyncClient, path: str, body: dict):
    headers = {**_web_headers(), "Content-Type": "application/json",
               "Origin": settings.chatlab_base_url}
    resp = await client.post(f"{settings.chatlab_base_url}/_web{path}", json=body, headers=headers)
    resp.raise_for_status()
    return resp.json()


async def get_dashboard(session_id: str, start_ts: int | None = None,
                        end_ts: int | None = None) -> dict:
    """Fan out to every ChatLab analytics endpoint concurrently and combine the
    results into one payload. A single failing endpoint degrades to null rather
    than sinking the whole dashboard; total failure -> {"disabled": True} so the
    app can fall back to sample data."""
    start_ts = start_ts or DASHBOARD_START_TS
    end_ts = end_ts or (int(time.time()) + 86400)
    rng = {"startTs": start_ts, "endTs": end_ts}
    sp = f"/sessions/{session_id}"

    async def safe(coro):
        try:
            return await coro
        except Exception:
            return None

    async with httpx.AsyncClient(timeout=30, verify=False) as client:
        (weekday, relationship, journey, message_length, long_message_count,
         daily, word_frequency, language_preference) = await asyncio.gather(
            safe(_web_get(client, f"{sp}/stats/weekday", rng)),
            safe(_web_get(client, f"{sp}/analytics/relationship", rng)),
            safe(_web_get(client, f"{sp}/analytics/journey", rng)),
            safe(_web_get(client, f"{sp}/analytics/message-length-distribution", rng)),
            safe(_web_get(client, f"{sp}/analytics/long-message-count", {**rng, "minLength": 30})),
            safe(_web_get(client, f"{sp}/stats/daily", rng)),
            safe(_web_post(client, "/nlp/word-frequency", {
                "sessionId": session_id, "locale": "zh-CN", "timeFilter": rng,
                "topN": 100, "minCount": 2, "posFilterMode": "meaningful",
                "enableStopwords": True, "dictType": "zh-CN",
            })),
            safe(_web_get(client, f"{sp}/analytics/language-preference",
                          {"locale": "zh-CN", **rng})),
        )

    parts = {
        "weekday": weekday,
        "relationship": relationship,
        "journey": journey,
        "messageLength": message_length,
        "longMessageCount": long_message_count,
        "daily": daily,
        "wordFrequency": word_frequency,
        "languagePreference": language_preference,
    }
    if not any(v is not None for v in parts.values()):
        return {"disabled": True, "reason": "ChatLab unreachable"}
    return {"session": session_id, "range": rng, **parts}
