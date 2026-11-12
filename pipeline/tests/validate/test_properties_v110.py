"""Correctness properties P22 and P23, and P19 with the aerial origin exception
(spec 01 design "Correctness properties", tasks 17.3 to 17.5)."""

from __future__ import annotations

from typing import Any

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from tests.validate.builders import (
    AERIAL,
    P1911,
    alignment,
    errors_for,
    evidence,
    feature,
    minimal_dataset,
)
from tests.validate.strategies import building_features, minimal_datasets
from tests.validate.strategies_v110 import (
    ATTRIBUTE_VALUES,
    dataset_with_references,
    feature_datasets_with_reads,
    hull_mutations,
    label_is_honest,
    reference_sets,
    year_label_cases,
)

EV_1911 = f"data/evidence/{P1911}.geojson"
REGISTRY = "data/sources.json"
ALIGN_1911 = f"data/alignment/{P1911}.json"
SETTINGS = settings(max_examples=120, deadline=None)
HULL_SETTINGS = settings(
    max_examples=120,
    deadline=None,
    suppress_health_check=[HealthCheck.filter_too_much, HealthCheck.too_slow],
)


def mentions(errors: list[Any], fid: str, path: str = EV_1911) -> bool:
    return any(e.feature_id == fid and e.path == path for e in errors)


# P22 ----------------------------------------------------------------------------------------


@SETTINGS
@given(case=year_label_cases())
def test_p22_a_years_label_states_the_record_years_and_no_others(case) -> None:
    ds = minimal_dataset()
    source = next(s for s in ds[REGISTRY]["sources"] if s["id"] == P1911)
    source.update(year_from=case["year_from"], year_to=case["year_to"], years_label=case["label"])
    rejected = any(e.path == REGISTRY for e in errors_for(ds))
    assert rejected == (not label_is_honest(case)), case


@SETTINGS
@given(data=feature_datasets_with_reads())
def test_p22_the_generated_reads_are_valid(data) -> None:
    ds, _fid, _names = data
    assert errors_for(ds) == []


@SETTINGS
@given(data=feature_datasets_with_reads())
def test_p22_a_material_without_its_read_is_rejected(data) -> None:
    ds, fid, names = data
    f = ds[EV_1911]["features"][0]
    if "material" not in names:
        f["properties"]["attributes"]["material"] = ATTRIBUTE_VALUES["material"]
    f["properties"]["provenance"]["attribute_reads"] = [
        r for r in f["properties"]["provenance"]["attribute_reads"] if r["attribute"] != "material"
    ]
    if not f["properties"]["provenance"]["attribute_reads"]:
        del f["properties"]["provenance"]["attribute_reads"]
    assert mentions(errors_for(ds), fid)


@SETTINGS
@given(data=feature_datasets_with_reads(), pick=st.integers(0, 3))
def test_p22_removing_an_attribute_that_has_a_read_leaves_an_orphan(data, pick) -> None:
    ds, fid, names = data
    gone = names[pick % len(names)]
    f = ds[EV_1911]["features"][0]
    del f["properties"]["attributes"][gone]
    errors = errors_for(ds)
    assert any(
        e.feature_id == fid and f"read for {gone}, but the feature has no {gone}" in e.reason
        for e in errors
    ), (gone, errors)


@SETTINGS
@given(data=feature_datasets_with_reads(), pick=st.integers(0, 3))
def test_p22_a_second_read_for_one_attribute_is_rejected(data, pick) -> None:
    ds, fid, names = data
    f = ds[EV_1911]["features"][0]
    again = f["properties"]["provenance"]["attribute_reads"][pick % len(names)]
    f["properties"]["provenance"]["attribute_reads"].append(dict(again))
    assert any(
        e.feature_id == fid and "second read for" in e.reason for e in errors_for(ds)
    )


# P23 ----------------------------------------------------------------------------------------


@HULL_SETTINGS
@given(refs=reference_sets(), data=st.data())
def test_p23_the_control_hull_is_exact(refs, data) -> None:
    ds = dataset_with_references(refs)
    assert errors_for(ds) == []  # the record with the computed hull is accepted
    mutation = data.draw(hull_mutations(refs))
    rec = ds[ALIGN_1911]
    rec["control_hull"] = mutation["hull"]
    rec["control_hull_area_m2"] = mutation["area"]
    rejected = any(e.path == ALIGN_1911 for e in errors_for(ds))
    assert rejected == (not mutation["ok"]), mutation["kind"]


@HULL_SETTINGS
@given(refs=reference_sets())
def test_p23_a_new_record_cannot_leave_the_hull_out(refs) -> None:
    ds = dataset_with_references(refs)
    rec = ds[ALIGN_1911]
    del rec["control_hull"]
    del rec["control_hull_area_m2"]
    assert any(e.path == ALIGN_1911 and "control_hull is required" in e.reason
               for e in errors_for(ds))
    rec["schema_version"] = "1.0.0"
    assert errors_for(ds) == []  # only a 1.0.0 record may omit it


# P19, with the aerial origin exception ----------------------------------------------------------


def aerial_dataset(features: list[dict[str, Any]]) -> dict[str, Any]:
    ds = minimal_dataset()
    ds[f"data/alignment/{AERIAL}.json"] = alignment(AERIAL)
    ds[f"data/evidence/{AERIAL}.geojson"] = evidence(AERIAL, features)
    return ds


@SETTINGS
@given(n=st.integers(1, 3), data=st.data())
def test_p19_a_traced_aerial_origin_presence_is_accepted(n, data) -> None:
    features = [data.draw(building_features(AERIAL, i + 1)) for i in range(n)]
    for f in features:
        f["properties"]["observations"] = [
            {"source": AERIAL, "present": True, "visibility": "clear", "method": "origin"}
        ]
    assert errors_for(aerial_dataset(features)) == []


@SETTINGS
@given(
    n=st.integers(1, 3),
    which=st.integers(0, 10),
    breakage=st.sampled_from(["obscured", "match_auto", "not_covered_origin"]),
    data=st.data(),
)
def test_p19_every_other_aerial_origin_observation_is_still_rejected(n, which, breakage, data):
    features = [data.draw(building_features(AERIAL, i + 1)) for i in range(n)]
    target = features[which % n]
    obs = {"source": AERIAL, "present": True, "visibility": "clear", "method": "origin"}
    if breakage == "obscured":
        obs["visibility"] = "obscured"
    elif breakage == "match_auto":
        obs["method"] = "match_auto"
        obs["matched_feature"] = target["id"]
    else:
        obs["visibility"] = "not_covered"
    target["properties"]["observations"] = [obs]
    path = f"data/evidence/{AERIAL}.geojson"
    assert mentions(errors_for(aerial_dataset(features)), target["id"], path)


@SETTINGS
@given(ds=minimal_datasets(), which=st.integers(0, 10), present=st.booleans())
def test_p19_an_origin_observation_on_another_source_is_not_the_exception(
    ds, which, present
) -> None:
    f = ds[EV_1911]["features"][which % len(ds[EV_1911]["features"])]
    f["properties"]["observations"].append(
        {"source": AERIAL, "present": True, "visibility": "clear", "method": "origin"}
    )
    assert mentions(errors_for(ds), f["id"])
    # The same observation set by a named person is fine.
    f["properties"]["observations"][-1].update(
        method="person", confirmed_by="synthetic reviewer", confirmed_at="2026-11-12T10:00:00Z"
    )
    assert errors_for(ds) == []


def test_the_single_feature_helper_still_builds_a_valid_origin_observation() -> None:
    assert feature(AERIAL, 1)["properties"]["observations"][0]["method"] == "origin"
