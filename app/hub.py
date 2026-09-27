"""WebSocket fan-out to every open browser tab, plus small rolling buffers for late joiners."""
from __future__ import annotations

import asyncio
import time
from collections import deque

from fastapi import WebSocket


class Hub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.agent_log: deque[dict] = deque(maxlen=200)
        self.phone: deque[dict] = deque(maxlen=12)
        self.playback = asyncio.Event()
        self.sync_token = 0

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.clients.discard(ws)
        if not self.clients:
            self.playback.set()  # nobody is watching: never block the debate

    async def send(self, ws: WebSocket, event: dict) -> None:
        try:
            await ws.send_json(event)
        except Exception:
            self.disconnect(ws)

    async def emit(self, type_: str, **data) -> None:
        event = {"type": type_, "ts": time.time(), **data}
        if type_ == "agent_log":
            self.agent_log.append(event)
        elif type_ == "phone":
            self.phone.append(event)
        for ws in list(self.clients):
            await self.send(ws, event)

    async def wait_playback(self, timeout: float = 150) -> None:
        """Block until the browser has finished speaking everything queued so far."""
        if not self.clients:
            return
        self.sync_token += 1
        self.playback.clear()
        await self.emit("sync", token=self.sync_token)
        try:
            await asyncio.wait_for(self.playback.wait(), timeout)
        except asyncio.TimeoutError:
            pass

    def playback_done(self, token: int) -> None:
        if token >= self.sync_token:
            self.playback.set()


hub = Hub()
