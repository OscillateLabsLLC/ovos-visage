import pytest

from ovos_visage.bus import CoreBus
from ovos_visage.gui_client import GuiClient
from tests.conftest import FakeOvos, wait_for

PAGE_INSERT = {
    "type": "mycroft.gui.list.insert",
    "namespace": "ovos-skill-date-time.openvoiceos",
    "position": 0,
    "data": [{"url": None, "page": "time"}],
}


@pytest.fixture
async def ovos():
    fake = FakeOvos([PAGE_INSERT])
    await fake.server.start_server()
    yield fake
    await fake.server.close()


@pytest.fixture
async def client(ovos):
    received, statuses = [], []

    async def on_message(message):
        received.append(message)

    async def on_status(connected):
        statuses.append(connected)

    bus = CoreBus(ovos.core_url)
    gui = GuiClient(bus, "test-gui", on_message, on_status)
    await bus.start()
    await gui.start()
    yield gui, received, statuses
    await gui.stop()
    await bus.stop()


async def test_announces_on_both_sockets_and_streams_messages(ovos, client):
    gui, received, statuses = client
    await wait_for(lambda: received)
    assert ovos.core_received[0] == {
        "type": "mycroft.gui.connected",
        "data": {"gui_id": "test-gui", "framework": "html"},
        "context": {"source": "ovos-visage"},
    }
    assert ovos.gui_received[0] == {"type": "mycroft.gui.connected", "gui_id": "test-gui", "framework": "html"}
    assert received == [PAGE_INSERT]
    assert statuses == [True] and gui.connected


async def test_ignores_port_for_other_clients_and_repeats(ovos, client):
    gui, received, _ = client
    await wait_for(lambda: received)
    await ovos.emit_core("mycroft.gui.port", {"port": 1, "gui_id": "someone-else"})
    await ovos.emit_core("mycroft.gui.port", {"port": 1, "gui_id": "test-gui"})
    assert gui.connected and len(ovos.gui_sockets) == 1


async def test_send_and_status_after_gui_drop(ovos, client):
    gui, received, statuses = client
    await wait_for(lambda: received)
    focus = {"type": "mycroft.events.triggered", "namespace": "x", "event_name": "page_gained_focus", "parameters": {}}
    assert await gui.send(focus)
    await wait_for(lambda: len(ovos.gui_received) == 2)
    await ovos.gui_sockets[0].close()
    await wait_for(lambda: statuses == [True, False])
    assert not await gui.send(focus)


def test_gui_url_uses_bus_host_and_announced_port():
    gui = GuiClient(CoreBus("ws://10.0.0.5:8181/core"), "g", None, None)
    assert gui.gui_url(18181) == "ws://10.0.0.5:18181/gui"


async def test_bus_emit_without_connection_is_refused():
    bus = CoreBus("ws://127.0.0.1:9/core")
    assert not bus.connected
    assert not await bus.emit("anything")
