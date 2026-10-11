"""Send one OCP control message on the core bus: stop playback, or open OCP's Home as the homescreen app icon does.

A spoken "stop" during a SomaFM stream reaches the SomaFM skill's stop handler and leaves OCP playing
(docs/UPSTREAM_ISSUES.md), so tests stop OCP directly.

Usage: python tests/manual/ocp_bus.py {stop,home} [--bus ws://127.0.0.1:8181/core]
"""

import argparse
import json

from websocket import create_connection

DEFAULT_BUS = "ws://127.0.0.1:8181/core"
SOURCE = "visage-ocp-test"
MESSAGES = {
    "stop": "ovos.common_play.stop",
    "home": "ovos.common_play.OCP.homescreen.app",
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("action", choices=sorted(MESSAGES))
    parser.add_argument("--bus", default=DEFAULT_BUS)
    args = parser.parse_args()
    ws = create_connection(args.bus)
    try:
        ws.send(json.dumps({"type": MESSAGES[args.action], "data": {}, "context": {"source": SOURCE}}))
    finally:
        ws.close()
    print(f"sent {MESSAGES[args.action]}")


if __name__ == "__main__":
    main()
