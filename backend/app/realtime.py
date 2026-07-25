"""In-process WebSocket relay hub — the FCM-less push channel for 思念.

Maps userId -> set of live sockets. relay/services call send_to() to deliver a
miss-you to the partner's app instance(s) in real time.
"""
from __future__ import annotations

from starlette.websockets import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._by_user: dict[str, set[WebSocket]] = {}

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._by_user.setdefault(user_id, set()).add(ws)

    def disconnect(self, user_id: str, ws: WebSocket) -> None:
        sockets = self._by_user.get(user_id)
        if not sockets:
            return
        sockets.discard(ws)
        if not sockets:
            self._by_user.pop(user_id, None)

    def is_online(self, user_id: str) -> bool:
        return bool(self._by_user.get(user_id))

    async def send_to(self, user_id: str, message: dict) -> bool:
        """Deliver to every live socket of user_id. Returns True if delivered."""
        sockets = self._by_user.get(user_id)
        if not sockets:
            return False
        delivered = False
        for ws in list(sockets):
            try:
                await ws.send_json(message)
                delivered = True
            except Exception:
                self.disconnect(user_id, ws)
        return delivered


manager = ConnectionManager()
