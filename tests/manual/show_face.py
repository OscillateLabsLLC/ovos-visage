"""Show the SYSTEM_Face template from a throwaway namespace, the way GUIInterface.show_face() does.

Emits gui.value.set {sleeping} and gui.page.show [SYSTEM_Face] with a timeout, so ovos-gui removes it again.

Usage: python tests/manual/show_face.py [--sleeping] [--seconds 15] [--bus ws://127.0.0.1:8181/core]
"""

import argparse
import json

from websocket import create_connection

DEFAULT_BUS = "ws://127.0.0.1:8181/core"
NAMESPACE = "visage-face-test"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--sleeping", action="store_true", help="closed eyes")
    parser.add_argument("--seconds", type=int, default=15, help="how long ovos-gui keeps the page")
    parser.add_argument("--bus", default=DEFAULT_BUS)
    args = parser.parse_args()
    context = {"source": NAMESPACE, "skill_id": NAMESPACE}
    show = {"__from": NAMESPACE, "page_names": ["SYSTEM_Face"], "index": 0, "__idle": args.seconds}
    ws = create_connection(args.bus)
    try:
        ws.send(
            json.dumps({"type": "gui.value.set", "data": {"__from": NAMESPACE, "sleeping": args.sleeping}, "context": context})
        )
        ws.send(json.dumps({"type": "gui.page.show", "data": show, "context": context}))
    finally:
        ws.close()
    print(f"showing SYSTEM_Face in {NAMESPACE} for {args.seconds}s (sleeping={args.sleeping})")


if __name__ == "__main__":
    main()
