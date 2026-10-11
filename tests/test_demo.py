"""Pure parts of the demo tour (tests/manual/demo*.py), without OVOS: the step table, alert ids, phrases, matchers."""

import json
import sys
import threading
from datetime import datetime
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent / "manual"))

import demo
import demo_alerts
import demo_bus

SPIKE_SAY = Path(__file__).parents[1] / "docs" / "spike_say.py"


def test_steps_run_in_tour_order_and_cleanup_is_not_selectable():
    assert list(demo.STEPS) == ["face", "weather", "timer", "alarms", "alarm-ring", "list", "answers", "templates", "media"]
    assert demo.chosen([]) == [name for name in demo.STEPS if name != "alarm-ring"]
    assert demo.chosen(["media", "face"]) == ["face", "media"]
    assert demo.chosen(["alarm-ring", "alarms"]) == ["alarms", "alarm-ring"]
    with pytest.raises(ValueError, match="cleanup"):
        demo.chosen(["cleanup"])
    assert all(callable(run) and about for run, about in demo.STEPS.values())


def store_entry(ident, alert_type):
    return json.dumps({"alert_type": alert_type, "alert_name": "x", "context": {"ident": ident}})


def test_pending_ids_split_by_type_from_the_skill_store():
    store = {"missed": {}, "pending": {"a": store_entry("a", 1), "b": store_entry("b", 0), "c": store_entry("c", 1)}}
    assert demo_alerts.pending_ids(store, demo_alerts.TIMER) == {"a", "c"}
    assert demo_alerts.pending_ids(store, demo_alerts.ALARM) == {"b"}
    assert demo_alerts.pending_ids({}, demo_alerts.TIMER) == set()


def test_read_store_tolerates_a_missing_or_broken_file(tmp_path):
    assert demo_alerts.read_store(tmp_path / "absent.json") == {}
    broken = tmp_path / "alerts.json"
    broken.write_text("{")
    assert demo_alerts.read_store(broken) == {}


def test_ids_come_from_the_gui_session_data():
    timers = {"activeTimers": {"timers": [{"alertId": "t1", "expired": False}, {"alertId": "t2", "expired": True}]}}
    assert demo_alerts.timer_ids(timers) == ["t1", "t2"]
    assert demo_alerts.timer_ids(timers, expired_only=True) == ["t2"]
    alarms = {"activeAlarms": [{"alarmIndex": "a1", "alarmExpired": True}, {"alarmIndex": "a2", "alarmExpired": False}]}
    assert demo_alerts.alarm_ids(alarms) == ["a1", "a2"]
    assert demo_alerts.alarm_ids(alarms, expired_only=True) == ["a1"]
    assert demo_alerts.timer_ids({}) == [] and demo_alerts.alarm_ids({"activeAlarms": None}) == []


@pytest.mark.parametrize(
    ("now", "phrase"),
    [
        (datetime(2026, 10, 11, 10, 17, 30), "set an alarm for 10:18 am"),
        (datetime(2026, 10, 11, 11, 59, 0), "set an alarm for 12:00 pm"),
        (datetime(2026, 10, 11, 23, 59, 50), "set an alarm for 12:01 am"),
        (datetime(2026, 10, 11, 13, 4, 0), "set an alarm for 1:05 pm"),
    ],
)
def test_the_ringing_alarm_is_the_first_whole_minute_after_the_lead(now, phrase):
    said, at = demo_alerts.ringing_alarm_phrase(now)
    assert said == phrase
    assert demo_alerts.RING_LEAD_S - 60 <= (at - now).total_seconds() <= demo_alerts.RING_LEAD_S


def test_utterance_matches_docs_spike_say():
    source = SPIKE_SAY.read_text()
    message = demo_bus.utterance("what time is it")
    assert message["type"] == "recognizer_loop:utterance"
    assert message["data"] == {"utterances": ["what time is it"], "lang": "en-us"}
    assert f'"context": {json.dumps(message["context"])}' in source


def show(namespace, *pages):
    return {"type": "gui.page.show", "data": {"__from": namespace, "page_names": list(pages), "index": 0}}


def test_page_matcher_wants_the_page_and_the_namespace():
    match = demo_bus.page_shown("ovos-skill-weather.openvoiceos", "HourlyForecast")
    assert match(show("ovos-skill-weather.openvoiceos", "HourlyForecast"))
    assert not match(show("ovos-skill-weather.openvoiceos", "CurrentWeather"))
    assert not match(show("other", "HourlyForecast"))
    assert not match({"type": "gui.value.set", "data": {"__from": "ovos-skill-weather.openvoiceos"}})
    assert demo_bus.page_shown(None, "SYSTEM_TextFrame")(show("skill-ovos-randomness.openvoiceos", "SYSTEM_TextFrame"))


def test_value_matcher_tests_the_data():
    match = demo_bus.value_set("ovos.common_play", lambda d: d.get("status") == "Playing")
    assert match({"type": "gui.value.set", "data": {"__from": "ovos.common_play", "status": "Playing"}})
    assert not match({"type": "gui.value.set", "data": {"__from": "ovos.common_play", "status": "Paused"}})


def offline_bus(messages):
    bus = object.__new__(demo_bus.Bus)
    bus.messages = list(messages)
    bus.changed = threading.Condition()
    return bus


def test_wait_finds_pages_in_order_and_times_out():
    bus = offline_bus([show("w", "CurrentWeather"), show("w", "HourlyForecast"), show("w", "CurrentWeather")])
    first = bus.wait(demo_bus.page_shown("w", "CurrentWeather"), 0.1)
    assert first[0] == 0
    assert bus.wait(demo_bus.page_shown("w", "CurrentWeather"), 0.1, since=first[0] + 1)[0] == 2
    assert bus.wait(demo_bus.page_shown("w", "DailyForecast"), 0.05) is None


def test_wait_wakes_when_a_message_arrives():
    bus = offline_bus([])

    def arrive():
        with bus.changed:
            bus.messages.append(show("w", "DailyForecast"))
            bus.changed.notify_all()

    threading.Timer(0.05, arrive).start()
    assert bus.wait(demo_bus.page_shown("w", "DailyForecast"), 2)[0] == 0


def test_speech_done_waits_for_quiet_after_the_last_end():
    start, end = {"type": demo_bus.AUDIO_START}, {"type": demo_bus.AUDIO_END}
    assert offline_bus([start, end]).wait_speech_done(0, timeout=0.1)
    assert not offline_bus([start]).wait_speech_done(0, timeout=0.1)
    assert not offline_bus([start, end, start]).wait_speech_done(0, timeout=0.1)
