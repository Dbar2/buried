"""How `match` uses the pairwise alignment error (spec 02 requirement 13.15)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from shapely.geometry import box

from buried_pipeline.fetch.manifest import sha256_file
from buried_pipeline.match import rules
from buried_pipeline.match.rules import Building, Plate
from buried_pipeline.match.run import pairwise_figures
from buried_pipeline.paths import Paths
from tests.match.conftest import read_json_file

ALIGN_F, ALIGN_G = 4.3, 3.1


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


def test_a_footprint_that_the_sum_erases_can_match_with_the_pairwise_figure() -> None:
    f = bld("F", "p1", (0, 0, 12, 12), 4.5, ALIGN_F)
    g = bld("G", "p2", (1, 0, 13, 12), 3.3, ALIGN_G)
    plate = Plate("p2", box(-100, -100, 300, 300), box(-50, -50, 250, 250), (g,), 3.3, 1.0)
    assert rules.plate_outcome(f, plate).kind == rules.REVIEW  # too small for 7.8 m
    assert rules.plate_outcome(f, plate, pairwise_m=1.0).kind == rules.MATCH_CANDIDATE


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


# --- a larger error never produces more matches or absences --------------------------------------

rect = st.tuples(
    st.integers(0, 40), st.integers(0, 40), st.integers(6, 60), st.integers(6, 60)
).map(lambda t: (float(t[0]), float(t[1]), float(t[0] + t[2]), float(t[1] + t[3])))


@given(
    f_rect=rect,
    g_rects=st.lists(rect, min_size=0, max_size=3),
    small=st.integers(10, 60).map(lambda v: v / 10),
    extra=st.integers(0, 60).map(lambda v: v / 10),
    reviewed=st.sampled_from([(-50, -50, 250, 250), (0, 0, 80, 80)]),
)
@settings(max_examples=400, deadline=None)
@pytest.mark.xfail(
    strict=True,
    reason=(
        "FALSE for the rules of requirements 13.2 and 13.4 as written (session 025, reported to the "
        "maintainer). Counterexample: F = (0,0)-(7,7), G = (0,4)-(7,11), reviewed area wide, "
        "pairwise 1.0 m gives review (G overlaps F's core), 2.5 m gives a clear absence, because "
        "the larger error shrinks F's core until G no longer touches it. A match can also appear "
        "at a larger error: r is measured on the shrunk core, so a shift smaller than the "
        "shrink scores 1.0. Needs a decision on the rule, not a change to this test."
    ),
)
def test_a_larger_pairwise_error_never_gives_more_matches_or_absences(
    f_rect: tuple[float, float, float, float],
    g_rects: list[tuple[float, float, float, float]],
    small: float,
    extra: float,
    reviewed: tuple[float, float, float, float],
) -> None:
    f = bld("F", "p1", f_rect, 4.5, ALIGN_F)
    gs = tuple(bld(f"G{i}", "p2", r, 3.3, ALIGN_G) for i, r in enumerate(g_rects))
    plate = Plate("p2", box(-100, -100, 300, 300), box(*reviewed), gs, 3.3, 1.0)
    low = rules.plate_outcome(f, plate, pairwise_m=small).kind
    high = rules.plate_outcome(f, plate, pairwise_m=small + extra).kind
    rank = {rules.MATCH_CANDIDATE: 1, rules.ABSENT: 1}
    assert rank.get(high, 0) <= rank.get(low, 0)
