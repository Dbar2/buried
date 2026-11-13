from __future__ import annotations

import json
from pathlib import Path

import pytest

from buried_pipeline.mcp.store import BadRequest, EvidenceStore, NotFound
from tests.mcp.conftest import PLATE


def test_find_places_matches_every_word_and_lists_the_lots_around_the_point(repo: Path) -> None:
    out = EvidenceStore(repo).find_places("sumach 75")
    assert [a["address"] for a in out["addresses"]] == ["75 Sumach St"]
    assert out["addresses"][0]["lots_containing_the_point"] == ["L1"]
    assert out["address_matches"] == 1
    assert EvidenceStore(repo).find_places("nowhere")["addresses"] == []


def test_find_places_finds_a_lot_by_parcel_id(repo: Path) -> None:
    out = EvidenceStore(repo).find_places("L2")
    assert [lot["lot_id"] for lot in out["lots"]] == ["L2"]


def test_features_near_a_lot_lists_published_features_nearest_first(repo: Path) -> None:
    out = EvidenceStore(repo).features_near({"lot_id": "L1", "distance_m": 100})
    ids = [f["id"] for f in out["features"]]
    assert ids == [f"bld_{PLATE}_0001", f"bld_{PLATE}_0002"]  # the rejected one is left out
    first = out["features"][0]
    assert first["distance_m"] == 0.0
    assert first["position_error_m"] == 4.5
    assert first["confidence"] == "documented"
    assert first["confidence_reason"] == "Traced from the plate."
    assert first["source_ids"] == ["fip_v3_1911_229", "fip_v3_1935_229"]
    assert [o["visibility"] for o in first["observations"]] == ["clear", "not_covered"]
    assert out["features"][1]["distance_m"] == pytest.approx(40.0)
    assert "on this lot" not in json.dumps(out["features"])


def test_features_near_a_point_and_by_status_and_limit(repo: Path) -> None:
    store = EvidenceStore(repo)
    near = store.features_near({"easting": 632405.0, "northing": 4834905.0, "distance_m": 5})
    assert near["total"] == 1
    both = store.features_near(
        {"address_id": "a1", "distance_m": 100, "status": ["published", "rejected"], "limit": 2}
    )
    assert both["total"] == 3 and len(both["features"]) == 2
    assert both["place"]["address"] == "75 Sumach St"


@pytest.mark.parametrize(
    "args",
    [
        {},
        {"lot_id": "L1", "address_id": "a1"},
        {"easting": 1.0},
        {"lot_id": "L1", "distance_m": -1},
        {"lot_id": "L1", "distance_m": 10**6},
        {"lot_id": "L1", "status": "published"},
        {"lot_id": "L1", "limit": 0},
    ],
)
def test_features_near_refuses_bad_arguments(repo: Path, args: dict) -> None:
    with pytest.raises(BadRequest):
        EvidenceStore(repo).features_near(args)


def test_an_unknown_lot_is_not_found(repo: Path) -> None:
    with pytest.raises(NotFound):
        EvidenceStore(repo).features_near({"lot_id": "nope"})


def test_list_sources_carries_rights_and_attribution(repo: Path) -> None:
    store = EvidenceStore(repo)
    all_rows = store.list_sources()["sources"]
    assert [s["id"] for s in all_rows] == [PLATE, "fip_v3_1935_232"]
    one = store.list_sources(PLATE)["sources"][0]
    assert one["licence_note"] == "Out of copyright."
    assert one["attribution_line"] == "U of T."
    assert one["rights_checked_on"] == "2026-11-10"
    assert store.list_sources(source_type="aerial_photograph")["sources"] == []
    with pytest.raises(NotFound):
        store.list_sources("fip_v3_9999_1")
    with pytest.raises(BadRequest):
        store.list_sources("../etc/passwd")


def test_alignment_reports_the_record_and_the_hull(repo: Path) -> None:
    out = EvidenceStore(repo).alignment(PLATE)
    assert out["record"]["alignment_error_m"] == 4.3
    assert out["control_hull_area_m2"] == 1.5
    assert out["control_points"][0]["reference_feature_id"] == "1"
    with pytest.raises(NotFound):
        EvidenceStore(repo).alignment("fip_v3_1935_229")


def test_plate_work_summarises_proposals_and_decisions(repo: Path) -> None:
    out = EvidenceStore(repo).plate_work(PLATE)
    assert out["proposals"]["count"] == 3
    assert out["proposals"]["tone_classes"] == {"dark": 1, "light": 2}
    assert out["proposals"]["weaknesses"] == {"touches_edge": 2}
    assert out["proposals"]["quality_score_quartiles"] == [0.2, 0.2, 0.6, 0.6, 0.8]
    assert out["proposals"]["header"] == {"map_area_sha256": "abc"}
    assert out["decisions"]["by_kind"] == {"accept": 2, "reject": 1}
    assert out["decisions"]["confirmed_by"] == ["A. Person"]
    assert out["decisions"]["reviewed_areas"] == 1


def test_plate_work_says_so_when_there_is_none(repo: Path) -> None:
    out = EvidenceStore(repo).plate_work("fip_v3_1935_229")
    assert out["proposals"] is None and out["decisions"] is None
    assert "gitignored" in out["note"]


def test_the_store_writes_nothing(repo: Path) -> None:
    def snapshot() -> dict[str, bytes]:
        return {str(p): p.read_bytes() for p in sorted(repo.rglob("*")) if p.is_file()}

    before = snapshot()
    store = EvidenceStore(repo)
    store.find_places("sumach")
    store.features_near({"lot_id": "L1"})
    store.list_sources()
    store.alignment(PLATE)
    store.plate_work(PLATE)
    assert snapshot() == before
