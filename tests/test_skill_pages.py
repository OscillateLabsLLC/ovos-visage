"""Date-time and weather pages (SPEC 8.3, 8.4), driven by live recordings in tests/fixtures."""

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
SCRIPT = Path(__file__).parent / "pages_replay.mjs"
STATIC = Path(__file__).parent.parent / "ovos_visage" / "static"
WEATHER = "ovos-skill-weather.openvoiceos"
DATETIME = "ovos-skill-date-time.openvoiceos"
ALERTS = "ovos-skill-alerts.openvoiceos"
needs_node = pytest.mark.skipif(NODE is None, reason="node is not installed")


def pages_shown(messages):
    """Every (namespace, page) that became current, in order, without consecutive repeats."""
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


def models(fixture):
    return {page["page"]: page["model"] for page in node_replay(fixture)["pages"] if page["model"]}


def test_current_weather_chains_hourly_then_daily_then_idle():
    assert pages_shown(load_fixture("weather_current_hourly_daily.jsonl")) == [
        (IDLE_NAMESPACE, "idle"),
        (WEATHER, "CurrentWeather"),
        (WEATHER, "HourlyForecast"),
        (WEATHER, "DailyForecast"),
        (IDLE_NAMESPACE, "idle"),
    ]


def test_single_day_and_hourly_return_to_idle():
    single = pages_shown(load_fixture("weather_single_day.jsonl"))
    hourly = pages_shown(load_fixture("weather_hourly.jsonl"))
    assert single == [(IDLE_NAMESPACE, "idle"), (WEATHER, "SingleDay"), (IDLE_NAMESPACE, "idle")]
    assert hourly == [(IDLE_NAMESPACE, "idle"), (WEATHER, "HourlyForecast"), (IDLE_NAMESPACE, "idle")]


def test_sunset_and_date_pages_over_a_running_timer_never_flash_idle():
    shown = pages_shown(load_fixture("weather_sunset_over_timer.jsonl"))
    assert shown == [(ALERTS, "Timer"), (DATETIME, "date"), (WEATHER, "SunriseSunset"), (ALERTS, "Timer")]


def test_time_then_date_over_a_running_timer_never_flash_idle():
    shown = pages_shown(load_fixture("datetime_time_date_over_timer.jsonl"))
    assert shown == [(ALERTS, "Timer"), (DATETIME, "time"), (ALERTS, "Timer"), (DATETIME, "date"), (ALERTS, "Timer")]


def test_time_page_keys():
    state = replay([])
    for message in load_fixture("datetime_time_date_over_timer.jsonl"):
        replay([message], state)
        if state.current() == (DATETIME, "time"):
            break
    data = state.namespaces[DATETIME].data
    assert data["time_string"].count(":") == 1 and "date_string" in data and "ampm_string" in data


def test_forecast_item_shapes_match_the_skill_builders():
    data = {}
    for message in load_fixture("weather_current_hourly_daily.jsonl"):
        if message["type"] == "mycroft.session.set" and message["namespace"] == WEATHER:
            data.update(message["data"])
    assert {"weatherCondition", "highTemperature", "lowTemperature", "date"} == set(data["forecast"]["all"][0])
    assert {"weatherCondition", "time", "temperature", "precipitation"} == set(data["hourlyForecast"]["hours"][0])


def test_router_entries_point_at_existing_modules():
    routes = re.findall(r'"([^"]+/[^"]+)": "\./(pages/[a-z_]+\.js)"', (STATIC / "router.js").read_text())
    assert len(routes) == 16
    for _, module in routes:
        assert (STATIC / module).is_file(), module


@needs_node
def test_animated_codes_follow_weather_delegate_and_have_icons():
    icons = node_replay("weather_single_day.jsonl")["icons"]
    assert icons[:2] == ["sun", "night"] and icons[8:12] == ["rain"] * 4 and icons[16:] == ["fog", "fog"]
    for name in set(icons):
        assert (STATIC / "icons" / f"{name}.svg").is_file(), name


@needs_node
def test_current_weather_model_from_live_data():
    model = models("weather_current_hourly_daily.jsonl")["CurrentWeather"]
    assert model["icon"] == "sun" and model["big"] == "22°"
    assert [chip["value"] for chip in model["chips"]] == ["30°", "15°", "0%"]
    assert model["location"] == "San Antonio, United States"


@needs_node
def test_forecast_models_from_live_data():
    shown = models("weather_current_hourly_daily.jsonl")
    daily, hourly = shown["DailyForecast"]["items"], shown["HourlyForecast"]["items"]
    assert [item["label"] for item in daily] == ["Sun", "Mon", "Tue", "Wed"]
    assert daily[2] == {"label": "Tue", "icon": "rain", "main": "33°", "sub": "22°"}
    assert len(hourly) == 4 and hourly[0]["label"] == "23:00" and hourly[0]["sub"] == "0%"


@needs_node
def test_single_day_and_sunset_models_from_live_data():
    single = models("weather_single_day.jsonl")["SingleDay"]
    assert single["heading"] == "Sun, 11 October" and single["icon"] == "partial_clouds"
    assert single["big"] == "32°" and [chip["value"] for chip in single["chips"]] == ["18°", "3%", "51%"]
    assert single["details"] == "wind 7"
    sun = models("weather_sunset_over_timer.jsonl")["SunriseSunset"]
    assert (sun["sunrise"], sun["sunset"]) == ("07:25", "18:49")
