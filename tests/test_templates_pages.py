"""SYSTEM_* templates (SPEC 8.2), driven by a recording of tests/manual/show_templates.py against the live ovos-gui."""

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from ovos_visage.resources import PathRewriter
from ovos_visage.state import IDLE_NAMESPACE
from tests.conftest import load_fixture
from tests.test_state import replay

NODE = shutil.which("node")
SCRIPT = Path(__file__).parent / "templates_replay.mjs"
STATIC = Path(__file__).parent.parent / "ovos_visage" / "static"
FIXTURE = "templates_show_all.jsonl"
# The ovos-gui cache as recorded in the fixtures (home anonymised to /home/ovos), not this machine's.
CACHE_ROOT = Path("/home/ovos/.cache/ovos_gui")
TEMPLATES = (
    "SYSTEM_TextFrame",
    "SYSTEM_Loading",
    "SYSTEM_Status",
    "SYSTEM_ImageFrame",
    "SYSTEM_AnimatedImageFrame",
    "SYSTEM_HtmlFrame",
    "SYSTEM_UrlFrame",
    "SYSTEM_InputBox",
)
needs_node = pytest.mark.skipif(NODE is None, reason="node is not installed")


def pages_shown(messages):
    state, shown = replay([]), []
    for message in messages:
        replay([message], state)
        current = state.current()
        if current and (not shown or shown[-1] != current):
            shown.append(current)
    return shown


@pytest.fixture(scope="module")
def shown_models(tmp_path_factory):
    """Node replay of the fixture after the same cache-path rewrite the app applies before state and browser."""
    if NODE is None:
        pytest.skip("node is not installed")
    rewriter = PathRewriter(CACHE_ROOT)
    path = tmp_path_factory.mktemp("templates") / FIXTURE
    path.write_text("".join(json.dumps(rewriter.rewrite(message)) + "\n" for message in load_fixture(FIXTURE)))
    result = subprocess.run([NODE, str(SCRIPT), str(path)], capture_output=True, text=True, check=True)
    return {page["namespace"].removeprefix("visage-templates-"): page["model"] for page in json.loads(result.stdout)["pages"]}


def test_every_sample_shows_its_template_then_idle_returns():
    shown = pages_shown(load_fixture(FIXTURE))
    samples = [(namespace.removeprefix("visage-templates-"), page) for namespace, page in shown if namespace != IDLE_NAMESPACE]
    assert [sample for sample, _ in samples] == [
        "text", "text-long", "loading", "status-ok", "status-off", "image",
        "image-http", "animated", "html", "url", "url-refused", "input",
    ]  # fmt: skip
    assert {page for _, page in samples} == set(TEMPLATES)
    assert shown[0] == (IDLE_NAMESPACE, "idle") and shown[-1] == (IDLE_NAMESPACE, "idle")


def test_router_routes_every_template_by_page_name():
    router = (STATIC / "router.js").read_text()
    for template in (*TEMPLATES, "SYSTEM_Face"):
        match = re.search(rf'\b{template}: "\./(pages/[a-z_]+\.js)"', router)
        assert match, template
        assert (STATIC / match.group(1)).is_file(), match.group(1)
    assert '<link rel="stylesheet" href="/static/templates.css">' in (STATIC / "index.html").read_text()


@needs_node
def test_text_and_status_models(shown_models):
    assert shown_models["text"] == {"title": "Unit conversion", "text": "Three teaspoons make one tablespoon."}
    assert shown_models["text-long"]["title"] == "" and len(shown_models["text-long"]["text"].split()) > 90
    assert shown_models["loading"] == {"label": "Looking that up"}
    assert shown_models["status-ok"] == {"ok": True, "label": "Wi-Fi connected"}
    assert shown_models["status-off"] == {"ok": False, "label": "Microphone muted"}


@needs_node
def test_image_models_cover_cache_path_http_and_data_uri(shown_models):
    cache, http, animated = shown_models["image"], shown_models["image-http"], shown_models["animated"]
    assert cache["src"] == "/res/ovos-skill-weather.openvoiceos/qt5/images/sun.svg"
    assert (cache["fit"], cache["background"], cache["title"]) == ("contain", "#0d1a28", "Clear sky")
    assert http["src"].startswith("https://") and (http["fit"], http["title"], http["background"]) == ("cover", "", "transparent")
    assert animated["src"].startswith("data:image/svg+xml") and animated["caption"] == "data: URI"


@needs_node
def test_html_url_and_input_models(shown_models):
    html = shown_models["html"]
    assert html["base"] == "" and html["srcdoc"].startswith("<h1>Shopping list</h1>")
    assert shown_models["url"] == {"url": "https://example.com/", "frameable": True}
    assert shown_models["url-refused"] == {"url": "https://www.google.com/", "frameable": True}
    assert shown_models["input"] == {
        "title": "Name your timer",
        "placeholder": "Say a name",
        "confirm": "Confirm",
        "exit": "Exit",
    }
