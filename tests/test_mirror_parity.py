"""The browser mirror (static/mirror.js) and state.py must agree on every recorded sequence."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from tests.conftest import FIXTURES, load_fixture
from tests.test_state import replay

NODE = shutil.which("node")
SCRIPT = Path(__file__).parent / "mirror_replay.mjs"


@pytest.mark.skipif(NODE is None, reason="node is not installed")
@pytest.mark.parametrize("fixture", sorted(path.name for path in FIXTURES.glob("*.jsonl")))
def test_js_mirror_matches_python_state(fixture):
    result = subprocess.run([NODE, str(SCRIPT), str(FIXTURES / fixture)], capture_output=True, text=True, check=True)
    js = json.loads(result.stdout)
    state = replay(load_fixture(fixture))
    snapshot = state.snapshot()
    assert js["active"] == snapshot["active"]
    assert js["namespaces"] == snapshot["namespaces"]
    current = state.current()
    assert js["current"] == (list(current) if current else None)
