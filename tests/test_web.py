import pytest
from aiohttp.test_utils import TestClient, TestServer

from ovos_visage.app import Visage, focus_message
from tests.conftest import load_fixture, wait_for


@pytest.fixture
async def client(tmp_path):
    (tmp_path / "skill" / "qt5").mkdir(parents=True)
    (tmp_path / "skill" / "qt5" / "sun.svg").write_text("<svg/>")
    (tmp_path.parent / "secret.txt").write_text("no")
    visage = Visage("ws://127.0.0.1:9/core", "test-gui", cache_root=tmp_path)
    sent = []

    async def fake_send(message):
        sent.append(message)
        return True

    visage.gui.send = fake_send
    async with TestClient(TestServer(visage.web.app)) as test_client:
        yield visage, test_client, sent


async def test_index_and_static(client):
    _visage, http, _ = client
    page = await http.get("/")
    assert page.status == 200 and 'id="screen"' in await page.text()
    for path in ("/static/visage.js", "/static/mirror.js", "/static/pages/idle.js", "/static/icons/sun.svg"):
        response = await http.get(path)
        assert response.status == 200, path
        assert response.headers["Cache-Control"] == "no-cache"


async def test_res_serves_cache_only(client):
    _visage, http, _ = client
    assert (await http.get("/res/skill/qt5/sun.svg")).status == 200
    assert (await http.get("/res/../secret.txt")).status == 404
    assert (await http.get("/res/%2e%2e/secret.txt")).status == 404
    assert (await http.get("/res/skill/missing.svg")).status == 404


async def test_ws_snapshot_then_deltas(client):
    visage, http, _ = client
    ws = await http.ws_connect("/ws")
    first = await ws.receive_json()
    assert first == {"type": "visage.snapshot", "gui_connected": False, "state": visage.state.snapshot()}
    boot = load_fixture("boot_sync_idle.jsonl")
    for message in boot:
        await visage.on_gui_message(message)
    deltas = [await ws.receive_json() for _ in boot]
    # Deltas carry the same path rewrite the app applies before state and browser.
    assert deltas == [visage.rewriter.rewrite(message) for message in boot]
    await visage.on_gui_message({"type": "not.a.gui.message"})
    await visage.on_gui_status(False)
    reset = await ws.receive_json()
    assert reset["type"] == "visage.snapshot" and reset["state"]["active"] == []
    await ws.close()


async def test_ws_rewrites_cache_paths(client, tmp_path):
    visage, http, _ = client
    ws = await http.ws_connect("/ws")
    await ws.receive_json()
    image = str(tmp_path / "skill" / "qt5" / "sun.svg")
    await visage.on_gui_message({"type": "mycroft.session.set", "namespace": "w", "data": {"weatherCondition": image}})
    delta = await ws.receive_json()
    assert delta["data"]["weatherCondition"] == "/res/skill/qt5/sun.svg"
    assert visage.state.namespaces["w"].data["weatherCondition"] == "/res/skill/qt5/sun.svg"
    await ws.close()


async def test_browser_focus_is_forwarded_once_per_change(client):
    _visage, http, sent = client
    ws = await http.ws_connect("/ws")
    await ws.receive_json()
    for _ in range(2):
        await ws.send_json({"type": "focus", "namespace": "ns", "number": 0})
    await ws.send_json({"type": "focus", "namespace": "ns", "number": 1})
    await ws.send_json({"type": "bogus"})
    await wait_for(lambda: len(sent) == 2)
    assert sent == [focus_message("ns", 0), focus_message("ns", 1)]
    assert sent[0]["parameters"] == {"number": 0, "skillId": "ns"}
    await ws.close()
