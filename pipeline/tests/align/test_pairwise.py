"""The pairwise registration of two plates (spec 02 requirement 13.15): needs four shared
references, takes T_BA by least squares, is conservative like the alignment error, composes with its
inverse to the identity, and is recomputable from the committed files."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from buried_pipeline.align.affine import LocalAffine
from buried_pipeline.align.pairwise import (
    AFFINE,
    MIN_SHARED,
    PAIRWISE_FLOOR_M,
    SIMILARITY,
    PlatePoint,
    RefKey,
    compose,
    fit_similarity,
    invert_local,
    pairwise_error_from_basis,
    plate_points,
    register,
)
from buried_pipeline.align.residuals import ceil_tenth

REPO_DATA = Path(__file__).resolve().parents[3] / "data"
E0, N0 = 632000.0, 4835000.0


def key(n: int) -> RefKey:
    return ("present_toronto_intersections_2026", str(n), -1, -1)


def apply_similarity(
    x: float, y: float, scale: float, theta: float, tx: float, ty: float
) -> tuple[float, float]:
    c, s = scale * math.cos(theta), scale * math.sin(theta)
    return (c * x - s * y + tx, s * x + c * y + ty)


small = st.floats(-4.0, 4.0, allow_nan=False, allow_infinity=False)
spot = st.tuples(st.integers(0, 800), st.integers(0, 800))


@st.composite
def planted(draw: st.DrawFn, min_size: int = 0) -> tuple[list[PlatePoint], list[PlatePoint], tuple]:
    """Plates A and B whose positions for every shared reference differ by one exact similarity
    `S` (B to A), so a registration must recover it with no error."""
    spots = draw(st.lists(spot, min_size=min_size, max_size=9, unique=True))
    scale = draw(st.floats(0.98, 1.02))
    theta = draw(st.floats(-0.02, 0.02))
    tx, ty = draw(st.floats(-6.0, 6.0)), draw(st.floats(-6.0, 6.0))
    a: list[PlatePoint] = []
    b: list[PlatePoint] = []
    for n, (x, y) in enumerate(spots):
        q = (E0 + x, N0 + y)
        rb = (draw(small), draw(small))
        pos_b = (q[0] + rb[0], q[1] + rb[1])
        pos_a = apply_similarity(pos_b[0] - E0, pos_b[1] - N0, scale, theta, tx, ty)
        pos_a = (pos_a[0] + E0, pos_a[1] + N0)
        b.append(PlatePoint(key(n), q[0], q[1], rb[0], rb[1]))
        a.append(PlatePoint(key(n), q[0], q[1], pos_a[0] - q[0], pos_a[1] - q[1]))
    return a, b, (scale, theta, tx, ty)


@given(planted(), st.lists(st.integers(0, 12), unique=True, max_size=8))
def test_it_is_never_defined_with_fewer_than_four_shared_references(
    plates: tuple, drop: list[int]
) -> None:
    a, b, _ = plates
    b = [p for p in b if int(p.key[1]) not in drop]
    shared = {p.key for p in a} & {p.key for p in b}
    result = register(a, b)
    if len(shared) < MIN_SHARED:
        assert result is None
    else:
        assert result is None or len(result.shared) == len(shared)


@given(planted(min_size=4))
@settings(max_examples=80, deadline=None)
def test_it_recovers_a_planted_similarity_with_the_floor_error(
    plates: tuple,
) -> None:
    a, b, (scale, theta, tx, ty) = plates
    result = register(a, b)
    if result is None:  # coincident positions: nothing to fit
        return
    assert result.error_m == PAIRWISE_FLOOR_M
    assert result.loo_rms_m < 1e-4
    for p in b[:3]:
        x, y = p.position()
        want = apply_similarity(x - E0, y - N0, scale, theta, tx, ty)
        got = result.b_to_a.apply(x, y)
        assert got[0] - E0 == pytest.approx(want[0], abs=1e-3)
        assert got[1] - N0 == pytest.approx(want[1], abs=1e-3)


@given(planted(min_size=4))
@settings(max_examples=80, deadline=None)
def test_the_registration_and_its_inverse_compose_to_the_identity(plates: tuple) -> None:
    a, b, _ = plates
    ab = register(a, b)
    if ab is None:
        return
    for p in b[:4]:
        x, y = p.position()
        for outer, inner in ((ab.a_to_b, ab.b_to_a), (ab.b_to_a, ab.a_to_b)):
            ox, oy = compose(outer, inner, (x, y))
            assert ox == pytest.approx(x, abs=1e-6)
            assert oy == pytest.approx(y, abs=1e-6)


@given(planted(min_size=4))
@settings(max_examples=80, deadline=None)
def test_fitting_the_other_way_round_gives_the_inverse_within_tolerance(plates: tuple) -> None:
    """With data an exact transform fits, T_AB fitted from A to B composed with T_BA fitted from B
    to A is the identity: the two fits do not drift apart."""
    a, b, _ = plates
    ab, ba = register(a, b), register(b, a)
    if ab is None or ba is None:
        return
    for p in b[:4]:
        x, y = p.position()
        ox, oy = compose(ba.b_to_a, ab.b_to_a, (x, y))  # B to A, then A back to B
        assert ox == pytest.approx(x, abs=1e-3)
        assert oy == pytest.approx(y, abs=1e-3)


@given(planted(min_size=4), st.randoms())
def test_the_order_of_the_points_does_not_matter(plates: tuple, rnd: object) -> None:
    a, b, _ = plates
    shuffled = list(a)
    rnd.shuffle(shuffled)  # type: ignore[attr-defined]
    assert register(a, b) == register(shuffled, b)


noise = st.floats(-6.0, 6.0, allow_nan=False, allow_infinity=False)


@st.composite
def noisy(draw: st.DrawFn) -> tuple[list[PlatePoint], list[PlatePoint]]:
    spots = draw(st.lists(spot, min_size=4, max_size=9, unique=True))
    a = [PlatePoint(key(n), E0 + x, N0 + y, draw(noise), draw(noise)) for n, (x, y) in enumerate(spots)]
    b = [PlatePoint(key(n), E0 + x, N0 + y, draw(noise), draw(noise)) for n, (x, y) in enumerate(spots)]
    return a, b


@given(noisy())
@settings(max_examples=80, deadline=None)
def test_the_error_is_conservative_floored_and_rounded_up(plates: tuple) -> None:
    a, b = plates
    result = register(a, b)
    if result is None:
        return
    assert result.error_m >= PAIRWISE_FLOOR_M
    assert result.error_m >= 2.0 * result.loo_rms_m - 1e-9
    assert result.error_m < max(PAIRWISE_FLOOR_M, 2.0 * result.loo_rms_m) + 0.1 + 1e-9
    assert round(result.error_m * 10) == pytest.approx(result.error_m * 10, abs=1e-9)
    # The model follows the count: a similarity below six references, an affine at six or more
    # unless the affine is unstable, when it falls back to a similarity.
    assert result.model == SIMILARITY if len(result.shared) < 6 else result.model in (AFFINE, SIMILARITY)


@given(noisy())
@settings(max_examples=60, deadline=None)
def test_the_leave_one_out_residuals_can_be_recomputed(plates: tuple) -> None:
    a, b = plates
    result = register(a, b)
    if result is None:
        return
    fit = fit_similarity if result.model == SIMILARITY else None
    if fit is None:  # recompute the affine with the library fit
        from buried_pipeline.align.affine import fit_local_affine as fit
    for i, (pb, pa, got) in enumerate(
        zip(result.positions_b, result.positions_a, result.loo_residuals_m, strict=True)
    ):
        rest_b = [p for j, p in enumerate(result.positions_b) if j != i]
        rest_a = [p for j, p in enumerate(result.positions_a) if j != i]
        want = fit(rest_b, rest_a).residual_components(pb, pa)
        assert got == pytest.approx(want, abs=1e-9)
    rms = math.sqrt(sum(dx * dx + dy * dy for dx, dy in result.loo_residuals_m) / len(result.shared))
    assert result.loo_rms_m == pytest.approx(rms)


def test_the_rule_on_a_worked_example() -> None:
    assert pairwise_error_from_basis(0.1) == PAIRWISE_FLOOR_M
    assert pairwise_error_from_basis(1.23) == ceil_tenth(2.46)
    # Four references on the corners of a square: B is A shifted by 2 m east, so the registration
    # is that translation and fits without error.
    corners = [(0, 0), (500, 0), (500, 500), (0, 500)]
    a = [PlatePoint(key(n), E0 + x, N0 + y, 2.0, 0.0) for n, (x, y) in enumerate(corners)]
    b = [PlatePoint(key(n), E0 + x, N0 + y, 0.0, 0.0) for n, (x, y) in enumerate(corners)]
    result = register(a, b)
    assert result is not None and result.model == SIMILARITY
    assert result.error_m == PAIRWISE_FLOOR_M
    x, y = result.b_to_a.apply(E0 + 100, N0 + 100)
    assert (x - E0, y - N0) == pytest.approx((102.0, 100.0), abs=1e-6)
    # One reference read 3 m off in A makes the leave-one-out error visible: 3 m at that point.
    a[0] = PlatePoint(key(0), E0, N0, 2.0, 3.0)
    off = register(a, b)
    assert off is not None and off.loo_rms_m > 1.0 and off.error_m > PAIRWISE_FLOOR_M


def test_the_same_reference_with_a_different_vertex_is_a_different_reference() -> None:
    a = [PlatePoint(("s", "1", v, 0), E0 + 100 * v, N0, 0.0, 0.0) for v in range(4)]
    b = [PlatePoint(("s", "1", 0, 0), E0, N0, 0.0, 0.0)] * 4
    assert register(a, b) is None


def test_a_degenerate_set_has_no_registration() -> None:
    same = [PlatePoint(key(n), E0, N0, 0.0, 0.0) for n in range(4)]  # four coincident points
    assert register(same, same) is None


def test_invert_local_inverts() -> None:
    t = LocalAffine(1.01, -0.02, 0.02, 1.01, (E0 + 10, N0 + 20), (E0 + 14, N0 + 18))
    back = invert_local(t)
    x, y = compose(back, t, (E0 + 300, N0 + 250))
    assert (x, y) == pytest.approx((E0 + 300, N0 + 250), abs=1e-6)


# --- the committed plates ------------------------------------------------------------------------


def committed(name: str) -> tuple[dict, dict]:
    record = json.loads((REPO_DATA / "alignment" / f"{name}.json").read_text(encoding="utf-8"))
    control = json.loads((REPO_DATA / "control" / f"{name}.json").read_text(encoding="utf-8"))
    return record, control


def test_the_two_plate_229_editions_register_on_six_shared_references() -> None:
    a = plate_points(*committed("fip_v3_1911_229"))
    b = plate_points(*committed("fip_v3_1935_229"))
    result = register(a, b)
    assert result is not None
    assert len(result.shared) == 6
    # Recompute by hand: where each plate puts a reference is the reference plus its supplied
    # residual (both chose `supplied`), and the figure is twice the leave-one-out RMS, rounded up.
    rec_a, ctl_a = committed("fip_v3_1911_229")
    rec_b, _ = committed("fip_v3_1935_229")
    assert rec_a["chosen"] == rec_b["chosen"] == "supplied"
    by_id = {p["id"]: p for p in ctl_a["points"]}
    ra = {r["id"]: r for r in rec_a["supplied"]["residuals"]}
    for pt in a:
        assert pt.key[0] == "present_toronto_intersections_2026"
    assert sorted((p.east_m, p.north_m) for p in a) == sorted(
        (float(p["reference"][0]), float(p["reference"][1])) for p in by_id.values()
    )
    assert {round(p.dx_m, 6) for p in a} == {round(r["dx_m"], 6) for r in ra.values()}
    assert result.error_m == pairwise_error_from_basis(result.loo_rms_m)
    assert result.model in (AFFINE, SIMILARITY)


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
