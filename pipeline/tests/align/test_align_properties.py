"""Correctness properties A1 to A9 (spec 02 design "Correctness properties")."""

from __future__ import annotations

import json
import math
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import pytest
from hypothesis import assume, example, given, settings
from hypothesis import strategies as st

from buried_pipeline.align.affine import (
    UnstableFit,
    apply_affine,
    fit_affine,
    fit_local_affine,
    invert_affine,
)
from buried_pipeline.align.compute import ControlPoint, build_record, compute_alignment
from buried_pipeline.align.control import parse_control_file
from buried_pipeline.align.references import check_references
from buried_pipeline.align.residuals import (
    leave_one_out,
    local_residuals_for,
    published_error,
    residuals_for,
    rmse,
)
from buried_pipeline.align.run import run_align_check
from buried_pipeline.errors import PipelineError
from buried_pipeline.io.registry import load_registry
from tests.align.strategies import (
    RUN_HEIGHT,
    RUN_TRANSFORM,
    RUN_WIDTH,
    affines,
    control_scenarios,
    coordinate_tolerance,
    noise_vectors,
    pixels,
    reference_scenarios,
    stable_pixel_sets,
    unit_vectors,
)
from tests.conftest import make_root
from tests.helpers.rasters import write_geotiff

NOW = datetime(2026, 11, 13, 12, 0, 0, tzinfo=UTC)


def record_for(supplied, points):
    result = compute_alignment(points, lambda x, y: apply_affine(supplied, x, y))
    record = build_record(
        source_id="fip_v3_1911_229",
        reference_sources=["present_toronto_intersections_2026"],
        control_file="data/control/fip_v3_1911_229.json",
        control_sha256="0" * 64,
        measured_at="2026-11-13T12:00:00Z",
        tool_version="test",
        source_pixel_size_m=0.1,
        supplied_crs="EPSG:26917",
        supplied_operation="noop",
        result=result,
    )
    return result, json.loads(json.dumps(record))  # the record survives being written as JSON


# A1 -------------------------------------------------------------------------------------------


@given(t=affines(), p=pixels, q=st.tuples(st.floats(600_000, 660_000), st.floats(4.8e6, 4.85e6)))
def test_a1_inverse_round_trip(t, p, q) -> None:
    inv = invert_affine(t)
    back_p = apply_affine(inv, *apply_affine(t, *p))
    assert math.dist(back_p, p) < 1e-6  # pixels
    back_q = apply_affine(t, *apply_affine(inv, *q))
    assert math.dist(back_q, q) < 1e-6  # metres


# A2 -------------------------------------------------------------------------------------------


@settings(max_examples=150)
@given(t=affines(), pts=stable_pixel_sets())
def test_a2_exact_recovery_from_noise_free_points(t, pts) -> None:
    targets = [apply_affine(t, x, y) for x, y in pts]
    fitted = fit_affine(pts, targets)
    ids = [f"p{i}" for i in range(len(pts))]
    in_sample = residuals_for(ids, pts, targets, lambda x, y: apply_affine(fitted, x, y))
    assert all(r.r_m < 1e-6 for r in in_sample)
    assert rmse(in_sample) < 1e-6


# A3 -------------------------------------------------------------------------------------------


@settings(max_examples=150)
@given(
    t=affines(), pts=stable_pixel_sets(), delta=st.floats(0.001, 5.0), data=st.data()
)
def test_a3_in_sample_rmse_never_exceeds_the_noise_bound(t, pts, delta, data) -> None:
    noise = data.draw(noise_vectors(len(pts), delta))
    targets = [
        (apply_affine(t, x, y)[0] + nx, apply_affine(t, x, y)[1] + ny)
        for (x, y), (nx, ny) in zip(pts, noise, strict=True)
    ]
    fitted = fit_affine(pts, targets)
    ids = [f"p{i}" for i in range(len(pts))]
    in_sample = residuals_for(ids, pts, targets, lambda x, y: apply_affine(fitted, x, y))
    assert rmse(in_sample) <= delta + 1e-9


# A4 -------------------------------------------------------------------------------------------


@settings(max_examples=150)
@given(
    t=affines(),
    pts=stable_pixel_sets(),
    delta=st.floats(0.001, 5.0),
    unit=st.lists(unit_vectors, min_size=10, max_size=10),
)
# Regression: the counterexample Hypothesis found when the check used a fixed 1e-9 tolerance and
# evaluated the fit at absolute northings near 4.8e6 m (residuals there resolve to about 2e-9 m).
@example(
    t=(
        0.18726617664095008,
        -0.006240693917274389,
        600000.0,
        0.009361040875911584,
        -0.12484411776063338,
        4800000.297975873,
    ),
    pts=[
        (0.0, 0.0),
        (29.0, 15325.5546875),
        (2.29296875, 3741.25),
        (6014.8125, 1.0),
        (9853.125, 87.0),
    ],
    delta=1.0,
    unit=[(0.0, 0.0)] * 10,
)
def test_a4_leave_one_out_is_never_optimistic(t, pts, delta, unit) -> None:
    targets = [
        (apply_affine(t, x, y)[0] + delta * nx, apply_affine(t, x, y)[1] + delta * ny)
        for (x, y), (nx, ny) in zip(pts, unit, strict=False)
    ]
    ids = [f"p{i}" for i in range(len(pts))]
    local = fit_local_affine(pts, targets)
    in_sample = rmse(local_residuals_for(ids, pts, targets, local))
    try:
        loo = rmse(leave_one_out(ids, pts, targets))
    except UnstableFit:
        assume(False)
    # The tolerance is the resolution of the coordinates involved, not a fixed number of metres.
    assert loo >= in_sample - coordinate_tolerance([e for e, _n in targets] + [n for _e, n in targets])


# A5 -------------------------------------------------------------------------------------------


@settings(max_examples=150)
@given(scenario=control_scenarios())
def test_a5_transform_reproduces_the_stored_residuals(scenario) -> None:
    supplied, _true, points = scenario
    result, record = record_for(supplied, points)

    if record["chosen"] == "refined":
        transform = tuple(record["refined"]["affine"])
        stored = record["refined"]["residuals"]
        in_sample_rmse = record["refined"]["rmse_in_sample_m"]
        max_res = record["refined"]["max_residual_m"]
    else:
        transform = supplied
        stored = record["supplied"]["residuals"]
        in_sample_rmse = record["supplied"]["rmse_m"]
        max_res = record["supplied"]["max_residual_m"]

    by_id = {p.id: p for p in points}
    squares = []
    tol = coordinate_tolerance([c for p in points for c in p.reference])
    for res in stored:
        p = by_id[res["id"]]
        e, n = apply_affine(transform, *p.pixel)
        assert abs((e - p.reference[0]) - res["dx_m"]) < max(1e-9, tol)
        assert abs((n - p.reference[1]) - res["dy_m"]) < max(1e-9, tol)
        assert res["r_m"] <= max_res + 1e-12
        squares.append(res["dx_m"] ** 2 + res["dy_m"] ** 2)
    assert abs(math.sqrt(math.fsum(squares) / len(squares)) - in_sample_rmse) < 1e-9
    assert record["alignment_error_m"] >= in_sample_rmse
    assert result.alignment_error_m == record["alignment_error_m"]


# A6 -------------------------------------------------------------------------------------------


@settings(max_examples=100)
@given(scenario=control_scenarios(), data=st.data())
def test_a6_order_independence(scenario, data) -> None:
    supplied, _true, points = scenario
    shuffled = data.draw(st.permutations(points))
    a = compute_alignment(points, lambda x, y: apply_affine(supplied, x, y))
    b = compute_alignment(shuffled, lambda x, y: apply_affine(supplied, x, y))
    assert a.supplied.rmse_m == b.supplied.rmse_m
    assert (a.refined is None) == (b.refined is None)
    if a.refined and b.refined:
        assert a.refined.rmse_in_sample_m == pytest.approx(b.refined.rmse_in_sample_m, abs=1e-9)
        assert a.refined.rmse_loo_m == pytest.approx(b.refined.rmse_loo_m, abs=1e-9)
    assert a.chosen == b.chosen
    assert a.alignment_error_m == b.alignment_error_m


# A7 -------------------------------------------------------------------------------------------


def independent_error(basis: float) -> float:
    """The rule written out again from the spec text: ceil_0.1(max(2.0, 2 x B))."""
    return math.ceil(round(max(2.0, 2.0 * basis) * 10, 9)) / 10


@settings(max_examples=150)
@given(scenario=control_scenarios())
def test_a7_choice_rule_basis_and_published_error(scenario) -> None:
    supplied, _true, points = scenario
    _result, record = record_for(supplied, points)
    refined = record.get("refined")
    expect_refined = refined is not None and refined["rmse_loo_m"] < record["supplied"]["rmse_m"]
    assert record["chosen"] == ("refined" if expect_refined else "supplied")
    if record["chosen"] == "refined":
        assert record["error_basis"] == "refined_loo_rmse"
        assert record["error_basis_m"] == refined["rmse_loo_m"]
    else:
        assert record["error_basis"] == "supplied_rmse"
        assert record["error_basis_m"] == record["supplied"]["rmse_m"]
    assert record["alignment_error_m"] == independent_error(record["error_basis_m"])
    assert record["error_rule"] == {"multiplier": 2.0, "floor_m": 2.0, "round_up_to_m": 0.1}


# A8 -------------------------------------------------------------------------------------------


def check_a8(error: float, basis: float) -> None:
    assert error >= 2.0
    assert error >= 2 * basis - 1e-9
    assert error < max(2.0, 2 * basis) + 0.1
    assert abs(error * 10 - round(error * 10)) < 1e-9


@given(basis=st.floats(0.0, 500.0))
def test_a8_published_error_for_any_basis(basis) -> None:
    check_a8(published_error(basis), basis)


@settings(max_examples=100)
@given(scenario=control_scenarios())
def test_a8_published_error_in_records(scenario) -> None:
    supplied, _true, points = scenario
    _result, record = record_for(supplied, points)
    check_a8(record["alignment_error_m"], record["error_basis_m"])


# A9 -------------------------------------------------------------------------------------------


@settings(max_examples=300)
@given(scenario=reference_scenarios())
def test_a9_references_are_checked_exactly(scenario) -> None:
    control = parse_control_file(scenario.control, "fip_v3_1911_229")
    problems = check_references(control.points, scenario.layers)
    if scenario.expect_ok:
        assert problems == [], scenario.mode
    else:
        assert len(problems) == 1, scenario.mode
        assert f"control point {scenario.bad_point}:" in problems[0]


@settings(max_examples=15, deadline=None)
@given(scenario=reference_scenarios())
def test_a9_align_check_refuses_or_runs(scenario) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        paths = make_root(Path(tmp))
        write_geotiff(
            paths.raw / "fip_v3_1911_229" / "plate.tif",
            RUN_TRANSFORM,
            width=RUN_WIDTH,
            height=RUN_HEIGHT,
        )
        paths.present_dir.mkdir(parents=True)
        for source_id, layer in scenario.layers.items():
            doc = {"type": "FeatureCollection", "source": source_id, **layer}
            paths.present_layer(source_id).write_text(json.dumps(doc), encoding="utf-8")
        paths.control_dir.mkdir(parents=True)
        paths.control_file("fip_v3_1911_229").write_text(
            json.dumps(scenario.control), encoding="utf-8"
        )
        registry = load_registry(paths.sources_json)
        record_path = paths.alignment_record("fip_v3_1911_229")
        if scenario.expect_ok:
            run_align_check(paths, registry, "fip_v3_1911_229", NOW, lambda _m: None)
            assert record_path.exists()
        else:
            with pytest.raises(PipelineError, match=f"control point {scenario.bad_point}"):
                run_align_check(paths, registry, "fip_v3_1911_229", NOW, lambda _m: None)
            assert not record_path.exists()


def test_control_point_type_is_what_compute_expects() -> None:
    # Guards the strategies: ControlPoint is a (id, pixel, reference) triple.
    p = ControlPoint("a", (1.0, 2.0), (3.0, 4.0))
    assert (p.id, p.pixel, p.reference) == ("a", (1.0, 2.0), (3.0, 4.0))
