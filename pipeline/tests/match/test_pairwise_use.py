"""How `match` uses the pairwise alignment error (spec 02 requirement 13.15)."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from hypothesis import assume, given, settings
from hypothesis import strategies as st
from shapely.geometry import box

from buried_pipeline.align.affine import LocalAffine
from buried_pipeline.fetch.manifest import sha256_file
from buried_pipeline.match import rules
from buried_pipeline.match.rules import Building, PairRegistration, Plate
from buried_pipeline.match.run import pairwise_figures
from buried_pipeline.paths import Paths
from tests.match.conftest import read_json_file

ALIGN_F, ALIGN_G = 4.3, 3.1
IDENTITY = LocalAffine(1.0, 0.0, 0.0, 1.0, (0.0, 0.0), (0.0, 0.0))


def bld(bid: str, source: str, rect: tuple[float, float, float, float], err: float, al: float) -> Building:
    return Building(bid, source, box(*rect), err, al)


def test_without_a_pairwise_figure_e_is_the_sum_of_the_position_errors() -> None:
    f = bld("F", "p1", (0, 0, 40, 40), 4.5, ALIGN_F)
    g = bld("G", "p2", (0, 0, 40, 40), 3.3, ALIGN_G)
    assert rules.pair_error(f, g, None) == pytest.approx(7.8)


def test_with_one_e_is_the_pairwise_figure_and_both_own_terms() -> None:
    f = bld("F", "p1", (0, 0, 40, 40), 4.5, ALIGN_F)
    g = bld("G", "p2", (0, 0, 40, 40), 3.3, ALIGN_G)
    e = rules.pair_error(f, g, 3.3)
    assert e < 7.8
    # sqrt(3.3^2 + (own F)^2 + (own G)^2), rounded up to 0.1 m
    fo, go = rules.own_term_m(f), rules.own_term_m(g)
    assert fo is not None and go is not None
    assert e >= (3.3**2 + fo**2 + go**2) ** 0.5 - 1e-9
    assert e < (3.3**2 + fo**2 + go**2) ** 0.5 + 0.1 + 1e-9


def test_a_building_with_no_known_alignment_error_falls_back_to_the_sum() -> None:
    f = Building("F", "p1", box(0, 0, 40, 40), 4.5)
    g = bld("G", "p2", (0, 0, 40, 40), 3.3, ALIGN_G)
    assert rules.pair_error(f, g, 3.3) == pytest.approx(7.8)


def test_a_tighter_pairwise_error_rejects_a_match_the_sum_of_errors_would_make() -> None:
    f = bld("F", "p1", (0, 0, 12, 12), 4.5, ALIGN_F)
    g = bld("G", "p2", (8, 0, 20, 12), 3.3, ALIGN_G)
    plate = Plate("p2", box(-100, -100, 300, 300), (box(-50, -50, 250, 250),), (g,))
    # As drawn, e is 7.8 m and a shift of 8 m would bring them together.
    assert rules.plate_outcome(f, plate).kind == rules.MATCH_CANDIDATE
    # Registered to within about 2 m, the 8 m gap is a different footprint.
    reg = PairRegistration("p1", "p2", 1.0, IDENTITY)
    out = rules.plate_outcome(f, plate, registration=reg)
    assert (out.kind, out.reason) == (rules.REVIEW, rules.PARTIAL_OVERLAP)
    assert rules.pair_error(f, g, 1.0) < 3.0


# --- the figure is only used with four shared references -----------------------------------------


def write_plate(root: Path, source: str, shared: int, own: int, dx: float) -> dict:
    """A control file and the alignment record that goes with it: `shared` points cite references
    that the other plate also cites, `own` cite references only this plate cites."""
    points = []
    residuals = []
    for i in range(shared + own):
        ref = f"{1000 + i}" if i < shared else f"{source}_{i}"
        points.append(
            {
                "id": f"cp_{ref}",
                "description": "synthetic",
                "pixel": [100 + 10 * i, 100 + 7 * i],
                "reference": [632000.0 + i, 4835000.0 + 2 * i],
                "reference_source": "present_toronto_intersections_2026",
                "reference_kind": "intersection",
                "reference_feature_id": ref,
            }
        )
        residuals.append({"id": f"cp_{ref}", "dx_m": dx + 0.1 * i, "dy_m": -dx, "r_m": 1.0})
    control = root / "data" / "control" / f"{source}.json"
    control.parent.mkdir(parents=True, exist_ok=True)
    control.write_text(json.dumps({"source": source, "points": points}), encoding="utf-8")
    return {
        "chosen": "supplied",
        "control_sha256": sha256_file(control),
        "supplied": {"residuals": residuals},
    }


@pytest.mark.parametrize(("shared", "used"), [(0, False), (3, False), (4, True), (6, True)])
def test_the_figure_is_used_only_with_four_shared_references(
    tmp_path: Path, shared: int, used: bool
) -> None:
    paths = Paths(tmp_path)
    records = {
        "p1": write_plate(tmp_path, "p1", shared, 2, 0.5),
        "p2": write_plate(tmp_path, "p2", shared, 2, -0.5),
    }
    lines: list[str] = []
    figures, rows = pairwise_figures(paths, records, lines.append)
    assert (("p1", "p2") in figures) is used
    assert rows[0]["used"] is used
    if used:
        assert figures[("p1", "p2")].source_a == "p1" and figures[("p1", "p2")].source_b == "p2"
        assert rows[0]["pairwise_error_m"] == figures[("p1", "p2")].pairwise_m


def test_a_control_file_that_changed_since_its_record_takes_no_part(tmp_path: Path) -> None:
    paths = Paths(tmp_path)
    records = {
        "p1": write_plate(tmp_path, "p1", 6, 0, 0.5),
        "p2": write_plate(tmp_path, "p2", 6, 0, -0.5),
    }
    records["p2"]["control_sha256"] = "0" * 64
    lines: list[str] = []
    figures, rows = pairwise_figures(paths, records, lines.append)
    assert figures == {}
    assert rows[0]["used"] is False
    assert any("changed since its alignment record" in line for line in lines)


def test_match_writes_the_figure_it_used(match_root: Paths) -> None:
    from datetime import UTC, datetime

    from buried_pipeline.io.registry import load_registry
    from buried_pipeline.match.run import run_match
    from tests.helpers.synthetic_evidence import P1911, P1935, building, evidence_doc
    from tests.match.conftest import write_evidence

    write_evidence(match_root, evidence_doc(P1911, [building(P1911, 1, 0, 0, 40, 40)]))
    write_evidence(match_root, evidence_doc(P1935, [building(P1935, 1, 0, 0, 40, 40)]))
    lines: list[str] = []
    run_match(
        match_root, load_registry(match_root.sources_json),
        datetime(2026, 11, 20, tzinfo=UTC), out=lines.append,
    )  # fmt: skip
    doc = read_json_file(match_root.match_pairwise)["pairwise"]
    assert len(doc) == 1 and doc[0]["used"] is True
    assert len(doc[0]["shared_references"]) == 6
    assert any(line.startswith("pairwise ") for line in lines)


# --- properties of the rule under a registration -------------------------------------------------

Rect = tuple[float, float, float, float]
rect = st.tuples(
    st.integers(0, 40), st.integers(0, 40), st.integers(6, 60), st.integers(6, 60)
).map(lambda t: (float(t[0]), float(t[1]), float(t[0] + t[2]), float(t[1] + t[3])))
WIDE = (-100.0, -100.0, 300.0, 300.0)
REVIEWED = (-50.0, -50.0, 250.0, 250.0)


def other_plate(gs: tuple[Building, ...], reviewed: Rect = REVIEWED) -> Plate:
    return Plate("p2", box(*WIDE), (box(*reviewed),), gs)


def at(pairwise_m: float) -> PairRegistration:
    return PairRegistration("p1", "p2", pairwise_m, IDENTITY)


@given(
    f_rect=rect,
    g_rects=st.lists(rect, min_size=0, max_size=3),
    small=st.integers(5, 60).map(lambda v: v / 10),
    extra=st.integers(0, 60).map(lambda v: v / 10),
    reviewed=st.sampled_from([REVIEWED, (0.0, 0.0, 80.0, 80.0)]),
)
@settings(max_examples=300, deadline=None)
def test_a_clear_absence_at_a_larger_error_is_one_at_a_smaller_error(
    f_rect: Rect, g_rects: list[Rect], small: float, extra: float, reviewed: Rect
) -> None:
    """The shrink-to-core rule failed this (session 025): a larger error shrank the core until a
    neighbour no longer touched it. Under the shift rule a larger error only adds shifts and
    candidates, so every score is at least as large, and an absence can only be lost."""
    f = bld("F", "p1", f_rect, 4.5, ALIGN_F)
    gs = tuple(bld(f"G{i}", "p2", r, 3.3, ALIGN_G) for i, r in enumerate(g_rects))
    plate = other_plate(gs, reviewed)
    low = rules.plate_outcome(f, plate, registration=at(small))
    high = rules.plate_outcome(f, plate, registration=at(small + extra))
    if high.kind == rules.ABSENT:
        assert low.kind == rules.ABSENT
    low_scores = {c: (r, cov) for c, r, cov in low.scores}
    for c, r, cov in high.scores:
        if c in low_scores:
            assert r >= low_scores[c][0] and cov >= low_scores[c][1]


@given(
    f_rect=rect,
    shift=st.tuples(st.integers(-3, 3), st.integers(-3, 3)),
    pairwise=st.integers(30, 80).map(lambda v: v / 10),
)
@settings(max_examples=200, deadline=None)
def test_a_copy_shifted_by_less_than_e_always_matches_when_nothing_else_is_near(
    f_rect: Rect, shift: tuple[int, int], pairwise: float
) -> None:
    f = bld("F", "p1", f_rect, 4.5, ALIGN_F)
    g_rect = (f_rect[0] + shift[0], f_rect[1] + shift[1], f_rect[2] + shift[0], f_rect[3] + shift[1])
    g = bld("G", "p2", g_rect, 3.3, ALIGN_G)
    e = rules.pair_error(f, g, pairwise)
    assume(math.hypot(*shift) < e)
    out = rules.plate_outcome(f, other_plate((g,)), registration=at(pairwise))
    assert out.kind == rules.MATCH_CANDIDATE and out.other == "G"
    assert out.scores[0][1] == pytest.approx(1.0)  # whole-metre shifts lie on the 0.25 m lattice


@given(
    f_rect=rect,
    g_size=st.tuples(st.integers(6, 60), st.integers(6, 60)),
    pairwise=st.integers(10, 80).map(lambda v: v / 10),
    direction=st.integers(0, 3),
)
@settings(max_examples=200, deadline=None)
def test_footprints_further_apart_than_e_never_match_and_give_an_absence(
    f_rect: Rect, g_size: tuple[int, int], pairwise: float, direction: int
) -> None:
    f = bld("F", "p1", f_rect, 4.5, ALIGN_F)
    e = rules.pair_error(f, bld("G", "p2", (0, 0, 1, 1), 3.3, ALIGN_G), pairwise)
    gap = e + 0.5
    w, h = g_size
    x0, y0, x1, y1 = f_rect
    g_rect = [
        (x1 + gap, y0, x1 + gap + w, y0 + h),
        (x0 - gap - w, y0, x0 - gap, y0 + h),
        (x0, y1 + gap, x0 + w, y1 + gap + h),
        (x0, y0 - gap - h, x0 + w, y0 - gap),
    ][direction]
    g = bld("G", "p2", g_rect, 3.3, ALIGN_G)
    out = rules.plate_outcome(f, other_plate((g,), (-300, -300, 400, 400)), registration=at(pairwise))
    assert out.kind == rules.ABSENT and out.scores == ()


@given(f_rect=rect, g_rects=st.lists(rect, min_size=1, max_size=3), pairwise=st.just(2.0))
@settings(max_examples=100, deadline=None)
def test_the_outcome_does_not_depend_on_the_order_of_the_other_plates_buildings(
    f_rect: Rect, g_rects: list[Rect], pairwise: float
) -> None:
    f = bld("F", "p1", f_rect, 4.5, ALIGN_F)
    gs = tuple(bld(f"G{i}", "p2", r, 3.3, ALIGN_G) for i, r in enumerate(g_rects))
    forward = rules.plate_outcome(f, other_plate(gs), registration=at(pairwise))
    backward = rules.plate_outcome(f, other_plate(gs[::-1]), registration=at(pairwise))
    assert forward == backward
