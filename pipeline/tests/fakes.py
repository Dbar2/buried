"""Test doubles. Tests never touch the network: they use FakeHttp."""

from __future__ import annotations

import io
import zipfile
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from buried_pipeline.errors import PipelineError
from buried_pipeline.io.http import Downloaded, write_stream


class FakeHttp:
    """Serves bytes (downloads) and JSON documents (get_json) by exact URL.

    `requests` records every call as (kind, url, params), so tests can assert on request counts.
    """

    def __init__(
        self,
        files: Mapping[str, bytes] | None = None,
        documents: Mapping[str, Any] | None = None,
    ) -> None:
        self.files = dict(files or {})
        self.documents = dict(documents or {})
        self.requests: list[tuple[str, str, Mapping[str, str] | None]] = []

    def get_json(self, url: str, params: Mapping[str, str] | None = None) -> Any:
        self.requests.append(("json", url, params))
        key = (url, tuple(sorted(params.items()))) if params else (url, ())
        if key in self.documents:
            return self.documents[key]
        if url in self.documents:
            return self.documents[url]
        raise PipelineError(f"FakeHttp: no document for {url} {params}")

    def download(self, url: str, dest: Path) -> Downloaded:
        self.requests.append(("download", url, None))
        if url not in self.files:
            raise PipelineError(f"FakeHttp: no file for {url}")
        data = self.files[url]
        chunks = [data[i : i + 7] for i in range(0, len(data), 7)]  # small chunks on purpose
        return write_stream(chunks, dest)


def make_zip(entries: Mapping[str, bytes]) -> bytes:
    """A zip in memory. Entry names are written as given, including unsafe ones."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return buffer.getvalue()
