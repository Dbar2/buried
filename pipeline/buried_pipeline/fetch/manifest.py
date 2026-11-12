"""`data/raw/manifest.json`: what was downloaded, when, and its SHA-256.

Pipeline-internal file (gitignored). Its shape is checked in code.

    {"entries": [ {"source": ..., "url": ..., "retrieved_at": ...,
                   "zip": {path, bytes, sha256}?,         # plates only
                   "files": [ {path, bytes, sha256}, ... ]} ]}

Paths are relative to `data/raw/`.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from buried_pipeline.errors import PipelineError
from buried_pipeline.io.atomic import atomic_write_json

_CHUNK = 1024 * 1024


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(_CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def file_record(raw_root: Path, path: Path) -> dict[str, Any]:
    return {
        "path": path.relative_to(raw_root).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def _check_file_record(rec: Any, where: str) -> None:
    if (
        not isinstance(rec, dict)
        or set(rec) != {"path", "bytes", "sha256"}
        or not isinstance(rec["path"], str)
        or not isinstance(rec["bytes"], int)
        or not isinstance(rec["sha256"], str)
    ):
        raise PipelineError(f"{where}: bad file record {rec!r}")


def _check_entry(entry: Any) -> None:
    if not isinstance(entry, dict):
        raise PipelineError("data/raw/manifest.json: entry is not an object")
    for key in ("source", "url", "retrieved_at"):
        if not isinstance(entry.get(key), str):
            raise PipelineError(f"data/raw/manifest.json: entry missing {key}")
    if "zip" in entry:
        _check_file_record(entry["zip"], f"manifest {entry['source']} zip")
    files = entry.get("files")
    if not isinstance(files, list):
        raise PipelineError(f"data/raw/manifest.json: {entry['source']} has no files list")
    for rec in files:
        _check_file_record(rec, f"manifest {entry['source']}")


def read_manifest(path: Path) -> dict[str, dict[str, Any]]:
    """Entries by source id. A missing manifest is an empty one."""
    if not path.exists():
        return {}
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise PipelineError(f"Manifest is not valid JSON: {path}: {exc}") from exc
    if not isinstance(doc, dict) or not isinstance(doc.get("entries"), list):
        raise PipelineError(f"Manifest has the wrong shape: {path}")
    out: dict[str, dict[str, Any]] = {}
    for entry in doc["entries"]:
        _check_entry(entry)
        out[entry["source"]] = entry
    return out


def write_manifest(path: Path, entries: dict[str, dict[str, Any]]) -> None:
    atomic_write_json(path, {"entries": [entries[k] for k in sorted(entries)]})


def entry_records(entry: dict[str, Any]) -> list[dict[str, Any]]:
    records = list(entry["files"])
    if "zip" in entry:
        records.append(entry["zip"])
    return records


def entry_mismatches(raw_root: Path, entry: dict[str, Any]) -> list[str]:
    """Paths whose file is missing or differs from the manifest's SHA-256. Empty = up to date."""
    bad: list[str] = []
    for rec in entry_records(entry):
        target = raw_root / rec["path"]
        if not target.is_file() or sha256_file(target) != rec["sha256"]:
            bad.append(rec["path"])
    return sorted(bad)
