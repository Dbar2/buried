"""A small, valid, fake `data/` tree held in memory (spec 01 task 4.4).

Keys are paths relative to the repository root; values are parsed documents. Geometry is synthetic
rectangles near a placeholder point in UTM 17N; nothing here describes a real building. Source ids
are the real plate ids because the Validator's rules are about those forms.
"""

from __future__ import annotations

import copy
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from buried_pipeline.align.hull import control_hull, hull_area_m2
from buried_pipeline.validate.dataset import LoadedFile, Report, validate_files
from buried_pipeline.validate.errors import ValidationError
from buried_pipeline.validate.schema import SchemaSet, def_for_path, load_schema

NOW = datetime(2026, 11, 13, 12, 0, 0, tzinfo=UTC)
LONG_AGO = "2026-11-12T10:00:00Z"
FUTURE = "2026-12-01T10:00:00Z"

E0, N0 = 500000.0, 4000000.0
P1911 = "fip_v3_1911_229"
P1935 = "fip_v3_1935_229"
AERIAL = "aerial_1947_s0000_fl0000_it0000h"
INTERSECTIONS = "present_toronto_intersections_2026"
OUTLINES = "present_toronto_building_outlines_2026"

VIRTUAL_ROOT = Path("/virtual")


def rect(e: float, n: float, w: float, h: float) -> list[list[float]]:
    return [[e, n], [e + w, n], [e + w, n + h], [e, n + h], [e, n]]


def polygon(e: float = E0, n: float = N0, w: float = 10.0, h: float = 8.0) -> dict[str, Any]:
    return {"type": "Polygon", "coordinates": [rect(e, n, w, h)]}


def source(sid: str, **over: Any) -> dict[str, Any]:
    s: dict[str, Any] = {
        "id": sid,
        "type": "fire_insurance_plan",
        "title": f"synthetic {sid}",
        "year_from": 1911,
        "year_to": 1914,
        "url": f"https://example.invalid/{sid}.zip",
        "licence_note": "Synthetic.",
        "attribution_line": "Synthetic attribution.",
        "attribution_status": "confirmed",
        "rights_checked_on": "2026-11-10",
        "held_out": False,
    }
    s.update(over)
    return s


def registry() -> dict[str, Any]:
    return {
        "schema_version": "1.0.0",
        "sources": [
            source(P1911),
            source(P1935, year_from=1935, year_to=1935),
            source(AERIAL, type="aerial_photograph", year_from=1947, year_to=1947),
            source(INTERSECTIONS, type="present_day_reference", year_from=2026, year_to=2026,
                   rights_checked_on="2026-11-12"),
            source(OUTLINES, type="present_day_reference", year_from=2026, year_to=2026,
                   rights_checked_on="2026-11-12"),
        ],
    }


def project() -> dict[str, Any]:
    return {
        "schema_version": "1.0.0",
        "crs": "EPSG:26917",
        "origin": {"easting": E0, "northing": N0},
        "origin_note": "Synthetic origin.",
        "bounds": {"min_e": E0 - 1000, "min_n": N0 - 1000, "max_e": E0 + 1000, "max_n": N0 + 1000},
        "eras": [{"id": "1911", "label": "1911", "year_from": 1911, "year_to": 1914}],
    }


def alignment(sid: str) -> dict[str, Any]:
    """A schema 1.0.0 record: it has no control hull, which only 1.0.0 may omit."""
    residuals = [{"id": f"cp_{i}", "dx_m": 1.0, "dy_m": -1.0, "r_m": 1.4142} for i in range(3)]
    return {
        "schema_version": "1.0.0",
        "source": sid,
        "reference_sources": [INTERSECTIONS],
        "control_file": f"data/control/{sid}.json",
        "control_sha256": "0" * 64,
        "measured_at": LONG_AGO,
        "tool_version": "0.1.0",
        "status": "measured",
        "source_pixel_size_m": 0.06,
        "supplied": {"crs": "EPSG:26917", "operation": "synthetic", "residuals": residuals,
                     "rmse_m": 2.14, "max_residual_m": 3.5},
        "chosen": "supplied",
        "error_basis": "supplied_rmse",
        "error_basis_m": 2.14,
        "error_rule": {"multiplier": 2.0, "floor_m": 2.0, "round_up_to_m": 0.1},
        "alignment_error_m": 4.3,
        "outliers": [],
    }


def alignment_with_hull(sid: str, control: dict[str, Any]) -> dict[str, Any]:
    """A schema 1.1.0 record whose control hull is that of `control`'s reference positions."""
    rec = alignment(sid)
    rec["schema_version"] = "1.1.0"
    hull = control_hull([(p["reference"][0], p["reference"][1]) for p in control["points"]])
    rec["control_hull"] = hull
    rec["control_hull_area_m2"] = hull_area_m2(hull)
    return rec


def present_feature(fid: str, geometry: dict[str, Any]) -> dict[str, Any]:
    return {"type": "Feature", "id": fid, "geometry": geometry, "properties": {"NAME": "synthetic"}}


def present_layer(sid: str, features: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "schema_version": "1.0.0",
        "crs": "EPSG:26917",
        "source": sid,
        "ckan_package_id": "synthetic-package",
        "ckan_resource_id": "synthetic-resource",
        "resource_url": "https://example.invalid/synthetic.gpkg",
        "retrieved_at": LONG_AGO,
        "last_refreshed": "2026-11-11",
        "source_sha256": "0" * 64,
        "id_field": "ID",
        "clip_bounds": project()["bounds"],
        "attribution_line": "Synthetic attribution.",
        "features": features,
    }


def intersections_layer() -> dict[str, Any]:
    pts = [("i1", E0 + 100, N0 + 100), ("i2", E0 + 400, N0 + 150), ("i3", E0 + 250, N0 + 500)]
    return present_layer(
        INTERSECTIONS,
        [present_feature(i, {"type": "Point", "coordinates": [e, n]}) for i, e, n in pts],
    )


def outlines_layer() -> dict[str, Any]:
    return present_layer(OUTLINES, [present_feature("b1", polygon(E0 + 200, N0 + 200, 20, 15))])


def control_points() -> dict[str, Any]:
    layer = {f["id"]: f["geometry"]["coordinates"] for f in intersections_layer()["features"]}
    pts: list[dict[str, Any]] = []
    for k, (fid, (e, n)) in enumerate(layer.items()):
        pts.append({
            "id": f"cp_{fid}", "description": "Synthetic.", "pixel": [100 * (k + 1), 50 * (k + 2)],
            "reference": [e, n], "reference_source": INTERSECTIONS,
            "reference_kind": "intersection", "reference_feature_id": fid,
        })
    pts.append({
        "id": "cp_b1", "description": "Synthetic.", "pixel": [900, 700],
        "reference": [E0 + 220, N0 + 200], "reference_source": OUTLINES,
        "reference_kind": "building_corner", "reference_feature_id": "b1",
        "reference_vertex": {"polygon": 0, "vertex": 1},
    })
    return {"schema_version": "1.0.0", "source": P1911, "pixel_convention": "gdal_corner",
            "points": pts}


def tile_sidecar(sid: str) -> dict[str, Any]:
    return {
        "schema_version": "1.0.0", "source": sid, "image": f"{sid}.jpg", "width_px": 4096,
        "height_px": 3000,
        "corners": {"top_left": [E0, N0 + 100], "top_right": [E0 + 150, N0 + 100],
                    "bottom_right": [E0 + 150, N0], "bottom_left": [E0, N0]},
        "transform": "supplied", "alignment_error_m": 4.3, "source_pixel_size_m": 0.06,
        "tile_pixel_size_m": 0.04, "attribution_line": "Synthetic attribution.",
    }


def feature(origin: str, seq: int = 1, **over: Any) -> dict[str, Any]:
    f: dict[str, Any] = {
        "type": "Feature",
        "id": f"bld_{origin}_{seq:04d}",
        "geometry": polygon(E0 + 40 * seq, N0),
        "properties": {
            "kind": "building",
            "position_error_m": 4.5,
            "attributes": {"storeys": 2},
            "observations": [{"source": origin, "present": True, "visibility": "clear",
                              "method": "origin"}],
            "confidence": "documented",
            "confidence_reason": "Synthetic.",
            "provenance": {
                "origin_source": origin,
                "crop_px": {"x": 0, "y": 0, "width": 100, "height": 100},
                "alignment_error_m": 4.3,
                "digitising_error_m": 1.0,
                "confirmed_by": "synthetic reviewer",
                "confirmed_at": LONG_AGO,
                "review": {"state": "draft_rule"},
            },
            "status": "published",
        },
    }
    f["properties"].update(over)
    return f


def link_features(a: dict[str, Any], b: dict[str, Any], method: str = "match_auto") -> None:
    """Link a and b both ways, with the matching presence observation on each."""
    for x, y in ((a, b), (b, a)):
        p = x["properties"]
        p.setdefault("same_as", []).append({"feature": y["id"], "method": method} | (
            {"confirmed_by": "synthetic reviewer", "confirmed_at": LONG_AGO}
            if method == "person" else {}
        ))
        p["observations"].append({
            "source": y["properties"]["provenance"]["origin_source"], "present": True,
            "visibility": "clear", "method": "match_auto", "matched_feature": y["id"],
        })


def evidence(origin: str, features: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": "FeatureCollection", "schema_version": "1.2.0", "crs": "EPSG:26917",
        "origin_source": origin,
        "mapped_area": {"geometry": polygon(E0 - 50, N0 - 50, 400, 300), "method": "neatline"},
        "reviewed_areas": [{
            "geometry": polygon(E0 - 10, N0 - 10, 300, 100), "method": "person",
            "pixel_polygon": [[0, 0], [100, 0], [100, 100]], "confirmed_by": "synthetic reviewer",
            "confirmed_at": LONG_AGO,
        }],
        "features": features,
    }


def base_dataset() -> dict[str, Any]:
    a = feature(P1911, 1)
    b = feature(P1935, 1)
    link_features(a, b)
    return {
        "data/sources.json": registry(),
        "data/project.json": project(),
        f"data/alignment/{P1911}.json": alignment_with_hull(P1911, control_points()),
        f"data/alignment/{P1935}.json": alignment(P1935),
        f"data/control/{P1911}.json": control_points(),
        f"data/present/{INTERSECTIONS}.geojson": intersections_layer(),
        f"data/present/{OUTLINES}.geojson": outlines_layer(),
        f"data/tiles/{P1911}.json": tile_sidecar(P1911),
        f"data/evidence/{P1911}.geojson": evidence(P1911, [a, feature(P1911, 2)]),
        f"data/evidence/{P1935}.geojson": evidence(P1935, [b]),
    }


def minimal_dataset(features: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Registry, project, one alignment record and one evidence file; no links, control or tiles."""
    return {
        "data/sources.json": registry(),
        "data/project.json": project(),
        f"data/alignment/{P1911}.json": alignment(P1911),
        f"data/evidence/{P1911}.geojson": evidence(P1911, features or [feature(P1911, 1)]),
    }


_SCHEMA: SchemaSet | None = None


def schema() -> SchemaSet:
    global _SCHEMA
    if _SCHEMA is None:
        from buried_pipeline.paths import find_repo_root

        _SCHEMA = load_schema(find_repo_root(Path(__file__)))
    return _SCHEMA


def validate_dataset(ds: dict[str, Any], now: datetime = NOW) -> Report:
    files = []
    for rel, doc in ds.items():
        full = VIRTUAL_ROOT / rel
        def_name = def_for_path(full, VIRTUAL_ROOT / "data")
        assert def_name is not None, rel
        files.append(LoadedFile(rel, full.stem, def_name, copy.deepcopy(doc)))
    return validate_files(files, schema(), now)


def errors_for(ds: dict[str, Any]) -> list[ValidationError]:
    return validate_dataset(ds).errors


def feature_of(ds: dict[str, Any], origin: str, seq: int = 1) -> dict[str, Any]:
    fid = f"bld_{origin}_{seq:04d}"
    for f in ds[f"data/evidence/{origin}.geojson"]["features"]:
        if f["id"] == fid:
            return f
    raise KeyError(fid)
