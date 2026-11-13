"""Checks for `data/plate_manifest.json` (`buried manifest` writes it): its shape, then the
cross-file rules against the source registry.

The shape is checked here, against the schema below, rather than in `evidence.schema.json`: the
file is pipeline and service input, not part of the evidence contract that the shell and Unity read,
so it does not change that schema or its version.

Rules against the registry: one entry per registered fire insurance plate and no other entry; the
entry's URL is the registry's; every file lies under `<source id>/`, once; the zip is the file the
URL names; the entry names exactly one raster (the file whose SHA-256 is the plate's `plate_ref`);
entries are sorted by source id, so the file has one canonical form.
"""

from __future__ import annotations

from pathlib import PurePosixPath
from typing import Any

from jsonschema import Draft202012Validator

from buried_pipeline.validate.context import Context
from buried_pipeline.validate.errors import ValidationError, err
from buried_pipeline.validate.schema import SchemaIssue, json_pointer

PLATE_TYPE = "fire_insurance_plan"
SOURCE_ID = r"^[a-z0-9]+(_[a-z0-9]+)*$"
SHA256 = r"^[0-9a-f]{64}$"

_FILE_RECORD = {
    "type": "object",
    "additionalProperties": False,
    "required": ["path", "bytes", "sha256"],
    "properties": {
        "path": {"type": "string", "pattern": r"^[a-z0-9_]+/[^\\:]+$"},
        "bytes": {"type": "integer", "minimum": 1},
        "sha256": {"type": "string", "pattern": SHA256},
    },
}

PLATE_MANIFEST_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": False,
    "required": ["version", "entries"],
    "properties": {
        "version": {"const": 1},
        "entries": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["source", "url", "retrieved_at", "zip", "files"],
                "properties": {
                    "source": {"type": "string", "pattern": SOURCE_ID},
                    "url": {"type": "string", "pattern": r"^https://[^\s]+$"},
                    "retrieved_at": {
                        "type": "string",
                        "pattern": r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$",
                    },
                    "zip": _FILE_RECORD,
                    "files": {"type": "array", "minItems": 1, "items": _FILE_RECORD},
                },
            },
        },
    },
}

_VALIDATOR = Draft202012Validator(PLATE_MANIFEST_SCHEMA)


def shape_issues(doc: object) -> list[SchemaIssue]:
    """Schema problems of the file, sorted, each with its JSON pointer."""
    return sorted(
        (SchemaIssue(json_pointer(e.absolute_path), str(e.message)[:160])
         for e in _VALIDATOR.iter_errors(doc)),
        key=lambda i: (i.pointer, i.message),
    )  # fmt: skip


def check_plate_manifest(doc: dict[str, Any], path: str, ctx: Context) -> list[ValidationError]:
    """The cross-file rules, for a document that already passed the shape check."""
    from buried_pipeline.service.plates import manifest_raster_ref  # the one raster rule

    out: list[ValidationError] = []
    registered = {i for i, s in ctx.sources.items() if s["type"] == PLATE_TYPE}
    entries: list[dict[str, Any]] = doc["entries"]
    seen: set[str] = set()
    for k, entry in enumerate(entries):
        base = f"/entries/{k}"
        sid = entry["source"]
        if sid in seen:
            out.append(err(path, f"{base}/source", f"{sid} has more than one entry"))
        seen.add(sid)
        if sid not in registered:
            out.append(err(path, f"{base}/source", f"{sid} is not a registered fire insurance "
                           "plate: this file holds the registered plates only"))
            continue
        source = ctx.sources[sid]
        if entry["url"] != source["url"]:
            out.append(err(path, f"{base}/url", f"the URL is not the one registered for {sid}"))
        records = [("zip", entry["zip"]),
                   *[(f"files/{i}", f) for i, f in enumerate(entry["files"])]]  # fmt: skip
        paths_seen: set[str] = set()
        for where, rec in records:
            p = PurePosixPath(rec["path"])
            if p.parts[0] != sid or ".." in p.parts or "." in p.parts[1:]:
                out.append(err(path, f"{base}/{where}/path",
                               f"{rec['path']} is not a file under {sid}/"))
            if rec["path"] in paths_seen:
                out.append(err(path, f"{base}/{where}/path", f"{rec['path']} is listed twice"))
            paths_seen.add(rec["path"])
        zip_name = PurePosixPath(entry["zip"]["path"]).name
        if zip_name != source["url"].rsplit("/", 1)[-1]:
            out.append(err(path, f"{base}/zip/path", "the zip is not the file the URL names"))
        if manifest_raster_ref(entry) is None:
            out.append(err(path, f"{base}/files", f"{sid} must list exactly one raster file "
                           "(.tif, .tiff, .jpg or .jpeg that is not a thumbnail)"))
    for sid in sorted(registered - seen):
        out.append(err(path, "/entries", f"the registered plate {sid} has no entry; run "
                       "`buried manifest`"))
    order = [e["source"] for e in entries]
    if order != sorted(order):
        out.append(err(path, "/entries", "entries must be sorted by source id"))
    return out
