"""Exercise the face's mouth without TTS: replay a recorded viseme list on the core bus.

Emits recognizer_loop:audio_output_start, enclosure.mouth.viseme_list (with `start` set to now), waits for the
recorded speech length, then recognizer_loop:audio_output_end. ovos-gui forwards all three to GUI clients.

Usage: python tests/manual/replay_visemes.py [fixture.jsonl] [--bus ws://127.0.0.1:8181/core]
"""

import argparse
import json
import time
from pathlib import Path

from websocket import create_connection

DEFAULT_FIXTURE = Path(__file__).parents[1] / "fixtures" / "corebus" / "visemes_what_time_is_it.jsonl"
DEFAULT_BUS = "ws://127.0.0.1:8181/core"
# Sent back to back, the two events can reach the browser in the opposite order (measured: the list 1 ms
# before audio_output_start), and the face drops a list that arrives before it is shown. Live TTS sends the list
# ~20 ms after start (measured at the browser), so the replay leaves the same gap.
LIST_AFTER_START_S = 0.02
SOURCE = "visage-replay-visemes"


def load_recording(path: Path) -> tuple[list, float]:
    """The viseme pairs and the recorded audio length (audio_output_start to audio_output_end)."""
    messages = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    by_type = {message["type"]: message for message in messages}
    visemes = by_type["enclosure.mouth.viseme_list"]["data"]["visemes"]
    started = by_type["recognizer_loop:audio_output_start"]["received"]
    ended = by_type["recognizer_loop:audio_output_end"]["received"]
    return visemes, ended - started


def emit(ws, msg_type: str, data: dict | None = None) -> None:
    ws.send(json.dumps({"type": msg_type, "data": data or {}, "context": {"source": SOURCE}}))
    print(f"{time.strftime('%T')} sent {msg_type}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("fixture", nargs="?", type=Path, default=DEFAULT_FIXTURE)
    parser.add_argument("--bus", default=DEFAULT_BUS)
    args = parser.parse_args()
    visemes, audio_seconds = load_recording(args.fixture)
    ws = create_connection(args.bus)
    try:
        emit(ws, "recognizer_loop:audio_output_start")
        time.sleep(LIST_AFTER_START_S)
        emit(ws, "enclosure.mouth.viseme_list", {"start": time.time(), "visemes": visemes})
        print(f"  {len(visemes)} visemes over {visemes[-1][1]:.2f}s; audio {audio_seconds:.2f}s", flush=True)
        time.sleep(audio_seconds)
        emit(ws, "recognizer_loop:audio_output_end")
    finally:
        ws.close()


if __name__ == "__main__":
    main()
