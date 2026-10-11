import pytest
from aiohttp.test_utils import TestClient, TestServer

from ovos_visage import web
from ovos_visage.app import Visage
from ovos_visage.framing import check_url, frame_policy


@pytest.mark.parametrize(
    ("headers", "frameable"),
    [
        ({}, True),
        ({"X-Frame-Options": "DENY"}, False),
        ({"X-Frame-Options": " SAMEORIGIN "}, False),
        ({"X-Frame-Options": "ALLOW-FROM https://x"}, True),
        ({"Content-Security-Policy": "default-src 'self'; frame-ancestors 'self'"}, False),
        ({"Content-Security-Policy": "frame-ancestors 'none'"}, False),
        ({"Content-Security-Policy": "frame-ancestors *"}, True),
        ({"Content-Security-Policy": "frame-ancestors https:"}, True),
        ({"Content-Security-Policy": "script-src 'self'"}, True),
    ],
)
def test_frame_policy(headers, frameable):
    assert frame_policy(headers)[0] is frameable


async def test_check_url_refuses_non_http_without_fetching():
    assert await check_url("file:///etc/passwd") == {"frameable": False, "reason": "not an http(s) URL"}


@pytest.fixture
async def client():
    visage = Visage("ws://127.0.0.1:9/core", "test-gui")
    async with TestClient(TestServer(visage.web.app)) as test_client:
        yield visage, test_client


async def test_frameable_checks_only_the_namespace_url(client, monkeypatch):
    visage, http = client
    checked = []

    async def fake_check(url):
        checked.append(url)
        return {"frameable": False, "reason": "X-Frame-Options: deny"}

    monkeypatch.setattr(web, "check_url", fake_check)
    assert (await http.get("/frameable/unknown")).status == 404
    visage.state.apply({"type": "mycroft.session.set", "namespace": "skill.a", "data": {"title": "no url"}})
    assert (await http.get("/frameable/skill.a")).status == 404
    visage.state.apply({"type": "mycroft.session.set", "namespace": "skill.a", "data": {"url": "https://site.test/"}})
    body = await (await http.get("/frameable/skill.a?url=https://evil.test/")).json()
    assert body == {"url": "https://site.test/", "frameable": False, "reason": "X-Frame-Options: deny"}
    assert checked == ["https://site.test/"]
