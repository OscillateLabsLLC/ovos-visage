"""Whether a SYSTEM_UrlFrame target allows being framed (SPEC 8.2).

A browser cannot see why a cross-origin iframe was blocked (Chrome still fires `load` on its error page), so the
middle layer reads the target's X-Frame-Options and CSP frame-ancestors headers. It only ever checks the `url` a
skill put in its own session data, never a URL supplied by the browser.
"""

import logging
import re

import aiohttp

LOG = logging.getLogger(__name__)
CHECK_TIMEOUT_S = 4.0
FRAME_ANCESTORS = re.compile(r"frame-ancestors\s+([^;]*)", re.IGNORECASE)
ALLOWING_SOURCES = {"*", "http:", "https:"}


def frame_policy(headers) -> tuple[bool, str]:
    """(frameable, reason) from response headers; only an explicit refusal makes it False."""
    xfo = (headers.get("X-Frame-Options") or "").strip().lower()
    if xfo in ("deny", "sameorigin"):
        return False, f"X-Frame-Options: {xfo}"
    match = FRAME_ANCESTORS.search(headers.get("Content-Security-Policy") or "")
    if match:
        sources = set(match.group(1).split())
        if not sources & ALLOWING_SOURCES:
            listed = " ".join(sorted(sources)) or "'none'"
            return False, f"frame-ancestors {listed}"
    return True, "no framing restriction"


async def check_url(url: str) -> dict:
    if not re.match(r"^https?://", url or "", re.IGNORECASE):
        return {"frameable": False, "reason": "not an http(s) URL"}
    timeout = aiohttp.ClientTimeout(total=CHECK_TIMEOUT_S)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session, session.get(url, allow_redirects=True) as response:
            frameable, reason = frame_policy(response.headers)
            return {"frameable": frameable, "reason": reason, "status": response.status}
    except (aiohttp.ClientError, TimeoutError) as err:
        LOG.info("framing check for %s failed: %r", url, err)
        return {"frameable": None, "reason": f"check failed: {type(err).__name__}"}
