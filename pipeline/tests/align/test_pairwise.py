"""The pairwise alignment error (spec 02 requirement 13.15): symmetric, needs four shared
references, conservative like the alignment error, and recomputable from the committed files."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st

from buried_pipeline.align.pairwise import (
    MIN_SHARED,
    PAIRWISE_FLOOR_M,
    PlatePoint,
    RefKey,
    pairwise_error,
    pairwise_error_from_basis,
    plate_points,
)
from buried_pipeline.align.residuals import ceil_tenth

REPO_DATA = Path(__file__).resolve().parents[3] / "data"

residual = st.floats(-8.0, 8.0, allow_nan=False, allow_infinity=False)
key_ids = st.integers(0, 9)


def key(n: int) -> RefKey:
    return ("present_toronto_intersections_2026", str(n), -1, -1)


@st.composite
def plates(draw: st.DrawFn) -> list[PlatePoint]:
    ids = draw(st.lists(key_ids, unique=True, max_size=8))
    return [PlatePoint(key(i), draw(residual), draw(residual)) for i in ids]


@given(plates(), plates())
def test_the_pairwise_figure_is_symmetric(a: list[PlatePoint], b: list[PlatePoint]) -> None:
    ab, ba = pairwise_error(a, b), pairwise_error(b, a)
    assert (ab is None) == (ba is None)
    if ab is not None and ba is not None:
        assert ab.error_m == ba.error_m
        assert ab.basis_m == ba.basis_m
        assert ab.shared == ba.shared
        assert ab.differences_m == tuple((-dx, -dy) for dx, dy in ba.differences_m)


@given(plates(), plates())
def test_it_is_never_defined_with_fewer_than_four_shared_references(
    a: list[PlatePoint], b: list[PlatePoint]
) -> None:
    shared = {p.key for p in a} & {p.key for p in b}
    assert (pairwise_error(a, b) is None) == (len(shared) < MIN_SHARED)


@given(plates(), plates(), st.randoms())
def test_the_order_of_the_points_does_not_matter(
    a: list[PlatePoint], b: list[PlatePoint], rnd: object
) -> None:
    shuffled = list(a)
    rnd.shuffle(shuffled)  # type: ignore[attr-defined]
    assert pairwise_error(a, b) == pairwise_error(shuffled, b)


@given(plates(), plates())
def test_it_is_conservative_floored_and_rounded_up(
    a: list[PlatePoint], b: list[PlatePoint]
) -> None:
    result = pairwise_error(a, b)
    if result is None:
        return
    assert result.error_m >= PAIRWISE_FLOOR_M
    assert result.error_m >= 2.0 * result.basis_m - 1e-9
    assert result.error_m < max(PAIRWISE_FLOOR_M, 2.0 * result.basis_m) + 0.1 + 1e-9
    assert round(result.error_m * 10) == pytest.approx(result.error_m * 10, abs=1e-9)


@given(plates())
def test_a_plate_against_itself_is_the_floor(a: list[PlatePoint]) -> None:
    result = pairwise_error(a, a)
    if result is not None:
        assert result.basis_m == 0.0
        assert result.error_m == PAIRWISE_FLOOR_M


def test_the_rule_on_a_worked_example() -> None:
    a = [PlatePoint(key(i), 1.0, 0.0) for i in range(4)]
    b = [PlatePoint(key(i), -0.5, 0.0) for i in range(4)]  # every difference is 1.5 m
    result = pairwise_error(a, b)
    assert result is not None
    assert result.basis_m == pytest.approx(1.5)
    assert result.error_m == 3.0
    assert pairwise_error_from_basis(0.2) == PAIRWISE_FLOOR_M
    assert pairwise_error_from_basis(1.23) == ceil_tenth(2.46)


def test_the_same_reference_with_a_different_vertex_is_a_different_reference() -> None:
    a = [PlatePoint(("s", "1", v, 0), 0.0, 0.0) for v in range(4)]
    b = [PlatePoint(("s", "1", 0, 0), 0.0, 0.0)] * 4
    assert pairwise_error(a, b) is None


# --- the committed plates ------------------------------------------------------------------------


def committed(name: str) -> tuple[dict, dict]:
    record = json.loads((REPO_DATA / "alignment" / f"{name}.json").read_text(encoding="utf-8"))
    control = json.loads((REPO_DATA / "control" / f"{name}.json").read_text(encoding="utf-8"))
    return record, control


def test_the_two_plate_229_editions_share_six_references() -> None:
    a = plate_points(*committed("fip_v3_1911_229"))
    b = plate_points(*committed("fip_v3_1935_229"))
    result = pairwise_error(a, b)
    assert result is not None
    assert len(result.shared) == 6
    # Recompute by hand from the two records' supplied residuals (both chose `supplied`).
    rec_a, _ = committed("fip_v3_1911_229")
    rec_b, _ = committed("fip_v3_1935_229")
    assert rec_a["chosen"] == rec_b["chosen"] == "supplied"
    ra = {r["id"]: r for r in rec_a["supplied"]["residuals"]}
    rb = {r["id"]: r for r in rec_b["supplied"]["residuals"]}
    squares = [
        (ra[i]["dx_m"] - rb[i]["dx_m"]) ** 2 + (ra[i]["dy_m"] - rb[i]["dy_m"]) ** 2 for i in ra
    ]
    expected = math.sqrt(math.fsum(squares) / len(squares))
    assert result.basis_m == pytest.approx(expected)
    assert result.error_m == pairwise_error_from_basis(expected)


def test_a_refined_plate_uses_out_of_sample_residuals() -> None:
    record, control = committed("fip_v3_1911_229")
    supplied = plate_points(record, control)
    record["chosen"] = "refined"
    refined = plate_points(record, control)
    # Leave-one-out residuals of the refined fit are not the supplied ones, and are larger than
    # the in-sample residuals the record stores for the refined fit.
    assert [(p.dx_m, p.dy_m) for p in refined] != [(p.dx_m, p.dy_m) for p in supplied]
    in_sample = {r["id"]: r["r_m"] for r in record["refined"]["residuals"]}
    loo = {p.key[1]: math.hypot(p.dx_m, p.dy_m) for p in refined}
    assert sum(loo.values()) > sum(in_sample.values())


def test_points_that_do_not_line_up_are_refused() -> None:
    record, control = committed("fip_v3_1911_229")
    control["points"] = control["points"][:-1]
    with pytest.raises(ValueError, match="different points"):
        plate_points(record, control)
