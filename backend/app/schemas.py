"""Pydantic request/response DTOs (mirror the Android Dtos.kt)."""
from __future__ import annotations

from pydantic import BaseModel


# --- auth ---
class DevLoginRequest(BaseModel):
    deviceLabel: str | None = None
    nickname: str | None = None


class DevLoginResponse(BaseModel):
    userId: str
    token: str
    nickname: str | None = None


# --- rings ---
class BindRingRequest(BaseModel):
    mac: str
    sn: str
    cpuid: str | None = None
    model: str | None = None
    firmware: str | None = None


class RingResponse(BaseModel):
    id: str
    mac: str
    sn: str
    model: str | None = None
    uniqueNo: str | None = None


# --- couples ---
class InviteResponse(BaseModel):
    code: str
    expiresAt: int


class AcceptRequest(BaseModel):
    code: str


class CoupleResponse(BaseModel):
    coupleId: str
    uniqueCode: str
    partnerUserId: str
    partnerNickname: str | None = None
    chatlabSession: str | None = None


# --- events ---
class MissYouRequest(BaseModel):
    triggerType: str = "button_double"  # button_double | imu_double
    memory: str | None = None  # 可选：自定义想你消息内容；缺省用预设随机文案


class MissYouEventResponse(BaseModel):
    id: str
    fromUserId: str
    toUserId: str
    triggerType: str
    memory: str | None = None
    createdAt: int
    delivered: bool
    reply: str | None = None  # 伴侣是 AI 时：AI 的第一条回复（同时会作为 miss_you 回推）


class MissYouHistoryItem(BaseModel):
    id: str
    fromUserId: str | None = None
    fromNickname: str | None = None
    memory: str | None = None
    triggerType: str | None = None
    createdAt: int | None = None
    deliveredAt: int | None = None
    readAt: int | None = None


class MissYouHistoryResponse(BaseModel):
    events: list[MissYouHistoryItem]


class MissYouStatsResponse(BaseModel):
    sent: int  # 自己发出的想念总数
    received: int  # 收到的想念总数


class DebugDoubleClickRequest(BaseModel):
    toUserId: str  # 目标接收方 userId
    fromUserId: str | None = None  # 可选：伪造的发送方（用于昵称展示）
    memory: str | None = None  # 可选：自定义关键回忆文案；缺省用预设随机文案
    triggerType: str = "button_double"  # button_double | imu_double


class DebugDoubleClickResponse(BaseModel):
    eventId: str
    toUserId: str
    fromUserId: str | None = None
    triggerType: str
    memory: str | None = None
    createdAt: int
    online: bool  # 目标用户当前是否有活跃 WS 连接
    delivered: bool


# --- companion (single-person AI partner) ---
class CreateCompanionRequest(BaseModel):
    name: str
    gender: str = "female"  # female | male | neutral
    traits: list[str] = []


class CompanionResponse(BaseModel):
    coupleId: str
    aiUserId: str
    name: str
    gender: str
    traits: list[str]


class CompanionMessageDTO(BaseModel):
    role: str  # user | ai
    text: str
    createdAt: int


class HistoryResponse(BaseModel):
    messages: list[CompanionMessageDTO]


# --- messages / analysis ---
class MessageRequest(BaseModel):
    text: str
    fileIndex: int | None = None  # for dedup when derived from a recording


class MessageResponse(BaseModel):
    pushed: bool
    detail: str | None = None
    reply: str | None = None  # 伴侣是 AI 时的即时回复


# --- recordings (ring .bin speex upload -> wav) ---
class RecordingResponse(BaseModel):
    id: str
    userId: str
    originalFilename: str | None = None
    durationMs: int | None = None
    sourceType: str | None = None
    decodeStatus: str  # decoded | failed
    decodeError: str | None = None
    binSize: int
    wavSize: int | None = None
    uploadedAt: int
    downloadUrl: str | None = None  # WAV download path when decoded
    asrStatus: str | None = None  # pending | done | failed (None if not queued)
    asrText: str | None = None  # transcript, linked to this recording
    asrError: str | None = None


# --- recall (双人回忆问答) ---
class RecallAskRequest(BaseModel):
    question: str


class RecallAnswerResponse(BaseModel):
    answer: str


class RecallMessageDTO(BaseModel):
    role: str  # user | ai
    text: str
    createdAt: int


class RecallHistoryResponse(BaseModel):
    messages: list[RecallMessageDTO]
