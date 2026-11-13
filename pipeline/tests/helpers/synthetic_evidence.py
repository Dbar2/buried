"""Synthetic evidence files for the match tests: boxes on plates, complete enough to pass the
Validator when the plate's alignment record in the test root is the real one.

Coordinates are EPSG:26917 metres inside the project bounds (631900 to 633200 E, 4834400 to
4835600 N). The helpers build plain dicts, as read from `data/evidence/*.geojson`.
"""

from __future__ import annotations

import math
from typing import Any

from shapely.geometry import box as shapely_box
from shapely.geometry import mapping

from buried_pipeline.align.residuals import ceil_tenth

P1911 = "fip_v3_1911_229"
P1911B = "fip_v3_1911_232"  # a third plate, only for tests of linked sets across three sources
P1935 = "fip_v3_1935_229"
# The alignment errors in the committed records for these two plates, and the digitising term the
# helper uses (at least 2 source pixels for both). The third plate borrows 1911/229's.
ALIGNMENT_ERROR_M = {P1911: 4.3, P1911B: 4.3, P1935: 3.1}
DIGITISING_M = 1.0
EAST0, NORTH0 = 632400.0, 4834900.0
CONFIRMED_AT = "2026-11-12T21:32:22Z"
WHO = "Synthetic Reviewer"


def feature_error(origin: str) -> float:
    """The position error of a feature from `origin` (the smallest the Validator allows)."""
    return float(ceil_tenth(math.hypot(ALIGNMENT_ERROR_M[origin], DIGITISING_M)))


def box_geometry(x0: float, y0: float, x1: float, y1: float) -> dict[str, Any]:
    """A rectangle, in metres east and north of (EAST0, NORTH0)."""
    return dict(mapping(shapely_box(EAST0 + x0, NORTH0 + y0, EAST0 + x1, NORTH0 + y1)))


def building(
    origin: str,
    n: int,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    *,
    error_m: float | None = None,
    observations: list[dict[str, Any]] | None = None,
    same_as: list[dict[str, Any]] | None = None,
    status: str = "published",
) -> dict[str, Any]:
    props: dict[str, Any] = {
        "kind": "building",
        "position_error_m": error_m if error_m is not None else feature_error(origin),
        "attributes": {"storeys": 2},
        "observations": [
            {"source": origin, "present": True, "visibility": "clear", "method": "origin"},
            *(observations or []),
        ],
        "confidence": "documented",
        "confidence_reason": "Synthetic footprint for a test.",
        "provenance": {
            "origin_source": origin,
            "crop_px": {"x": 0, "y": 0, "width": 100, "height": 100},
            "alignment_error_m": ALIGNMENT_ERROR_M[origin],
            "digitising_error_m": DIGITISING_M,
            "confirmed_by": WHO,
            "confirmed_at": CONFIRMED_AT,
        },
        "status": status,
    }
    if status == "rejected":
        props["status_reason"] = "synthetic"
    if same_as:
        props["same_as"] = same_as
    return {
        "type": "Feature",
        "id": f"bld_{origin}_{n:04d}",
        "geometry": box_geometry(x0, y0, x1, y1),
        "properties": props,
    }


def coverage(x0: float, y0: float, x1: float, y1: float, *, person: bool = False) -> dict[str, Any]:
    area: dict[str, Any] = {
        "geometry": box_geometry(x0, y0, x1, y1),
        "method": "person" if person else "neatline",
    }
    if person:
        area["pixel_polygon"] = [[0, 0], [10, 0], [10, 10], [0, 10]]
        area["confirmed_by"] = WHO
        area["confirmed_at"] = CONFIRMED_AT
    return area


def evidence_doc(
    origin: str,
    features: list[dict[str, Any]],
    *,
    mapped: tuple[float, float, float, float] | None = (-100, -100, 300, 300),
    reviewed: list[tuple[float, float, float, float]] | None = None,
) -> dict[str, Any]:
    doc: dict[str, Any] = {
        "type": "FeatureCollection",
        "schema_version": "1.1.0",
        "crs": "EPSG:26917",
        "origin_source": origin,
        "features": features,
    }
    if mapped is not None:
        doc["mapped_area"] = coverage(*mapped)
    if reviewed:
        doc["reviewed_areas"] = [coverage(*r, person=True) for r in reviewed]
    return doc


def presence(source: str, matched: str, *, method: str = "match_auto") -> dict[str, Any]:
    obs: dict[str, Any] = {
        "source": source,
        "present": True,
        "visibility": "clear",
        "method": method,
        "matched_feature": matched,
    }
    if method == "person":
        del obs["matched_feature"]
        obs["confirmed_by"] = WHO
        obs["confirmed_at"] = CONFIRMED_AT
    return obs


def person_observation(source: str, present: bool, visibility: str) -> dict[str, Any]:
    return {
        "source": source,
        "present": present,
        "visibility": visibility,
        "method": "person",
        "confirmed_by": WHO,
        "confirmed_at": CONFIRMED_AT,
    }


def link(feature: str, method: str = "match_auto") -> dict[str, Any]:
    out: dict[str, Any] = {"feature": feature, "method": method}
    if method == "person":
        out["confirmed_by"] = WHO
        out["confirmed_at"] = CONFIRMED_AT
    return out
