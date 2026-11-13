"""A tiny repository for the MCP tests: two address points, two lots, two buildings, one source
registry, one alignment record with its control file, and some `data/work/` output."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

ADDR = "present_toronto_address_points_2026"
LOT = "present_toronto_property_boundaries_2026"
PLATE = "fip_v3_1911_229"
E0, N0 = 632400.0, 4834900.0


def square(x: float, y: float, size: float) -> dict[str, Any]:
    ring = [[E0 + x, N0 + y], [E0 + x + size, N0 + y], [E0 + x + size, N0 + y + size],
            [E0 + x, N0 + y + size], [E0 + x, N0 + y]]  # fmt: skip
    return {"type": "Polygon", "coordinates": [ring]}


def write(path: Path, doc: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc), encoding="utf-8")


def building(n: int, x: float, y: float, status: str = "published") -> dict[str, Any]:
    return {
        "type": "Feature",
        "id": f"bld_{PLATE}_{n:04d}",
        "geometry": square(x, y, 10),
        "properties": {
            "kind": "building",
            "status": status,
            "position_error_m": 4.5,
            "confidence": "documented",
            "confidence_reason": "Traced from the plate.",
            "attributes": {"storeys": 2},
            "observations": [
                {"source": PLATE, "present": True, "visibility": "clear", "method": "origin"},
                {"source": "fip_v3_1935_229", "present": False, "visibility": "not_covered",
                 "method": "match_auto"},
            ],
            "provenance": {"origin_source": PLATE, "alignment_error_m": 4.3},
        },
    }  # fmt: skip


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    (root / ".kiro").mkdir(parents=True)
    d = root / "data"
    write(d / "present" / f"{ADDR}.geojson", {"features": [
        {"type": "Feature", "id": "a1", "geometry": {"type": "Point", "coordinates": [E0 + 5, N0 + 5]},
         "properties": {"ADDRESS_FULL": "75 Sumach St"}},
        {"type": "Feature", "id": "a2", "geometry": {"type": "Point", "coordinates": [E0 + 500, N0 + 500]},
         "properties": {"ADDRESS_FULL": "12 River St"}},
    ]})  # fmt: skip
    write(d / "present" / f"{LOT}.geojson", {"features": [
        {"type": "Feature", "id": "L1", "geometry": square(0, 0, 20), "properties": {}},
        {"type": "Feature", "id": "L2", "geometry": square(400, 400, 200), "properties": {}},
    ]})  # fmt: skip
    write(d / "evidence" / f"{PLATE}.geojson", {
        "type": "FeatureCollection", "origin_source": PLATE,
        "features": [building(1, 2, 2), building(2, 60, 2), building(3, 3, 3, "rejected")],
    })  # fmt: skip
    write(d / "sources.json", {"sources": [
        {"id": PLATE, "type": "fire_insurance_plan", "title": "Plate 229, 1911", "year_from": 1911,
         "year_to": 1914, "url": "https://example.test/x.zip", "licence_note": "Out of copyright.",
         "attribution_line": "U of T.", "attribution_status": "confirmed",
         "rights_checked_on": "2026-11-10", "held_out": False},
        {"id": "fip_v3_1935_232", "type": "fire_insurance_plan", "title": "Plate 232, 1935",
         "year_from": 1931, "year_to": 1935, "url": "https://example.test/y.zip",
         "licence_note": "See sources.md", "attribution_line": "LAC.",
         "attribution_status": "confirmed", "rights_checked_on": "2026-11-10", "held_out": True},
    ]})  # fmt: skip
    write(d / "alignment" / f"{PLATE}.json", {
        "source": PLATE, "chosen": "supplied", "alignment_error_m": 4.3,
        "control_hull": {"type": "Polygon", "coordinates": []}, "control_hull_area_m2": 1.5,
    })  # fmt: skip
    write(d / "control" / f"{PLATE}.json", {"points": [
        {"id": "cp_1", "description": "x", "pixel": [1, 2], "reference": [3.0, 4.0],
         "reference_source": "present_toronto_intersections_2026",
         "reference_kind": "intersection", "reference_feature_id": "1"},
    ]})  # fmt: skip
    write(d / "work" / "proposals" / f"{PLATE}.geojson", {
        "type": "FeatureCollection", "map_area_sha256": "abc", "map_area_geometry": {"x": 1},
        "features": [
            {"properties": {"quality": {"score": s}, "tone_class": t, "weaknesses": w}}
            for s, t, w in [(0.2, "light", []), (0.8, "dark", ["touches_edge"]),
                            (0.6, "light", ["touches_edge"])]
        ],
    })  # fmt: skip
    write(d / "work" / "review" / f"{PLATE}.json", {
        "decisions": [
            {"type": "accept", "confirmed_by": "A. Person"},
            {"decision": "reject", "confirmed_by": "A. Person"},
            {"type": "accept"},
        ],
        "reviewed_areas": [{}],
    })  # fmt: skip
    return root
