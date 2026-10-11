"""OCP with real skills and mpv playing (SPEC 8.6), from a live recording.

ocp_somafm_live_browse.jsonl: "play groove salad on soma fm" twice (the first stream failed to open, so OCP showed
SuggestionsView), a live SomaFM stream, "pause", "resume", a spoken "stop", then OCP's Home via the homescreen app
event (tests/manual/ocp_bus.py home).
Finite-track units are covered by the node tests (tests/js/ocp_model.test.mjs) from measured values.
"""

import pytest

from tests.conftest import load_fixture
from tests.test_ocp_page import NODE, OCP, collapse, node_replay
from tests.test_skill_pages import pages_shown

LIVE = "ocp_somafm_live_browse.jsonl"
needs_node = pytest.mark.skipif(NODE is None, reason="node is not installed")


def tracks(fixture, title):
    return [m for m in node_replay(fixture)["models"] if "track" in m and m["track"]["title"] == title]


def test_live_run_walks_busy_suggestions_player_and_home():
    shown = [page for namespace, page in pages_shown(load_fixture(LIVE)) if namespace == OCP]
    assert collapse(shown) == [
        "PlayerLoader",
        "busy",
        "SuggestionsView",
        "PlayerLoader",
        "SuggestionsView",
        "busy",
        "PlayerLoader",
        "SuggestionsView",
        "Home",
    ]


def test_live_fixture_holds_only_ocp_homescreen_and_my_utterances():
    messages = load_fixture(LIVE)
    assert {m["namespace"] for m in messages} <= {
        OCP,
        "ovos-skill-homescreen.openvoiceos",
        "system",
        "mycroft.system.active_skills",
    }
    said = [m["data"]["utterances"][0] for m in messages if m.get("event_name") == "recognizer_loop:utterance"]
    assert said == ["play groove salad on soma fm"] * 2 + ["pause", "resume", "stop"]


@needs_node
def test_live_stream_reads_as_live_with_a_full_steady_ring():
    stream = tracks(LIVE, "Drone Zone 2")
    playing = [m for m in stream if m["status"] == "Playing"]
    assert playing and all(m["track"]["live"] and m["progress"]["fraction"] == 1 for m in playing)
    shown = [m["shownMs"] for m in stream]
    assert shown[0] == 0 and stream[0]["track"]["positionMs"] == 94560  # the previous track's position, left in place
    assert shown == sorted(shown) and max(shown) > 10000


@needs_node
def test_somafm_sends_duration_minus_one_and_a_growing_length():
    durations = {m["data"]["duration"] for m in load_fixture(LIVE) if "duration" in (m.get("data") or {})}
    assert -1 in durations
    lengths = [m["data"]["length"] for m in load_fixture(LIVE) if m.get("namespace") == OCP and "length" in (m.get("data") or {})]
    assert lengths[-3:] == sorted(lengths[-3:])


@needs_node
def test_busy_suggestions_and_home_models_from_live_data():
    browse = {m["page"]: m["browse"] for m in node_replay(LIVE)["models"] if "browse" in m}
    assert browse["busy"]["label"] == "Searching..."
    assert browse["SuggestionsView"]["heading"] == "Playlist"
    suggestions = browse["SuggestionsView"]["rows"]
    assert (suggestions[0]["title"], suggestions[0]["current"]) == ("Drone Zone 2", True)
    assert suggestions[1].get("section") == "Search results" and not any(r["current"] for r in suggestions[1:])
    assert len(suggestions) == 7 and browse["SuggestionsView"]["hidden"] > 0
    assert [(r["title"], r["subtitle"]) for r in browse["Home"]["rows"]] == [
        ("News Skill", "news"),
        ("somafm skill", "music · radio"),
    ]
