from fastapi import APIRouter, HTTPException

from .. import relay
from ..config import settings
from ..schemas import (
    DebugDoubleClickRequest,
    DebugDoubleClickResponse,
    MissYouEventResponse,
    MissYouHistoryResponse,
    MissYouRequest,
    MissYouStatsResponse,
)
from ..security import CurrentUser

router = APIRouter(tags=["events"])


@router.post("/events/miss-you", response_model=MissYouEventResponse)
async def miss_you(req: MissYouRequest, user_id: str = CurrentUser) -> MissYouEventResponse:
    result = await relay.send_miss_you(user_id, req.triggerType, req.memory)
    return MissYouEventResponse(**result)


@router.get("/events")
def get_events(since: int = 0, user_id: str = CurrentUser) -> dict:
    return {"events": relay.events_since(user_id, since)}


@router.get("/events/miss-you", response_model=MissYouHistoryResponse)
def get_miss_you_history(user_id: str = CurrentUser) -> MissYouHistoryResponse:
    """拉取所有发给自己的想念记录（不区分是否已读/已送达），按时间倒序。"""
    return MissYouHistoryResponse(events=relay.all_events_for(user_id))


@router.get("/events/miss-you/stats", response_model=MissYouStatsResponse)
def get_miss_you_stats(user_id: str = CurrentUser) -> MissYouStatsResponse:
    """统计自己发送和接收到的想念总数。"""
    return MissYouStatsResponse(**relay.miss_you_stats(user_id))


@router.post("/debug/double-click", response_model=DebugDoubleClickResponse)
async def debug_double_click(req: DebugDoubleClickRequest) -> DebugDoubleClickResponse:
    """调试接口：直接向指定 userId 推送一个 double-click（思念）事件。
    绕过配对关系，仅用于调试客户端实时推送。仅在 DEV_AUTH 开启时可用。"""
    if not settings.dev_auth:
        raise HTTPException(404, "not found")
    result = await relay.debug_send_double_click(
        req.toUserId, req.fromUserId, req.memory, req.triggerType
    )
    return DebugDoubleClickResponse(**result)
