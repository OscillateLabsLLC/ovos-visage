"""Start OCP playback of one track directly, the way an OCP skill does after a search (ovos.common_play.play).

Use it when no installed OCP skill can find media (see docs/UPSTREAM_ISSUES.md). The page shown is OCP's own
PlayerLoader with playerBackend OVOSSyncPlayer, fed by the classic OCP plugin in ovos-audio.

Usage: python tests/manual/play_media.py [--uri URL] [--title T] [--artist A] [--image URL] [--length MS]
"""

import argparse
import json

from websocket import create_connection

DEFAULT_BUS = "ws://127.0.0.1:8181/core"
SOURCE = "visage-ocp-test"
PLAYBACK_AUDIO = 2
MEDIA_TYPE_RADIO = 7
STATUS_DISAMBIGUATION = 1
GROOVE_SALAD = {
    "uri": "https://ice1.somafm.com/groovesalad-128-mp3",
    "title": "Groove Salad",
    "artist": "SomaFM",
    "image": "https://somafm.com/img3/groovesalad-400.jpg",
}


def media(args: argparse.Namespace) -> dict:
    return {
        "uri": args.uri,
        "title": args.title,
        "artist": args.artist,
        "image": args.image,
        "length": args.length,
        "playback": PLAYBACK_AUDIO,
        "media_type": MEDIA_TYPE_RADIO,
        "status": STATUS_DISAMBIGUATION,
        "skill_id": SOURCE,
        "match_confidence": 100,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    for key, value in GROOVE_SALAD.items():
        parser.add_argument(f"--{key}", default=value)
    parser.add_argument("--length", type=int, default=0, help="track length in ms; 0 for a live stream")
    parser.add_argument("--bus", default=DEFAULT_BUS)
    args = parser.parse_args()
    track = media(args)
    ws = create_connection(args.bus)
    try:
        ws.send(
            json.dumps(
                {"type": "ovos.common_play.play", "data": {"media": track, "playlist": [track]}, "context": {"source": SOURCE}}
            )
        )
    finally:
        ws.close()
    print(f"asked OCP to play {args.title} ({args.uri})")


if __name__ == "__main__":
    main()
