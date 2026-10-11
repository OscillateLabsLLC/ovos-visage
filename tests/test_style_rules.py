"""SPEC 9: no cards or nested panels, and no accent borders or edge stripes; gradients, glows and motion are fine."""

import re
from pathlib import Path

import pytest

STATIC = Path(__file__).parent.parent / "ovos_visage" / "static"
STYLESHEETS = sorted(path for path in STATIC.rglob("*.css") if "vendor" not in path.parts)
# Rounded, filled boxes that are not content cards.
ALLOWED_PANELS = {
    ".screen": "the display surface itself",
    ".link": "the GUI-offline status pill",
    ".badge": "the idle notification-count pill",
    ".fallback": "the debug card for unrouted pages (SPEC 8.7)",
}


def rules(stylesheet: Path) -> list[tuple[str, str]]:
    css = re.sub(r"/\*.*?\*/", "", stylesheet.read_text(), flags=re.DOTALL)
    return [(selector.strip(), body) for selector, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css)]


def value(body: str, prop: str) -> str | None:
    match = re.search(rf"(?<![-\w]){prop}\s*:\s*([^;]+)", body)
    return match.group(1).strip() if match else None


@pytest.mark.parametrize("stylesheet", STYLESHEETS, ids=[path.name for path in STYLESHEETS])
def test_no_accent_borders_or_edge_stripes(stylesheet):
    borders = [
        (sel, v) for sel, body in rules(stylesheet) for v in re.findall(r"\bborder(?!-radius)(?:-[a-z]+)?\s*:\s*([^;]+)", body)
    ]
    assert all(v.strip() in ("0", "none") for _, v in borders), borders


@pytest.mark.parametrize("stylesheet", STYLESHEETS, ids=[path.name for path in STYLESHEETS])
def test_no_card_panels(stylesheet):
    """A card is a filled box with rounded, not circular, corners; circles (50%) and unfilled shapes are fine."""
    cards = []
    for selector, body in rules(stylesheet):
        radius, fill = value(body, "border-radius"), value(body, "background(?:-color)?")
        filled = fill not in (None, "transparent", "none")
        if radius and radius != "50%" and filled and selector not in ALLOWED_PANELS:
            cards.append(selector)
    assert not cards, cards


def test_every_stylesheet_is_checked():
    assert {"visage.css", "skills.css", "alerts.css", "templates.css", "face.css"} <= {p.name for p in STYLESHEETS}


def test_the_guard_catches_the_alarm_card_it_exists_for(tmp_path):
    sheet = tmp_path / "card.css"
    sheet.write_text(".alarm { background: #0d141c; border-radius: 18px; border-left: 4px solid var(--accent); }")
    with pytest.raises(AssertionError):
        test_no_accent_borders_or_edge_stripes(sheet)
    with pytest.raises(AssertionError):
        test_no_card_panels(sheet)
