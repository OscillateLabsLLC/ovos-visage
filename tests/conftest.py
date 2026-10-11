import asyncio
import json
from pathlib import Path

from aiohttp import WSMsgType, web
from aiohttp.test_utils import TestServer

FIXTURES = Path(__file__).parent / "fixtures"


async def wait_for(predicate, timeout: float = 3.0) -> None:
    """Poll until predicate() is true; CI runners schedule the server coroutines late."""
    for _ in range(int(timeout / 0.02)):
        if predicate():
            return
        await asyncio.sleep(0.02)
    raise AssertionError("condition not met in time")


def load_fixture(name: str) -> list[dict]:
    lines = (FIXTURES / name).read_text().splitlines()
    return [json.loads(line) for line in lines if line.strip()]


class FakeOvos:
    """Plays the core bus (/core) and ovos-gui (/gui) on one test server."""

    def __init__(self, gui_messages: list[dict] | None = None) -> None:
        self.core_received: list[dict] = []
        self.gui_received: list[dict] = []
        self.gui_messages = gui_messages or []
        self.core_sockets: list[web.WebSocketResponse] = []
        self.gui_sockets: list[web.WebSocketResponse] = []
        self.port = 0
        app = web.Application()
        app.add_routes([web.get("/core", self._core), web.get("/gui", self._gui)])
        self.server = TestServer(app)

    @property
    def core_url(self) -> str:
        return f"ws://127.0.0.1:{self.server.port}/core"

    async def _core(self, request: web.Request) -> web.WebSocketResponse:
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        self.core_sockets.append(ws)
        async for msg in ws:
            if msg.type is WSMsgType.TEXT:
                await self._on_core(ws, json.loads(msg.data))
        return ws

    async def _on_core(self, ws: web.WebSocketResponse, message: dict) -> None:
        self.core_received.append(message)
        if message["type"] == "mycroft.gui.connected":
            data = message["data"]
            reply = {"port": self.server.port, "gui_id": data["gui_id"], "framework": data["framework"]}
            await ws.send_json({"type": "mycroft.gui.port", "data": reply, "context": {}})

    async def _gui(self, request: web.Request) -> web.WebSocketResponse:
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        self.gui_sockets.append(ws)
        async for msg in ws:
            if msg.type is WSMsgType.TEXT:
                self.gui_received.append(json.loads(msg.data))
                if len(self.gui_received) == 1:
                    for gui_message in self.gui_messages:
                        await ws.send_json(gui_message)
        return ws

    async def emit_core(self, msg_type: str, data: dict) -> None:
        for ws in self.core_sockets:
            await ws.send_json({"type": msg_type, "data": data, "context": {}})
