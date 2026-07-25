"""AI 伴侣：人设 prompt 渲染 + 调 OpenAI 生成回复 + 存读 CompanionMessage + 推 ChatLab。"""
from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, cast

from .config import settings
from .db import Companion, CompanionMessage, get_session, new_id, now_ms

if TYPE_CHECKING:
    from openai.types.chat import ChatCompletionMessageParam

# 性格标签 key -> 中文描述（前端也用这套 key，见 CompanionSetupScreen）
TRAIT_LABELS: dict[str, str] = {
    "gentle": "温柔体贴，说话轻声细语",
    "clingy": "有点黏人，喜欢撒娇、想对方",
    "witty": "机灵幽默，爱开玩笑",
    "cold": "外冷内热，话不多但在意",
    "caring": "细心，会关心对方的日常和情绪",
    "playful": "俏皮活泼，爱逗对方开心",
}

GENDER_LABELS = {"female": "女生", "male": "男生", "neutral": "TA"}

COMPANION_CONTEXT_TURNS = 12


def render_system_prompt(name: str, gender: str, traits: list[str]) -> str:
    desc = "、".join(TRAIT_LABELS[t] for t in traits if t in TRAIT_LABELS)
    who = GENDER_LABELS.get(gender, "TA")
    return (
        f"你是「{name}」，用户的 AI 恋人，一个{who}。"
        f"你的性格：{desc or '温柔、真诚'}。\n"
        "请始终以恋人的口吻中文回复：自然、简短（一般 1-3 句），有温度、有记忆感，"
        "会主动关心对方的近况和情绪。不要暴露你是 AI 或语言模型，不要长篇大论或说教。"
        "若对方流露强烈负面情绪或危机信号，温柔地表达关心并鼓励对方寻求现实中的帮助。"
    )


def _call_llm(system: str, messages: list[dict]) -> str:
    """调用 OpenAI 通用 chat completions 接口生成回复。"""
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)
    chat_messages = cast(
        "list[ChatCompletionMessageParam]",
        [{"role": "system", "content": system}, *messages],
    )
    resp = client.chat.completions.create(
        model=settings.companion_model,
        max_tokens=400,
        messages=chat_messages,
    )
    return (resp.choices[0].message.content or "").strip()


def recent_context(couple_id: str) -> list[dict]:
    from sqlmodel import select

    with get_session() as s:
        rows = s.exec(
            select(CompanionMessage)
            .where(CompanionMessage.couple_id == couple_id)
            .order_by(CompanionMessage.created_at.asc())
        ).all()
    rows = rows[-COMPANION_CONTEXT_TURNS:]
    return [
        {"role": "assistant" if r.role == "ai" else "user", "content": r.text or ""}
        for r in rows
    ]


def _save_message(couple_id: str, role: str, sender_user_id: str, text: str) -> None:
    with get_session() as s:
        s.add(
            CompanionMessage(
                id=new_id("cmsg_"),
                couple_id=couple_id,
                role=role,
                sender_user_id=sender_user_id,
                text=text,
                created_at=now_ms(),
            )
        )


def generate_reply_sync(user_id: str, ai_user_id: str, couple_id: str, user_text: str) -> str | None:
    if not settings.companion_enabled:
        return None
    with get_session() as s:
        comp = s.get(Companion, ai_user_id)
    system = comp.system_prompt if comp and comp.system_prompt else "你是用户的 AI 恋人，请温柔简短地中文回复。"
    # 先存用户这条，再把它包含进上下文一起发给 LLM
    _save_message(couple_id, "user", user_id, user_text)
    messages = recent_context(couple_id)
    try:
        reply = _call_llm(system, messages)
    except Exception as e:  # noqa: BLE001 - 回复失败不应影响主流程
        print(e)
        return None
    if not reply:
        return None
    _save_message(couple_id, "ai", ai_user_id, reply)
    return reply


async def generate_reply(user_id: str, ai_user_id: str, couple_id: str, user_text: str) -> str | None:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, generate_reply_sync, user_id, ai_user_id, couple_id, user_text
    )
