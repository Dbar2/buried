"""Cross-file checks for every contract file except evidence files (see `evidence_checks.py`).

Pure functions over parsed, schema-valid data. Each returns a list of ValidationError. None reads
the clock or the disk. None computes dates, windows, conflicts or lot relations (requirement 8.7).
"""

from __future__ import annotations

import math
import re
from pathlib import PurePosixPath
from typing import Any

from buried_pipeline.align.control import ControlFilePoint
from buried_pipeline.align.hull import hull_area_m2, hull_matches
from buried_pipeline.align.references import point_problem
from buried_pipeline.align.residuals import published_error
from buried_pipeline.validate.context import Context
from buried_pipeline.validate.errors import ValidationError, err
from buried_pipeline.validate.evidence_checks import parse_time
from buried_pipeline.validate.geometry import (
    bounds_box,
    pixel_polygon_problem,
    position_outside,
    to_shape,
)

HELD_OUT_SOURCE = "fip_v3_1935_232"
LEGACY_SCHEMA_VERSION = "1.0.0"
HULL_AREA_TOLERANCE_M2 = 0.01
TILE_CORNER_TOLERANCE_M = 0.01

# Source id forms by source type (structure.md "Source ids").
SOURCE_ID_FORMS: dict[str, re.Pattern[str]] = {
    "fire_insurance_plan": re.compile(r"^fip_v\d+_\d{4}_\d+$"),
    "aerial_photograph": re.compile(r"^aerial_\d{4}_[a-z0-9]+(_[a-z0-9]+)*$"),
    "present_day_reference": re.compile(r"^present_[a-z0-9]+(_[a-z0-9]+)*_\d{4}$"),
}


FOUR_DIGIT_NUMBER = re.compile(r"(?<!\d)\d{4}(?!\d)")


def years_label_problem(label: str, year_from: int | None, year_to: int) -> str | None:
    """Requirement 24.2: the label states year_from and year_to as four-digit numbers, and no
    other four-digit number, so it can never state a year the record does not."""
    if year_from is None:
        return "a label needs year_from, which this source does not have yet"
    found = set(FOUR_DIGIT_NUMBER.findall(label))
    expected = {str(year_from), str(year_to)}
    if found == expected:
        return None
    missing = sorted(expected - found)
    extra = sorted(found - expected)
    parts = []
    if missing:
        parts.append(f"does not contain {', '.join(missing)}")
    if extra:
        parts.append(f"contains {', '.join(extra)}, which the record does not state")
    return f"years_label {label!r} " + " and ".join(parts)


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
        if "years_label" in s:
            problem = years_label_problem(s["years_label"], s["year_from"], s["year_to"])
            if problem:
                out.append(err(path, f"{ptr}/years_label", problem))
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
    if "supplied" not in doc and doc["error_basis"] != "refined_loo_rmse":
        out.append(err(path, "/error_basis", "a record without supplied georeferencing must "
                       "use error_basis refined_loo_rmse"))
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
    out.extend(_check_control_hull(doc, path, ctx))
    return out


def _check_control_hull(doc: dict[str, Any], path: str, ctx: Context) -> list[ValidationError]:
    """Requirement 30.2 and 30.3."""
    hull = doc.get("control_hull")
    area = doc.get("control_hull_area_m2")
    if hull is None and area is None:
        if doc["schema_version"] == LEGACY_SCHEMA_VERSION:
            return []
        return [err(path, "/control_hull", "control_hull is required in a record written after "
                    f"schema {LEGACY_SCHEMA_VERSION}; run buried align-check again")]
    if hull is None:
        return [err(path, "/control_hull_area_m2", "control_hull_area_m2 without control_hull")]
    out: list[ValidationError] = []
    if area is None:
        out.append(err(path, "/control_hull", "control_hull needs control_hull_area_m2"))
    elif abs(area - hull_area_m2(hull)) > HULL_AREA_TOLERANCE_M2:
        out.append(err(path, "/control_hull_area_m2", f"{area!r} m2 is not the area of "
                       f"control_hull ({hull_area_m2(hull)!r} m2)"))
    control = ctx.control.get(PurePosixPath(doc["control_file"]).stem)
    if control is None:
        out.append(err(path, "/control_file", f"{doc['control_file']} was not found, so "
                       "control_hull cannot be checked against its control points"))
    else:
        references = [(p["reference"][0], p["reference"][1]) for p in control["points"]]
        if not hull_matches(hull, references):
            out.append(err(path, "/control_hull", "is not the convex hull of the reference "
                           f"positions in {doc['control_file']} (within 0.01 m)"))
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


def check_map_area(
    doc: dict[str, Any], path: str, name: str, ctx: Context
) -> list[ValidationError]:
    """Requirement 29.2. Whether the polygon lies inside the raster is checked by the pipeline,
    which has the raster (spec 02 requirement 16)."""
    out: list[ValidationError] = []
    sid = doc["source"]
    if sid != name:
        out.append(err(path, "/source", f"map area is for {sid} but the file is {name}"))
    s = ctx.sources.get(sid)
    if s is None:
        out.append(err(path, "/source", f"source {sid} is not in data/sources.json"))
    elif s["type"] != "fire_insurance_plan":
        out.append(err(path, "/source", f"{sid} is not a fire insurance plan"))
    problem = pixel_polygon_problem(doc["pixel_polygon"])
    if problem:
        out.append(err(path, "/pixel_polygon", f"the polygon {problem}"))
    if parse_time(doc["confirmed_at"]) > ctx.now:
        out.append(err(path, "/confirmed_at", "is in the future"))
    return out


def _corners_from_crop(crop: dict[str, int]) -> list[tuple[float, float]]:
    x, y, w, h = crop["x"], crop["y"], crop["width"], crop["height"]
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]


def _check_tile_crop(
    doc: dict[str, Any], path: str, ctx: Context, record: dict[str, Any] | None
) -> list[ValidationError]:
    """Requirements 31.1 and 31.3, and spec 02 requirement 19.2."""
    out: list[ValidationError] = []
    sid = doc["source"]
    map_area = ctx.map_areas.get(sid)
    crop = doc.get("crop_px")
    if map_area is not None and (crop is None or "map_area" not in doc):
        out.append(err(path, "/crop_px", f"{sid} has a map area file, so the sidecar must carry "
                       "crop_px and map_area; run buried tile again"))
    if crop is None:
        return out
    if map_area is None:
        out.append(err(path, "/crop_px", f"crop_px without a map area file for {sid}"))
        return out
    xs = [v[0] for v in map_area["pixel_polygon"]]
    ys = [v[1] for v in map_area["pixel_polygon"]]
    box_ = {"x": min(xs), "y": min(ys), "width": max(xs) - min(xs), "height": max(ys) - min(ys)}
    if crop != box_:
        out.append(err(path, "/crop_px", f"must be the bounding box of the map area {box_!r}"))

    names = ("top_left", "top_right", "bottom_right", "bottom_left")
    corners = [tuple(doc["corners"][n]) for n in names]
    if doc["transform"] == "refined" and record is not None and "refined" in record:
        a, b, c, d, e, f = record["refined"]["affine"]
        for n, (px, py), got in zip(names, _corners_from_crop(crop), corners, strict=True):
            want = (a * px + b * py + c, d * px + e * py + f)
            if math.hypot(got[0] - want[0], got[1] - want[1]) > TILE_CORNER_TOLERANCE_M:
                out.append(err(path, f"/corners/{n}", "is not the refined transform applied to "
                               f"the crop_px corner (expected {want!r})"))
    else:
        # The supplied georeferencing needs the raster, which is not in data/. What can be
        # checked here is that the four corners keep the shape of a rectangle under an affine
        # map: opposite corners sum to the same point.
        tl, tr, br, bl = corners
        gap = math.hypot(tl[0] + br[0] - tr[0] - bl[0], tl[1] + br[1] - tr[1] - bl[1])
        if gap > TILE_CORNER_TOLERANCE_M:
            out.append(err(path, "/corners", "do not form a parallelogram, which an affine map "
                           f"of the crop_px rectangle must ({gap:.3f} m apart)"))
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
    if record is not None and doc["transform"] != record["chosen"]:
        out.append(err(path, "/transform", f"must be the alignment record's chosen transform "
                       f"({record['chosen']})"))
    out.extend(_check_tile_crop(doc, path, ctx, record))
    return out
