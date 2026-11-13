from __future__ import annotations

import pytest
from shapely.geometry import box

from buried_pipeline.match import rules
from buried_pipeline.match.rules import Building, Outcome, Plate

F_ERR, G_ERR, MIN_ERR = 4.5, 3.3, 3.3  # e = 7.8 m between F and G


def bld(bid: str, source: str, x0: float, y0: float, x1: float, y1: float, err: float) -> Building:
    return Building(bid, source, box(x0, y0, x1, y1), err)


def f40(x0: float = 0.0) -> Building:
    return bld("F", "p1", x0, 0, x0 + 40, 40, F_ERR)


def g40(gid: str = "G", x0: float = 0.0) -> Building:
    return bld(gid, "p2", x0, 0, x0 + 40, 40, G_ERR)


def plate(
    buildings: list[Building],
    mapped: tuple[float, ...] | None = (-100, -100, 300, 300),
    reviewed: tuple[float, ...] | None = (-50, -50, 250, 250),
) -> Plate:
    return Plate(
        source="p2",
        mapped_area=box(*mapped) if mapped else None,
        reviewed_area=box(*reviewed) if reviewed else None,
        buildings=tuple(buildings),
        min_error_m=MIN_ERR,
    )


def test_thresholds_are_the_designs() -> None:
    assert rules.MATCH_MIN == 0.5
    assert rules.COMPETE_MIN == 0.1


def test_shrink_and_grow_are_inward_and_outward_buffers() -> None:
    sq = box(0, 0, 10, 10)
    assert rules.shrink(sq, 2).bounds == pytest.approx((2, 2, 8, 8))
    assert rules.grow(sq, 2).bounds == pytest.approx((-2, -2, 12, 12))
    assert rules.shrink(sq, 6).is_empty


def test_overlap_score_identical_shifted_and_too_small() -> None:
    assert rules.overlap_score(box(0, 0, 40, 40), box(0, 0, 40, 40), 7.8) == pytest.approx(1.0)
    # The shrunk core is 24.4 m wide; a 25 m shift leaves 7.2 m of it inside the other box.
    shifted = rules.overlap_score(box(0, 0, 40, 40), box(25, 0, 65, 40), 7.8)
    assert shifted == pytest.approx(7.2 / 24.4, abs=1e-3)
    assert rules.overlap_score(box(0, 0, 10, 10), box(0, 0, 10, 10), 7.8) is None


def test_overlap_score_is_symmetric() -> None:
    a, b = box(0, 0, 40, 40), box(10, 5, 60, 45)
    assert rules.overlap_score(a, b, 6.0) == rules.overlap_score(b, a, 6.0)


def test_identical_footprints_are_a_match_candidate() -> None:
    out = rules.plate_outcome(f40(), plate([g40()]))
    assert out.kind == rules.MATCH_CANDIDATE and out.other == "G"
    assert out.scores == (("G", pytest.approx(1.0)),)


def test_small_shift_still_matches() -> None:
    assert rules.plate_outcome(f40(), plate([g40(x0=5)])).kind == rules.MATCH_CANDIDATE


def test_partial_overlap_goes_to_review() -> None:
    out = rules.plate_outcome(f40(), plate([g40(x0=25)]))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.PARTIAL_OVERLAP)


def test_two_strong_candidates_compete() -> None:
    out = rules.plate_outcome(f40(), plate([g40("G1"), g40("G2")]))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.COMPETING)


def test_a_second_footprint_with_a_tenth_of_the_core_competes() -> None:
    other = bld("H", "p2", 25, 0, 65, 40, G_ERR)  # r about 0.3
    out = rules.plate_outcome(f40(), plate([g40(), other]))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.COMPETING)


def test_a_second_footprint_below_a_tenth_does_not_compete() -> None:
    sliver = bld("H", "p2", 32.0, 0, 70, 40, G_ERR)  # core ends at 32.2: r about 0.008
    out = rules.plate_outcome(f40(), plate([g40(), sliver]))
    assert out.kind == rules.MATCH_CANDIDATE and out.other == "G"


def test_too_small_for_its_error_goes_to_review() -> None:
    tiny = bld("F", "p1", 0, 0, 10, 10, F_ERR)
    out = rules.plate_outcome(tiny, plate([bld("G", "p2", 0, 0, 10, 10, G_ERR)]))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.TOO_SMALL)


def test_a_match_near_the_plate_edge_goes_to_review() -> None:
    f = bld("F", "p1", 30, 0, 58, 40, F_ERR)
    g = bld("G", "p2", 30, 0, 58, 40, G_ERR)
    out = rules.plate_outcome(f, plate([g], mapped=(0, -100, 60, 300)))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.PLATE_EDGE)


def test_not_covered_when_the_feature_misses_the_mapped_area() -> None:
    far = bld("F", "p1", 500, 500, 540, 540, F_ERR)
    assert rules.plate_outcome(far, plate([])).kind == rules.NOT_COVERED


def test_no_mapped_area_is_never_guessed() -> None:
    out = rules.plate_outcome(f40(), plate([], mapped=None))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.NO_MAPPED_AREA)


def test_clear_absence_inside_a_reviewed_area_with_an_empty_core() -> None:
    assert rules.plate_outcome(f40(), plate([])).kind == rules.ABSENT


def test_a_far_building_does_not_touch_the_core() -> None:
    far = bld("G", "p2", 100, 0, 140, 40, G_ERR)
    assert rules.plate_outcome(f40(), plate([far])).kind == rules.ABSENT


def test_an_edge_sliver_outside_the_core_is_still_an_absence() -> None:
    near = bld("G", "p2", 38, 0, 78, 40, G_ERR)  # overlaps F but not its certain core
    assert rules.plate_outcome(f40(), plate([near])).kind == rules.ABSENT


def test_no_absence_outside_the_reviewed_areas() -> None:
    out = rules.plate_outcome(f40(), plate([], reviewed=(500, 500, 600, 600)))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.OUTSIDE_REVIEWED)
    out = rules.plate_outcome(f40(), plate([], reviewed=None))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.OUTSIDE_REVIEWED)


def test_no_absence_when_the_grown_footprint_leaves_the_reviewed_area() -> None:
    out = rules.plate_outcome(f40(), plate([], reviewed=(0, 0, 45, 45)))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.OUTSIDE_REVIEWED)


def test_no_absence_for_a_footprint_too_small_to_shrink() -> None:
    tiny = bld("F", "p1", 0, 0, 10, 10, F_ERR)
    out = rules.plate_outcome(tiny, plate([]))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.TOO_SMALL)


def test_a_sliver_into_the_core_is_not_an_absence() -> None:
    cuts = bld("G", "p2", 31.2, 0, 80, 40, G_ERR)  # 1 m into the 24.4 m core: r about 0.04
    out = rules.plate_outcome(f40(), plate([cuts]))
    assert (out.kind, out.reason) == (rules.REVIEW, rules.OVERLAPS_CORE)


def test_no_link_excludes_the_candidate_but_still_blocks_an_absence() -> None:
    out = rules.plate_outcome(f40(), plate([g40()]), no_link={"G"})
    assert (out.kind, out.reason) == (rules.REVIEW, rules.OVERLAPS_CORE)


def test_aerial_outcome_is_not_covered_or_pending_never_a_presence() -> None:
    footprint = box(0, 0, 100, 100)
    assert rules.aerial_outcome(box(200, 200, 210, 210), footprint).kind == rules.NOT_COVERED
    assert rules.aerial_outcome(box(50, 50, 60, 60), footprint).kind == rules.PENDING
    assert rules.aerial_outcome(box(90, 90, 120, 120), footprint).kind == rules.PENDING


def cand(other: str) -> Outcome:
    return Outcome(rules.MATCH_CANDIDATE, other=other)


def test_mutual_matches_need_both_sides() -> None:
    source_of = {"F": "p1", "G": "p2", "H": "p2"}
    outcomes = {("F", "p2"): cand("G"), ("G", "p1"): cand("F")}
    pairs, demoted = rules.mutual_matches(outcomes, source_of)
    assert pairs == {("F", "G")} and demoted == {}

    outcomes = {("F", "p2"): cand("G"), ("G", "p1"): Outcome(rules.REVIEW, reason="x")}
    pairs, demoted = rules.mutual_matches(outcomes, source_of)
    assert pairs == set()
    assert demoted[("F", "p2")].reason == rules.NOT_MUTUAL

    outcomes = {("F", "p2"): cand("G"), ("G", "p1"): cand("H")}
    pairs, demoted = rules.mutual_matches(outcomes, source_of)
    assert pairs == set() and ("F", "p2") in demoted
