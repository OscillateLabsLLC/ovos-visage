"""GUI websocket protocol client for ovos-gui (SPEC 5.1): announce, get the port, connect, announce again."""

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable

import aiohttp
from yarl import URL

from ovos_visage.bus import CoreBus

LOG = logging.getLogger(__name__)
FRAMEWORK = "html"
GUI_ROUTE = "/gui"
PORT_TIMEOUT_S = 10.0
RECONNECT_DELAY_S = 3.0

MessageHandler = Callable[[dict], Awaitable[None]]
StatusHandler = Callable[[bool], Awaitable[None]]


def announcement(gui_id: str) -> dict:
    return {"gui_id": gui_id, "framework": FRAMEWORK}


class GuiClient:
    """Negotiates the GUI socket over the core bus and streams GUI protocol messages to a handler."""

    def __init__(self, bus: CoreBus, gui_id: str, on_message: MessageHandler, on_status: StatusHandler) -> None:
        self.bus = bus
        self.gui_id = gui_id
        self.on_message = on_message
        self.on_status = on_status
        self._port_waiter: asyncio.Future | None = None
        self._session: aiohttp.ClientSession | None = None
        self._ws: aiohttp.ClientWebSocketResponse | None = None
        self._task: asyncio.Task | None = None
        bus.on("mycroft.gui.port", self._on_port)

    @property
    def connected(self) -> bool:
        return self._ws is not None and not self._ws.closed

    async def start(self) -> None:
        self._session = aiohttp.ClientSession()
        self._task = asyncio.create_task(self._keep_connected())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._ws:
            await self._ws.close()
        if self._session:
            await self._session.close()

    async def send(self, message: dict) -> bool:
        if not self.connected:
            LOG.warning("GUI socket not connected; dropping %s", message)
            return False
        await self._ws.send_str(json.dumps(message))
        return True

    def gui_url(self, port: int) -> str:
        return str(URL(self.bus.url).with_port(port).with_path(GUI_ROUTE))

    async def _keep_connected(self) -> None:
        while True:
            try:
                port = await self._negotiate_port()
                await self._hold_gui_socket(port)
            except (aiohttp.ClientError, OSError, asyncio.TimeoutError) as err:
                LOG.info("GUI socket unavailable: %r", err)
            if self._ws is not None:
                self._ws = None
                await self.on_status(False)
            await asyncio.sleep(RECONNECT_DELAY_S)

    async def _negotiate_port(self) -> int:
        await self.bus.wait_connected()
        self._port_waiter = asyncio.get_running_loop().create_future()
        await self.bus.emit("mycroft.gui.connected", announcement(self.gui_id))
        LOG.info("sent mycroft.gui.connected on the core bus (gui_id=%s, framework=%s)", self.gui_id, FRAMEWORK)
        try:
            return await asyncio.wait_for(self._port_waiter, PORT_TIMEOUT_S)
        finally:
            self._port_waiter = None

    def _on_port(self, message: dict) -> None:
        data = message.get("data") or {}
        if data.get("gui_id") != self.gui_id:
            return
        if self._port_waiter is None or self._port_waiter.done():
            LOG.debug("ignoring repeated mycroft.gui.port %s", data)
            return
        LOG.info("mycroft.gui.port -> %s", data)
        self._port_waiter.set_result(int(data["port"]))

    async def _hold_gui_socket(self, port: int) -> None:
        url = self.gui_url(port)
        async with self._session.ws_connect(url, heartbeat=30) as ws:
            self._ws = ws
            await ws.send_str(json.dumps({"type": "mycroft.gui.connected", **announcement(self.gui_id)}))
            LOG.info("connected to %s and re-announced framework=%s on the GUI socket", url, FRAMEWORK)
            await self.on_status(True)
            async for msg in ws:
                if msg.type is aiohttp.WSMsgType.TEXT:
                    await self.on_message(json.loads(msg.data))
            LOG.info("GUI socket closed")
