"""Alerts skill pages (SPEC 8.5), driven by live recordings in tests/fixtures (cut with tests/manual/slice_recording.py)."""

import importlib.util
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from ovos_visage.state import IDLE_NAMESPACE
from tests.conftest import FIXTURES, load_fixture
from tests.test_state import replay

NODE = shutil.which("node")
SCRIPT = Path(__file__).parent / "alerts_replay.mjs"
STATIC = Path(__file__).parent.parent / "ovos_visage" / "static"
ALERTS = "ovos-skill-alerts.openvoiceos"
TIMERS = "alerts_two_timers_expire_cancel.jsonl"
ONE_TIMER = "alerts_one_timer_cancel.jsonl"
ALARM = "alerts_alarm_set_cancel.jsonl"
needs_node = pytest.mark.skipif(NODE is None, reason="node is not installed")


def pages_shown(messages):
    state, shown = replay([]), []
    for message in messages:
        replay([message], state)
        current = state.current()
        if current and (not shown or shown[-1] != current):
            shown.append(current)
    return shown


def node_replay(fixture):
    result = subprocess.run([NODE, str(SCRIPT), str(FIXTURES / fixture)], capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def timer_frames(fixture):
    """Timer lists per update; the page becomes current before the skill's first activeTimers, so skip empty frames."""
    frames = [frame["model"]["timers"] for frame in node_replay(fixture)["models"] if frame["page"] == "Timer"]
    return [timers for timers in frames if timers]


@pytest.mark.parametrize(
    ("fixture", "page"), [(TIMERS, "Timer"), (ONE_TIMER, "Timer"), (ALARM, "AlarmsOverviewCard")], ids=["timers", "one", "alarm"]
)
def test_alerts_page_shows_then_returns_to_idle(fixture, page):
    assert pages_shown(load_fixture(fixture)) == [(IDLE_NAMESPACE, "idle"), (ALERTS, page), (IDLE_NAMESPACE, "idle")]


def test_fixtures_hold_only_alerts_homescreen_and_system_traffic():
    allowed = {ALERTS, IDLE_NAMESPACE, "system", "mycroft.system.active_skills"}
    for fixture in (TIMERS, ONE_TIMER, ALARM):
        assert {message["namespace"] for message in load_fixture(fixture)} <= allowed, fixture


def test_skill_sends_stuck_percent_remaining():
    percents = [
        timer["percentRemaining"]
        for message in load_fixture(ONE_TIMER)
        if message["type"] == "mycroft.session.set" and "activeTimers" in message["data"]
        for timer in message["data"]["activeTimers"]["timers"]
    ]
    assert len(percents) > 10 and min(percents) > 0.999


def test_router_has_the_three_alerts_pages():
    router = (STATIC / "router.js").read_text()
    for page, module in (("Timer", "timer"), ("AlarmsOverviewCard", "alarms"), ("ListView", "alert_list")):
        assert re.search(rf'"{ALERTS}/{page}": "\./pages/{module}\.js"', router), page
        assert (STATIC / "pages" / f"{module}.js").is_file()
    assert '<link rel="stylesheet" href="/static/alerts.css">' in (STATIC / "index.html").read_text()


@needs_node
def test_single_timer_ring_depletes_from_time_delta():
    frames = timer_frames(ONE_TIMER)
    fractions = [timers[0]["fraction"] for timers in frames]
    assert fractions[0] == 1 and fractions == sorted(fractions, reverse=True) and fractions[-1] < 0.65
    assert frames[-1][0]["delta"] == "0:36" and abs(fractions[-1] - 36 / 59) < 1e-9


@needs_node
def test_two_timers_stack_expire_and_report_overrun():
    frames = timer_frames(TIMERS)
    assert max(len(timers) for timers in frames) == 2
    expired = [timer for timers in frames for timer in timers if timer["expired"]]
    assert expired and all(timer["fraction"] == 1 and timer["delta"].startswith("+") for timer in expired)
    both = next(timers for timers in frames if len(timers) == 2)
    assert [timer["name"] for timer in both] == ["set timer", "set timer"]


@needs_node
def test_alarm_card_model_from_live_data():
    frames = [frame["model"] for frame in node_replay(ALARM)["models"] if frame["page"] == "AlarmsOverviewCard"]
    alarm = frames[-1][0]
    assert (alarm["time"], alarm["ampm"], alarm["name"], alarm["repeat"], alarm["expired"]) == (
        "07:00",
        "",
        "Set Alarm",
        "Once",
        False,
    )


def load_slicer():
    spec = importlib.util.spec_from_file_location("slice_recording", Path(__file__).parent / "manual" / "slice_recording.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_slicer_drops_foreign_skills_and_rewrites_stack_positions():
    slicer = load_slicer()
    active = {"type": "mycroft.session.list.insert", "namespace": "mycroft.system.active_skills"}
    remove = {"type": "mycroft.session.list.remove", "namespace": "mycroft.system.active_skills", "items_number": 1}
    messages = [
        {**active, "position": 0, "data": [{"skill_id": IDLE_NAMESPACE}]},
        {**active, "position": 0, "data": [{"skill_id": "foreign"}]},
        {**active, "position": 0, "data": [{"skill_id": ALERTS}]},
        {"type": "mycroft.session.set", "namespace": "foreign", "data": {"x": 1}},
        {**remove, "position": 1},
        {**remove, "position": 0},
    ]
    out = slicer.slice_recording(messages, 3, len(messages), {ALERTS})
    assert [m.get("position") for m in out] == [0, 0, 0] and all(m["namespace"] != "foreign" for m in out)
    assert pages_shown(out) == [] and replay(out).active == [IDLE_NAMESPACE]
