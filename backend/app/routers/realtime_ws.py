from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..realtime import manager
from ..security import user_id_from_token

router = APIRouter()


@router.websocket("/realtime")
async def realtime(ws: WebSocket) -> None:
    token = ws.query_params.get("token", "")
    user_id = user_id_from_token(token)
    if not user_id:
        await ws.close(code=4401)
        return
    await manager.connect(user_id, ws)
    try:
        while True:
            # Client frames are keepalive/no-op; the server only pushes.
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user_id, ws)
    except Exception:
        manager.disconnect(user_id, ws)
