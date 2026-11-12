"""Cross-file checks for every contract file except evidence files (see `evidence_checks.py`).

Pure functions over parsed, schema-valid data. Each returns a list of ValidationError. None reads
the clock or the disk. None computes dates, windows, conflicts or lot relations (requirement 8.7).
"""

from __future__ import annotations

import math
import re
from typing import Any

from buried_pipeline.align.control import ControlFilePoint
from buried_pipeline.align.references import point_problem
from buried_pipeline.align.residuals import published_error
from buried_pipeline.validate.context import Context
from buried_pipeline.validate.errors import ValidationError, err
from buried_pipeline.validate.geometry import bounds_box, position_outside, to_shape

HELD_OUT_SOURCE = "fip_v3_1935_232"

# Source id forms by source type (structure.md "Source ids").
SOURCE_ID_FORMS: dict[str, re.Pattern[str]] = {
    "fire_insurance_plan": re.compile(r"^fip_v\d+_\d{4}_\d+$"),
    "aerial_photograph": re.compile(r"^aerial_\d{4}_[a-z0-9]+(_[a-z0-9]+)*$"),
    "present_day_reference": re.compile(r"^present_[a-z0-9]+(_[a-z0-9]+)*_\d{4}$"),
}


def check_registry(doc: dict[str, Any], path: str) -> list[ValidationError]:
    """Requirements 6.2 and 6.4."""
    out: list[ValidationError] = []
    seen: dict[str, int] = {}
    for i, s in enumerate(doc["sources"]):
        sid = s["id"]
        ptr = f"/sources/{i}"
        if sid in seen:
            out.append(
                err(path, f"{ptr}/id", f"duplicate source id (first at /sources/{seen[sid]})")
            )
        seen.setdefault(sid, i)
        form = SOURCE_ID_FORMS.get(s["type"])
        if form is not None and not form.match(sid):
            out.append(
                err(path, f"{ptr}/id", f"id does not follow structure.md for {s['type']}: {sid}")
            )
        if s["year_from"] is not None and s["year_from"] > s["year_to"]:
            out.append(err(path, f"{ptr}/year_from", "year_from is greater than year_to"))
        if s["held_out"] and sid != HELD_OUT_SOURCE:
            out.append(err(path, f"{ptr}/held_out", f"only {HELD_OUT_SOURCE} may be held out"))
        if sid == HELD_OUT_SOURCE and not s["held_out"]:
            out.append(err(path, f"{ptr}/held_out", f"{HELD_OUT_SOURCE} must be held out"))
    return out


def check_project(doc: dict[str, Any], path: str) -> list[ValidationError]:
    out: list[ValidationError] = []
    b = doc["bounds"]
    if not (b["min_e"] < b["max_e"] and b["min_n"] < b["max_n"]):
        out.append(err(path, "/bounds", "bounds must have min below max on both axes"))
    o = doc["origin"]
    if not (b["min_e"] <= o["easting"] <= b["max_e"] and b["min_n"] <= o["northing"] <= b["max_n"]):
        out.append(err(path, "/origin", "origin lies outside the project bounds"))
    seen: set[str] = set()
    for i, era in enumerate(doc["eras"]):
        if era["id"] in seen:
            out.append(err(path, f"/eras/{i}/id", f"duplicate era id {era['id']}"))
        seen.add(era["id"])
        if era["year_from"] > era["year_to"]:
            out.append(err(path, f"/eras/{i}/year_from", "year_from is greater than year_to"))
    return out


def _source_problem(ctx: Context, source_id: str) -> str | None:
    s = ctx.sources.get(source_id)
    if s is None:
        return f"source {source_id} is not in data/sources.json"
    if s["attribution_status"] != "confirmed":
        return f"source {source_id} has attribution_status {s['attribution_status']}"
    return None


def check_alignment_record(
    doc: dict[str, Any], path: str, name: str, ctx: Context
) -> list[ValidationError]:
    """Requirements 20.1 and 20.2, plus file and registry consistency."""
    out: list[ValidationError] = []
    if doc["source"] != name:
        out.append(err(path, "/source", f"record is for {doc['source']} but the file is {name}"))
    if doc["source"] not in ctx.sources:
        out.append(err(path, "/source", f"source {doc['source']} is not in data/sources.json"))
    for i, ref in enumerate(doc["reference_sources"]):
        s = ctx.sources.get(ref)
        if s is None:
            out.append(err(path, f"/reference_sources/{i}", f"{ref} is not in data/sources.json"))
        elif s["type"] != "present_day_reference":
            out.append(err(path, f"/reference_sources/{i}", f"{ref} is not a present-day source"))
    if doc["chosen"] == "supplied":
        basis = doc["supplied"]["rmse_m"]
        basis_name = "the supplied RMSE"
    else:
        basis = doc["refined"]["rmse_loo_m"]
        basis_name = "the refined leave-one-out RMSE"
    if doc["error_basis_m"] != basis:
        out.append(
            err(path, "/error_basis_m", f"error_basis_m must be {basis_name} ({basis!r}) when "
                f"chosen is {doc['chosen']}, not {doc['error_basis_m']!r}")
        )
    expected = published_error(doc["error_basis_m"])
    if doc["alignment_error_m"] != expected:
        out.append(
            err(path, "/alignment_error_m", "alignment_error_m must be ceil_0.1(max(2.0, "
                f"2.0 x error_basis_m)) = {expected!r}, not {doc['alignment_error_m']!r}")
        )
    return out


def check_control_points(
    doc: dict[str, Any], path: str, name: str, ctx: Context
) -> list[ValidationError]:
    """Requirements 22.2 and 22.3, plus 7.5 for the reference coordinates."""
    out: list[ValidationError] = []
    if doc["source"] != name:
        out.append(err(path, "/source", f"control file is for {doc['source']} but file is {name}"))
    if doc["source"] not in ctx.sources:
        out.append(err(path, "/source", f"source {doc['source']} is not in data/sources.json"))
    ids = [p["id"] for p in doc["points"]]
    for i, pid in enumerate(ids):
        if ids.index(pid) != i:
            out.append(err(path, f"/points/{i}/id", f"duplicate control point id {pid}"))
    for i, p in enumerate(doc["points"]):
        vertex = p.get("reference_vertex")
        point = ControlFilePoint(
            id=p["id"],
            description=p["description"],
            pixel=(float(p["pixel"][0]), float(p["pixel"][1])),
            reference=(float(p["reference"][0]), float(p["reference"][1])),
            reference_source=p["reference_source"],
            reference_kind=p["reference_kind"],
            reference_feature_id=p["reference_feature_id"],
            reference_vertex=(vertex["polygon"], vertex["vertex"]) if vertex else None,
        )
        problem = point_problem(point, ctx.present)
        if problem:
            out.append(err(path, f"/points/{i}", f"control point {p['id']}: {problem}"))
        if ctx.bounds and position_outside(p["reference"], ctx.bounds):
            out.append(
                err(path, f"/points/{i}/reference", "reference is outside the project bounds")
            )
    return out


def check_present_layer(
    doc: dict[str, Any], path: str, name: str, ctx: Context
) -> list[ValidationError]:
    """Requirements 21.3 and 21.4."""
    out: list[ValidationError] = []
    sid = doc["source"]
    if sid != name:
        out.append(err(path, "/source", f"layer is for {sid} but the file is {name}"))
    s = ctx.sources.get(sid)
    if s is None:
        out.append(err(path, "/source", f"source {sid} is not in data/sources.json"))
    else:
        if s["type"] != "present_day_reference":
            out.append(err(path, "/source", f"{sid} is not a present_day_reference source"))
        if s["attribution_status"] != "confirmed":
            out.append(err(path, "/source", f"{sid} has attribution_status "
                           f"{s['attribution_status']}"))
    seen: set[str] = set()
    box_ = bounds_box(ctx.bounds) if ctx.bounds else None
    for i, f in enumerate(doc["features"]):
        if f["id"] in seen:
            out.append(err(path, f"/features/{i}/id", f"duplicate feature id {f['id']}", f["id"]))
        seen.add(f["id"])
        if box_ is not None and not to_shape(f["geometry"]).intersects(box_):
            out.append(
                err(path, f"/features/{i}/geometry",
                    "feature does not intersect the project bounds", f["id"])
            )
    return out


def check_tile_sidecar(
    doc: dict[str, Any], path: str, name: str, ctx: Context
) -> list[ValidationError]:
    out: list[ValidationError] = []
    sid = doc["source"]
    if sid != name:
        out.append(err(path, "/source", f"sidecar is for {sid} but the file is {name}"))
    problem = _source_problem(ctx, sid)
    if problem:
        out.append(err(path, "/source", problem))
    if doc["image"] != f"{sid}.jpg":
        out.append(err(path, "/image", f"image must be {sid}.jpg"))
    record = ctx.alignment.get(sid)
    if record is None:
        out.append(err(path, "/source", f"{sid} has no alignment record; it cannot be tiled"))
    elif record["alignment_error_m"] != doc["alignment_error_m"]:
        out.append(
            err(path, "/alignment_error_m", "must equal the alignment record's "
                f"{record['alignment_error_m']!r}")
        )
    if ctx.bounds and position_outside(list(doc["corners"].values()), ctx.bounds):
        out.append(err(path, "/corners", "a corner is outside the project bounds"))
    if not all(math.isfinite(v) for c in doc["corners"].values() for v in c):
        out.append(err(path, "/corners", "corners must be finite"))
    return out
