"""HTTP and websocket server: index, /static, /res (the ovos-gui cache), and /ws (snapshot then GUI deltas)."""

import json
import logging
from collections.abc import Awaitable, Callable
from pathlib import Path

from aiohttp import WSMsgType, web

from ovos_visage.framing import check_url
from ovos_visage.resources import DEFAULT_CACHE_ROOT, SeenImages, resolve_under
from ovos_visage.state import GuiState

LOG = logging.getLogger(__name__)
STATIC_DIR = Path(__file__).parent / "static"
SNAPSHOT = "visage.snapshot"

FocusHandler = Callable[[str, int], Awaitable[None]]


async def _no_cache(_request: web.Request, response: web.StreamResponse) -> None:
    """Browsers otherwise reuse static files heuristically, so a reload after a GUI change shows stale JS."""
    response.headers["Cache-Control"] = "no-cache"


class WebServer:
    def __init__(
        self,
        state: GuiState,
        on_focus: FocusHandler,
        cache_root: Path = DEFAULT_CACHE_ROOT,
        host: str = "127.0.0.1",
        port: int = 8766,
        images: SeenImages | None = None,
    ) -> None:
        self.state = state
        self.images = images if images is not None else SeenImages()
        self.on_focus = on_focus
        self.cache_root = cache_root
        self.host = host
        self.port = port
        self.gui_connected = False
        self._sockets: set[web.WebSocketResponse] = set()
        self._runner: web.AppRunner | None = None
        self.app = web.Application()
        self.app.add_routes(
            [
                web.get("/", self._index),
                web.get("/ws", self._websocket),
                web.get("/res-abs/{token}", self._seen_image),
                web.get("/res/{path:.+}", self._resource),
                web.get("/frameable/{namespace}", self._frameable),
            ]
        )
        self.app.router.add_static("/static/", STATIC_DIR)
        self.app.on_response_prepare.append(_no_cache)

    async def start(self) -> None:
        self._runner = web.AppRunner(self.app)
        await self._runner.setup()
        await web.TCPSite(self._runner, self.host, self.port).start()
        LOG.info("visage GUI at http://%s:%d/", self.host, self.port)

    async def stop(self) -> None:
        for ws in list(self._sockets):
            await ws.close()
        if self._runner:
            await self._runner.cleanup()

    def snapshot(self) -> dict:
        return {"type": SNAPSHOT, "gui_connected": self.gui_connected, "state": self.state.snapshot()}

    async def broadcast(self, message: dict) -> None:
        payload = json.dumps(message, separators=(",", ":"))
        for ws in list(self._sockets):
            try:
                await ws.send_str(payload)
            except ConnectionError:
                self._sockets.discard(ws)

    async def broadcast_snapshot(self) -> None:
        await self.broadcast(self.snapshot())

    async def _index(self, _request: web.Request) -> web.StreamResponse:
        return web.FileResponse(STATIC_DIR / "index.html")

    async def _frameable(self, request: web.Request) -> web.Response:
        """Framing policy for the `url` the namespace's skill set; the browser never names the URL itself."""
        namespace = self.state.namespaces.get(request.match_info["namespace"])
        url = namespace.data.get("url") if namespace else None
        if not isinstance(url, str):
            raise web.HTTPNotFound()
        return web.json_response({"url": url, **await check_url(url)})

    async def _seen_image(self, request: web.Request) -> web.StreamResponse:
        """An image file outside the cache that a skill named in session data; unknown tokens are 404."""
        path = self.images.resolve(request.match_info["token"])
        if path is None:
            raise web.HTTPNotFound()
        return web.FileResponse(path)

    async def _resource(self, request: web.Request) -> web.StreamResponse:
        path = resolve_under(self.cache_root, request.match_info["path"])
        if path is None:
            LOG.warning("refused resource request %s", request.match_info["path"])
            raise web.HTTPNotFound()
        return web.FileResponse(path)

    async def _websocket(self, request: web.Request) -> web.WebSocketResponse:
        ws = web.WebSocketResponse(heartbeat=30)
        await ws.prepare(request)
        self._sockets.add(ws)
        await ws.send_json(self.snapshot())
        try:
            async for msg in ws:
                if msg.type is WSMsgType.TEXT:
                    await self.handle_input(json.loads(msg.data))
        finally:
            self._sockets.discard(ws)
        return ws

    async def handle_input(self, event: dict) -> None:
        if event.get("type") == "focus" and isinstance(event.get("namespace"), str) and isinstance(event.get("number"), int):
            await self.on_focus(event["namespace"], event["number"])
        else:
            LOG.warning("unknown browser event %r", event)
