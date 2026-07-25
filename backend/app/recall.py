"""双人回忆问答：关键词检索 ChatLab 对话 -> 阶跃基于记录回答。"""
from __future__ import annotations

import asyncio
import re
from datetime import datetime

from . import chatlab
from . import companion

# 疑问/功能词与常见语气词，检索时无意义，去掉以免污染 keyword。
_STOPWORDS = {
    "我们", "你们", "他们", "什么", "怎么", "为什么", "哪里", "哪儿", "哪个",
    "谁", "多少", "何时", "时候", "那次", "这次", "上次", "那个", "这个",
    "吗", "呢", "吧", "呀", "啊", "的", "了", "是", "有", "在", "和",
    "跟", "还", "就", "都", "也", "要", "会", "过", "一下", "记得", "帮我",
    "告诉", "我想", "知道", "回忆", "记录",
    # 个别中文字符的停用词（分词粒度调整）
    "我", "们", "次", "那", "去",
}
# 以非中文/非字母数字为切分边界。
_TOKEN = re.compile(r"[一-龥]{2,}|[A-Za-z0-9]{2,}")


# ⚠️ MVP 局限：无分词器时，连续中文问句会被 _TOKEN 整段匹配成一个"大词"，
# 作为 ChatLab keyword 基本查不到东西——此时检索实际只靠"最近窗口"兜底。
# 二期接 jieba 分词后才有真正的关键词召回。
def extract_keywords(question: str) -> list[str]:
    """从问句里取 ≤3 个检索候选词（去疑问词/停用词/标点）。无有效词返回 []。"""
    tokens = _TOKEN.findall(question or "")
    out: list[str] = []
    for t in tokens:
        if t in _STOPWORDS:
            continue
        # 进一步过滤：完全由停用词字符组成的令牌也要去掉。
        if all(char in _STOPWORDS for char in t):
            continue
        if t not in out:
            out.append(t)
        if len(out) >= 3:
            break
    return out


async def search_memory(session_id: str, question: str, recent: int = 40,
                        per_keyword: int = 30, cap: int = 60) -> list[dict]:
    """检索与问题相关的历史消息：关键词命中 + 最近窗口，合并去重按时间排序。"""
    collected: list[dict] = []
    # 1) 最近窗口（无 keyword，取最近 recent 条兜底上下文）
    collected += await chatlab.get_messages(session_id, limit=recent)
    # 2) 每个关键词各检索一批
    for kw in extract_keywords(question):
        collected += await chatlab.get_messages(session_id, keyword=kw, limit=per_keyword)
    # 3) 去重（sender+timestamp+content）
    seen: set[tuple] = set()
    unique: list[dict] = []
    for m in collected:
        key = (m.get("sender"), m.get("timestamp"), m.get("content"))
        if key in seen:
            continue
        seen.add(key)
        unique.append(m)
    # 4) 升序 + 截断
    unique.sort(key=lambda m: m.get("timestamp") or 0)
    return unique[-cap:]


RECALL_SYSTEM = (
    "你是这对情侣共同回忆的知情助手。下面是他们戒指语音转写的真实聊天记录。"
    "请只依据这些记录回答用户的问题：可以引用具体时间、原话、谁说的；"
    "记录里没有的信息，就如实说『在你们的记录里没找到相关内容』，绝不编造。"
    "回答用中文，自然、简洁、有温度。"
)

_NO_RECORDS = "在你们的记录里暂时没找到相关内容，换个说法或时间再问问我～"


def render_transcript(messages: list[dict]) -> str:
    lines = []
    for m in messages:
        ts = m.get("timestamp") or 0
        when = datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M") if ts else "?"
        who = m.get("senderName") or m.get("sender") or "TA"
        lines.append(f"[{when}] {who}：{m.get('content', '')}")
    return "\n".join(lines)


async def answer(session_id: str, question: str) -> str:
    records = await search_memory(session_id, question)
    if not records:
        return _NO_RECORDS
    transcript = render_transcript(records)
    messages = [{
        "role": "user",
        "content": f"【聊天记录】\n{transcript}\n\n【我的问题】{question}",
    }]
    try:
        reply = await asyncio.get_event_loop().run_in_executor(
            None, companion._call_llm, RECALL_SYSTEM, messages
        )
    except Exception as e:  # noqa: BLE001 - LLM 故障降级
        print(e)
        return _NO_RECORDS
    return reply or _NO_RECORDS
