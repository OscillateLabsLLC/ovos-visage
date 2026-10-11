"""Images outside the ovos-gui cache are served only when their exact path appeared in session data (resources.py)."""

import pytest
from aiohttp.test_utils import TestClient, TestServer

from ovos_visage.app import Visage
from ovos_visage.resources import ABS_PREFIX, SeenImages, plain_image_file

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


@pytest.fixture
def venv(tmp_path):
    """A stand-in for a skill package in the OVOS venv, outside the cache."""
    root = (tmp_path / "venv" / "skill_x" / "res").resolve()
    root.mkdir(parents=True)
    (root / "icon.png").write_bytes(PNG)
    (root / "notes.txt").write_text("not an image")
    return root


@pytest.fixture
async def served(tmp_path, venv):
    cache = tmp_path / "cache"
    cache.mkdir()
    visage = Visage("ws://127.0.0.1:9/core", "test-gui", cache_root=cache)
    async with TestClient(TestServer(visage.web.app)) as http:
        yield visage, http


def test_plain_image_file_rules(venv, tmp_path):
    assert plain_image_file(str(venv / "icon.png")) == venv / "icon.png"
    assert plain_image_file(str(venv / "notes.txt")) is None
    assert plain_image_file(str(venv / "missing.png")) is None
    assert plain_image_file("relative/icon.png") is None
    assert plain_image_file(str(venv)) is None
    link = tmp_path / "link.png"
    link.symlink_to(venv / "icon.png")
    assert plain_image_file(str(link)) is None
    linked_dir = tmp_path / "linked_dir"
    linked_dir.symlink_to(venv)
    assert plain_image_file(str(linked_dir / "icon.png")) is None


def test_registry_maps_tokens_only_and_forgets_the_oldest(venv):
    images = SeenImages(limit=1)
    url = images.register(str(venv / "icon.png"))
    assert url.startswith(ABS_PREFIX) and "/" not in url.removeprefix(ABS_PREFIX)
    assert images.resolve(url.removeprefix(ABS_PREFIX)) == venv / "icon.png"
    assert images.resolve("0" * 24) is None
    (venv / "other.png").write_bytes(PNG)
    images.register(str(venv / "other.png"))
    assert images.resolve(url.removeprefix(ABS_PREFIX)) is None


def test_rewriter_turns_seen_image_paths_into_tokens_and_leaves_the_rest(served, venv):
    visage, _ = served
    message = {"data": {"skillCards": [{"image": str(venv / "icon.png")}], "notes": str(venv / "notes.txt")}}
    rewritten = visage.rewriter.rewrite(message)
    assert rewritten["data"]["skillCards"][0]["image"].startswith(ABS_PREFIX)
    assert rewritten["data"]["notes"] == str(venv / "notes.txt")


async def test_seen_image_serves_with_its_content_type(served, venv):
    visage, http = served
    url = visage.rewriter.rewrite(str(venv / "icon.png"))
    response = await http.get(url)
    assert response.status == 200
    assert response.headers["Content-Type"] == "image/png"
    assert await response.read() == PNG


async def test_unseen_traversal_symlinked_and_non_image_paths_are_404(served, venv, tmp_path):
    visage, http = served
    visage.rewriter.rewrite(str(venv / "notes.txt"))
    for url in (
        "/res-abs/" + "0" * 24,
        "/res-abs/../../etc/passwd",
        "/res-abs/%2e%2e%2f%2e%2e%2fetc%2fpasswd",
        f"/res-abs/{venv / 'icon.png'}",
        "/res-abs/",
    ):
        assert (await http.get(url)).status == 404, url
    link = tmp_path / "cover.png"
    link.symlink_to(venv / "icon.png")
    assert visage.rewriter.rewrite(str(link)) == str(link)


async def test_a_file_swapped_for_a_symlink_after_it_was_seen_is_404(served, venv, tmp_path):
    visage, http = served
    url = visage.rewriter.rewrite(str(venv / "icon.png"))
    (venv / "icon.png").unlink()
    secret = tmp_path / "secret.png"
    secret.write_bytes(PNG)
    (venv / "icon.png").symlink_to(secret)
    assert (await http.get(url)).status == 404
