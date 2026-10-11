"""CLI and wiring: core bus, GUI protocol client, state mirror, widget manager and the browser server."""

import argparse
import asyncio
import json
import logging
import uuid
from pathlib import Path

from ovos_visage.bus import DEFAULT_BUS_URL, CoreBus
from ovos_visage.gui_client import GuiClient
from ovos_visage.resources import DEFAULT_CACHE_ROOT, PathRewriter
from ovos_visage.state import FOCUS_EVENT, GuiState
from ovos_visage.web import WebServer
from ovos_visage.widgets import WidgetManager

LOG = logging.getLogger(__name__)
DEFAULT_HTTP_PORT = 8766
DEFAULT_HOST = "127.0.0.1"


def log_gui_message(message: dict) -> None:
    kind = message.get("type")
    if kind == "mycroft.gui.list.insert":
        LOG.info("%s ns=%s pos=%s data=%s", kind, message.get("namespace"), message.get("position"), message.get("data"))
    elif kind == "mycroft.session.set":
        LOG.info("%s ns=%s keys=%s", kind, message.get("namespace"), list((message.get("data") or {}).keys()))
    LOG.debug("gui <- %s", json.dumps(message)[:500])


def focus_message(namespace: str, number: int) -> dict:
    """ovos-gui reads ``parameters`` (not ``data``) from client events and takes the namespace from ``skillId``."""
    return {
        "type": "mycroft.events.triggered",
        "namespace": namespace,
        "event_name": FOCUS_EVENT,
        "parameters": {"number": number, "skillId": namespace},
    }


class Visage:
    """One GUI client process: core bus link, GUI socket, state mirror, widgets and web server."""

    def __init__(
        self,
        bus_url: str = DEFAULT_BUS_URL,
        gui_id: str | None = None,
        host: str = DEFAULT_HOST,
        http_port: int = DEFAULT_HTTP_PORT,
        cache_root: Path = DEFAULT_CACHE_ROOT,
        record: Path | None = None,
    ) -> None:
        self.state = GuiState()
        self.rewriter = PathRewriter(cache_root)
        self.record = record
        self.bus = CoreBus(bus_url)
        self.widgets = WidgetManager(self.bus)
        self.gui = GuiClient(self.bus, gui_id or default_gui_id(), self.on_gui_message, self.on_gui_status)
        self.web = WebServer(self.state, self.on_browser_focus, cache_root, host, http_port, self.rewriter.images)
        self._last_focus: tuple[str, int] | None = None

    async def on_gui_message(self, message: dict) -> None:
        log_gui_message(message)
        self._record(message)
        message = self.rewriter.rewrite(message)
        if self.state.apply(message):
            await self.web.broadcast(message)

    async def on_gui_status(self, connected: bool) -> None:
        LOG.info("GUI socket %s; clearing state", "connected" if connected else "disconnected")
        self.state.reset()
        self._last_focus = None
        self.web.gui_connected = connected
        await self.web.broadcast_snapshot()

    async def on_browser_focus(self, namespace: str, number: int) -> None:
        if self._last_focus == (namespace, number):
            return
        self._last_focus = (namespace, number)
        await self.gui.send(focus_message(namespace, number))

    def _record(self, message: dict) -> None:
        if self.record:
            with self.record.open("a") as handle:
                handle.write(json.dumps(message) + "\n")

    async def start(self) -> None:
        await self.web.start()
        await self.bus.start()
        await self.gui.start()

    async def stop(self) -> None:
        await self.gui.stop()
        await self.bus.stop()
        await self.web.stop()

    async def run_forever(self) -> None:
        await self.start()
        try:
            await asyncio.Event().wait()
        finally:
            await self.stop()


def default_gui_id() -> str:
    return f"ovos-visage-{uuid.uuid4().hex[:8]}"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ovos-visage", description="Browser GUI client for OpenVoiceOS")
    parser.add_argument("--host", default=DEFAULT_HOST, help="bind address for the browser GUI")
    parser.add_argument("--http-port", type=int, default=DEFAULT_HTTP_PORT, help="port for the browser GUI")
    parser.add_argument("--bus", default=DEFAULT_BUS_URL, help="OVOS core messagebus websocket URL")
    parser.add_argument("--gui-id", default=None, help="GUI client id announced to ovos-gui (default: random)")
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE_ROOT, help="ovos-gui resource cache served at /res/")
    parser.add_argument("--record", type=Path, default=None, help="append every received GUI message to this .jsonl file")
    parser.add_argument("-v", "--verbose", action="store_true", help="debug logging")
    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    visage = Visage(args.bus, args.gui_id, args.host, args.http_port, args.cache_dir, args.record)
    try:
        asyncio.run(visage.run_forever())
    except KeyboardInterrupt:
        pass
