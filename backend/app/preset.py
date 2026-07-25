"""Preset '关键回忆' quotes attached to a 思念 in the first cut (F1)."""
from __future__ import annotations

import random

QUOTES = [
    "此刻，有人正在想你 💍",
    "还记得我们第一次牵手吗？",
    "无论多远，我的心一直在你身边。",
    "想你了，就这么简单。",
    "今天也要好好吃饭，我在想你。",
    "你是我最想分享今天的人。",
    "闭上眼，就能想起你的笑。",
    "早点休息，梦里见。",
]


def random_quote() -> str:
    return random.choice(QUOTES)
