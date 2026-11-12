"""Correctness properties P13 to P15 and P19 to P21 (spec 01 design "Correctness properties")."""

from __future__ import annotations

import copy
import math
from typing import Any

from hypothesis import example, given, settings
from hypothesis import strategies as st

from tests.validate.builders import (
    AERIAL,
    E0,
    LONG_AGO,
    N0,
    P1911,
    P1935,
    alignment,
    errors_for,
    feature,
    minimal_dataset,
)
from tests.validate.strategies import (
    alignment_variants,
    budgets,
    independent_alignment_error,
    independent_ceil_tenth,
    linked_datasets,
    lonlat_pairs,
    minimal_datasets,
    unregistered_sources,
)

EV_1911 = f"data/evidence/{P1911}.geojson"
SETTINGS = settings(max_examples=120, deadline=None)


def mentions(errors: list[Any], fid: str, path: str = EV_1911) -> bool:
    return any(e.feature_id == fid and e.path == path for e in errors)


def pick(ds: dict[str, Any], index: int) -> dict[str, Any]:
    feats = ds[EV_1911]["features"]
    return feats[index % len(feats)]


# P13 ----------------------------------------------------------------------------------------


@SETTINGS
@given(
    ds=minimal_datasets(),
    which=st.integers(0, 10),
    breakage=st.sampled_from(
        ["no_position_error", "zero", "negative", "no_observations", "unregistered_source"]
    ),
    unknown=unregistered_sources,
    negative=st.floats(-50.0, -0.001),
)
def test_p13_missing_evidence_is_rejected(ds, which, breakage, unknown, negative) -> None:
    assert errors_for(ds) == []  # the generator only makes valid datasets
    f = pick(ds, which)
    props = f["properties"]
    if breakage == "no_position_error":
        del props["position_error_m"]
    elif breakage == "zero":
        props["position_error_m"] = 0
    elif breakage == "negative":
        props["position_error_m"] = negative
    elif breakage == "no_observations":
        props["observations"] = []
    else:
        props["observations"][0]["source"] = unknown
    assert mentions(errors_for(ds), f["id"])


# P14 ----------------------------------------------------------------------------------------


@SETTINGS
@given(ds=minimal_datasets(), which=st.integers(0, 10), pair=lonlat_pairs(), at=st.integers(0, 3))
def test_p14_lon_lat_positions_are_rejected(ds, which, pair, at) -> None:
    f = pick(ds, which)
    ring = f["geometry"]["coordinates"][0]
    ring[at % (len(ring) - 1)] = pair
    if at % (len(ring) - 1) == 0:
        ring[-1] = list(pair)  # keep the ring closed so only the position is wrong
    assert mentions(errors_for(ds), f["id"])


@given(ds=minimal_datasets())
def test_p14_a_third_coordinate_is_rejected(ds) -> None:
    f = pick(ds, 0)
    f["geometry"]["coordinates"][0][1] = [*f["geometry"]["coordinates"][0][1], 75.0]
    assert mentions(errors_for(ds), f["id"])


# P15 ----------------------------------------------------------------------------------------


def budget_dataset(b: dict[str, float]) -> dict[str, Any]:
    ds = minimal_dataset()
    rec = alignment(P1911)
    rec["source_pixel_size_m"] = b["pixel"]
    rec["error_basis_m"] = b["basis"]
    rec["supplied"]["rmse_m"] = b["basis"]
    rec["alignment_error_m"] = b["alignment"]
    ds[f"data/alignment/{P1911}.json"] = rec
    f = feature(P1911, 1)
    f["properties"]["position_error_m"] = b["position"]
    f["properties"]["provenance"]["alignment_error_m"] = b["provenance_alignment"]
    f["properties"]["provenance"]["digitising_error_m"] = b["digitising"]
    ds[EV_1911]["features"] = [f]
    return ds


def budget_ok(b: dict[str, float]) -> bool:
    required = independent_ceil_tenth(math.hypot(b["alignment"], b["digitising"]))
    return (
        b["position"] >= required - 1e-9
        and b["digitising"] >= 2 * b["pixel"] - 1e-9
        and b["provenance_alignment"] == b["alignment"]
    )


@SETTINGS
@given(b=budgets())
@example(b={"basis": 2.14, "alignment": 4.3, "pixel": 0.06, "digitising": 1.0,
            "position": 4.5, "provenance_alignment": 4.3})  # exactly on the floor
@example(b={"basis": 2.14, "alignment": 4.3, "pixel": 0.06, "digitising": 1.0,
            "position": 4.4, "provenance_alignment": 4.3})  # a tenth under
@example(b={"basis": 2.14, "alignment": 4.3, "pixel": 0.5, "digitising": 1.0,
            "position": 4.5, "provenance_alignment": 4.3})  # digitising exactly 2 pixels
def test_p15_position_error_floor(b) -> None:
    ds = budget_dataset(b)
    fid = ds[EV_1911]["features"][0]["id"]
    rejected = mentions(errors_for(ds), fid)
    assert rejected == (not budget_ok(b)), b
    if not rejected:
        # Accepted features are never below the alignment error itself.
        assert ds[EV_1911]["features"][0]["properties"]["position_error_m"] >= b["alignment"]


# P19 ----------------------------------------------------------------------------------------


@SETTINGS
@given(
    ds=minimal_datasets(),
    which=st.integers(0, 10),
    visibility=st.sampled_from(["clear", "obscured"]),
    method=st.sampled_from(["origin", "match_auto"]),
    present=st.booleans(),
)
def test_p19_code_never_reads_a_photograph(ds, which, visibility, method, present) -> None:
    f = pick(ds, which)
    obs: dict[str, Any] = {"source": AERIAL, "present": present, "visibility": visibility,
                           "method": method}
    if method == "match_auto" and present:
        obs["matched_feature"] = f["id"]
    f["properties"]["observations"].append(obs)
    assert mentions(errors_for(ds), f["id"])


@SETTINGS
@given(ds=minimal_datasets(), which=st.integers(0, 10), visibility=st.sampled_from(["clear", "obscured"]),
       present=st.booleans())
def test_p19_a_named_person_may_set_aerial_observations(ds, which, visibility, present) -> None:
    f = pick(ds, which)
    f["properties"]["observations"].append({
        "source": AERIAL, "present": present, "visibility": visibility, "method": "person",
        "confirmed_by": "synthetic reviewer", "confirmed_at": LONG_AGO,
    })
    assert errors_for(ds) == []


@given(ds=minimal_datasets(), which=st.integers(0, 10), present=st.booleans())
def test_p19_pipeline_may_write_not_covered_for_aerials(ds, which, present) -> None:
    f = pick(ds, which)
    f["properties"]["observations"].append(
        {"source": AERIAL, "present": False, "visibility": "not_covered", "method": "match_auto"}
    )
    assert errors_for(ds) == []


# P20 ----------------------------------------------------------------------------------------

EV_1935 = f"data/evidence/{P1935}.geojson"


def by_id(ds: dict[str, Any], fid: str) -> dict[str, Any]:
    for path in (EV_1911, EV_1935):
        for f in ds[path]["features"]:
            if f["id"] == fid:
                return f
    raise KeyError(fid)


@SETTINGS
@given(
    data=linked_datasets(),
    k=st.integers(0, 5),
    mutation=st.sampled_from(["drop_back_link", "unpublish_target", "missing_target", "same_origin"]),
    flip=st.booleans(),
)
def test_p20_links_are_symmetric_published_and_one_per_origin(data, k, mutation, flip) -> None:
    ds, n = data
    assert errors_for(ds) == []  # the generated links are good
    i = k % n
    a = f"bld_{P1911}_{i + 1:04d}"
    b = f"bld_{P1935}_{i + 1:04d}"
    first, second = (b, a) if flip else (a, b)

    if mutation == "drop_back_link":
        del by_id(ds, second)["properties"]["same_as"]
        errors = errors_for(ds)
        assert any("not mirrored" in e.reason and e.feature_id == first for e in errors)
    elif mutation == "unpublish_target":
        by_id(ds, second)["properties"].update(status="rejected", status_reason="synthetic")
        errors = errors_for(ds)
        assert any("is not published" in e.reason and e.feature_id == first for e in errors)
    elif mutation == "missing_target":
        missing = f"bld_{P1935 if not flip else P1911}_0099"
        by_id(ds, first)["properties"]["same_as"][0]["feature"] = missing
        errors = errors_for(ds)
        assert any("does not exist" in e.reason and e.feature_id == first for e in errors)
    else:
        # Link two features of one origin into the same set through the other plate's feature.
        other = f"bld_{P1911}_{(i + 1) % n + 1:04d}" if n > 1 else None
        if other is None:
            extra = feature(P1911, 9)
            ds[EV_1911]["features"].append(extra)
            other = extra["id"]
        for x, y in ((a, other), (other, a)):
            by_id(ds, x)["properties"].setdefault("same_as", []).append(
                {"feature": y, "method": "match_auto"}
            )
        errors = errors_for(ds)
        flagged = {e.feature_id for e in errors if "two features from" in e.reason}
        assert {a, other} <= flagged


# P21 ----------------------------------------------------------------------------------------


@SETTINGS
@given(v=alignment_variants())
@example(v={"chosen": "supplied", "supplied_rmse": 2.14, "loo": 2.5, "in_sample": 0.9,
            "reported_basis": 2.14, "reported_error": 4.3, "basis_ok": True, "error_ok": True})
@example(v={"chosen": "refined", "supplied_rmse": 2.14, "loo": 0.5, "in_sample": 0.2,
            "reported_basis": 0.5, "reported_error": 2.0, "basis_ok": True, "error_ok": True})
def test_p21_the_alignment_error_rule(v) -> None:
    ds = minimal_dataset()
    ds[EV_1911]["features"] = []
    rec = alignment(P1911)
    rec["supplied"]["rmse_m"] = v["supplied_rmse"]
    if v["chosen"] == "refined":
        residuals = [{"id": f"cp_{i}", "dx_m": 0.1, "dy_m": 0.1, "r_m": 0.15} for i in range(4)]
        rec["supplied"]["residuals"] = residuals
        rec["refined"] = {
            "affine": [0.05, 0.0, E0, 0.0, -0.05, N0], "residuals": residuals,
            "rmse_in_sample_m": v["in_sample"], "rmse_loo_m": v["loo"], "max_residual_m": 0.15,
        }
        rec["chosen"] = "refined"
        rec["error_basis"] = "refined_loo_rmse"
    rec["error_basis_m"] = v["reported_basis"]
    rec["alignment_error_m"] = v["reported_error"]
    ds[f"data/alignment/{P1911}.json"] = copy.deepcopy(rec)

    path = f"data/alignment/{P1911}.json"
    errors = [e for e in errors_for(ds) if e.path == path]
    accepted = errors == []
    assert accepted == (v["basis_ok"] and v["error_ok"]), (v, errors)
    if accepted:
        assert rec["alignment_error_m"] >= 2.0
        assert rec["alignment_error_m"] >= rec["error_basis_m"]
        assert rec["alignment_error_m"] == independent_alignment_error(rec["error_basis_m"])
