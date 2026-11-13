from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import pytest
from shapely.geometry import box

from buried_pipeline.cli import main
from buried_pipeline.errors import PipelineError
from buried_pipeline.io.registry import load_registry
from buried_pipeline.match.apply import Decisions
from buried_pipeline.match.compute import AerialInfo, MatchInputs, compute_match
from buried_pipeline.match.run import plate_min_error, run_match
from buried_pipeline.paths import Paths
from buried_pipeline.validate.run import validate_would_be
from tests.helpers.synthetic_evidence import (
    EAST0,
    NORTH0,
    P1911,
    P1911B,
    P1935,
    building,
    evidence_doc,
    person_observation,
)
from tests.match.conftest import read_json_file, write_evidence

NOW = datetime(2026, 11, 20, 12, 0, 0, tzinfo=UTC)
F1 = f"bld_{P1911}_0001"
G1 = f"bld_{P1935}_0001"
F2 = f"bld_{P1911}_0002"
AERIAL = "aerial_1947_s0012_fl1947_it0018h"
BY = {"confirmed_by": "A. Person", "confirmed_at": "2026-11-19T10:00:00-05:00"}


def run(paths: Paths, **kwargs: Any) -> tuple[list[str], Any]:
    lines: list[str] = []
    result = run_match(
        paths, load_registry(paths.sources_json), NOW, out=lines.append, **kwargs
    )
    return lines, result


def feature_of(paths: Paths, source: str, fid: str) -> dict[str, Any]:
    doc = read_json_file(paths.evidence_file(source))
    return next(f for f in doc["features"] if f["id"] == fid)["properties"]


def test_plate_min_error_matches_the_design_formula() -> None:
    # sqrt(3.1^2 + max(1.0, 2 x 0.1225)^2) = 3.257 -> 3.3
    assert plate_min_error({"alignment_error_m": 3.1, "source_pixel_size_m": 0.1225}) == 3.3
    # Two source pixels above 1.0 m take over: sqrt(3.1^2 + 1.2^2) = 3.324 -> 3.4
    assert plate_min_error({"alignment_error_m": 3.1, "source_pixel_size_m": 0.6}) == 3.4


def test_a_match_is_written_validated_and_stable(match_root: Paths) -> None:
    write_evidence(match_root, evidence_doc(P1911, [building(P1911, 1, 0, 0, 40, 40)]))
    write_evidence(
        match_root, evidence_doc(P1935, [building(P1935, 1, 2, 2, 42, 42)])
    )
    lines, _ = run(match_root)

    f = feature_of(match_root, P1911, F1)
    g = feature_of(match_root, P1935, G1)
    assert f["same_as"] == [{"feature": G1, "method": "match_auto"}]
    assert g["same_as"] == [{"feature": F1, "method": "match_auto"}]
    assert f["observations"][1] == {
        "source": P1935, "present": True, "visibility": "clear", "method": "match_auto",
        "matched_feature": G1,
    }  # fmt: skip
    assert g["observations"][1]["matched_feature"] == F1
    assert validate_would_be(match_root, {}, NOW) == []
    assert any("matched 1" in line for line in lines)

    before = {p: p.read_bytes() for p in (match_root.data / "evidence").glob("*.geojson")}
    lines, _ = run(match_root)
    assert {p: p.read_bytes() for p in before} == before  # byte-identical
    assert "no evidence file changed" in lines


def test_a_clear_absence_is_written(match_root: Paths) -> None:
    write_evidence(match_root, evidence_doc(P1911, [building(P1911, 1, 0, 0, 40, 40)]))
    write_evidence(match_root, evidence_doc(P1935, [], reviewed=[(-50, -50, 250, 250)]))
    run(match_root)
    f = feature_of(match_root, P1911, F1)
    assert f["observations"][1] == {
        "source": P1935, "present": False, "visibility": "clear", "method": "match_auto"
    }  # fmt: skip
    assert "same_as" not in f
    assert validate_would_be(match_root, {}, NOW) == []


def test_not_covered_is_written_when_the_feature_misses_the_mapped_area(
    match_root: Paths,
) -> None:
    write_evidence(match_root, evidence_doc(P1911, [building(P1911, 1, 0, 0, 40, 40)]))
    write_evidence(match_root, evidence_doc(P1935, [], mapped=(500, 500, 600, 600)))
    run(match_root)
    obs = feature_of(match_root, P1911, F1)["observations"][1]
    assert (obs["present"], obs["visibility"], obs["method"]) == (False, "not_covered", "match_auto")


def test_review_cases_write_no_observation_and_land_on_the_list(match_root: Paths) -> None:
    write_evidence(match_root, evidence_doc(P1911, [building(P1911, 1, 0, 0, 40, 40)]))
    # Shifted 25 m: partial overlap.
    write_evidence(match_root, evidence_doc(P1935, [building(P1935, 1, 25, 0, 65, 40)]))
    before = {p: p.read_bytes() for p in (match_root.data / "evidence").glob("*.geojson")}
    lines, result = run(match_root)
    assert {p: p.read_bytes() for p in before} == before
    review = read_json_file(match_root.match_review)["review"]
    assert [(r["type"], r["feature"], r["plate"], r["reason"]) for r in review] == [
        ("plate", F1, P1935, "partial_overlap"),
        ("plate", G1, P1911, "partial_overlap"),
    ]
    assert review[0]["candidates"] == [{"feature": G1, "r": pytest.approx(0.2951, abs=1e-3)}]
    assert any("sent to review 1" in line for line in lines)
    assert result.review == review


def test_a_decision_without_who_is_refused_and_nothing_is_written(match_root: Paths) -> None:
    write_evidence(match_root, evidence_doc(P1911, [building(P1911, 1, 0, 0, 40, 40)]))
    write_evidence(match_root, evidence_doc(P1935, [building(P1935, 1, 0, 0, 40, 40)]))
    decisions = match_root.match_decisions
    decisions.parent.mkdir(parents=True)
    decisions.write_text(
        json.dumps({"decisions": [{"type": "link", "features": [F1, G1]}]}), encoding="utf-8"
    )
    before = {p: p.read_bytes() for p in (match_root.data / "evidence").glob("*.geojson")}
    with pytest.raises(PipelineError, match="confirmed_by"):
        run(match_root)
    assert {p: p.read_bytes() for p in before} == before
    assert not match_root.match_review.exists()


def test_a_person_link_is_written_and_kept(match_root: Paths) -> None:
    write_evidence(match_root, evidence_doc(P1911, [building(P1911, 1, 0, 0, 40, 40)]))
    # Far from F, so match would never link them: only the person does.
    write_evidence(match_root, evidence_doc(P1935, [building(P1935, 1, 100, 100, 140, 140)]))
    decisions = match_root.match_decisions
    decisions.parent.mkdir(parents=True)
    decisions.write_text(
        json.dumps({"decisions": [{"type": "link", "features": [F1, G1], **BY}]}),
        encoding="utf-8",
    )
    run(match_root)
    f = feature_of(match_root, P1911, F1)
    assert f["same_as"] == [{"feature": G1, "method": "person", **BY}]
    assert f["observations"][1]["method"] == "person"
    assert validate_would_be(match_root, {}, NOW) == []
    # The decisions file may go (it lives in gitignored data/work/): the person's work stays.
    decisions.unlink()
    run(match_root)
    assert feature_of(match_root, P1911, F1)["same_as"][0]["method"] == "person"


def test_a_person_observation_blocks_the_automatic_one(match_root: Paths) -> None:
    f = building(P1911, 1, 0, 0, 40, 40, observations=[person_observation(P1935, False, "obscured")])
    write_evidence(match_root, evidence_doc(P1911, [f]))
    write_evidence(match_root, evidence_doc(P1935, [building(P1935, 1, 0, 0, 40, 40)]))
    run(match_root)
    props = feature_of(match_root, P1911, F1)
    assert [o["method"] for o in props["observations"]] == ["origin", "person"]
    assert "same_as" not in props
    assert "same_as" not in feature_of(match_root, P1935, G1)


def test_a_validation_failure_writes_nothing(match_root: Paths) -> None:
    # A position error below the root-sum-square of the alignment and digitising errors is
    # invalid, so any change to the state is refused.
    write_evidence(
        match_root, evidence_doc(P1911, [building(P1911, 1, 0, 0, 40, 40, error_m=1.0)])
    )
    write_evidence(match_root, evidence_doc(P1935, [], reviewed=[(-50, -50, 250, 250)]))
    before = {p: p.read_bytes() for p in (match_root.data / "evidence").glob("*.geojson")}
    with pytest.raises(PipelineError, match="nothing was written"):
        run(match_root)
    assert {p: p.read_bytes() for p in before} == before


def test_aerials_without_a_record_are_skipped_and_named(match_root: Paths) -> None:
    write_evidence(match_root, evidence_doc(P1911, [building(P1911, 1, 0, 0, 40, 40)]))
    lines, _ = run(match_root)
    assert f"{AERIAL}: skipped, no alignment record (requirement 13.1)" in lines


def test_the_cli_prints_counts_per_pair(
    match_root: Paths, capsys: pytest.CaptureFixture[str]
) -> None:
    write_evidence(match_root, evidence_doc(P1911, [building(P1911, 1, 0, 0, 40, 40)]))
    write_evidence(match_root, evidence_doc(P1935, [building(P1935, 1, 0, 0, 40, 40)]))
    assert main(["--root", str(match_root.root), "match"], now=lambda: NOW) == 0
    out = capsys.readouterr().out
    assert f"{P1911} -> {P1935}: matched 1, absent 0, not covered 0, sent to review 0" in out
    assert "items on the review list" in out


# --- aerials, on the pure function (the Registry has no tiled aerial yet) ----------------------


def aerial_inputs(footprint: Any) -> MatchInputs:
    near = building(P1911, 1, 0, 0, 40, 40)
    far = building(P1911, 2, 150, 150, 190, 190)
    return MatchInputs(
        docs={
            P1911: evidence_doc(P1911, [near, far]),
            P1935: evidence_doc(P1935, [building(P1935, 1, 0, 0, 40, 40)]),
        },
        plate_sources=frozenset({P1911, P1935}),
        min_error_m={P1911: 4.5, P1935: 3.3},
        aerials={AERIAL: AerialInfo(AERIAL, footprint, f"{AERIAL}.jpg")},
        year_to={P1911: 1914, P1935: 1935, AERIAL: 1947},
        decisions=Decisions(),
    )


def test_aerials_get_not_covered_or_a_pending_item_never_a_presence() -> None:
    footprint = box(EAST0 - 10, NORTH0 - 10, EAST0 + 100, NORTH0 + 100)
    result = compute_match(aerial_inputs(footprint))
    far = next(f for f in result.docs[P1911]["features"] if f["id"].endswith("0002"))
    assert far["properties"]["observations"][-1] == {
        "source": AERIAL, "present": False, "visibility": "not_covered", "method": "match_auto"
    }  # fmt: skip
    near = next(f for f in result.docs[P1911]["features"] if f["id"].endswith("0001"))
    assert all(o["source"] != AERIAL for o in near["properties"]["observations"])
    pending = [r for r in result.review if r["type"] == "aerial_pending"]
    # F (1911) and G (1935) are linked, so each is shown on the member from the latest source.
    assert {(r["feature"], r["show_feature"]) for r in pending} == {(F1, G1), (G1, G1)}
    assert all(r["tile"] == f"{AERIAL}.jpg" for r in pending)
    assert result.counts[(P1911, AERIAL)].pending == 1
    assert result.counts[(P1911, AERIAL)].not_covered == 1


def test_a_chain_across_three_plates_that_would_hold_two_1911_229_features_is_refused() -> None:
    """F1 ~ G ~ H ~ F2: each neighbouring pair matches, but the set would hold two features from
    fip_v3_1911_229, which is a merge and not a link (requirement 13.6)."""
    wide = (-100.0, -100.0, 500.0, 300.0)
    docs = {
        P1911: evidence_doc(
            P1911,
            [building(P1911, 1, 0, 0, 100, 100), building(P1911, 2, 138, 0, 238, 100)],
            mapped=wide, reviewed=[wide],
        ),
        P1935: evidence_doc(
            P1935, [building(P1935, 1, 46, 0, 146, 100)], mapped=wide, reviewed=[wide]
        ),
        P1911B: evidence_doc(
            P1911B, [building("fip_v3_1911_232", 1, 92, 0, 192, 100)], mapped=wide, reviewed=[wide]
        ),
    }  # fmt: skip
    result = compute_match(
        MatchInputs(
            docs=docs,
            plate_sources=frozenset(docs),
            min_error_m={P1911: 4.5, P1935: 3.3, P1911B: 4.5},
            aerials={},
            year_to={P1911: 1914, P1935: 1935, P1911B: 1914},
        )
    )
    clashes = [r for r in result.review if r["type"] == "link_clash"]
    h = "bld_fip_v3_1911_232_0001"
    assert sorted(r["features"] for r in clashes) == sorted([[F1, G1], [h, G1], [F2, h]])
    assert all(r["sources"] == [P1911] for r in clashes)
    for doc in result.docs.values():
        for f in doc["features"]:
            assert "same_as" not in f["properties"]
            assert not any(
                o["method"] == "match_auto" and o["present"] for o in f["properties"]["observations"]
            )
