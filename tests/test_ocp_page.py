"""OCP now-playing page (SPEC 8.6), driven by a live recording (cut with tests/manual/slice_recording.py).

The recording is a SomaFM stream started with tests/manual/play_media.py, then "pause", "resume", three finite-length
tracks with a filesystem-path cover, and "stop". No installed OCP skill could start playback (docs/UPSTREAM_ISSUES.md).
"""

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from tests.conftest import FIXTURES, load_fixture
from tests.test_skill_pages import pages_shown

NODE = shutil.which("node")
SCRIPT = Path(__file__).parent / "ocp_replay.mjs"
STATIC = Path(__file__).parent.parent / "ovos_visage" / "static"
OCP = "ovos.common_play"
FIXTURE = "ocp_play_pause_resume_stop.jsonl"
needs_node = pytest.mark.skipif(NODE is None, reason="node is not installed")


def node_replay(fixture=FIXTURE):
    result = subprocess.run([NODE, str(SCRIPT), str(FIXTURES / fixture)], capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def player_models(fixture=FIXTURE):
    return [model for model in node_replay(fixture)["models"] if "track" in model]


def collapse(values):
    return [value for i, value in enumerate(values) if i == 0 or values[i - 1] != value]


def test_ocp_shows_player_loader_not_ovos_sync_player():
    assert pages_shown(load_fixture(FIXTURE)) == [(OCP, "PlayerLoader")]
    backends = {m["data"]["playerBackend"] for m in load_fixture(FIXTURE) if "playerBackend" in (m.get("data") or {})}
    assert backends == {"OVOSSyncPlayer"}


def test_fixture_holds_only_ocp_homescreen_and_my_utterances():
    messages = load_fixture(FIXTURE)
    assert {m["namespace"] for m in messages} <= {
        OCP,
        "ovos-skill-homescreen.openvoiceos",
        "system",
        "mycroft.system.active_skills",
    }
    said = [m["data"]["utterances"][0] for m in messages if m.get("event_name") == "recognizer_loop:utterance"]
    assert said == ["pause", "resume", "stop"]


def test_router_sends_every_ocp_screen_to_a_page():
    routes = dict(re.findall(r'"(ovos\.common_play/[A-Za-z]+)": "\./(pages/[a-z_]+\.js)"', (STATIC / "router.js").read_text()))
    assert routes == {
        f"{OCP}/PlayerLoader": "pages/now_playing.js",
        f"{OCP}/OVOSSyncPlayer": "pages/now_playing.js",
        f"{OCP}/busy": "pages/ocp_busy.js",
        f"{OCP}/SuggestionsView": "pages/ocp_list.js",
        f"{OCP}/Home": "pages/ocp_list.js",
    }


@needs_node
def test_states_follow_the_session_through_play_pause_resume_stop():
    states = collapse([model["track"]["state"] for model in player_models()])
    assert states[-1] == "stopped"
    assert states[states.index("playing") :][:3] == ["playing", "paused", "playing"]


@needs_node
def test_live_stream_has_http_cover_and_full_ring():
    stream = [m for m in player_models() if m["track"]["title"] == "Groove Salad" and m["track"]["state"] == "playing"]
    assert stream and all(m["track"]["live"] and m["progress"]["fraction"] == 1 for m in stream)
    assert stream[0]["track"]["cover"] == "https://somafm.com/img3/groovesalad-400.jpg"
    assert stream[0]["progress"]["total"] == "live"


@needs_node
def test_finite_track_reads_string_duration_and_drops_a_filesystem_cover():
    finite = [m for m in player_models() if m["track"]["title"] == "Groove Salad (finite test 3)"]
    last = finite[-1]
    assert last["track"]["durationMs"] == 213000 and last["progress"]["total"] == "3:33"
    assert last["track"]["cover"] is None and last["track"]["state"] == "stopped"
    assert all(m["syncPlayer"] for m in finite)


@needs_node
def test_extracting_title_appears_while_ocp_resolves_the_stream():
    titles = {m["track"]["title"] for m in player_models()}
    assert "Extracting info from: https://ice1.somafm.com/groovesalad-128-mp3" in titles
