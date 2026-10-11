"""OVOS core messagebus client: one reconnecting websocket with handlers keyed by message type."""

import asyncio
import inspect
import json
import logging
from collections import defaultdict
from collections.abc import Awaitable, Callable

import aiohttp

LOG = logging.getLogger(__name__)
DEFAULT_BUS_URL = "ws://127.0.0.1:8181/core"
RECONNECT_DELAY_S = 3.0
SOURCE = "ovos-visage"

Handler = Callable[[dict], Awaitable[None] | None]


class CoreBus:
    """Keeps one websocket to the messagebus open, reconnects when it drops, and dispatches by type."""

    def __init__(self, url: str = DEFAULT_BUS_URL) -> None:
        self.url = url
        self._handlers: dict[str, list[Handler]] = defaultdict(list)
        self._connected = asyncio.Event()
        self._session: aiohttp.ClientSession | None = None
        self._ws: aiohttp.ClientWebSocketResponse | None = None
        self._task: asyncio.Task | None = None

    @property
    def connected(self) -> bool:
        return self._ws is not None and not self._ws.closed

    def on(self, msg_type: str, handler: Handler) -> None:
        self._handlers[msg_type].append(handler)

    async def wait_connected(self) -> None:
        await self._connected.wait()

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

    async def emit(self, msg_type: str, data: dict | None = None) -> bool:
        if not self.connected:
            LOG.warning("bus not connected; dropping %s", msg_type)
            return False
        payload = {"type": msg_type, "data": data or {}, "context": {"source": SOURCE}}
        await self._ws.send_str(json.dumps(payload))
        return True

    async def dispatch(self, message: dict) -> None:
        for handler in self._handlers.get(message.get("type", ""), []):
            try:
                result = handler(message)
                if inspect.isawaitable(result):
                    await result
            except Exception:
                LOG.exception("bus handler failed for %s", message.get("type"))

    async def _keep_connected(self) -> None:
        while True:
            try:
                await self._hold_connection()
            except (aiohttp.ClientError, OSError) as err:
                LOG.debug("bus unavailable at %s: %s", self.url, err)
            self._ws = None
            self._connected.clear()
            await asyncio.sleep(RECONNECT_DELAY_S)

    async def _hold_connection(self) -> None:
        async with self._session.ws_connect(self.url, heartbeat=30) as ws:
            self._ws = ws
            self._connected.set()
            LOG.info("connected to messagebus at %s", self.url)
            async for msg in ws:
                if msg.type is aiohttp.WSMsgType.TEXT:
                    await self.dispatch(json.loads(msg.data))
            LOG.info("messagebus connection closed")
