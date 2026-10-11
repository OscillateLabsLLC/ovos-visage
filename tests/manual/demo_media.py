"""Media and cleanup steps of the demo tour (tests/manual/demo.py).

OCP is stopped on the bus, never by a spoken "stop" (docs/UPSTREAM_ISSUES.md 17). A SomaFM stream can fail to open
(18); the play is retried once when OCP reports Stopped right after Playing.
"""

from argparse import Namespace

import play_media
import show_templates
from demo_alerts import dismiss_alarms, dismiss_timer
from demo_bus import Tour, page_shown, value_set
from ocp_bus import MESSAGES as OCP_MESSAGES

OCP = "ovos.common_play"
STREAM_SETTLE_S = 5  # also the first half of the 10 s on now playing
PLAY_TIMEOUT_S = 30


def status_is(status: str):
    return value_set(OCP, lambda d: d.get("status") == status)


def play_spoken(tour: Tour, phrase: str, last_try: bool) -> bool:
    """Say the play phrase; True once OCP is Playing and stays up for STREAM_SETTLE_S.

    A stream that stops at once is only a problem on the last try; before that it is a note and the caller retries.
    """
    since = tour.bus.mark()
    tour.say(phrase, pages=("PlayerLoader",), namespace=OCP, timeout=PLAY_TIMEOUT_S)
    playing = tour.bus.wait(status_is("Playing"), PLAY_TIMEOUT_S, since)
    if not playing:
        tour.problem(f'"{phrase}": OCP never reported Playing')
        return False
    stopped = tour.bus.wait(status_is("Stopped"), STREAM_SETTLE_S, playing[0] + 1)
    if stopped:
        report = tour.problem if last_try else tour.note
        report(f'"{phrase}": the stream stopped right after starting (upstream 18)')
    return not stopped


def control(tour: Tour, phrase: str, status: str, look: str) -> None:
    since = tour.bus.mark()
    tour.say(phrase, reply=False)
    if tour.bus.wait(status_is(status), 10, since):
        tour.look(look)
    else:
        tour.problem(f'"{phrase}": OCP did not report {status}')
    tour.dwell(4)


def ocp_send(tour: Tour, action: str, page: str | None = None, timeout: float = 10) -> bool:
    since = tour.bus.mark()
    print(f"   bus: {OCP_MESSAGES[action]}", flush=True)
    tour.bus.emit(OCP_MESSAGES[action])
    return not page or tour.expect_pages((page,), OCP, since, timeout)


def suggestions(tour: Tour) -> None:
    """Stop playback; OCP then shows SuggestionsView when it holds search results, else a featured-media playlist."""
    since = tour.bus.mark()
    ocp_send(tour, "stop")
    if tour.bus.wait(page_shown(OCP, "SuggestionsView"), 6, since):
        print(f"   shown: {OCP} / SuggestionsView", flush=True)
    else:
        track = groove_salad()
        tour.bus.emit("ovos.common_play.skill.play", {"skill_id": play_media.SOURCE, "playlist": [track, track]})
        tour.expect_pages(("SuggestionsView",), OCP, since, 10)
    tour.look("the search results as a grid of covers")
    tour.dwell(6)


def groove_salad(**overrides) -> dict:
    return play_media.media(Namespace(**{**play_media.GROOVE_SALAD, **overrides}, length=0))


def vinyl(tour: Tour) -> None:
    since = tour.bus.mark()
    track = groove_salad(image="")
    tour.bus.emit("ovos.common_play.play", {"media": track, "playlist": [track]})
    tour.expect_pages(("PlayerLoader",), OCP, since, PLAY_TIMEOUT_S)
    tour.look("no cover art: the vinyl record turns instead")
    tour.dwell(6)
    ocp_send(tour, "stop")


def media(tour: Tour) -> None:
    tour.heading("media", "now playing, pause and resume, suggestions, OCP home, the vinyl")
    tour.ocp_used = True
    phrase = "play groove salad on soma fm"
    if not play_spoken(tour, phrase, last_try=False):
        print("   retrying once", flush=True)
        play_spoken(tour, phrase, last_try=True)
    tour.look("the cover disc, title and artist; the progress ring (SomaFM may pick a different channel)")
    tour.dwell(10 - STREAM_SETTLE_S)
    control(tour, "pause", "Paused", "the cover eases upright and stops turning")
    control(tour, "resume", "Playing", "playback resumes")
    suggestions(tour)
    ocp_send(tour, "home", "Home")
    tour.look("OCP home: the skill chips (OCP shows Home only while nothing plays)")
    tour.dwell(6)
    vinyl(tour)


def cleanup(tour: Tour) -> None:
    """Always runs: dismiss what the demo created and is still up, stop OCP, clear demo namespaces."""
    tour.heading("cleanup", "dismiss the demo's alerts, stop OCP, clear demo pages")
    for ident in sorted(tour.timers - tour.dismissed):
        dismiss_timer(tour, ident)
    left = sorted(tour.alarms - tour.dismissed)
    if left:
        dismiss_alarms(tour, left)
    if tour.ocp_used:
        ocp_send(tour, "stop")
    for namespace in sorted(tour.namespaces):
        show_templates.clear(tour.bus.ws, namespace)
    tour.namespaces.clear()
