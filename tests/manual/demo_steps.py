"""Spoken and template steps of the demo tour (tests/manual/demo.py): face, weather, list, answers, templates."""

import show_templates
from demo_bus import Tour, page_shown

DATE_TIME = "ovos-skill-date-time.openvoiceos"
WEATHER = "ovos-skill-weather.openvoiceos"
ALERTS = "ovos-skill-alerts.openvoiceos"
WEATHER_PAGE_TIMEOUT_S = 30
TEMPLATE_SECONDS = 4
SAMPLE_LIST = {
    "header": "Reminders",
    "items": [
        {"main": "Water the plants", "secondary": "Today at 6:00 PM"},
        {"main": "Call the vet", "secondary": "Tomorrow at 9:30 AM"},
        {"main": "Take out the recycling", "secondary": "Thursday at 7:00 AM"},
    ],
}


def face(tour: Tour) -> None:
    tour.heading("face", "the attention face, then the clock and the date")
    tour.say("what time is it", pages=("time",), namespace=DATE_TIME)
    tour.look("the face shrinks to the round badge over the clock; its hollow mouth follows the visemes")
    tour.dwell(2)
    tour.say("what's the date", pages=("date",), namespace=DATE_TIME)
    tour.look("the date ring with its glow")
    tour.dwell(2)


def weather(tour: Tour) -> None:
    tour.heading("weather", "current, hourly and daily, then tomorrow and sunset")
    tour.say("what is the weather", ("CurrentWeather", "HourlyForecast", "DailyForecast"), WEATHER, WEATHER_PAGE_TIMEOUT_S)
    tour.look("the animated icon in the gradient circle, then the hourly and daily rows (the skill's own 7 s steps)")
    tour.say("what is the weather tomorrow", pages=("SingleDay",), namespace=WEATHER, timeout=WEATHER_PAGE_TIMEOUT_S)
    tour.say("what time does the sun set", pages=("SunriseSunset",), namespace=WEATHER, timeout=WEATHER_PAGE_TIMEOUT_S)


def alert_list(tour: Tour) -> None:
    """ListView is only reachable by voice for reminders, events and to-do lists, which this demo does not create;
    "list my alerts" asks for every kind and the skill shows no page for that (_display_alerts skips AlertType.ALL).
    So after the spoken request the step shows the skill's ListView itself with sample rows, then clears it."""
    tour.heading("list", "the alerts ListView with its hero chip (sample rows)")
    since = tour.bus.mark()
    tour.say("list my alerts")
    if not tour.bus.wait(page_shown(ALERTS, "ListView"), 0, since):
        print("   no ListView for all alerts (by design); showing the page with sample reminders", flush=True)
        tour.bus.emit("gui.value.set", {"__from": ALERTS, **SAMPLE_LIST})
        tour.bus.emit("gui.page.show", {"__from": ALERTS, "page_names": ["ListView"], "index": 0, "__idle": 30})
        tour.namespaces.add(ALERTS)
    tour.look("the checklist hero with the item count, rows beneath")
    tour.dwell(5)
    if ALERTS in tour.namespaces:
        show_templates.clear(tour.bus.ws, ALERTS)
        tour.namespaces.discard(ALERTS)


def answers(tour: Tour) -> None:
    tour.heading("answers", "a short answer in the ring, then a picture answer")
    tour.say("flip a coin", pages=("SYSTEM_TextFrame",))
    tour.look("heads or tails, big, in the glowing ring")
    tour.dwell(3)
    tour.say("who is albert einstein", pages=("SYSTEM_ImageFrame",), timeout=30)
    tour.look("the DuckDuckGo answer: a picture with its title and caption")
    tour.dwell(4)
    print("   long text with page dots: no installed skill sends one; see text-long in the templates step", flush=True)


def templates(tour: Tour) -> None:
    tour.heading("templates", "every SYSTEM_* template from tests/manual/show_templates.py")
    seconds = TEMPLATE_SECONDS * tour.pace
    for sample in show_templates.SAMPLES:
        namespace = f"{show_templates.NAMESPACE}-{sample}"
        tour.namespaces.add(namespace)
        show_templates.show(tour.bus.ws, sample, seconds)
        tour.dwell(TEMPLATE_SECONDS)
        show_templates.clear(tour.bus.ws, namespace)
        tour.namespaces.discard(namespace)
