"""Cut a fixture out of an `ovos-visage --record` file, keeping only the namespaces a test is about.

Active-skill list operations are positional, so foreign namespaces cannot simply be deleted: the script replays the
stack, drops operations on foreign skills, and rewrites positions against the filtered stack. Messages from the
start of the file that set up the idle namespace (the homescreen) are prepended so the fixture starts from idle.
The real active stack must hold only the idle namespace at START.

Usage: python tests/manual/slice_recording.py REC.jsonl START END OUT.jsonl --keep NS [--keep NS ...]
  START/END are 1-based line numbers, inclusive.
"""

import argparse
import json
from pathlib import Path

ACTIVE = "mycroft.system.active_skills"
SYSTEM = "system"
IDLE = "ovos-skill-homescreen.openvoiceos"


class StackFilter:
    """Tracks the real active stack and emits equivalent operations on the stack of kept namespaces only."""

    def __init__(self, keep: set[str]) -> None:
        self.keep = keep
        self.real: list[str] = []

    def kept_index(self, position: int) -> int:
        return sum(1 for skill in self.real[:position] if skill in self.keep)

    def apply(self, message: dict) -> list[dict]:
        kind = message["type"].rsplit(".", 1)[-1]
        return getattr(self, f"_{kind}")(message)

    def _insert(self, message: dict) -> list[dict]:
        skills = [item["skill_id"] for item in message["data"]]
        position = self.kept_index(message["position"])
        self.real[message["position"] : message["position"]] = skills
        kept = [{"skill_id": skill} for skill in skills if skill in self.keep]
        return [{**message, "position": position, "data": kept}] if kept else []

    def _remove(self, message: dict) -> list[dict]:
        start, count = message["position"], message.get("items_number", 1)
        removed = self.real[start : start + count]
        position = self.kept_index(start)
        del self.real[start : start + count]
        kept = sum(1 for skill in removed if skill in self.keep)
        return [{**message, "position": position, "items_number": kept}] if kept else []

    def _move(self, message: dict) -> list[dict]:
        skill = self.real[message["from"]]
        source = self.kept_index(message["from"])
        del self.real[message["from"]]
        self.real.insert(message["to"], skill)
        if skill not in self.keep:
            return []
        return [{**message, "from": source, "to": self.kept_index(message["to"])}]


def slice_recording(messages: list[dict], start: int, end: int, keep: set[str]) -> list[dict]:
    """Idle-namespace setup from before START, then everything in keep (plus system events) from START to END."""
    stack, out = StackFilter({IDLE}), []
    for number, message in enumerate(messages[:end], 1):
        if number == start:
            stack.keep = keep | {IDLE}
        namespace = message.get("namespace")
        if namespace == ACTIVE:
            out.extend(stack.apply(message))
        elif namespace in stack.keep or (namespace == SYSTEM and number >= start):
            out.append(message)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("recording", type=Path)
    parser.add_argument("start", type=int)
    parser.add_argument("end", type=int)
    parser.add_argument("out", type=Path)
    parser.add_argument("--keep", action="append", required=True)
    args = parser.parse_args()
    messages = [json.loads(line) for line in args.recording.read_text().splitlines() if line.strip()]
    sliced = slice_recording(messages, args.start, args.end, set(args.keep))
    args.out.write_text("".join(json.dumps(message) + "\n" for message in sliced))
    print(f"{len(sliced)} messages -> {args.out}")


if __name__ == "__main__":
    main()
