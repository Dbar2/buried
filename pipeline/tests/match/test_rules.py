from __future__ import annotations

import math

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from shapely.geometry import box

from buried_pipeline.align.affine import LocalAffine
from buried_pipeline.match import rules
from buried_pipeline.match.rules import Building, Outcome, PairRegistration, Plate

F_ERR, G_ERR = 4.5, 3.3  # e = 7.8 m between F and G when no pairwise figure is used
IDENTITY = LocalAffine(1.0, 0.0, 0.0, 1.0, (0.0, 0.0), (0.0, 0.0))


def bld(bid: str, source: str, x0: float, y0: float, x1: float, y1: float, err: float) -> Building:
    return Building(bid, source, box(x0, y0, x1, y1), err)


def f40(x0: float = 0.0) -> Building:
    return bld("F", "p1", x0, 0, x0 + 40, 40, F_ERR)


def g40(gid: str = "G", x0: float = 0.0) -> Building:
    return bld(gid, "p2", x0, 0, x0 + 40, 40, G_ERR)


def plate(
    buildings: list[Building],
    mapped: tuple[float, ...] | None = (-100, -100, 300, 300),
    reviewed: tuple[tuple[float, ...], ...] = ((-50, -50, 250, 250),),
) -> Plate:
    return Plate(
        source="p2",
        mapped_area=box(*mapped) if mapped else None,
        reviewed_areas=tuple(box(*r) for r in reviewed),
        buildings=tuple(buildings),
    )


def test_thresholds_are_the_designs() -> None:
    assert rules.MATCH_MIN == 0.5
    assert rules.COMPETE_MIN == 0.3
    assert rules.ABSENCE_COVER_MAX == 0.10
    assert rules.SHIFT_STEP_M <= 0.25


# --- the shifts ----------------------------------------------------------------------------------


def test_shifts_are_a_lattice_inside_the_disc_with_zero_included() -> None:
    offsets = rules.shift_offsets(7.8)
    assert (0.0, 0.0) in {(float(x), float(y)) for x, y in offsets}
    assert max(math.hypot(x, y) for x, y in offsets) <= 7.8 + 1e-9
    assert {float(x) for x, _ in offsets} == {k * 0.25 for k in range(-31, 32)}
    assert len(rules.shift_offsets(0.0)) == 1


@given(st.floats(0.0, 12.0), st.floats(0.0, 6.0))
def test_a_larger_error_only_adds_shifts(e: float, extra: float) -> None:
    small = {(float(x), float(y)) for x, y in rules.shift_offsets(e)}
    large = {(float(x), float(y)) for x, y in rules.shift_offsets(e + extra)}
    assert small <= large


# --- the overlap score ---------------------------------------------------------------------------


def test_overlap_score_identical_shifted_and_small() -> None:
    assert rules.overlap_score(box(0, 0, 40, 40), box(0, 0, 40, 40), 7.8) == pytest.approx(1.0)
    # A shift inside the error is undone: the lattice holds -5 m exactly.
    assert rules.overlap_score(box(0, 0, 40, 40), box(5, 0, 45, 40), 7.8) == pytest.approx(1.0)
    # A 25 m offset is brought down to 25 - 7.75 = 17.25 m: 22.75 m of overlap in a 40 m width.
    assert rules.overlap_score(box(0, 0, 40, 40), box(25, 0, 65, 40), 7.8) == pytest.approx(
        22.75 / (80 - 22.75), abs=1e-6
    )
    # A 10 m footprint is no longer too small for its error.
    assert rules.overlap_score(box(0, 0, 10, 10), box(0, 0, 10, 10), 7.8) == pytest.approx(1.0)
    assert rules.overlap_score(box(0, 0, 0, 0), box(0, 0, 10, 10), 7.8) is None


@given(st.integers(0, 30), st.integers(0, 30), st.integers(4, 40), st.integers(4, 40))
def test_overlap_score_is_symmetric(dx: int, dy: int, w: int, h: int) -> None:
    a, b = box(0, 0, 30, 20), box(dx, dy, dx + w, dy + h)
    assert rules.overlap_score(a, b, 6.0) == rules.overlap_score(b, a, 6.0)


rect = st.tuples(
    st.integers(0, 40), st.integers(0, 40), st.integers(4, 40), st.integers(4, 40)
).map(lambda t: box(t[0], t[1], t[0] + t[2], t[1] + t[3]))


@given(rect, rect, st.integers(0, 100).map(lambda v: v / 10), st.integers(0, 80).map(lambda v: v / 10))
@settings(max_examples=150, deadline=None)
def test_the_overlap_score_never_decreases_as_the_error_grows(
    a: object, b: object, e: float, extra: float
) -> None:
    low = rules.overlap_score(a, b, e)  # type: ignore[arg-type]
    high = rules.overlap_score(a, b, e + extra)  # type: ignore[arg-type]
    assert low is not None and high is not None
    assert high >= low


# --- one plate against another -------------------------------------------------------------------


def test_identical_footprints_are_a_match_candidate() -> None:
    out = rules.plate_outcome(f40(), plate([g40()]))
    assert out.kind == rules.MATCH_CANDIDATE and out.other == "G" and out.best == "G"
    assert out.scores == (("G", pytest.approx(1.0), pytest.approx(1.0)),)


def test_a_shift_inside_the_error_still_matches() -> None:
    assert rules.plate_outcome(f40(), plate([g40(x0=5)])).kind == rules.MATCH_CANDIDATE


def test_a_small_footprint_can_match() -> None:
    f = bld("F", "p1", 0, 0, 10, 10, F_ERR)
    g = bld("G", "p2", 1, 0, 11, 10, G_ERR)
    assert rules.plate_outcome(f, plate([g])).kind == rules.MATCH_CANDIDATE


def test_partial_overlap_goes_to_review() -> None:
    out = rules.plate_outcome(f40(), plate([g40(x0=25)]))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.PARTIAL_OVERLAP)
    assert out.scores[0][1] == pytest.approx(0.3974, abs=1e-3)  # below MATCH_MIN


def test_two_strong_candidates_compete() -> None:
    out = rules.plate_outcome(f40(), plate([g40("G1"), g40("G2")]))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.COMPETING)
    assert out.best is None  # a tie has no best


def test_a_second_footprint_scoring_a_third_competes() -> None:
    other = bld("H", "p2", 25, 0, 65, 40, G_ERR)  # scores about 0.4
    out = rules.plate_outcome(f40(), plate([g40(), other]))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.COMPETING)
    assert out.best == "G"


def test_a_second_footprint_scoring_under_a_third_does_not_compete() -> None:
    weak = bld("H", "p2", 32.0, 0, 72, 40, G_ERR)  # scores about 0.245
    out = rules.plate_outcome(f40(), plate([g40(), weak]))
    assert out.kind == rules.MATCH_CANDIDATE and out.other == "G"


def test_a_match_near_the_plate_edge_is_still_a_match() -> None:
    f = bld("F", "p1", 30, 0, 58, 40, F_ERR)
    g = bld("G", "p2", 30, 0, 58, 40, G_ERR)
    assert rules.plate_outcome(f, plate([g], mapped=(0, -100, 60, 300))).kind == (
        rules.MATCH_CANDIDATE
    )


def test_not_covered_when_the_feature_misses_the_mapped_area() -> None:
    far = bld("F", "p1", 500, 500, 540, 540, F_ERR)
    assert rules.plate_outcome(far, plate([])).kind == rules.NOT_COVERED


def test_no_mapped_area_is_never_guessed() -> None:
    out = rules.plate_outcome(f40(), plate([], mapped=None))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.NO_MAPPED_AREA)


def test_clear_absence_inside_a_reviewed_area_with_nothing_near() -> None:
    assert rules.plate_outcome(f40(), plate([])).kind == rules.ABSENT


def test_a_far_building_is_not_a_candidate() -> None:
    far = bld("G", "p2", 100, 0, 140, 40, G_ERR)
    out = rules.plate_outcome(f40(), plate([far]))
    assert out.kind == rules.ABSENT and out.scores == ()


def test_a_neighbour_that_only_just_reaches_under_the_largest_shift_is_an_absence() -> None:
    reaches = bld("G", "p2", 47, 0, 87, 40, G_ERR)  # 7 m away: F shifted 7.75 m overlaps 0.75 m
    out = rules.plate_outcome(f40(), plate([reaches]))
    assert out.kind == rules.ABSENT
    assert out.scores[0][2] == pytest.approx(0.75 / 40)


def test_a_footprint_covering_a_tenth_of_f_under_a_shift_is_not_an_absence() -> None:
    near = bld("G", "p2", 38, 0, 78, 40, G_ERR)  # 2 m of overlap, 9.75 m with the shift
    out = rules.plate_outcome(f40(), plate([near]))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.PARTIAL_OVERLAP)


def test_no_absence_outside_the_reviewed_areas() -> None:
    out = rules.plate_outcome(f40(), plate([], reviewed=((500, 500, 600, 600),)))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.OUTSIDE_REVIEWED)
    out = rules.plate_outcome(f40(), plate([], reviewed=()))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.OUTSIDE_REVIEWED)


def test_no_absence_when_the_footprint_leaves_the_reviewed_area() -> None:
    out = rules.plate_outcome(f40(), plate([], reviewed=((0, 0, 35, 45),)))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.OUTSIDE_REVIEWED)
    assert rules.plate_outcome(f40(), plate([], reviewed=((0, 0, 40, 40),))).kind == rules.ABSENT


def test_the_footprint_must_lie_wholly_inside_one_reviewed_area() -> None:
    halves = ((-10, -10, 20, 50), (20, -10, 50, 50))  # together they hold F; neither does alone
    out = rules.plate_outcome(f40(), plate([], reviewed=halves))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.OUTSIDE_REVIEWED)


def test_a_footprint_with_no_area_is_never_matched_or_absent() -> None:
    flat = Building("F", "p1", box(0, 0, 0, 40), F_ERR)
    out = rules.plate_outcome(flat, plate([g40()]))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.TOO_SMALL)


def test_no_link_excludes_the_candidate_but_still_blocks_an_absence() -> None:
    out = rules.plate_outcome(f40(), plate([g40()]), no_link={"G"})
    assert (out.kind, out.reason) == (rules.REVIEW, rules.OVERLAPS_RULED_OUT)


# --- with a registration -------------------------------------------------------------------------


def test_a_registration_brings_the_other_plate_into_the_frame() -> None:
    # Plate p2 is drawn 30 m east of where p1 draws the same ground: T_BA moves it back.
    to_a = LocalAffine(1.0, 0.0, 0.0, 1.0, (30.0, 0.0), (0.0, 0.0))
    reg = PairRegistration("p1", "p2", 1.0, to_a)
    g = bld("G", "p2", 30, 0, 70, 40, G_ERR)
    assert rules.plate_outcome(f40(), plate([g])).kind == rules.REVIEW  # as drawn: no overlap
    out = rules.plate_outcome(f40(), plate([g]), registration=reg)
    assert out.kind == rules.MATCH_CANDIDATE
    assert out.scores[0][1] == pytest.approx(1.0)


def test_both_sides_of_a_pair_see_the_same_scores_through_a_registration() -> None:
    # Same registration, the roles swapped: F on p2 against plate p1.
    to_a = LocalAffine(1.0, 0.0, 0.0, 1.0, (30.0, 0.0), (0.0, 0.0))
    reg = PairRegistration("p1", "p2", 1.0, to_a)
    f_on_p1 = bld("F", "p1", 0, 0, 40, 40, F_ERR)
    g_on_p2 = bld("G", "p2", 33, 0, 73, 40, G_ERR)
    p1 = Plate("p1", box(-100, -100, 300, 300), (box(-50, -50, 250, 250),), (f_on_p1,))
    p2 = Plate("p2", box(-100, -100, 300, 300), (box(-50, -50, 250, 250),), (g_on_p2,))
    forward = rules.plate_outcome(f_on_p1, p2, registration=reg)
    back = rules.plate_outcome(g_on_p2, p1, registration=reg)
    assert forward.scores[0][1] == back.scores[0][1]
    assert forward.other == "G" and back.other == "F"


def test_the_xfail_counterexample_of_session_025_never_becomes_an_absence() -> None:
    """F = (0,0)-(7,7), G = (0,4)-(7,11). Under the shrink-to-core rule a pairwise error of 1.0 m
    gave review and 2.5 m gave a clear absence, because the larger error shrank F's core until G no
    longer touched it. Under the shift rule G covers 43 per cent of F at zero shift and a larger
    error only adds shifts, so G is a match candidate at both errors (F shifted by about 2 m scores
    0.57, by about 3 m scores 0.77) and the scores do not fall."""
    f = Building("F", "p1", box(0, 0, 7, 7), 4.5, 4.3)
    g = Building("G", "p2", box(0, 4, 7, 11), 3.3, 3.1)
    p = Plate("p2", box(-100, -100, 300, 300), (box(-50, -50, 250, 250),), (g,))
    outcomes = [
        rules.plate_outcome(f, p, registration=PairRegistration("p1", "p2", pairwise, IDENTITY))
        for pairwise in (1.0, 2.5)
    ]
    assert [o.kind for o in outcomes] == [rules.MATCH_CANDIDATE, rules.MATCH_CANDIDATE]
    assert outcomes[0].scores[0][1] <= outcomes[1].scores[0][1]
    assert outcomes[0].scores[0][2] <= outcomes[1].scores[0][2]
    assert outcomes[0].scores[0][2] >= 3 * 7 / 49 - 1e-9


# --- the aerial and mutual rules -----------------------------------------------------------------


def test_aerial_outcome_is_not_covered_or_pending_never_a_presence() -> None:
    footprint = box(0, 0, 100, 100)
    assert rules.aerial_outcome(box(200, 200, 210, 210), footprint).kind == rules.NOT_COVERED
    assert rules.aerial_outcome(box(50, 50, 60, 60), footprint).kind == rules.PENDING
    assert rules.aerial_outcome(box(90, 90, 120, 120), footprint).kind == rules.PENDING


def cand(other: str, best: str | None = None) -> Outcome:
    return Outcome(rules.MATCH_CANDIDATE, other=other, best=best or other)


def test_mutual_matches_need_f_to_be_gs_best_candidate() -> None:
    source_of = {"F": "p1", "G": "p2", "H": "p2"}
    # G's best is F, even though G itself had a competitor and so was no candidate: still mutual.
    outcomes = {
        ("F", "p2"): cand("G"),
        ("G", "p1"): Outcome(rules.REVIEW, reason=rules.COMPETING, best="F"),
    }
    pairs, demoted = rules.mutual_matches(outcomes, source_of)
    assert pairs == {("F", "G")} and demoted == {}

    outcomes = {("F", "p2"): cand("G"), ("G", "p1"): Outcome(rules.REVIEW, reason="x")}
    pairs, demoted = rules.mutual_matches(outcomes, source_of)
    assert pairs == set()
    assert demoted[("F", "p2")].reason == rules.NOT_MUTUAL

    outcomes = {("F", "p2"): cand("G"), ("G", "p1"): cand("H")}
    pairs, demoted = rules.mutual_matches(outcomes, source_of)
    assert pairs == set() and ("F", "p2") in demoted
