"""Demo tour: drive the real OVOS stack through every visage screen without saying the wake word.

Each step speaks utterances onto the core bus (as docs/spike_say.py does) or sends bus events where speech is
unreliable, waits for the skill's page to appear, and prints what is on screen and what to look at. Anything that
did not work is listed under its step and again at the end. Cleanup always runs, also on Ctrl-C or an error: it
dismisses only the timers and alarms this run created, stops OCP and clears the demo's template namespaces.

Usage: python tests/manual/demo.py [STEP ...] [--pace 1.0] [--list] [--bus ws://127.0.0.1:8181/core]
"""

import argparse
import sys
import time

import demo_alerts
import demo_media
import demo_steps
from demo_bus import DEFAULT_BUS, Bus, Tour

STEPS = {
    "face": (demo_steps.face, "what time is it, what's the date: the attention face and its badge"),
    "weather": (demo_steps.weather, "current, hourly, daily, tomorrow, sunset"),
    "timer": (demo_alerts.timers, "20 s and 45 s timers; the first goes off, both are dismissed"),
    "alarms": (demo_alerts.alarms, "chip, two chips, grid; all dismissed"),
    "alarm-ring": (
        demo_alerts.alarm_ring,
        "opt-in, not in the default run: an alarm for the next whole minute rings (waits up to ~75 s)",
    ),
    "list": (demo_steps.alert_list, "list my alerts, then the ListView with sample rows"),
    "answers": (demo_steps.answers, "flip a coin, who is albert einstein"),
    "templates": (demo_steps.templates, "every SYSTEM_* template"),
    "media": (demo_media.media, "now playing, pause, resume, suggestions, home, vinyl"),
}
CLEANUP_STEP = (demo_media.cleanup, "always runs last")
OPT_IN = {"alarm-ring"}
CLEANUP = "cleanup"


def chosen(names: list[str]) -> list[str]:
    """The steps to run, in tour order: the named ones, or every step but the opt-in ones; unknown names raise."""
    unknown = [name for name in names if name not in STEPS]
    if unknown:
        raise ValueError(f"unknown step(s) {unknown}; choose from {list(STEPS)}")
    return [name for name in STEPS if name in names or (not names and name not in OPT_IN)]


def timed(tour: Tour, name: str) -> None:
    started = time.monotonic()
    run_step = CLEANUP_STEP[0] if name == CLEANUP else STEPS[name][0]
    try:
        run_step(tour)
    except (OSError, ValueError, KeyError, TypeError) as error:
        tour.problem(f"step stopped: {error!r}")
    finally:
        tour.elapsed[name] = time.monotonic() - started
        print(f"   ({name}: {tour.elapsed[name]:.0f}s)", flush=True)


def summary(tour: Tour) -> int:
    print("\n== summary", flush=True)
    times = ", ".join(f"{name} {seconds:.0f}s" for name, seconds in tour.elapsed.items())
    print(f"   time: {times}; total {sum(tour.elapsed.values()):.0f}s", flush=True)
    if not tour.problems:
        print("   every step worked", flush=True)
        return 0
    for step, problems in tour.problems.items():
        for problem in problems:
            print(f"   {step}: {problem}", flush=True)
    return 1


def run(tour: Tour, names: list[str]) -> None:
    try:
        for name in names:
            timed(tour, name)
    except KeyboardInterrupt:
        print("\ninterrupted; cleaning up", flush=True)
        tour.problem("interrupted (Ctrl-C); later steps skipped")
    finally:
        timed(tour, CLEANUP)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("steps", nargs="*", metavar="STEP", help="steps to run (default: all); see --list")
    parser.add_argument("--pace", type=float, default=1.0, help="multiplies every dwell; 0.5 is twice as fast")
    parser.add_argument("--bus", default=DEFAULT_BUS)
    parser.add_argument("--list", action="store_true", help="list the steps and exit")
    args = parser.parse_args()
    if args.list:
        print("\n".join(f"{name}: {about}" for name, (_, about) in STEPS.items()) + f"\n{CLEANUP}: {CLEANUP_STEP[1]}")
        return
    try:
        names = chosen(args.steps)
    except ValueError as error:
        parser.error(str(error))
    bus = Bus(args.bus)
    tour = Tour(bus, pace=args.pace)
    try:
        run(tour, names)
    finally:
        bus.close()
    sys.exit(summary(tour))


if __name__ == "__main__":
    main()
