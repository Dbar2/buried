"""Validate a set of already-read contract files: schema first, then the cross-file checks.

Pure: no disk, no clock. `run.py` reads the files and passes `now`.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from buried_pipeline.validate.checks import (
    check_alignment_record,
    check_control_points,
    check_map_area,
    check_present_layer,
    check_project,
    check_registry,
    check_tile_sidecar,
)
from buried_pipeline.validate.context import Context, Doc
from buried_pipeline.validate.errors import ValidationError, err
from buried_pipeline.validate.evidence_checks import check_evidence
from buried_pipeline.validate.schema import SchemaSet


@dataclass(frozen=True)
class LoadedFile:
    """A contract file that parsed as JSON. `def_name` is the `$defs` entry it is checked as."""

    path: str
    name: str
    def_name: str
    doc: Any


@dataclass(frozen=True)
class Report:
    errors: list[ValidationError]
    files_checked: int
    features_checked: int


def feature_id_at(doc: Any, pointer: str) -> str | None:
    """The id of the feature a `/features/<n>/...` pointer points into, if it has one."""
    m = re.match(r"^/features/(\d+)(/|$)", pointer)
    if not m or not isinstance(doc, dict) or not isinstance(doc.get("features"), list):
        return None
    i = int(m.group(1))
    if i >= len(doc["features"]):
        return None
    f = doc["features"][i]
    fid = f.get("id") if isinstance(f, dict) else None
    return fid if isinstance(fid, str) else None


def validate_files(files: Sequence[LoadedFile], schema: SchemaSet, now: datetime) -> Report:
    errors: list[ValidationError] = []
    ok: dict[str, list[Doc]] = {}
    registry_failed = False
    features = 0

    for f in files:
        issues = schema.issues(f.def_name, f.doc)
        for issue in issues:
            fid = feature_id_at(f.doc, issue.pointer)
            errors.append(err(f.path, issue.pointer, issue.message, fid))
        if issues:
            registry_failed = registry_failed or f.def_name == "sourceRegistry"
            continue
        ok.setdefault(f.def_name, []).append(Doc(f.path, f.name, f.doc))
        if f.def_name == "featureCollection":
            features += len(f.doc["features"])

    if registry_failed:
        failing = next(f.path for f in files if f.def_name == "sourceRegistry")
        errors.append(err(failing, "/", "cross-file checks were skipped because this file "
                          "failed the Schema"))
        return Report(sorted(set(errors)), len(files), features)

    ctx = Context(now=now)
    for d in ok.get("sourceRegistry", []):
        ctx.sources = {s["id"]: s for s in d.doc["sources"]}
    for d in ok.get("project", []):
        ctx.project = d.doc
    for d in ok.get("alignmentRecord", []):
        ctx.alignment[d.doc["source"]] = d.doc
    for d in ok.get("presentLayer", []):
        ctx.present[d.doc["source"]] = d.doc
    for d in ok.get("controlPoints", []):
        ctx.control[d.name] = d.doc
    for d in ok.get("mapArea", []):
        ctx.map_areas[d.name] = d.doc

    for d in ok.get("sourceRegistry", []):
        errors.extend(check_registry(d.doc, d.path))
    for d in ok.get("project", []):
        errors.extend(check_project(d.doc, d.path))
    for d in ok.get("alignmentRecord", []):
        errors.extend(check_alignment_record(d.doc, d.path, d.name, ctx))
    for d in ok.get("controlPoints", []):
        errors.extend(check_control_points(d.doc, d.path, d.name, ctx))
    for d in ok.get("presentLayer", []):
        errors.extend(check_present_layer(d.doc, d.path, d.name, ctx))
    for d in ok.get("mapArea", []):
        errors.extend(check_map_area(d.doc, d.path, d.name, ctx))
    for d in ok.get("tileSidecar", []):
        errors.extend(check_tile_sidecar(d.doc, d.path, d.name, ctx))
    errors.extend(check_evidence(ok.get("featureCollection", []), ctx))

    return Report(sorted(set(errors)), len(files), features)
