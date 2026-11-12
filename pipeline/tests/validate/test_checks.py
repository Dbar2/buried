"""Example tests for every cross-file check (spec 01 tasks 4.4 and 12.2).

Each test starts from the valid in-memory tree in `builders.py`, breaks one thing, and expects an
error that names the file and (for features) the feature id.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest

from tests.validate.builders import (
    AERIAL,
    E0,
    FUTURE,
    INTERSECTIONS,
    N0,
    NOW,
    OUTLINES,
    P1911,
    P1935,
    base_dataset,
    errors_for,
    feature,
    feature_of,
    link_features,
    polygon,
    validate_dataset,
)

EV_1911 = f"data/evidence/{P1911}.geojson"
EV_1935 = f"data/evidence/{P1935}.geojson"
F1911 = f"bld_{P1911}_0001"
F1911_2 = f"bld_{P1911}_0002"
F1935 = f"bld_{P1935}_0001"


def reasons(errors: list[Any], contains: str, path: str | None = None) -> list[Any]:
    return [e for e in errors if contains in e.reason and (path is None or e.path == path)]


def test_the_base_tree_is_valid() -> None:
    report = validate_dataset(base_dataset())
    assert report.errors == []
    assert report.features_checked == 3
    assert report.files_checked == 10


# --- registry ---------------------------------------------------------------------------------


def test_duplicate_source_id() -> None:
    ds = base_dataset()
    ds["data/sources.json"]["sources"].append(copy.deepcopy(ds["data/sources.json"]["sources"][0]))
    assert reasons(errors_for(ds), "duplicate source id", "data/sources.json")


def test_source_id_form_follows_structure_md() -> None:
    ds = base_dataset()
    ds["data/sources.json"]["sources"][0]["id"] = "plate_one"
    assert reasons(errors_for(ds), "does not follow structure.md", "data/sources.json")


def test_registry_year_order() -> None:
    ds = base_dataset()
    ds["data/sources.json"]["sources"][0]["year_from"] = 1920
    assert reasons(errors_for(ds), "year_from is greater than year_to", "data/sources.json")


def test_only_plate_232_1935_is_held_out() -> None:
    ds = base_dataset()
    ds["data/sources.json"]["sources"][0]["held_out"] = True
    assert reasons(errors_for(ds), "may be held out", "data/sources.json")


def test_plate_232_1935_must_be_held_out_when_registered() -> None:
    ds = base_dataset()
    ds["data/sources.json"]["sources"].append(
        {**ds["data/sources.json"]["sources"][0], "id": "fip_v3_1935_232", "year_from": 1935,
         "year_to": 1935, "held_out": False}
    )
    assert reasons(errors_for(ds), "must be held out", "data/sources.json")


# --- project ----------------------------------------------------------------------------------


def test_origin_must_lie_inside_the_bounds() -> None:
    ds = base_dataset()
    ds["data/project.json"]["origin"]["easting"] = E0 + 5000
    assert reasons(errors_for(ds), "origin lies outside", "data/project.json")


def test_duplicate_era_ids() -> None:
    ds = base_dataset()
    ds["data/project.json"]["eras"].append(copy.deepcopy(ds["data/project.json"]["eras"][0]))
    assert reasons(errors_for(ds), "duplicate era id", "data/project.json")


# --- evidence: identity and geometry ----------------------------------------------------------


def test_origin_source_must_match_file_name() -> None:
    ds = base_dataset()
    ds[EV_1911]["origin_source"] = P1935
    assert reasons(errors_for(ds), "does not match the file name", EV_1911)


def test_provenance_origin_must_match_file() -> None:
    ds = base_dataset()
    feature_of(ds, P1911)["properties"]["provenance"]["origin_source"] = P1935
    es = reasons(errors_for(ds), "differs from the file's origin_source", EV_1911)
    assert es and es[0].feature_id == F1911


def test_id_must_contain_the_origin_source() -> None:
    ds = base_dataset()
    feature_of(ds, P1911)["id"] = f"bld_{P1935}_0009"
    assert reasons(errors_for(ds), "id does not contain the file's origin source", EV_1911)


def test_duplicate_feature_id_across_files() -> None:
    ds = base_dataset()
    ds[EV_1935]["features"].append(copy.deepcopy(feature_of(ds, P1911)))
    assert reasons(errors_for(ds), "duplicate feature id")


def test_invalid_polygon_zero_area_and_unclosed_ring() -> None:
    ds = base_dataset()
    feature_of(ds, P1911)["geometry"] = {
        "type": "Polygon",
        "coordinates": [[[E0, N0], [E0 + 5, N0 + 5], [E0 + 5, N0], [E0, N0 + 5], [E0, N0]]],
    }  # bow tie
    assert reasons(errors_for(ds), "polygon is invalid", EV_1911)

    ds = base_dataset()
    feature_of(ds, P1911)["geometry"] = {
        "type": "Polygon",
        "coordinates": [[[E0, N0], [E0 + 5, N0], [E0 + 9, N0], [E0 + 3, N0], [E0, N0]]],
    }  # collinear
    assert reasons(errors_for(ds), "", EV_1911)

    ds = base_dataset()
    feature_of(ds, P1911)["geometry"] = {
        "type": "Polygon",
        "coordinates": [[[E0, N0], [E0 + 5, N0], [E0 + 5, N0 + 5], [E0, N0 + 5]]],
    }  # not closed (four positions, first differs from last)
    assert reasons(errors_for(ds), "not closed", EV_1911)


def test_zero_length_line() -> None:
    ds = base_dataset()
    f = feature_of(ds, P1911, 2)
    f["id"] = f"wtr_{P1911}_0002"
    f["properties"]["kind"] = "water"
    f["properties"]["attributes"] = {}
    f["properties"]["confidence"] = "estimated"
    f["geometry"] = {"type": "LineString", "coordinates": [[E0, N0], [E0, N0]]}
    assert reasons(errors_for(ds), "zero length", EV_1911)


def test_coordinate_outside_project_bounds() -> None:
    ds = base_dataset()
    feature_of(ds, P1911)["geometry"] = polygon(E0 + 5000, N0)
    assert reasons(errors_for(ds), "outside the project bounds", EV_1911)


def test_evidence_needs_a_project_file() -> None:
    ds = base_dataset()
    del ds["data/project.json"]
    assert reasons(errors_for(ds), "data/project.json is missing")


# --- evidence: observations -------------------------------------------------------------------


def test_observation_cites_unregistered_source() -> None:
    ds = base_dataset()
    feature_of(ds, P1911, 2)["properties"]["observations"].append(
        {"source": "fip_v3_1999_001", "present": False, "visibility": "not_covered",
         "method": "match_auto"}
    )
    es = reasons(errors_for(ds), "is not in data/sources.json", EV_1911)
    assert es and es[0].feature_id == F1911_2


def test_cited_source_must_have_confirmed_attribution() -> None:
    ds = base_dataset()
    ds["data/sources.json"]["sources"][1]["attribution_status"] = "to_be_confirmed"
    assert reasons(errors_for(ds), "attribution_status to_be_confirmed", EV_1935)


def test_cited_source_must_have_a_year() -> None:
    ds = base_dataset()
    ds["data/sources.json"]["sources"][3]["year_from"] = None  # present layer, legal in registry
    f = feature_of(ds, P1911, 2)
    f["properties"]["observations"].append(
        {"source": INTERSECTIONS, "present": False, "visibility": "not_covered",
         "method": "match_auto"}
    )
    assert reasons(errors_for(ds), "has no year_from yet", EV_1911)


def test_two_observations_from_one_source() -> None:
    ds = base_dataset()
    f = feature_of(ds, P1911, 2)
    f["properties"]["observations"].append(copy.deepcopy(f["properties"]["observations"][0]))
    assert reasons(errors_for(ds), "second observation from", EV_1911)


def test_origin_source_needs_a_clear_presence() -> None:
    ds = base_dataset()
    f = feature_of(ds, P1911, 2)
    f["properties"]["observations"][0]["visibility"] = "obscured"
    assert reasons(errors_for(ds), "no clear presence from the origin source", EV_1911)
    f["properties"]["observations"][0].update(visibility="clear", present=False)
    # Since schema 1.1.0 an origin observation cannot be an absence at all (requirement 27.2),
    # so the Schema rejects this before the cross-file check can.
    assert [e for e in errors_for(ds) if e.path == EV_1911 and e.feature_id == f["id"]]


def test_origin_source_observation_missing() -> None:
    ds = base_dataset()
    f = feature_of(ds, P1911, 2)
    f["properties"]["observations"] = [
        {"source": P1935, "present": False, "visibility": "not_covered", "method": "match_auto"}
    ]
    assert reasons(errors_for(ds), "no observation from the origin source", EV_1911)


def test_method_origin_only_for_the_origin_source() -> None:
    ds = base_dataset()
    f = feature_of(ds, P1911, 2)
    f["properties"]["observations"].append(
        {"source": P1935, "present": True, "visibility": "clear", "method": "origin"}
    )
    assert reasons(errors_for(ds), "method origin is only for the origin source", EV_1911)


def test_origin_observation_must_have_method_origin() -> None:
    ds = base_dataset()
    f = feature_of(ds, P1911, 2)
    f["properties"]["observations"][0].update(
        method="person", confirmed_by="synthetic reviewer", confirmed_at="2026-11-12T10:00:00Z"
    )
    assert reasons(errors_for(ds), "must have method origin", EV_1911)


@pytest.mark.parametrize("visibility", ["clear", "obscured"])
def test_aerial_clear_or_obscured_only_by_a_person(visibility: str) -> None:
    ds = base_dataset()
    f = feature_of(ds, P1911, 2)
    f["properties"]["observations"].append(
        {"source": AERIAL, "present": False, "visibility": visibility, "method": "match_auto"}
    )
    assert reasons(errors_for(ds), "must be set by a person", EV_1911)
    f["properties"]["observations"][-1].update(
        method="person", confirmed_by="synthetic reviewer", confirmed_at="2026-11-12T10:00:00Z"
    )
    assert errors_for(ds) == []


def test_aerial_not_covered_may_be_automatic() -> None:
    ds = base_dataset()
    f = feature_of(ds, P1911, 2)
    f["properties"]["observations"].append(
        {"source": AERIAL, "present": False, "visibility": "not_covered", "method": "match_auto"}
    )
    assert errors_for(ds) == []


def test_match_auto_presence_must_match_a_linked_published_feature() -> None:
    # Missing target.
    ds = base_dataset()
    feature_of(ds, P1911)["properties"]["observations"][1]["matched_feature"] = (
        f"bld_{P1935}_0099"
    )
    assert reasons(errors_for(ds), "does not exist", EV_1911)

    # Target not in same_as.
    ds = base_dataset()
    extra = feature(P1935, 2)
    ds[EV_1935]["features"].append(extra)
    feature_of(ds, P1911)["properties"]["observations"][1]["matched_feature"] = extra["id"]
    assert reasons(errors_for(ds), "not in this feature's same_as", EV_1911)

    # Target comes from another source than the observation's.
    ds = base_dataset()
    feature_of(ds, P1911)["properties"]["observations"][1]["matched_feature"] = F1911_2
    assert reasons(errors_for(ds), "comes from", EV_1911)

    # Target not published.
    ds = base_dataset()
    feature_of(ds, P1935)["properties"].update(status="rejected", status_reason="synthetic")
    assert reasons(errors_for(ds), "is not published", EV_1911)


# --- evidence: alignment and position error ---------------------------------------------------


def test_origin_needs_a_measured_alignment_record() -> None:
    ds = base_dataset()
    del ds[f"data/alignment/{P1935}.json"]
    es = reasons(errors_for(ds), "no measured alignment record", EV_1935)
    assert es and es[0].feature_id == F1935


def test_position_error_must_cover_the_error_budget() -> None:
    ds = base_dataset()
    feature_of(ds, P1911)["properties"]["position_error_m"] = 4.4  # needs 4.5
    es = reasons(errors_for(ds), "less than the root-sum-square", EV_1911)
    assert es and es[0].feature_id == F1911
    feature_of(ds, P1911)["properties"]["position_error_m"] = 4.5
    assert errors_for(ds) == []


def test_position_error_above_the_floor_is_accepted() -> None:
    ds = base_dataset()
    feature_of(ds, P1911)["properties"]["position_error_m"] = 9.0
    assert errors_for(ds) == []


def test_provenance_alignment_error_must_equal_the_record() -> None:
    ds = base_dataset()
    feature_of(ds, P1911)["properties"]["provenance"]["alignment_error_m"] = 3.0
    assert reasons(errors_for(ds), "differs from the alignment record", EV_1911)


def test_digitising_error_at_least_two_pixels() -> None:
    ds = base_dataset()
    feature_of(ds, P1911)["properties"]["provenance"]["digitising_error_m"] = 0.1  # < 0.12
    assert reasons(errors_for(ds), "less than 2 source pixels", EV_1911)


def test_confirmed_at_in_the_future() -> None:
    ds = base_dataset()
    feature_of(ds, P1911)["properties"]["provenance"]["confirmed_at"] = FUTURE
    assert reasons(errors_for(ds), "is in the future", EV_1911)
    assert FUTURE > NOW.isoformat()


def test_person_observation_in_the_future() -> None:
    ds = base_dataset()
    feature_of(ds, P1911, 2)["properties"]["observations"].append(
        {"source": AERIAL, "present": False, "visibility": "clear", "method": "person",
         "confirmed_by": "synthetic reviewer", "confirmed_at": FUTURE}
    )
    assert reasons(errors_for(ds), "is in the future", EV_1911)


# --- evidence: status and links ---------------------------------------------------------------


def test_merged_into_must_exist_and_not_be_self() -> None:
    ds = base_dataset()
    feature_of(ds, P1911, 2)["properties"].update(status="merged", merged_into=f"bld_{P1911}_0077")
    assert reasons(errors_for(ds), "does not exist", EV_1911)
    feature_of(ds, P1911, 2)["properties"]["merged_into"] = F1911_2
    assert reasons(errors_for(ds), "merged into itself", EV_1911)
    feature_of(ds, P1911, 2)["properties"]["merged_into"] = F1911
    assert errors_for(ds) == []


def test_link_to_missing_feature() -> None:
    ds = base_dataset()
    feature_of(ds, P1911)["properties"]["same_as"][0]["feature"] = f"bld_{P1935}_0099"
    assert reasons(errors_for(ds), "does not exist", EV_1911)


def test_link_to_itself() -> None:
    ds = base_dataset()
    feature_of(ds, P1911)["properties"]["same_as"][0]["feature"] = F1911
    assert reasons(errors_for(ds), "cannot link to itself", EV_1911)


def test_link_to_a_different_kind() -> None:
    ds = base_dataset()
    f = feature_of(ds, P1935)
    f["id"] = f"use_{P1935}_0001"
    f["properties"]["kind"] = "land_use"
    f["properties"]["attributes"] = {}
    f["properties"]["confidence"] = "estimated"
    feature_of(ds, P1911)["properties"]["same_as"][0]["feature"] = f["id"]
    feature_of(ds, P1911)["properties"]["observations"][1]["matched_feature"] = f["id"]
    f["properties"]["same_as"][0]["feature"] = F1911
    assert reasons(errors_for(ds), "not a building", EV_1911)


def test_link_to_an_unpublished_feature() -> None:
    ds = base_dataset()
    feature_of(ds, P1935)["properties"].update(status="rejected", status_reason="synthetic")
    assert reasons(errors_for(ds), "is not published", EV_1911)


def test_link_must_be_mirrored() -> None:
    ds = base_dataset()
    del feature_of(ds, P1935)["properties"]["same_as"]
    es = reasons(errors_for(ds), "not mirrored", EV_1911)
    assert es and es[0].feature_id == F1911


def test_mirrored_link_must_have_the_same_method() -> None:
    ds = base_dataset()
    link = feature_of(ds, P1935)["properties"]["same_as"][0]
    link.update(method="person", confirmed_by="synthetic reviewer",
                confirmed_at="2026-11-12T10:00:00Z")
    assert reasons(errors_for(ds), "links back with method", EV_1911)


def test_person_link_in_the_future() -> None:
    ds = base_dataset()
    for origin in (P1911, P1935):
        feature_of(ds, origin)["properties"]["same_as"][0].update(
            method="person", confirmed_by="synthetic reviewer", confirmed_at=FUTURE
        )
    assert reasons(errors_for(ds), "is in the future")


def test_linked_set_cannot_hold_two_features_from_one_origin() -> None:
    ds = base_dataset()
    other = feature_of(ds, P1911, 2)
    a = feature_of(ds, P1935)
    # Link the 1935 feature to a second 1911 feature as well: the set now has two 1911 members.
    a["properties"]["same_as"].append({"feature": other["id"], "method": "match_auto"})
    other["properties"].setdefault("same_as", []).append(
        {"feature": a["id"], "method": "match_auto"}
    )
    es = reasons(errors_for(ds), "two features from")
    assert {e.feature_id for e in es} == {F1911, F1911_2}


def test_link_between_two_valid_origins_is_fine() -> None:
    ds = base_dataset()
    link_features(feature_of(ds, P1911, 2), feature(P1935, 2))
    # Not added to the tree, so the second feature does not exist.
    assert reasons(errors_for(ds), "does not exist", EV_1911)


# --- evidence: coverage -----------------------------------------------------------------------


def test_reviewed_area_must_be_inside_the_mapped_area() -> None:
    ds = base_dataset()
    ds[EV_1911]["reviewed_areas"][0]["geometry"] = polygon(E0 + 300, N0, 200, 100)
    assert reasons(errors_for(ds), "not inside the mapped_area", EV_1911)


def test_reviewed_area_with_a_hair_of_overhang_is_allowed() -> None:
    ds = base_dataset()
    # Mapped area spans E0-50 .. E0+350; overhang of 0.005 m is inside the 0.01 m slack.
    ds[EV_1911]["reviewed_areas"][0]["geometry"] = polygon(E0 + 100, N0, 250.005, 100)
    assert errors_for(ds) == []


def test_reviewed_areas_need_a_mapped_area() -> None:
    ds = base_dataset()
    del ds[EV_1911]["mapped_area"]
    assert reasons(errors_for(ds), "reviewed areas need a mapped_area", EV_1911)


# --- alignment records ------------------------------------------------------------------------


def test_alignment_error_must_follow_the_rule() -> None:
    ds = base_dataset()
    ds[f"data/alignment/{P1911}.json"]["alignment_error_m"] = 4.2
    assert reasons(errors_for(ds), "alignment_error_m must be ceil_0.1", f"data/alignment/{P1911}.json")


def test_error_basis_must_be_the_chosen_transforms_out_of_sample_rmse() -> None:
    ds = base_dataset()
    ds[f"data/alignment/{P1911}.json"]["error_basis_m"] = 2.0
    assert reasons(errors_for(ds), "error_basis_m must be", f"data/alignment/{P1911}.json")


def test_refined_basis_is_the_leave_one_out_rmse() -> None:
    ds = base_dataset()
    rec = ds[f"data/alignment/{P1911}.json"]
    residuals = [{"id": f"cp_{i}", "dx_m": 0.1, "dy_m": 0.1, "r_m": 0.15} for i in range(4)]
    rec["supplied"]["residuals"] = residuals
    rec["refined"] = {"affine": [0.05, 0, E0, 0, -0.05, N0], "residuals": residuals,
                      "rmse_in_sample_m": 0.1, "rmse_loo_m": 0.9, "max_residual_m": 0.15}
    rec.update(chosen="refined", error_basis="refined_loo_rmse", error_basis_m=0.9,
               alignment_error_m=2.0)
    path = f"data/alignment/{P1911}.json"
    assert [e for e in errors_for(ds) if e.path == path] == []
    rec["error_basis_m"] = 0.1  # the in-sample figure
    assert reasons(errors_for(ds), "error_basis_m must be the refined leave-one-out RMSE")


def test_alignment_record_names_its_source() -> None:
    ds = base_dataset()
    ds[f"data/alignment/{P1911}.json"]["source"] = P1935
    assert reasons(errors_for(ds), "record is for", f"data/alignment/{P1911}.json")


# --- present layers ---------------------------------------------------------------------------


def test_present_layer_source_must_be_a_confirmed_present_day_source() -> None:
    ds = base_dataset()
    ds["data/sources.json"]["sources"][3]["attribution_status"] = "to_be_confirmed"
    assert reasons(errors_for(ds), "attribution_status", f"data/present/{INTERSECTIONS}.geojson")

    ds = base_dataset()
    layer = ds[f"data/present/{INTERSECTIONS}.geojson"]
    layer["source"] = P1911
    layer["ckan_package_id"] = "x"
    assert reasons(errors_for(ds), "is not a present_day_reference", f"data/present/{INTERSECTIONS}.geojson")


def test_present_layer_duplicate_feature_ids() -> None:
    ds = base_dataset()
    layer = ds[f"data/present/{INTERSECTIONS}.geojson"]
    layer["features"].append(copy.deepcopy(layer["features"][0]))
    assert reasons(errors_for(ds), "duplicate feature id", f"data/present/{INTERSECTIONS}.geojson")


def test_present_feature_must_intersect_the_bounds() -> None:
    ds = base_dataset()
    layer = ds[f"data/present/{INTERSECTIONS}.geojson"]
    layer["features"].append(
        {"type": "Feature", "id": "far", "geometry": {"type": "Point",
                                                      "coordinates": [E0 + 9000, N0]},
         "properties": {}}
    )
    assert reasons(errors_for(ds), "does not intersect the project bounds")


def test_present_feature_crossing_the_bounds_is_allowed() -> None:
    ds = base_dataset()
    layer = ds[f"data/present/{OUTLINES}.geojson"]
    layer["features"].append(
        {"type": "Feature", "id": "wide", "geometry": polygon(E0 + 900, N0, 400, 20),
         "properties": {}}
    )
    assert errors_for(ds) == []


# --- control points ---------------------------------------------------------------------------


def control(ds: dict[str, Any]) -> dict[str, Any]:
    return ds[f"data/control/{P1911}.json"]


def test_control_reference_layer_must_exist() -> None:
    ds = base_dataset()
    del ds[f"data/present/{OUTLINES}.geojson"]
    assert reasons(errors_for(ds), "has no present layer", f"data/control/{P1911}.json")


def test_control_reference_feature_must_exist() -> None:
    ds = base_dataset()
    control(ds)["points"][0]["reference_feature_id"] = "nope"
    assert reasons(errors_for(ds), "is not in", f"data/control/{P1911}.json")


def test_control_reference_coordinate_within_a_millimetre() -> None:
    ds = base_dataset()
    p = control(ds)["points"][0]
    p["reference"] = [p["reference"][0] + 0.0009, p["reference"][1]]
    assert errors_for(ds) == []
    p["reference"] = [p["reference"][0] + 0.01, p["reference"][1]]
    assert reasons(errors_for(ds), "m from the cited", f"data/control/{P1911}.json")


def test_control_building_corner_vertex_must_match() -> None:
    ds = base_dataset()
    control(ds)["points"][3]["reference_vertex"]["vertex"] = 2
    assert reasons(errors_for(ds), "m from the cited", f"data/control/{P1911}.json")


def test_control_reference_source_must_suit_the_kind() -> None:
    ds = base_dataset()
    p = control(ds)["points"][0]
    p["reference_source"] = OUTLINES
    assert reasons(errors_for(ds), "may cite", f"data/control/{P1911}.json")


def test_control_file_names_its_source() -> None:
    ds = base_dataset()
    control(ds)["source"] = P1935
    assert reasons(errors_for(ds), "control file is for", f"data/control/{P1911}.json")


# --- tile sidecars ----------------------------------------------------------------------------


def test_tile_needs_an_alignment_record_and_matching_error() -> None:
    ds = base_dataset()
    ds[f"data/tiles/{P1911}.json"]["alignment_error_m"] = 3.0
    assert reasons(errors_for(ds), "must equal the alignment record", f"data/tiles/{P1911}.json")

    ds = base_dataset()
    del ds[f"data/alignment/{P1911}.json"]
    assert reasons(errors_for(ds), "no alignment record", f"data/tiles/{P1911}.json")


def test_tile_corner_outside_bounds() -> None:
    ds = base_dataset()
    ds[f"data/tiles/{P1911}.json"]["corners"]["top_left"] = [E0 + 9000, N0]
    assert reasons(errors_for(ds), "outside the project bounds", f"data/tiles/{P1911}.json")


# --- schema first -----------------------------------------------------------------------------


def test_schema_errors_are_reported_and_cross_file_checks_skip_that_file() -> None:
    ds = base_dataset()
    del feature_of(ds, P1911, 2)["properties"]["position_error_m"]
    es = errors_for(ds)
    assert any("position_error_m" in e.reason and e.path == EV_1911 for e in es)
    # The broken file is left out of the cross-file stage, so nothing else is said about it.
    assert not any(e.path == EV_1911 and "link" in e.reason for e in es)


def test_failed_registry_skips_every_cross_file_check_with_one_note() -> None:
    ds = base_dataset()
    del ds["data/sources.json"]["sources"][0]["title"]
    es = errors_for(ds)
    assert reasons(es, "cross-file checks were skipped", "data/sources.json")
    assert {e.path for e in es} == {"data/sources.json"}
