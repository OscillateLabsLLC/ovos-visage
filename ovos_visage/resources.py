"""Map skill resource paths in the ovos-gui cache to /res/ URLs the browser can load (SPEC 7.3).

Images outside the cache (OCP sends skill icons and covers as absolute paths into the OVOS venv) are served only when
the exact path appeared as a session value: the rewriter registers it under an opaque token, and /res-abs/<token> maps
back through that registry alone, so no file path is ever taken from a URL.
"""

import hashlib
import logging
import os
from collections import OrderedDict
from pathlib import Path

LOG = logging.getLogger(__name__)
DEFAULT_CACHE_ROOT = Path.home() / ".cache" / "ovos_gui"
RES_PREFIX = "/res/"
ABS_PREFIX = "/res-abs/"
FILE_SCHEME = "file://"
MEDIA_SUFFIXES = {".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".json", ".mp3", ".wav", ".ogg", ".mp4"}
IMAGE_SUFFIXES = {".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp"}
TOKEN_CHARS = 24
MAX_SEEN_IMAGES = 1024


def plain_image_file(path_text: str) -> Path | None:
    """The path when it is an absolute, symlink-free path to an existing regular image file, else None."""
    if not os.path.isabs(path_text):
        return None
    try:
        resolved = Path(path_text).resolve(strict=True)
    except (OSError, ValueError):
        return None
    if str(resolved) != os.path.normpath(path_text) or resolved.suffix.lower() not in IMAGE_SUFFIXES:
        return None
    return resolved if resolved.is_file() and not resolved.is_symlink() else None


class SeenImages:
    """Image files outside the cache that appeared in session data, by opaque token. The only way /res-abs/ finds a file."""

    def __init__(self, limit: int = MAX_SEEN_IMAGES) -> None:
        self.limit = limit
        self._paths: OrderedDict[str, Path] = OrderedDict()

    def register(self, path_text: str) -> str | None:
        path = plain_image_file(path_text)
        if path is None:
            return None
        token = hashlib.sha256(str(path).encode()).hexdigest()[:TOKEN_CHARS]
        self._paths[token] = path
        self._paths.move_to_end(token)
        while len(self._paths) > self.limit:
            self._paths.popitem(last=False)
        return ABS_PREFIX + token

    def resolve(self, token: str) -> Path | None:
        """The registered file for a token, re-checked now: still a plain image file at the same place."""
        path = self._paths.get(token)
        return plain_image_file(str(path)) if path else None


def resolve_under(root: Path, relative: str) -> Path | None:
    """The file for a /res/ request, or None when it is missing or escapes the cache root."""
    base = root.resolve()
    candidate = (base / relative).resolve()
    if not candidate.is_relative_to(base) or not candidate.is_file():
        return None
    return candidate


class PathRewriter:
    def __init__(self, cache_root: Path = DEFAULT_CACHE_ROOT, images: SeenImages | None = None) -> None:
        self.cache_root = cache_root.resolve()
        self.images = images if images is not None else SeenImages()

    def rewrite(self, value):
        """Return value with every cache path string replaced by its /res/ URL, recursing into dicts and lists."""
        if isinstance(value, dict):
            return {key: self.rewrite(item) for key, item in value.items()}
        if isinstance(value, list):
            return [self.rewrite(item) for item in value]
        if isinstance(value, str):
            return self._rewrite_string(value)
        return value

    def _rewrite_string(self, value: str) -> str:
        path_text = value.removeprefix(FILE_SCHEME)
        if not path_text.startswith("/") or path_text.startswith(RES_PREFIX):
            return value
        try:
            path = Path(path_text).resolve()
        except (OSError, ValueError):
            return value
        if path.is_relative_to(self.cache_root):
            return RES_PREFIX + path.relative_to(self.cache_root).as_posix()
        seen = self.images.register(path_text)
        if seen:
            return seen
        if path.suffix.lower() in MEDIA_SUFFIXES:
            LOG.warning("resource outside the ovos-gui cache is not served: %s", value)
        return value
