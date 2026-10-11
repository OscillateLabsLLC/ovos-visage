"""Widget and notification translator (SPEC 7.2), ported from ovos-gui-plugin-shell-companion's WidgetManager.

The alerts skill emits generic ``ovos.widgets.*`` messages and the homescreen listens for typed ones. With the
``generic`` gui extension nobody translates, so this does, attached to the core bus.
"""

import logging
import time

from ovos_visage.bus import CoreBus

LOG = logging.getLogger(__name__)
WIDGET_TYPES = {"timer": "timer", "alarm": "alarm", "audio": "media"}
NOTIFICATION_DEFAULTS = {"duration": 10, "sender": "", "text": "", "action": "", "type": "", "style": "info"}


def _same_notification(a: dict, b: dict) -> bool:
    return a.get("sender") == b.get("sender") and a.get("text") == b.get("text")


class WidgetManager:
    def __init__(self, bus: CoreBus) -> None:
        self.bus = bus
        self.notifications: list[dict] = []
        self.storage: list[dict] = []
        for verb in ("display", "update", "remove"):
            bus.on(f"ovos.widgets.{verb}", self._widget_handler(verb))
        handlers = {
            "request.storage.model": self.emit_storage_model,
            "set": self._on_set,
            "pop.clear": self._on_pop_clear,
            "pop.clear.delete": self._on_pop_clear_delete,
            "storage.clear": self._on_storage_clear,
            "storage.clear.item": self._on_storage_clear_item,
            "set.controlled": self._on_set_controlled,
            "remove.controlled": self._on_remove_controlled,
        }
        for suffix, handler in handlers.items():
            bus.on(f"ovos.notification.api.{suffix}", handler)

    def _widget_handler(self, verb: str):
        async def handle(message: dict) -> None:
            data = message.get("data") or {}
            widget = WIDGET_TYPES.get(data.get("type", ""))
            if widget is None:
                LOG.warning("unknown widget type in %r", message)
                return
            payload = None if verb == "remove" else {"widget": data.get("data", "")}
            await self.bus.emit(f"ovos.widgets.{widget}.{verb}", payload)

        return handle

    async def emit_storage_model(self, _message: dict | None = None) -> None:
        model = {"storedmodel": self.storage, "count": len(self.storage)}
        await self.bus.emit("ovos.notification.update_storage_model", {"notification_model": model})

    async def _on_set(self, message: dict) -> None:
        data = message.get("data") or {}
        record = {key: data.get(key, default) for key, default in NOTIFICATION_DEFAULTS.items()}
        record["callback_data"] = data.get("callback_data") or {}
        record["timestamp"] = time.time()
        if record in self.notifications:
            return
        self.notifications.append(record)
        await self.bus.emit("ovos.notification.update_counter", {"notification_counter": len(self.notifications)})
        await self.bus.emit("ovos.notification.notification_data", {"notification": record})
        await self.bus.emit("ovos.notification.show")

    def _drop_pending(self, notification: dict) -> None:
        for index, pending in enumerate(self.notifications):
            if _same_notification(pending, notification):
                del self.notifications[index]
                return

    async def _on_pop_clear(self, message: dict) -> None:
        notification = (message.get("data") or {}).get("notification")
        if not notification or notification in self.storage:
            LOG.debug("empty or duplicate notification dropped: %r", notification)
            return
        self.storage.append(notification)
        self._drop_pending(notification)
        await self.emit_storage_model()
        await self.bus.emit("ovos.notification.notification_data", {"notification": {}})

    async def _on_pop_clear_delete(self, message: dict) -> None:
        notification = (message.get("data") or {}).get("notification")
        if notification:
            self._drop_pending(notification)

    async def _on_storage_clear(self, _message: dict) -> None:
        self.storage = []
        await self.emit_storage_model()

    async def _on_storage_clear_item(self, message: dict) -> None:
        notification = (message.get("data") or {}).get("notification")
        if not notification:
            return
        self.storage = [item for item in self.storage if not _same_notification(item, notification)]
        await self.emit_storage_model()

    async def _on_set_controlled(self, message: dict) -> None:
        data = message.get("data") or {}
        record = {"sender": data.get("sender", ""), "text": data.get("text", ""), "style": data.get("style", "info")}
        record["timestamp"] = time.time()
        await self.bus.emit("ovos.notification.controlled.type.show", {"notification": record})

    async def _on_remove_controlled(self, _message: dict) -> None:
        await self.bus.emit("ovos.notification.controlled.type.remove")
