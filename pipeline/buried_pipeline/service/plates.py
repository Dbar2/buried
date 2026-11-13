"""Fetching a registered plate on demand, for a Service whose `data/raw/` is empty (spec 04 4.1).

This is the fetch part of task 4.1 (requirements 3.1 and 3.2).

What it does: given a source id that is in the Registry, build the download URL from the Registry
(never from a request), check it against the two `sources.md` patterns and the host allowlist,
download it once into a cache directory laid out like `data/raw/`, extract it with `zipsafe`, and
verify size and SHA-256 against a manifest. What it refuses: an id that is not a registered plate,
a plate whose rights have not been checked, any host that is not allowlisted, a download that does
not match the manifest, and the held-out plate unless the caller says the request is live.

There is no warm-up and no precompute: `PlateFetcher.ensure` takes one source id, fetches on the
call and nothing else calls it at startup. The held-out plate is the Registry's `held_out` source
(the code names no plate): it is fetched only when a live request passes `live=True`; with
`live=False` it is refused before any file or network access, whether or not a copy is already in
the cache.

Manifest rule: if the manifest at `manifest_path` has an entry for the plate, the download and every
extracted file must match it, or nothing is kept. Without one, the first download is recorded in
the cache's own `manifest.json` and later cache hits are checked against that record, so a changed
cache is noticed.

The index part of task 4.1 (`GET /v1/plates/index`, unregistered plates) is not built here.
"""

from __future__ import annotations

import shutil
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import urlsplit

from buried_pipeline.errors import PipelineError
from buried_pipeline.fetch.manifest import (
    entry_mismatches,
    file_record,
    read_manifest,
    write_manifest,
)
from buried_pipeline.fetch.plates import PLATE_ID_RE, PLATE_TYPE, check_plate_url
from buried_pipeline.fetch.zipsafe import extract_safely
from buried_pipeline.inspect.georef import IGNORED_NAME_PARTS, RASTER_SUFFIXES
from buried_pipeline.io.http import HttpClient
from buried_pipeline.io.registry import Registry, Source
from buried_pipeline.timeutil import rfc3339, utc_now

ALLOWED_HOSTS = frozenset({"maps.library.utoronto.ca", "services1.arcgis.com"})
CACHE_MANIFEST = "manifest.json"


class FetchRefused(PipelineError):
    """The Service will not fetch this. `code` says why, for the API's error body."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class PlateFiles:
    source: str
    directory: Path
    status: str  # "downloaded" or "cached"
    zip_bytes: int
    files: int


def manifest_raster_ref(entry: dict[str, Any]) -> str | None:
    """The SHA-256 of the raster in a manifest entry: the one TIFF or JPEG file that is not a
    thumbnail (the rule `find_raster` applies on disk). None when there is not exactly one."""
    found = [
        rec["sha256"]
        for rec in entry["files"]
        if PurePosixPath(rec["path"]).suffix.lower() in RASTER_SUFFIXES
        and not any(part in PurePosixPath(rec["path"]).name.lower() for part in IGNORED_NAME_PARTS)
    ]
    return found[0] if len(found) == 1 else None


def check_host(url: str) -> None:
    """Requirement 3.2: https, an allowlisted host, no credentials, the default port."""
    parts = urlsplit(url)
    try:
        port = parts.port
    except ValueError:
        port = -1
    if (
        parts.scheme != "https"
        or parts.hostname not in ALLOWED_HOSTS
        or parts.username is not None
        or parts.password is not None
        or port not in (None, 443)
    ):
        raise FetchRefused("host_not_allowed", f"refusing to fetch from {parts.netloc or url!r}")


def check_request(registry: Registry, source_id: str, *, live: bool) -> Source:
    """Everything that can be refused before any file or network access."""
    if not isinstance(source_id, str) or not PLATE_ID_RE.fullmatch(source_id):
        raise FetchRefused("not_a_plate", "not a fire insurance plate id (fip_v3_<year>_<plate>)")
    if not registry.has(source_id):
        raise FetchRefused("not_registered", f"{source_id} is not in the Registry")
    source = registry.get(source_id)
    if source.type != PLATE_TYPE:
        raise FetchRefused("not_a_plate", f"{source_id} is not a fire insurance plate")
    if source.held_out and not live:
        raise FetchRefused(
            "held_out",
            f"{source_id} is the held-out plate: it is fetched only for a live request, "
            "never warmed up or precomputed",
        )
    if source.rights_checked_on is None:
        raise FetchRefused("rights_unchecked", f"{source_id}: rights have not been checked")
    try:
        check_plate_url(source)
    except PipelineError as exc:
        raise FetchRefused("url_not_allowed", str(exc)) from exc
    check_host(source.url)
    return source


class PlateFetcher:
    """Fetches registered plates into `cache_dir/<source id>/`, one at a time."""

    def __init__(
        self,
        registry: Registry,
        cache_dir: Path,
        http: HttpClient,
        manifest_path: Path | None = None,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.registry = registry
        self.cache_dir = cache_dir
        self.http = http
        self.manifest_path = manifest_path
        self.clock = clock
        self._lock = threading.Lock()  # one download at a time

    def _expected(self, source_id: str) -> dict | None:
        """The manifest entry the download must match: the supplied manifest's, else the cache's
        own record of an earlier download, else None (first fetch, nothing to compare)."""
        if self.manifest_path is not None and self.manifest_path.is_file():
            entry = read_manifest(self.manifest_path).get(source_id)
            if entry is not None:
                return entry
        return read_manifest(self.cache_dir / CACHE_MANIFEST).get(source_id)

    def ensure(self, source_id: str, *, live: bool = False) -> PlateFiles:
        source = check_request(self.registry, source_id, live=live)
        with self._lock:
            final_dir = self.cache_dir / source.id
            expected = self._expected(source.id)
            if final_dir.is_dir() and expected is not None:
                if not entry_mismatches(self.cache_dir, expected):
                    return PlateFiles(
                        source.id, final_dir, "cached",
                        expected.get("zip", {}).get("bytes", 0), len(expected["files"]),
                    )  # fmt: skip
                shutil.rmtree(final_dir)  # a cache that no longer matches is discarded
            elif final_dir.is_dir():
                shutil.rmtree(final_dir)  # files with no record cannot be trusted
            return self._download(source, expected)

    def _download(self, source: Source, expected: dict | None) -> PlateFiles:
        zip_name = source.url.rsplit("/", 1)[-1]
        partial = self.cache_dir / f"{source.id}.partial"
        if partial.exists():
            shutil.rmtree(partial)
        partial.mkdir(parents=True)
        try:
            downloaded = self.http.download(source.url, partial / zip_name)
            self._check_zip(source.id, downloaded.bytes, downloaded.sha256, expected)
            extract_safely(partial / zip_name, partial)
            final_dir = self.cache_dir / source.id
            partial.rename(final_dir)
        except BaseException:
            shutil.rmtree(partial, ignore_errors=True)
            raise
        zip_path = final_dir / zip_name
        files = [
            file_record(self.cache_dir, p)
            for p in sorted(final_dir.rglob("*"))
            if p.is_file() and p != zip_path
        ]
        try:
            self._check_files(source.id, files, expected)
        except FetchRefused:
            shutil.rmtree(final_dir, ignore_errors=True)
            raise
        entry = {
            "source": source.id,
            "url": source.url,
            "retrieved_at": rfc3339(self.clock()),
            "zip": file_record(self.cache_dir, zip_path),
            "files": files,
        }
        if expected is None or self._expected_is_cache_record(source.id):
            manifest = read_manifest(self.cache_dir / CACHE_MANIFEST)
            manifest[source.id] = entry
            write_manifest(self.cache_dir / CACHE_MANIFEST, manifest)
        return PlateFiles(source.id, final_dir, "downloaded", entry["zip"]["bytes"], len(files))

    def _expected_is_cache_record(self, source_id: str) -> bool:
        if self.manifest_path is not None and self.manifest_path.is_file():
            if source_id in read_manifest(self.manifest_path):
                return False
        return True

    @staticmethod
    def _check_zip(source_id: str, size: int, sha256: str, expected: dict | None) -> None:
        zip_record = (expected or {}).get("zip")
        if zip_record is None:
            return
        if size != zip_record["bytes"]:
            raise FetchRefused(
                "size_mismatch",
                f"{source_id}: the download is {size} bytes, "
                f"the manifest says {zip_record['bytes']}",
            )
        if sha256 != zip_record["sha256"]:
            raise FetchRefused("hash_mismatch", f"{source_id}: the download's SHA-256 differs "
                               "from the manifest's")

    @staticmethod
    def _check_files(source_id: str, files: list[dict], expected: dict | None) -> None:
        if expected is None:
            return
        want = {r["path"]: r for r in expected["files"]}
        got = {r["path"]: r for r in files}
        if set(want) != set(got):
            raise FetchRefused(
                "files_mismatch",
                f"{source_id}: the extracted files differ from the manifest's list",
            )
        for path, record in got.items():
            if record["bytes"] != want[path]["bytes"]:
                raise FetchRefused("size_mismatch", f"{source_id}: {path} has a different size")
            if record["sha256"] != want[path]["sha256"]:
                raise FetchRefused(
                    "hash_mismatch", f"{source_id}: {path} differs from the manifest"
                )
