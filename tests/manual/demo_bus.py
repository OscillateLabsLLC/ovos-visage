"""Core-bus plumbing for the demo tour (tests/manual/demo.py).

Skills send their GUI traffic on the core bus (gui.value.set, gui.page.show with `__from`; measured), and
the messagebus broadcasts every message to every client, so the tour waits for pages there instead of sleeping.
"""

import json
import threading
import time
from dataclasses import dataclass, field

from websocket import WebSocketConnectionClosedException, WebSocketTimeoutException, create_connection

DEFAULT_BUS = "ws://127.0.0.1:8181/core"
SOURCE = "visage-demo"
KEEP_PREFIXES = ("gui.", "speak", "recognizer_loop:", "ovos.common_play", "enclosure.mouth")
AUDIO_START = "recognizer_loop:audio_output_start"
AUDIO_END = "recognizer_loop:audio_output_end"
RECV_POLL_S = 0.5
QUIET_AFTER_SPEECH_S = 1.5
SPEECH_TIMEOUT_S = 25


def utterance(text: str) -> dict:
    """The message docs/spike_say.py sends, so the demo reaches the skills exactly as a test utterance does."""
    return {
        "type": "recognizer_loop:utterance",
        "data": {"utterances": [text], "lang": "en-us"},
        "context": {"source": "spike", "destination": ["skills"]},
    }


def page_shown(namespace: str | None, page: str):
    """Matches a skill's gui.page.show that includes `page`; namespace None matches any skill."""

    def match(msg: dict) -> bool:
        data = msg.get("data") or {}
        if msg.get("type") != "gui.page.show" or page not in (data.get("page_names") or []):
            return False
        return namespace is None or data.get("__from") == namespace

    return match


def value_set(namespace: str, test):
    """Matches a gui.value.set from `namespace` whose data passes `test`."""

    def match(msg: dict) -> bool:
        data = msg.get("data") or {}
        return msg.get("type") == "gui.value.set" and data.get("__from") == namespace and bool(test(data))

    return match


def of_type(*types: str):
    return lambda msg: msg.get("type") in types


class Bus:
    """One core-bus connection: a thread keeps the GUI, speech and OCP messages; the caller sends and waits."""

    def __init__(self, url: str = DEFAULT_BUS):
        self.ws = create_connection(url, timeout=RECV_POLL_S)
        self.messages: list[dict] = []
        self.changed = threading.Condition()
        self.running = True
        self.thread = threading.Thread(target=self._listen, daemon=True)
        self.thread.start()

    def _listen(self) -> None:
        while self.running:
            try:
                msg = json.loads(self.ws.recv())
            except WebSocketTimeoutException:
                continue
            except (WebSocketConnectionClosedException, OSError, ValueError):
                break
            if str(msg.get("type", "")).startswith(KEEP_PREFIXES):
                with self.changed:
                    self.messages.append(msg)
                    self.changed.notify_all()

    def mark(self) -> int:
        with self.changed:
            return len(self.messages)

    def wait(self, match, timeout: float, since: int = 0) -> tuple[int, dict] | None:
        """The first message at or after index `since` that matches, waiting up to `timeout` seconds for it."""
        deadline = time.monotonic() + timeout
        with self.changed:
            while True:
                for index in range(since, len(self.messages)):
                    if match(self.messages[index]):
                        return index, self.messages[index]
                since = len(self.messages)
                left = deadline - time.monotonic()
                if left <= 0 or not self.changed.wait(left):
                    return None

    def wait_speech_done(self, since: int, timeout: float = SPEECH_TIMEOUT_S) -> bool:
        """True once speech that started after `since` has ended and stayed quiet for a moment."""
        end = self.wait(of_type(AUDIO_END), timeout, since)
        while end:
            again = self.wait(of_type(AUDIO_START), QUIET_AFTER_SPEECH_S, end[0] + 1)
            if not again:
                return True
            end = self.wait(of_type(AUDIO_END), timeout, again[0] + 1)
        return False

    def emit(self, msg_type: str, data: dict | None = None) -> None:
        self.ws.send(json.dumps({"type": msg_type, "data": data or {}, "context": {"source": SOURCE}}))

    def say(self, text: str) -> None:
        self.ws.send(json.dumps(utterance(text)))

    def close(self) -> None:
        self.running = False
        self.ws.close()
        self.thread.join(timeout=2)


@dataclass
class Tour:
    """What the steps share: the bus, the pace, what the demo created (for cleanup) and what did not work."""

    bus: Bus
    pace: float = 1.0
    step: str = ""
    timers: set = field(default_factory=set)
    alarms: set = field(default_factory=set)
    dismissed: set = field(default_factory=set)
    namespaces: set = field(default_factory=set)
    ocp_used: bool = False
    elapsed: dict = field(default_factory=dict)
    problems: dict = field(default_factory=dict)

    def heading(self, name: str, about: str) -> None:
        self.step = name
        print(f"\n== {name}: {about}", flush=True)

    def look(self, text: str) -> None:
        print(f"   look: {text}", flush=True)

    def note(self, text: str) -> None:
        print(f"   note: {text}", flush=True)

    def problem(self, text: str) -> None:
        print(f"   did not work: {text}", flush=True)
        self.problems.setdefault(self.step, []).append(text)

    def dwell(self, seconds: float) -> None:
        time.sleep(seconds * self.pace)

    def say(self, text: str, pages: tuple = (), namespace: str | None = None, timeout: float = 20, reply: bool = True) -> bool:
        """Speak an utterance onto the bus, wait for each page in turn, then for the spoken reply (if any) to finish."""
        since = self.bus.mark()
        print(f'{time.strftime("%T")} say: "{text}"', flush=True)
        self.bus.say(text)
        shown = self.expect_pages(pages, namespace, since, timeout)
        if reply and not self.bus.wait_speech_done(since):
            self.problem(f'"{text}": no spoken reply finished within {SPEECH_TIMEOUT_S}s')
        return shown

    def expect_pages(self, pages: tuple, namespace: str | None, since: int, timeout: float) -> bool:
        for page in pages:
            found = self.bus.wait(page_shown(namespace, page), timeout, since)
            if not found:
                self.problem(f"{page} did not appear within {timeout:g}s")
                return False
            print(f"   shown: {found[1]['data'].get('__from')} / {page}", flush=True)
            since = found[0] + 1
        return True
