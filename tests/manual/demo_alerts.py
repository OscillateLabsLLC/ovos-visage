"""Timer and alarm steps of the demo tour, and the pure helpers they use (ids, phrases), tested in tests/test_demo.py.

Only alerts this run created are dismissed: ids already pending in the skill's store when a step starts are never
touched. Spoken "cancel" is unreliable with several alerts pending (docs/UPSTREAM_ISSUES.md 4 and 20), so the tour
dismisses through the skill's GUI events instead.
"""

import json
from datetime import datetime, timedelta
from pathlib import Path

from demo_bus import Tour, page_shown, value_set

ALERTS = "ovos-skill-alerts.openvoiceos"
STORE = Path.home() / ".local/share/mycroft/filesystem/skills" / ALERTS / "alerts.json"
ALARM, TIMER = 0, 1  # ovos_skill_alerts.util.AlertType
# gui.register_handler prefixes the skill id; cancel_alarm is also registered bare with add_event.
CANCEL_TIMER = f"{ALERTS}.ovos.alerts.cancel_timer"
CANCEL_ALARM = "ovos.alerts.cancel_alarm"
# The homescreen alarm chip's action: shows every pending alarm, silently (a new alarm shows only itself).
SHOW_ALARMS = "ovos.gui.show.active.alarms"
RING_LEAD_S = 75
FAR_ALARMS = ("set an alarm for 6:30 am", "set an alarm for 9:45 pm", "set an alarm for 7:15 pm")


def read_store(path: Path = STORE) -> dict:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def pending_ids(store: dict, alert_type: int) -> set[str]:
    """Ids of the pending alerts of one type; the store keeps each alert as a JSON string keyed by its ident."""
    ids = set()
    for ident, raw in (store.get("pending") or {}).items():
        alert = json.loads(raw) if isinstance(raw, str) else raw
        if alert.get("alert_type") == alert_type:
            ids.add(str((alert.get("context") or {}).get("ident") or ident))
    return ids


def timer_ids(data: dict, expired_only: bool = False) -> list[str]:
    timers = (data.get("activeTimers") or {}).get("timers") or []
    return [str(t["alertId"]) for t in timers if "alertId" in t and (t.get("expired") or not expired_only)]


def alarm_ids(data: dict, expired_only: bool = False) -> list[str]:
    alarms = data.get("activeAlarms") or []
    return [str(a["alarmIndex"]) for a in alarms if "alarmIndex" in a and (a.get("alarmExpired") or not expired_only)]


def ringing_alarm_phrase(now: datetime, lead_s: int = RING_LEAD_S) -> tuple[str, datetime]:
    """An alarm phrase for the first whole minute at least lead_s - 60 seconds away: long enough to set it."""
    at = (now + timedelta(seconds=lead_s)).replace(second=0, microsecond=0)
    hour = at.hour % 12 or 12
    return f"set an alarm for {hour}:{at.minute:02d} {'am' if at.hour < 12 else 'pm'}", at


def create(tour: Tour, phrase: str, page: str, ids_of, known: set) -> str | None:
    """Say `phrase` and return the id of the alert it added (one not in `known`).

    The first alert shows `page`; later ones only update the page already up (no new gui.page.show), so the step
    waits for the new id in the GUI data rather than for the page.
    """
    since = tour.bus.mark()
    tour.say(phrase)
    found = tour.bus.wait(value_set(ALERTS, lambda d: set(ids_of(d)) - known), 10, since)
    if not found:
        tour.problem(f'"{phrase}": no new alert id in the GUI data')
        return None
    shown = tour.bus.wait(page_shown(ALERTS, page), 0, since)
    print(f"   {'shown' if shown else 'updated'}: {ALERTS} / {page}", flush=True)
    new = min(set(ids_of(found[1]["data"])) - known)
    known.add(new)
    return new


def dismiss(tour: Tour, event: str, data: dict, ids: list[str], what: str) -> None:
    since = tour.bus.mark()
    print(f"   dismiss {what} by GUI event {event}", flush=True)
    tour.bus.emit(event, data)
    tour.dismissed.update(ids)
    tour.bus.wait_speech_done(since)


def dismiss_timer(tour: Tour, ident: str) -> None:
    dismiss(tour, CANCEL_TIMER, {"timer": {"alertId": ident}}, [ident], f"timer {ident[:8]}")


def dismiss_alarms(tour: Tour, ids: list[str]) -> None:
    dismiss(tour, CANCEL_ALARM, {"alarmIndex": ids}, ids, f"{len(ids)} alarm(s)")


def wait_expired(tour: Tour, ids_of, ident: str, timeout: float) -> bool:
    print(f"   waiting up to {timeout:.0f}s for it to go off", flush=True)
    found = tour.bus.wait(value_set(ALERTS, lambda d: ident in ids_of(d, expired_only=True)), timeout, tour.bus.mark())
    if not found:
        tour.problem(f"{ident[:8]} did not go off within {timeout:.0f}s")
    return bool(found)


def timers(tour: Tour) -> None:
    tour.heading("timer", "two short timers; the first goes off, warms, blooms red; both are dismissed")
    known = pending_ids(read_store(), TIMER)
    first = create(tour, "set a timer for 20 seconds", "Timer", timer_ids, known)
    tour.timers.update({first} - {None})
    tour.look("one gradient ring counting down, warming to yellow then red near the end")
    second = create(tour, "set a timer for 45 seconds", "Timer", timer_ids, known)
    tour.timers.update({second} - {None})
    tour.look("two rings stacked")
    if first and wait_expired(tour, timer_ids, first, 40):
        tour.look('"Time\'s up" in the red ring, the glow blooming on a loop')
        tour.dwell(5)
        dismiss_timer(tour, first)
    if second:
        dismiss_timer(tour, second)


def show_all_alarms(tour: Tour, ids: list[str]) -> None:
    since = tour.bus.mark()
    print(f"   bus: {SHOW_ALARMS}", flush=True)
    tour.bus.emit(SHOW_ALARMS)
    if not tour.bus.wait(value_set(ALERTS, lambda d: set(ids) <= set(alarm_ids(d))), 10, since):
        tour.problem(f"{SHOW_ALARMS} did not show all {len(ids)} alarms")


def alarms(tour: Tour) -> None:
    tour.heading("alarms", "one chip, two chips, then the grid; all are dismissed")
    known = pending_ids(read_store(), ALARM)
    looks = ("one alarm chip with a swinging bell", "two chips, the next to fire glowing", "the 2x2 grid")
    ids = []
    for phrase, look in zip(FAR_ALARMS, looks, strict=True):
        ident = create(tour, phrase, "AlarmsOverviewCard", alarm_ids, known)
        if ident:
            ids.append(ident)
            tour.alarms.add(ident)
        if len(ids) > 1:
            show_all_alarms(tour, ids)
        tour.look(look)
        tour.dwell(4)
    if ids:
        dismiss_alarms(tour, ids)


def alarm_ring(tour: Tour) -> None:
    """Opt-in: alarms ring on whole minutes, so this waits up to RING_LEAD_S for one to go off."""
    tour.heading("alarm-ring", "an alarm for the next whole minute rings, then is dismissed")
    known = pending_ids(read_store(), ALARM)
    phrase, at = ringing_alarm_phrase(datetime.now())
    ident = create(tour, phrase, "AlarmsOverviewCard", alarm_ids, known)
    if not ident:
        return
    tour.alarms.add(ident)
    if wait_expired(tour, alarm_ids, ident, max(0, (at - datetime.now()).total_seconds()) + 45):
        tour.look('the ringing alarm: full brightness, red ring and bloom, shaking bell, "Ringing"')
        tour.dwell(6)
    dismiss_alarms(tour, [ident])
