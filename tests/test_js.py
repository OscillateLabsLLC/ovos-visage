"""Runs the browser-module tests in tests/js with node's built-in test runner."""

import shutil
import subprocess
from pathlib import Path

import pytest

NODE = shutil.which("node")
JS_TESTS = sorted((Path(__file__).parent / "js").glob("*.test.mjs"))


@pytest.mark.skipif(NODE is None, reason="node is not installed")
@pytest.mark.parametrize("script", JS_TESTS, ids=[path.name for path in JS_TESTS])
def test_js_module(script):
    result = subprocess.run([NODE, "--test", str(script)], check=False, capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr
