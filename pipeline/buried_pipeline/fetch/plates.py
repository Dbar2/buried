"""`buried fetch` for fire insurance plates.

Only registered sources, only the two U of T download patterns from `sources.md`, one request at a
time. A source whose files already match the manifest is skipped with no request.
"""

from __future__ import annotations

import re
import shutil
from dataclasses import dataclass
from datetime import datetime

from buried_pipeline.errors import PipelineError
from buried_pipeline.fetch.manifest import (
    entry_mismatches,
    file_record,
    read_manifest,
    write_manifest,
)
from buried_pipeline.fetch.zipsafe import extract_safely
from buried_pipeline.io.http import HttpClient
from buried_pipeline.io.registry import Registry, Source
from buried_pipeline.paths import Paths
from buried_pipeline.timeutil import rfc3339

PLATE_ID_RE = re.compile(r"^fip_v3_(1911|1935)_(\d+)$")
URL_1911 = re.compile(
    r"^https://maps\.library\.utoronto\.ca/datapub/FIP/vol3_19111914/v3-1911-(\d+)\.zip$"
)
URL_1935 = re.compile(
    r"^https://maps\.library\.utoronto\.ca/datapub/FIP/vol3_1935/Georeferenced/v3-1935-(\d+)\.zip$"
)
PLATE_TYPE = "fire_insurance_plan"


@dataclass(frozen=True)
class FetchResult:
    source: str
    status: str  # "downloaded" or "up_to_date"
    zip_bytes: int
    files: int


def check_plate_url(source: Source) -> None:
    """The URL must match one of the two patterns, for the edition and plate in the source id."""
    id_match = PLATE_ID_RE.match(source.id)
    if not id_match:
        raise PipelineError(f"{source.id}: not a fire insurance plate id (fip_v3_<year>_<plate>)")
    edition, plate = id_match.groups()
    pattern = URL_1911 if edition == "1911" else URL_1935
    url_match = pattern.match(source.url)
    if not url_match:
        raise PipelineError(
            f"{source.id}: URL does not match the {edition} download pattern in sources.md: "
            f"{source.url}"
        )
    if url_match.group(1) != plate:
        raise PipelineError(f"{source.id}: URL names plate {url_match.group(1)}, id names {plate}")


def select_sources(registry: Registry, ids: list[str]) -> list[Source]:
    """No ids: every registered plate. Ids: only those, which must be registered plates."""
    if not ids:
        return list(registry.by_type(PLATE_TYPE))
    selected = []
    for source_id in ids:
        source = registry.get(source_id)
        if source.type != PLATE_TYPE:
            raise PipelineError(
                f"{source_id}: type {source.type} cannot be fetched yet "
                "(aerial downloads arrive with spec 02 task 5.2)"
            )
        selected.append(source)
    return selected


def check_fetchable(source: Source) -> None:
    if source.rights_checked_on is None:
        raise PipelineError(
            f"{source.id}: rights_checked_on is null. Check the item's rights statement, then "
            "record the date in data/sources.json."
        )
    check_plate_url(source)


def fetch_plates(
    paths: Paths,
    registry: Registry,
    http: HttpClient,
    ids: list[str],
    now: datetime,
) -> list[FetchResult]:
    sources = select_sources(registry, ids)
    for source in sources:
        check_fetchable(source)

    results: list[FetchResult] = []
    for source in sources:
        results.append(_fetch_one(paths, source, http, now))
    return results


def _fetch_one(paths: Paths, source: Source, http: HttpClient, now: datetime) -> FetchResult:
    manifest = read_manifest(paths.manifest)
    final_dir = paths.raw_source_dir(source.id)
    entry = manifest.get(source.id)

    if final_dir.exists():
        if entry is None:
            if any(final_dir.iterdir()):
                raise PipelineError(
                    f"{source.id}: {final_dir} has files but the manifest has no entry. "
                    "Nothing was overwritten. Delete the folder by hand to fetch again."
                )
        else:
            bad = entry_mismatches(paths.raw, entry)
            if bad:
                raise PipelineError(
                    f"{source.id}: files differ from the manifest: {', '.join(bad)}. "
                    "Nothing was overwritten. Delete data/raw/<id>/ by hand to fetch again."
                )
            return FetchResult(
                source.id, "up_to_date", entry.get("zip", {}).get("bytes", 0), len(entry["files"])
            )

    zip_name = source.url.rsplit("/", 1)[-1]
    partial = paths.raw / f"{source.id}.partial"
    if partial.exists():
        shutil.rmtree(partial)
    partial.mkdir(parents=True)
    try:
        http.download(source.url, partial / zip_name)
        extract_safely(partial / zip_name, partial)
        # The zip itself is listed under "zip"; extracted files under "files".
        if final_dir.exists():  # empty directory from an earlier failed run
            final_dir.rmdir()
        partial.rename(final_dir)
    except BaseException:
        shutil.rmtree(partial, ignore_errors=True)
        raise

    zip_path = final_dir / zip_name
    files = [
        file_record(paths.raw, p)
        for p in sorted(final_dir.rglob("*"))
        if p.is_file() and p != zip_path
    ]
    manifest[source.id] = {
        "source": source.id,
        "url": source.url,
        "retrieved_at": rfc3339(now),
        "zip": file_record(paths.raw, zip_path),
        "files": files,
    }
    write_manifest(paths.manifest, manifest)
    return FetchResult(source.id, "downloaded", manifest[source.id]["zip"]["bytes"], len(files))
