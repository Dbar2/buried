"""Example tests for the schema 1.1.0 checks (spec 01 task 17.2).

Same method as `test_checks.py`: start from the valid in-memory tree, break one thing, expect an
error that names the file and, for features, the feature id.
"""

from __future__ import annotations

import copy
from typing import Any

from buried_pipeline.align.hull import control_hull, hull_area_m2
from tests.validate.builders import (
    AERIAL,
    E0,
    FUTURE,
    LONG_AGO,
    N0,
    P1911,
    P1935,
    alignment,
    alignment_with_hull,
    base_dataset,
    control_points,
    errors_for,
    evidence,
    feature,
    feature_of,
    validate_dataset,
)

EV_1911 = f"data/evidence/{P1911}.geojson"
REGISTRY = "data/sources.json"
ALIGN_1911 = f"data/alignment/{P1911}.json"
ALIGN_1935 = f"data/alignment/{P1935}.json"
TILE_1911 = f"data/tiles/{P1911}.json"
MAP_AREA_1911 = f"data/control/map_area/{P1911}.json"
SQUARE_PX = [[100, 150], [4100, 150], [4100, 3050], [100, 3050]]


def reasons(errors: list[Any], contains: str, path: str | None = None) -> list[Any]:
    return [e for e in errors if contains in e.reason and (path is None or e.path == path)]


def map_area_file(source: str = P1911, polygon_px: list[list[int]] | None = None) -> dict[str, Any]:
    return {
        "schema_version": "1.1.0",
        "source": source,
        "pixel_convention": "gdal_corner",
        "pixel_polygon": copy.deepcopy(polygon_px or SQUARE_PX),
        "excluded": "margin, title block, scale bar (synthetic)",
        "confirmed_by": "synthetic reviewer",
        "confirmed_at": LONG_AGO,
    }


def with_map_area(ds: dict[str, Any], polygon_px: list[list[int]] | None = None) -> dict[str, Any]:
    """Add a map area file for plate 1911 and make the evidence file and tile sidecar follow it."""
    ma = map_area_file(P1911, polygon_px)
    ds[MAP_AREA_1911] = ma
    ds[EV_1911]["mapped_area"]["method"] = "map_area"
    xs = [v[0] for v in ma["pixel_polygon"]]
    ys = [v[1] for v in ma["pixel_polygon"]]
    tile = ds[TILE_1911]
    tile["schema_version"] = "1.1.0"
    tile["crop_px"] = {"x": min(xs), "y": min(ys), "width": max(xs) - min(xs),
                       "height": max(ys) - min(ys)}
    tile["map_area"] = {
        "type": "Polygon",
        "coordinates": [[[E0 + 5, N0 + 5], [E0 + 140, N0 + 5], [E0 + 140, N0 + 90],
                         [E0 + 5, N0 + 90], [E0 + 5, N0 + 5]]],
    }
    return ds


# --- years_label (24.2) ---------------------------------------------------------------------------


def set_label(ds: dict[str, Any], sid: str, label: str, **over: Any) -> None:
    for s in ds["data/sources.json"]["sources"]:
        if s["id"] == sid:
            s["years_label"] = label
            s.update(over)


def test_years_label_that_states_exactly_the_record_is_accepted() -> None:
    ds = base_dataset()
    set_label(ds, P1911, "1911, revised to 1914")
    set_label(ds, P1935, "1931, revised to 1935", year_from=1931, year_to=1935)
    assert errors_for(ds) == []


def test_years_label_for_a_single_year_source() -> None:
    ds = base_dataset()
    set_label(ds, AERIAL, "1947")
    assert errors_for(ds) == []


def test_years_label_missing_a_year_is_rejected() -> None:
    ds = base_dataset()
    set_label(ds, P1911, "1911")
    assert reasons(errors_for(ds), "does not contain 1914", REGISTRY)


def test_years_label_stating_another_year_is_rejected() -> None:
    ds = base_dataset()
    set_label(ds, P1911, "1911, revised to 1914, reprinted 1920")
    assert reasons(errors_for(ds), "contains 1920, which the record does not state", REGISTRY)


def test_years_label_numbers_must_be_whole_four_digit_numbers() -> None:
    ds = base_dataset()
    set_label(ds, P1911, "plate 19114, 1911 to 1914")
    # 19114 is a five-digit number, not a year, so the label still states exactly 1911 and 1914.
    assert not reasons(errors_for(ds), "years_label", REGISTRY)


def test_years_label_on_a_source_without_year_from_is_rejected() -> None:
    ds = base_dataset()
    set_label(ds, "present_toronto_building_outlines_2026", "2026", year_from=None)
    assert reasons(errors_for(ds), "needs year_from", REGISTRY)


def test_empty_years_label_and_holding_are_rejected_by_the_schema() -> None:
    ds = base_dataset()
    set_label(ds, P1911, "")
    assert errors_for(ds)


# --- attribute reads (25.2, 25.3) -----------------------------------------------------------------


def read(attribute: str, **over: Any) -> dict[str, Any]:
    r: dict[str, Any] = {
        "attribute": attribute,
        "crop_px": {"x": 10, "y": 10, "width": 40, "height": 20},
        "read_by": "person",
        "confirmed_by": "synthetic reviewer",
        "confirmed_at": LONG_AGO,
    }
    r.update(over)
    return r


def test_material_with_a_read_is_accepted() -> None:
    ds = base_dataset()
    f = feature_of(ds, P1911, 2)
    f["properties"]["attributes"]["material"] = "BRICK (as lettered)"
    f["properties"]["provenance"]["attribute_reads"] = [read("material")]
    assert errors_for(ds) == []


def test_material_without_a_read_is_rejected() -> None:
    ds = base_dataset()
    f = feature_of(ds, P1911, 2)
    f["properties"]["attributes"]["material"] = "BRICK"
    errors = errors_for(ds)
    assert [e for e in errors if e.feature_id == f["id"]]


def test_material_with_only_another_attributes_read_is_rejected() -> None:
    ds = base_dataset()
    f = feature_of(ds, P1911, 2)
    f["properties"]["attributes"]["material"] = "BRICK"
    f["properties"]["attributes"]["use"] = "OFFICE"
    f["properties"]["provenance"]["attribute_reads"] = [read("use")]
    assert [e for e in errors_for(ds) if e.feature_id == f["id"]]


def test_a_label_assist_read_keeps_provider_and_model() -> None:
    ds = base_dataset()
    f = feature_of(ds, P1911, 2)
    f["properties"]["attributes"]["street_number"] = "12"
    f["properties"]["provenance"]["attribute_reads"] = [
        read("street_number", read_by="label_assist", provider="synthetic", model_id="synthetic-1")
    ]
    assert errors_for(ds) == []


def test_two_reads_for_one_attribute_are_rejected() -> None:
    ds = base_dataset()
    f = feature_of(ds, P1911, 2)
    f["properties"]["provenance"]["attribute_reads"] = [read("storeys"), read("storeys")]
    assert reasons(errors_for(ds), "second read for storeys", EV_1911)


def test_a_read_for_an_attribute_the_feature_lacks_is_rejected() -> None:
    ds = base_dataset()
    f = feature_of(ds, P1911, 2)
    f["properties"]["provenance"]["attribute_reads"] = [read("use")]
    errors = reasons(errors_for(ds), "read for use, but the feature has no use attribute", EV_1911)
    assert errors and errors[0].feature_id == f["id"]


def test_a_read_confirmed_in_the_future_is_rejected() -> None:
    ds = base_dataset()
    f = feature_of(ds, P1911, 2)
    f["properties"]["provenance"]["attribute_reads"] = [read("storeys", confirmed_at=FUTURE)]
    assert reasons(errors_for(ds), "is in the future", EV_1911)


def test_tone_class_is_provenance_not_an_attribute() -> None:
    ds = base_dataset()
    f = feature_of(ds, P1911, 2)
    f["properties"]["provenance"]["tone_class"] = "hatched"
    assert errors_for(ds) == []
    f["properties"]["attributes"]["tone_class"] = "hatched"
    assert [e for e in errors_for(ds) if e.feature_id == f["id"]]


# --- alignment records without supplied georeferencing (26) ----------------------------------------


def refined_only_record() -> dict[str, Any]:
    rec = alignment_with_hull(P1911, control_points())
    residuals = [{"id": f"cp_{i}", "dx_m": 0.1, "dy_m": 0.1, "r_m": 0.15} for i in range(4)]
    del rec["supplied"]
    rec["refined"] = {
        "affine": [0.05, 0.0, E0, 0.0, -0.05, N0], "residuals": residuals,
        "rmse_in_sample_m": 0.3, "rmse_loo_m": 2.14, "max_residual_m": 0.15,
    }
    rec["chosen"] = "refined"
    rec["error_basis"] = "refined_loo_rmse"
    rec["error_basis_m"] = 2.14
    rec["alignment_error_m"] = 4.3
    return rec


def test_a_refined_only_record_is_accepted() -> None:
    ds = base_dataset()
    ds[ALIGN_1911] = refined_only_record()
    ds[TILE_1911]["transform"] = "refined"
    assert errors_for(ds) == []


def test_a_supplied_choice_without_supplied_block_is_rejected() -> None:
    ds = base_dataset()
    rec = refined_only_record()
    rec["chosen"] = "supplied"
    rec["error_basis"] = "supplied_rmse"
    ds[ALIGN_1911] = rec
    assert [e for e in errors_for(ds) if e.path == ALIGN_1911]


def test_refined_only_record_must_use_the_refined_basis() -> None:
    from buried_pipeline.validate.checks import check_alignment_record
    from buried_pipeline.validate.context import Context
    from tests.validate.builders import NOW

    rec = refined_only_record()
    rec["error_basis"] = "supplied_rmse"  # the Schema rejects this too; the check must as well
    ctx = Context(now=NOW)
    ctx.control[P1911] = control_points()
    ctx.sources = {s["id"]: s for s in base_dataset()["data/sources.json"]["sources"]}
    errors = check_alignment_record(rec, ALIGN_1911, P1911, ctx)
    assert reasons(errors, "without supplied georeferencing must use error_basis refined")


# --- aerial origin (27.1, 27.2) --------------------------------------------------------------------


def aerial_dataset() -> dict[str, Any]:
    ds = base_dataset()
    f = feature(AERIAL, 1)
    ds[f"data/alignment/{AERIAL}.json"] = alignment(AERIAL)
    ds[f"data/evidence/{AERIAL}.geojson"] = evidence(AERIAL, [f])
    return ds


def test_a_feature_traced_from_an_aerial_may_have_a_clear_origin_presence() -> None:
    assert errors_for(aerial_dataset()) == []


def test_an_aerial_origin_that_is_obscured_is_rejected() -> None:
    ds = aerial_dataset()
    path = f"data/evidence/{AERIAL}.geojson"
    f = ds[path]["features"][0]
    f["properties"]["observations"][0]["visibility"] = "obscured"
    assert reasons(errors_for(ds), "must be set by a person", path)


def test_origin_observation_of_a_trace_cannot_be_an_absence() -> None:
    ds = aerial_dataset()
    path = f"data/evidence/{AERIAL}.geojson"
    ds[path]["features"][0]["properties"]["observations"][0]["present"] = False
    assert [e for e in errors_for(ds) if e.path == path]


def test_a_non_origin_aerial_observation_on_a_plate_feature_still_needs_a_person() -> None:
    ds = base_dataset()
    f = feature_of(ds, P1911, 2)
    f["properties"]["observations"].append(
        {"source": AERIAL, "present": True, "visibility": "clear", "method": "origin"}
    )
    assert reasons(errors_for(ds), "must be set by a person", EV_1911)


# --- control hull (30) -----------------------------------------------------------------------------


def test_the_base_tree_record_with_hull_is_accepted() -> None:
    assert "control_hull" in base_dataset()[ALIGN_1911]
    assert errors_for(base_dataset()) == []


def test_a_new_record_without_a_hull_is_rejected() -> None:
    ds = base_dataset()
    rec = alignment(P1911)
    rec["schema_version"] = "1.1.0"
    ds[ALIGN_1911] = rec
    assert reasons(errors_for(ds), "control_hull is required", ALIGN_1911)


def test_a_1_0_0_record_without_a_hull_is_accepted() -> None:
    ds = base_dataset()
    ds[ALIGN_1911] = alignment(P1911)
    assert errors_for(ds) == []


def test_a_hull_that_is_not_the_convex_hull_is_rejected() -> None:
    ds = base_dataset()
    rec = ds[ALIGN_1911]
    rec["control_hull"]["coordinates"][0][1][0] += 1.0
    rec["control_hull"]["coordinates"][0][-1] = list(rec["control_hull"]["coordinates"][0][0])
    assert reasons(errors_for(ds), "is not the convex hull", ALIGN_1911)


def test_a_hull_within_the_tolerance_is_accepted() -> None:
    ds = base_dataset()
    rec = ds[ALIGN_1911]
    ring = rec["control_hull"]["coordinates"][0]
    ring[1][0] += 0.005
    rec["control_hull_area_m2"] = hull_area_m2(rec["control_hull"])
    assert errors_for(ds) == []


def test_a_hull_area_that_does_not_match_is_rejected() -> None:
    ds = base_dataset()
    ds[ALIGN_1911]["control_hull_area_m2"] += 5.0
    assert reasons(errors_for(ds), "is not the area of control_hull", ALIGN_1911)


def test_a_hull_without_an_area_or_an_area_without_a_hull() -> None:
    ds = base_dataset()
    del ds[ALIGN_1911]["control_hull_area_m2"]
    assert reasons(errors_for(ds), "needs control_hull_area_m2", ALIGN_1911)
    ds = base_dataset()
    del ds[ALIGN_1911]["control_hull"]
    assert reasons(errors_for(ds), "control_hull_area_m2 without control_hull", ALIGN_1911)


def test_a_hull_cannot_be_checked_without_its_control_file() -> None:
    ds = base_dataset()
    del ds[f"data/control/{P1911}.json"]
    assert reasons(errors_for(ds), "cannot be checked against its control points", ALIGN_1911)


def test_the_hull_is_that_of_the_references_not_the_pixels() -> None:
    ds = base_dataset()
    ctl = ds[f"data/control/{P1911}.json"]
    shifted = copy.deepcopy(ctl)
    shifted["points"][0]["reference"][0] += 0.0  # unchanged
    ds[ALIGN_1911]["control_hull"] = control_hull(
        [(p["reference"][0], p["reference"][1]) for p in shifted["points"][1:]]
    )
    ds[ALIGN_1911]["control_hull_area_m2"] = hull_area_m2(ds[ALIGN_1911]["control_hull"])
    assert reasons(errors_for(ds), "is not the convex hull", ALIGN_1911)


# --- map area files (29) ---------------------------------------------------------------------------


def test_a_map_area_with_tile_and_evidence_that_follow_it_is_accepted() -> None:
    assert errors_for(with_map_area(base_dataset())) == []


def test_a_map_area_for_an_unregistered_source_is_rejected() -> None:
    ds = base_dataset()
    ds[f"data/control/map_area/{P1911}.json"] = map_area_file("fip_v3_1999_001")
    errors = errors_for(ds)
    assert reasons(errors, "map area is for fip_v3_1999_001", f"data/control/map_area/{P1911}.json")
    assert reasons(errors, "is not in data/sources.json", f"data/control/map_area/{P1911}.json")


def test_a_map_area_for_a_present_day_source_is_rejected() -> None:
    ds = base_dataset()
    name = "present_toronto_intersections_2026"
    ds[f"data/control/map_area/{name}.json"] = map_area_file(name)
    assert reasons(errors_for(ds), "is not a fire insurance plan")


def test_a_self_crossing_map_area_polygon_is_rejected() -> None:
    ds = base_dataset()
    ds[MAP_AREA_1911] = map_area_file(P1911, [[0, 0], [100, 100], [100, 0], [0, 100]])
    assert reasons(errors_for(ds), "not a single valid polygon", MAP_AREA_1911)


def test_a_map_area_polygon_that_repeats_its_first_vertex_is_rejected() -> None:
    ds = base_dataset()
    ds[MAP_AREA_1911] = map_area_file(P1911, [*SQUARE_PX, SQUARE_PX[0]])
    assert reasons(errors_for(ds), "repeats its first vertex", MAP_AREA_1911)


def test_a_map_area_polygon_with_zero_area_is_rejected() -> None:
    ds = base_dataset()
    ds[MAP_AREA_1911] = map_area_file(P1911, [[0, 0], [10, 0], [20, 0], [30, 0]])
    assert reasons(errors_for(ds), "not a single valid polygon", MAP_AREA_1911)


def test_a_map_area_with_three_vertices_is_rejected_by_the_schema() -> None:
    ds = base_dataset()
    ds[MAP_AREA_1911] = map_area_file(P1911, [[0, 0], [100, 0], [0, 100]])
    assert [e for e in errors_for(ds) if e.path == MAP_AREA_1911]


def test_a_map_area_confirmed_in_the_future_is_rejected() -> None:
    ds = with_map_area(base_dataset())
    ds[MAP_AREA_1911]["confirmed_at"] = FUTURE
    assert reasons(errors_for(ds), "is in the future", MAP_AREA_1911)


def test_a_plate_with_a_map_area_needs_mapped_area_method_map_area() -> None:
    ds = with_map_area(base_dataset())
    ds[EV_1911]["mapped_area"]["method"] = "neatline"
    assert reasons(errors_for(ds), "mapped_area must have method map_area", EV_1911)


def test_mapped_area_method_map_area_needs_the_map_area_file() -> None:
    ds = base_dataset()
    ds[EV_1911]["mapped_area"]["method"] = "map_area"
    assert reasons(errors_for(ds), "needs data/control/map_area/", EV_1911)


def test_a_map_area_file_is_not_read_as_a_control_point_file() -> None:
    report = validate_dataset(with_map_area(base_dataset()))
    assert report.errors == []
    assert report.files_checked == 11


# --- tile sidecar crop and map area (31) -----------------------------------------------------------


def test_a_sidecar_must_carry_crop_and_map_area_when_the_plate_has_a_map_area() -> None:
    ds = with_map_area(base_dataset())
    del ds[TILE_1911]["crop_px"]
    del ds[TILE_1911]["map_area"]
    assert reasons(errors_for(ds), "must carry crop_px and map_area", TILE_1911)


def test_a_sidecar_crop_without_a_map_area_file_is_rejected() -> None:
    ds = with_map_area(base_dataset())
    del ds[MAP_AREA_1911]
    ds[EV_1911]["mapped_area"]["method"] = "neatline"
    assert reasons(errors_for(ds), "crop_px without a map area file", TILE_1911)


def test_a_sidecar_crop_must_be_the_bounding_box_of_the_map_area() -> None:
    ds = with_map_area(base_dataset())
    ds[TILE_1911]["crop_px"]["width"] += 1
    assert reasons(errors_for(ds), "bounding box of the map area", TILE_1911)


def test_a_refined_tile_has_corners_from_the_refined_affine() -> None:
    ds = with_map_area(base_dataset())
    ds[ALIGN_1911] = refined_only_record()
    tile = ds[TILE_1911]
    tile["transform"] = "refined"
    x, y, w, h = (tile["crop_px"][k] for k in ("x", "y", "width", "height"))
    a, b, c, d, e, f = ds[ALIGN_1911]["refined"]["affine"]

    def at(px: float, py: float) -> list[float]:
        return [a * px + b * py + c, d * px + e * py + f]

    tile["corners"] = {"top_left": at(x, y), "top_right": at(x + w, y),
                       "bottom_right": at(x + w, y + h), "bottom_left": at(x, y + h)}
    tile["corners"]["top_left"][0] += 0.0
    assert errors_for(ds) == []
    tile["corners"]["top_left"][0] += 0.5
    assert reasons(errors_for(ds), "not the refined transform applied", TILE_1911)


def test_a_supplied_tile_must_keep_the_shape_of_a_rectangle() -> None:
    ds = with_map_area(base_dataset())
    ds[TILE_1911]["corners"]["bottom_right"][0] += 1.0
    assert reasons(errors_for(ds), "do not form a parallelogram", TILE_1911)


def test_a_sidecar_transform_must_be_the_records_chosen_transform() -> None:
    ds = base_dataset()
    ds[TILE_1911]["transform"] = "refined"
    assert reasons(errors_for(ds), "must be the alignment record's chosen transform", TILE_1911)
