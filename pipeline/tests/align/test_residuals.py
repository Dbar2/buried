from __future__ import annotations

import math

import pytest

from buried_pipeline.align.affine import UnstableFit
from buried_pipeline.align.compute import ControlPoint, build_record, compute_alignment
from buried_pipeline.align.residuals import (
    ceil_tenth,
    choose_transform,
    error_basis,
    leave_one_out,
    make_residual,
    max_residual,
    outlier_ids,
    published_error,
    residuals_for,
    rmse,
)
from buried_pipeline.errors import PipelineError

PIXELS = [(100.0, 100.0), (9000.0, 200.0), (8800.0, 7000.0), (300.0, 6800.0), (4500.0, 3500.0)]
IDS = ["p1", "p2", "p3", "p4", "p5"]


def north_up(x: float, y: float) -> tuple[float, float]:
    # 0.5 m pixels: exact in binary, so residual arithmetic below has no rounding noise.
    return (630000.0 + 0.5 * x, 4834000.0 - 0.5 * y)


def refs_with_offsets(offsets: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Reference points where the supplied mapping is off by -offset (so residual = +offset)."""
    # May be given fewer offsets than PIXELS: the references then cover the first points only.
    return [
        (north_up(*p)[0] - dx, north_up(*p)[1] - dy)
        for p, (dx, dy) in zip(PIXELS, offsets, strict=False)
    ]


def test_residual_is_mapped_minus_reference() -> None:
    r = make_residual("a", (10.0, 20.0), (7.0, 16.0))
    assert (r.dx_m, r.dy_m, r.r_m) == (3.0, 4.0, 5.0)


def test_rmse_and_max() -> None:
    rs = [make_residual("a", (3.0, 4.0), (0.0, 0.0)), make_residual("b", (0.0, 0.0), (0.0, 0.0))]
    assert rmse(rs) == pytest.approx(math.sqrt(25 / 2))
    assert max_residual(rs) == 5.0
    with pytest.raises(ValueError):
        rmse([])


def test_residuals_for_uses_the_predictor() -> None:
    rs = residuals_for(IDS, PIXELS, refs_with_offsets([(1.0, 0.0)] * 5), north_up)
    assert all(r.dx_m == pytest.approx(1.0) and r.dy_m == pytest.approx(0.0) for r in rs)


def test_outliers_are_more_than_three_times_the_median() -> None:
    offsets = [(1.0, 0.0), (1.0, 0.0), (1.0, 0.0), (1.0, 0.0), (3.5, 0.0)]
    rs = residuals_for(IDS, PIXELS, refs_with_offsets(offsets), north_up)
    assert outlier_ids(rs) == ["p5"]
    just_under = [(1.0, 0.0)] * 4 + [(3.0, 0.0)]  # exactly 3x the median: not "more than"
    rs2 = residuals_for(IDS, PIXELS, refs_with_offsets(just_under), north_up)
    assert outlier_ids(rs2) == []
    assert outlier_ids([]) == []


def test_leave_one_out_needs_stable_subsets() -> None:
    line_plus = [(0.0, 0.0), (100.0, 0.0), (200.0, 0.0), (300.0, 1000.0)]
    targets = [(x, y) for x, y in line_plus]
    # Removing the one off-line point leaves three collinear points.
    with pytest.raises(UnstableFit):
        leave_one_out(["a", "b", "c", "d"], line_plus, targets)


def test_choice_rule() -> None:
    assert choose_transform(1.0, None) == "supplied"
    assert choose_transform(1.0, 0.5) == "refined"
    assert choose_transform(1.0, 1.0) == "supplied"  # not lower
    assert choose_transform(1.0, 2.0) == "supplied"
    assert error_basis("supplied", 1.0, 0.5) == ("supplied_rmse", 1.0)
    assert error_basis("refined", 1.0, 0.5) == ("refined_loo_rmse", 0.5)


@pytest.mark.parametrize(
    ("basis", "expected"),
    [(0.0, 2.0), (0.5, 2.0), (1.0, 2.0), (1.01, 2.1), (1.04, 2.1), (1.05, 2.1), (1.0500001, 2.2),
     (1.5, 3.0), (2.34, 4.7)],
)  # fmt: skip
def test_published_error_rule(basis: float, expected: float) -> None:
    assert published_error(basis) == pytest.approx(expected)


def test_ceil_tenth_ignores_float_noise() -> None:
    assert ceil_tenth(0.30000000000000004) == 0.3
    assert ceil_tenth(2.0) == 2.0
    assert ceil_tenth(2.00000000001) == 2.0  # 1e-11 is below the rounding to 9 decimals of x*10
    assert ceil_tenth(2.0000001) == 2.1
    assert ceil_tenth(2.01) == 2.1


def test_compute_alignment_supplied_chosen_with_three_points() -> None:
    pts = [
        ControlPoint(i, p, r)
        for i, p, r in zip(IDS[:3], PIXELS[:3], refs_with_offsets([(1.0, 2.0)] * 3), strict=True)
    ]
    result = compute_alignment(pts, north_up)
    assert result.refined is None and "needs 4" in (result.refined_skipped or "")
    assert result.chosen == "supplied"
    assert result.supplied.rmse_m == pytest.approx(math.hypot(1.0, 2.0))
    assert result.error_basis == "supplied_rmse"
    assert result.alignment_error_m == published_error(math.hypot(1.0, 2.0))


def test_compute_alignment_prefers_refined_when_supplied_is_biased() -> None:
    # Supplied mapping is off by a constant 5 m; the points themselves are consistent with an
    # affine, so the refined fit (which absorbs the shift) has a small leave-one-out error.
    noise = [(0.2, 0.0), (-0.1, 0.2), (0.0, -0.2), (0.1, 0.1), (-0.2, 0.0)]
    offsets = [(5.0 + a, 0.0 + b) for a, b in noise]
    refs = refs_with_offsets(offsets)
    pts = [ControlPoint(i, p, r) for i, p, r in zip(IDS, PIXELS, refs, strict=True)]
    result = compute_alignment(pts, north_up)
    assert result.supplied.rmse_m > 4.9
    assert result.refined is not None
    assert result.refined.rmse_loo_m >= result.refined.rmse_in_sample_m
    assert result.chosen == "refined"
    assert result.error_basis == "refined_loo_rmse"
    assert result.error_basis_m == result.refined.rmse_loo_m
    assert result.alignment_error_m >= 2.0


def test_collinear_points_skip_refined_with_reason() -> None:
    pixels = [(0.0, 0.0), (1000.0, 1000.0), (2000.0, 2000.0), (3000.0, 3000.0)]
    pts = [
        ControlPoint(f"p{i}", p, (north_up(*p)[0] + 1.0, north_up(*p)[1]))
        for i, p in enumerate(pixels)
    ]
    result = compute_alignment(pts, north_up)
    assert result.refined is None
    assert "close to a line" in (result.refined_skipped or "")
    assert result.chosen == "supplied"


def test_fewer_than_three_points_refused() -> None:
    with pytest.raises(PipelineError, match="At least 3"):
        compute_alignment([ControlPoint("a", (0.0, 0.0), (1.0, 1.0))] * 2, north_up)


def test_zero_error_basis_refused() -> None:
    pts = [ControlPoint(i, p, north_up(*p)) for i, p in zip(IDS[:3], PIXELS[:3], strict=True)]
    with pytest.raises(PipelineError, match="exactly 0 m"):
        compute_alignment(pts, north_up)


def test_duplicate_ids_refused() -> None:
    pts = [ControlPoint("a", p, (north_up(*p)[0] + 1, north_up(*p)[1])) for p in PIXELS[:3]]
    with pytest.raises(PipelineError, match="not unique"):
        compute_alignment(pts, north_up)


def test_record_shape_and_constants() -> None:
    offsets = [(1.0, 0.5), (0.5, -1.0), (-1.0, 0.5), (0.2, 0.2), (-0.5, 0.1)]
    pts = [ControlPoint(i, p, r) for i, p, r in zip(IDS, PIXELS, refs_with_offsets(offsets), strict=True)]
    result = compute_alignment(pts, north_up)
    record = build_record(
        source_id="fip_v3_1911_229",
        reference_sources=["b_src", "a_src", "a_src"],
        control_file="data/control/fip_v3_1911_229.json",
        control_sha256="0" * 64,
        measured_at="2026-11-13T12:00:00Z",
        tool_version="0.1.0",
        source_pixel_size_m=0.055,
        supplied_crs="EPSG:26917",
        supplied_operation="noop",
        result=result,
        control_references=[p.reference for p in pts],
    )
    assert record["reference_sources"] == ["a_src", "b_src"]
    assert record["status"] == "measured"
    assert record["error_rule"] == {"multiplier": 2.0, "floor_m": 2.0, "round_up_to_m": 0.1}
    assert set(record) >= {
        "supplied", "refined", "chosen", "error_basis", "error_basis_m", "alignment_error_m",
        "outliers", "source_pixel_size_m", "control_sha256", "measured_at", "tool_version",
    }  # fmt: skip
    assert [r["id"] for r in record["supplied"]["residuals"]] == IDS
    assert len(record["refined"]["affine"]) == 6
    json_ok = __import__("json").dumps(record)
    assert json_ok
