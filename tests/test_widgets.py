import pytest

from ovos_visage.widgets import WidgetManager


class RecordingBus:
    def __init__(self) -> None:
        self.handlers = {}
        self.emitted = []

    def on(self, msg_type, handler):
        self.handlers[msg_type] = handler

    async def emit(self, msg_type, data=None):
        self.emitted.append((msg_type, data))
        return True

    async def send(self, msg_type, data=None):
        await self.handlers[msg_type]({"type": msg_type, "data": data or {}})


@pytest.fixture
def bus():
    bus = RecordingBus()
    WidgetManager(bus)
    return bus


@pytest.mark.parametrize(("kind", "typed"), [("timer", "timer"), ("alarm", "alarm"), ("audio", "media")])
async def test_widget_messages_are_translated_to_typed_ones(bus, kind, typed):
    widget = {"count": 1, "action": f"ovos.gui.show.pending.{kind}s"}
    await bus.send("ovos.widgets.display", {"type": kind, "data": widget})
    await bus.send("ovos.widgets.update", {"type": kind, "data": widget})
    await bus.send("ovos.widgets.remove", {"type": kind, "data": widget})
    assert bus.emitted == [
        (f"ovos.widgets.{typed}.display", {"widget": widget}),
        (f"ovos.widgets.{typed}.update", {"widget": widget}),
        (f"ovos.widgets.{typed}.remove", None),
    ]


async def test_unknown_widget_type_is_logged_not_emitted(bus, caplog):
    await bus.send("ovos.widgets.update", {"type": "weather", "data": {}})
    assert bus.emitted == [] and "unknown widget type" in caplog.text


async def test_notification_set_emits_immediately_and_dedupes(bus):
    note = {"sender": "alerts", "text": "Missed timer", "duration": 5}
    await bus.send("ovos.notification.api.set", note)
    kinds = [kind for kind, _ in bus.emitted]
    assert kinds == ["ovos.notification.update_counter", "ovos.notification.notification_data", "ovos.notification.show"]
    assert bus.emitted[0][1] == {"notification_counter": 1}
    record = bus.emitted[1][1]["notification"]
    assert record["style"] == "info" and record["callback_data"] == {} and "timestamp" in record


async def test_pop_clear_moves_to_storage_and_storage_ops(bus):
    note = {"sender": "alerts", "text": "Missed timer"}
    await bus.send("ovos.notification.api.set", note)
    await bus.send("ovos.notification.api.pop.clear", {"notification": note})
    await bus.send("ovos.notification.api.pop.clear", {"notification": note})
    await bus.send("ovos.notification.api.request.storage.model")
    models = [data for kind, data in bus.emitted if kind == "ovos.notification.update_storage_model"]
    assert len(models) == 2 and models[-1]["notification_model"] == {"storedmodel": [note], "count": 1}
    await bus.send("ovos.notification.api.storage.clear.item", {"notification": note})
    assert bus.emitted[-1][1]["notification_model"]["count"] == 0
    await bus.send("ovos.notification.api.storage.clear")
    assert bus.emitted[-1][1]["notification_model"] == {"storedmodel": [], "count": 0}


async def test_pop_clear_delete_and_controlled(bus):
    note = {"sender": "s", "text": "t"}
    await bus.send("ovos.notification.api.set", note)
    await bus.send("ovos.notification.api.pop.clear.delete", {"notification": note})
    await bus.send("ovos.notification.api.pop.clear.delete", {})
    await bus.send("ovos.notification.api.storage.clear.item", {})
    await bus.send("ovos.notification.api.set", note)
    assert bus.emitted[-3] == ("ovos.notification.update_counter", {"notification_counter": 1})
    await bus.send("ovos.notification.api.set.controlled", {"sender": "s", "text": "busy"})
    await bus.send("ovos.notification.api.remove.controlled")
    assert bus.emitted[-2][0] == "ovos.notification.controlled.type.show"
    assert bus.emitted[-1] == ("ovos.notification.controlled.type.remove", None)
