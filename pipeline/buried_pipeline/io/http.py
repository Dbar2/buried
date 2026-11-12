"""The one HTTP client interface. Tests replace it with a fake (tests/fakes.py).

Requests are made one at a time. Downloads stream to `<dest>.part`, hash while streaming, then
rename into place.
"""

from __future__ import annotations

import hashlib
import os
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import httpx

from buried_pipeline import __version__
from buried_pipeline.errors import PipelineError

USER_AGENT = f"Buried-pipeline/{__version__} (archival map research)"
CHUNK_BYTES = 1024 * 1024


@dataclass(frozen=True)
class Downloaded:
    path: Path
    bytes: int
    sha256: str


class HttpClient(Protocol):
    def get_json(self, url: str, params: Mapping[str, str] | None = None) -> Any:
        """GET a URL and parse the JSON body."""

    def download(self, url: str, dest: Path) -> Downloaded:
        """Stream a URL to `dest` (via `dest.part`), returning its size and SHA-256."""


def write_stream(chunks: Iterable[bytes], dest: Path) -> Downloaded:
    """Shared by the real client and the test fake: stream chunks to dest.part, then rename."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    digest = hashlib.sha256()
    size = 0
    try:
        with part.open("wb") as handle:
            for chunk in chunks:
                handle.write(chunk)
                digest.update(chunk)
                size += len(chunk)
        os.replace(part, dest)
    except BaseException:
        part.unlink(missing_ok=True)
        raise
    return Downloaded(path=dest, bytes=size, sha256=digest.hexdigest())


class RealHttpClient:
    """httpx client: one connection pool, one request at a time, User-Agent naming Buried."""

    def __init__(self, timeout_s: float = 60.0) -> None:
        self._client = httpx.Client(
            headers={"User-Agent": USER_AGENT},
            timeout=timeout_s,
            follow_redirects=True,
        )

    def get_json(self, url: str, params: Mapping[str, str] | None = None) -> Any:
        try:
            response = self._client.get(url, params=dict(params) if params else None)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise PipelineError(f"Request failed: {url}: {exc}") from exc

    def download(self, url: str, dest: Path) -> Downloaded:
        try:
            with self._client.stream("GET", url) as response:
                response.raise_for_status()
                return write_stream(response.iter_bytes(CHUNK_BYTES), dest)
        except httpx.HTTPError as exc:
            raise PipelineError(f"Download failed: {url}: {exc}") from exc

    def close(self) -> None:
        self._client.close()
