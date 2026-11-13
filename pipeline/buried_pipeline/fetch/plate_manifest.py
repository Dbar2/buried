"""`buried manifest`: write `data/plate_manifest.json`, the committed record of what each registered
plate's download holds (URL, file names, sizes, SHA-256), taken from `data/raw/manifest.json`.

No raster is stored, only the numbers that identify one. The Studio service reads this file as its
default manifest, so a deployment with an empty `data/raw/` knows each plate's `plate_ref` (the
SHA-256 of its raster) before it has fetched the plate, and checks every download against it.
The held-out plate has an entry too: a hash identifies a file, it is not a result.

    {"version": 1,
     "entries": [ {"source", "url", "retrieved_at", "zip": {path, bytes, sha256},
                   "files": [ {path, bytes, sha256}, ... ]}, ... ]}   # sorted by source id

Each entry has the shape of an entry of `data/raw/manifest.json`, so `read_manifest` reads this
file too. `buried validate` checks it (`validate/plate_manifest.py`).
"""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from buried_pipeline.errors import PipelineError
from buried_pipeline.fetch.manifest import entry_mismatches, read_manifest
from buried_pipeline.io.atomic import atomic_write_text
from buried_pipeline.io.registry import Registry
from buried_pipeline.paths import Paths

PLATE_TYPE = "fire_insurance_plan"
VERSION = 1


def canonical(doc: Any) -> str:
    """The same canonical serialisation as every other contract file (spec 04 "Conventions")."""
    return json.dumps(doc, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


def build_plate_manifest(
    raw: dict[str, dict[str, Any]], registry: Registry
) -> dict[str, Any]:
    """The plate manifest for every registered plate, from the raw manifest's entries. Pure.

    Raises `PipelineError` naming each plate that has no entry or whose entry's URL is not the
    Registry's, so a file that is not about the registered plates is never written."""
    problems: list[str] = []
    entries: list[dict[str, Any]] = []
    for source in sorted(registry.by_type(PLATE_TYPE), key=lambda s: s.id):
        entry = raw.get(source.id)
        if entry is None:
            problems.append(f"{source.id}: no entry in data/raw/manifest.json "
                            f"(run `buried fetch {source.id}`)")
            continue
        if entry["url"] != source.url:
            problems.append(f"{source.id}: the manifest's URL is not the Registry's")
            continue
        if "zip" not in entry:
            problems.append(f"{source.id}: its entry in data/raw/manifest.json has no zip record")
            continue
        entries.append(
            {
                "source": source.id,
                "url": entry["url"],
                "retrieved_at": entry["retrieved_at"],
                "zip": dict(entry["zip"]),
                "files": sorted((dict(f) for f in entry["files"]), key=lambda f: f["path"]),
            }
        )
    if not entries and not problems:
        problems.append("the Registry has no fire insurance plates")
    if problems:
        raise PipelineError("; ".join(problems))
    return {"version": VERSION, "entries": entries}


def run_manifest(
    paths: Paths, registry: Registry, out: Callable[[str], None] = print
) -> Path:
    """Read `data/raw/manifest.json`, check that the files it names are on disk and unchanged,
    and write `data/plate_manifest.json` atomically. Running it twice gives the same bytes."""
    raw = read_manifest(paths.manifest)
    doc = build_plate_manifest(raw, registry)
    stale = {
        e["source"]: entry_mismatches(paths.raw, raw[e["source"]]) for e in doc["entries"]
    }
    stale = {k: v for k, v in stale.items() if v}
    if stale:
        named = "; ".join(f"{k}: {', '.join(v[:3])}" for k, v in sorted(stale.items()))
        raise PipelineError(
            f"data/raw/ does not match its manifest ({named}); run `buried fetch` again "
            "before writing the plate manifest"
        )
    target = paths.plate_manifest
    atomic_write_text(target, canonical(doc))
    out(f"wrote {target.relative_to(paths.root).as_posix()}: {len(doc['entries'])} plates")
    for e in doc["entries"]:
        out(f"  {e['source']}: {len(e['files'])} files")
    return target
