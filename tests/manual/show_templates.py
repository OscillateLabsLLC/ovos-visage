"""Show each SYSTEM_* template with sample data, the way GUIInterface.show_* does (SPEC 8.2).

Each sample emits gui.value.set then gui.page.show from its own throwaway namespace (visage-templates-<sample>),
waits --seconds, then sends gui.clear.namespace; it also clears on Ctrl-C or error, so no test page is left up.
Samples cover null titles, long text, the three image forms (cache path, http URL, data: URI) and a site that
refuses framing.

Usage: python tests/manual/show_templates.py [SAMPLE ...] [--seconds 12] [--list]
"""

import argparse
import json
import time
from pathlib import Path

from websocket import create_connection

DEFAULT_BUS = "ws://127.0.0.1:8181/core"
NAMESPACE = "visage-templates"
IDLE_MARGIN_S = 10
CACHE_IMAGE = Path.home() / ".cache/ovos_gui/ovos-skill-weather.openvoiceos/qt5/images/sun.svg"
PULSE_SVG = (
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>"
    "<circle cx='50' cy='50' r='30' fill='%231e9bff'><animate attributeName='r' values='20;40;20' dur='1.5s' "
    "repeatCount='indefinite'/></circle></svg>"
)
LONG_TEXT = (
    "A teaspoon is about five millilitres, a tablespoon is three teaspoons, and a cup is sixteen tablespoons. "
    "So a cup holds forty-eight teaspoons, or roughly two hundred and forty millilitres. "
    "In the United Kingdom the cup was historically larger, about two hundred and eighty-four millilitres, "
    "but most modern recipes use the metric cup of two hundred and fifty millilitres. "
    "When a recipe says a scant cup it means slightly less than full; a heaping tablespoon is mounded above the rim. "
    "Dry ingredients should be levelled with a knife, and flour should be spooned into the cup rather than scooped."
)

SAMPLES = {
    "text": ("SYSTEM_TextFrame", {"text": "Three teaspoons make one tablespoon.", "title": "Unit conversion"}),
    "text-long": ("SYSTEM_TextFrame", {"text": LONG_TEXT, "title": None}),
    "loading": ("SYSTEM_Loading", {"label": "Looking that up"}),
    "status-ok": ("SYSTEM_Status", {"status": "Enabled", "label": "Wi-Fi connected"}),
    "status-off": ("SYSTEM_Status", {"status": "Disabled", "label": "Microphone muted"}),
    "image": (
        "SYSTEM_ImageFrame",
        {
            "image": str(CACHE_IMAGE),
            "title": "Clear sky",
            "caption": "Cache path served at /res/",
            "fill": "fit",
            "background_color": "#0d1a28",
        },
    ),
    "image-http": (
        "SYSTEM_ImageFrame",
        {
            "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Fronalpstock_big.jpg/500px-Fronalpstock_big.jpg",
            "title": None,
            "caption": "http image, fill crop",
            "fill": "crop",
            "background_color": None,
        },
    ),
    "animated": (
        "SYSTEM_AnimatedImageFrame",
        {"image": PULSE_SVG, "title": "Animated", "caption": "data: URI", "fill": "fit", "background_color": None},
    ),
    "html": (
        "SYSTEM_HtmlFrame",
        {
            "html": "<h1>Shopping list</h1><ul><li>Coffee</li><li>Oat milk</li><li>Lemons</li></ul>"
            "<p id='t'>script ran: no</p><script>document.getElementById('t').textContent='script ran: yes'</script>",
            "resourceLocation": None,
        },
    ),
    "url": ("SYSTEM_UrlFrame", {"url": "https://example.com/"}),
    "url-refused": ("SYSTEM_UrlFrame", {"url": "https://www.google.com/"}),
    "input": (
        "SYSTEM_InputBox",
        {
            "title": "Name your timer",
            "placeholder": "Say a name",
            "confirm_text": "Confirm",
            "exit_text": "Exit",
            "skill_id_handler": f"{NAMESPACE}-input",
        },
    ),
}


def message(msg_type: str, namespace: str, data: dict) -> str:
    return json.dumps(
        {"type": msg_type, "data": {"__from": namespace, **data}, "context": {"source": namespace, "skill_id": namespace}}
    )


def show(ws, sample: str, seconds: float) -> str:
    """One namespace per sample: ovos-gui's removal timer from one show then cannot clear a later sample's data."""
    page, data = SAMPLES[sample]
    namespace = f"{NAMESPACE}-{sample}"
    ws.send(message("gui.value.set", namespace, data))
    # __idle is only a backstop; the namespace is cleared explicitly so a test page can never pin a client.
    ws.send(message("gui.page.show", namespace, {"page_names": [page], "index": 0, "__idle": int(seconds) + IDLE_MARGIN_S}))
    print(f"{time.strftime('%T')} {sample}: {page} in {namespace} for {seconds}s", flush=True)
    return namespace


def clear(ws, namespace: str) -> None:
    ws.send(message("gui.clear.namespace", namespace, {}))
    print(f"{time.strftime('%T')} cleared {namespace}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("samples", nargs="*", metavar="SAMPLE", help="sample names (default: all); see --list")
    parser.add_argument("--seconds", type=float, default=12, help="how long each sample stays before it is cleared")
    parser.add_argument("--bus", default=DEFAULT_BUS)
    parser.add_argument("--list", action="store_true", help="list the sample names and exit")
    args = parser.parse_args()
    if args.list:
        print("\n".join(f"{name}: {page}" for name, (page, _) in SAMPLES.items()))
        return
    unknown = [name for name in args.samples if name not in SAMPLES]
    if unknown:
        parser.error(f"unknown sample(s) {unknown}; choose from {list(SAMPLES)}")
    ws = create_connection(args.bus)
    shown = None
    try:
        for sample in args.samples or list(SAMPLES):
            shown = show(ws, sample, args.seconds)
            time.sleep(args.seconds)
            clear(ws, shown)
            shown = None
    finally:
        if shown:
            clear(ws, shown)
        ws.close()


if __name__ == "__main__":
    main()
