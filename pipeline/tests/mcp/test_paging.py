"""Size bounds and paging for the MCP tools (session 030): every result fits in 20 KB or says how
to get the rest, and walking the cursors gives every row once."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from buried_pipeline.mcp.server import Server
from buried_pipeline.mcp.store import (
    ADDRESS_LAYER,
    MAX_RESULT_BYTES,
    BadRequest,
    EvidenceStore,
)
from tests.mcp.conftest import E0, N0, PLATE, square, write

N_FEATURES = 300
NEAR = {"easting": E0 + 150.0, "northing": N0 + 50.0, "distance_m": 5000}
REVIEWER = "Buried maintainers (draft pass by rule, not checked one by one)"


def make_building(i: int) -> dict[str, Any]:
    x, y = (i % 30) * 10, (i // 30) * 10
    return {
        "type": "Feature",
        "id": f"bld_{PLATE}_{i + 1:04d}",
        "geometry": square(x, y, 8),
        "properties": {
            "kind": "building",
            "status": "published" if i % 10 else "rejected",
            "position_error_m": 4.5,
            "confidence": "documented" if i % 2 else "estimated",
            "confidence_reason": "Traced from the plate, then checked against the 1935 plan.",
            "attributes": {"storeys": 2} if i % 3 == 0 else {},
            "observations": [
                {"source": PLATE, "present": True, "visibility": "clear", "method": "origin"},
                {"source": "fip_v3_1935_229", "present": True, "visibility": "clear",
                 "method": "person", "confirmed_by": REVIEWER,
                 "confirmed_at": "2026-11-13T14:42:16Z"},
            ],
            "same_as": [f"bld_fip_v3_1935_229_{i + 1:04d}"] if i % 4 == 0 else [],
            "provenance": {
                "origin_source": PLATE, "alignment_error_m": 4.3, "digitising_error_m": 1.0,
                "confirmed_by": REVIEWER, "confirmed_at": "2026-11-13T14:42:16Z",
                "crop_px": {"x": 2687 + i, "y": 3279, "width": 83, "height": 80},
            },
        },
    }  # fmt: skip


def hull_polygon() -> dict[str, Any]:
    ring = [[E0, N0], [E0 + 150, N0], [E0 + 150, N0 + 100], [E0, N0 + 100], [E0, N0]]
    return {"type": "Polygon", "coordinates": [ring]}


@pytest.fixture(scope="module")
def big(tmp_path_factory: pytest.TempPathFactory) -> Path:
    root = tmp_path_factory.mktemp("big")
    (root / ".kiro").mkdir()
    d = root / "data"
    write(d / "evidence" / f"{PLATE}.geojson", {
        "type": "FeatureCollection", "origin_source": PLATE,
        "features": [make_building(i) for i in range(N_FEATURES)],
    })  # fmt: skip
    write(d / "evidence" / "fip_v3_1935_229.geojson", {
        "type": "FeatureCollection", "origin_source": "fip_v3_1935_229",
        "features": [{**make_building(1), "id": "bld_fip_v3_1935_229_0001"}],
    })  # fmt: skip
    write(d / "alignment" / f"{PLATE}.json", {
        "source": PLATE, "alignment_error_m": 4.3, "control_hull": hull_polygon(),
        "control_hull_area_m2": 15000.0,
    })  # fmt: skip
    write(d / "present" / f"{ADDRESS_LAYER}.geojson", {"features": [
        {"type": "Feature", "id": f"a{i}",
         "geometry": {"type": "Point", "coordinates": [E0 + i, N0 + i]},
         "properties": {"ADDRESS_FULL": f"{i} Sumach St"}} for i in range(150)
    ]})  # fmt: skip
    write(d / "present" / "present_toronto_property_boundaries_2026.geojson", {"features": []})
    flags = [["touches_edge"], ["low_quality", "touches_fold"], []]
    write(d / "work" / "proposals" / f"{PLATE}.geojson", {
        "type": "FeatureCollection",
        "features": [
            {"id": f"prop_{PLATE}_{i:05d}_{'x' * 40}", "properties": {
                "quality": {"score": 0.5}, "tone_class": "light", "weaknesses": flags[i % 3],
                "area_m2": 12.5, "crop_px": {"x": i, "y": 7, "width": 20, "height": 30}}}
            for i in range(500)
        ],
    })  # fmt: skip
    return root


def call(root: Path, name: str, arguments: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    """The size in bytes of the text a tools/call sends, and what it parses to."""
    result = Server(EvidenceStore(root)).call_tool(name, arguments)
    assert result["isError"] is False, result["content"][0]["text"]
    text = result["content"][0]["text"]
    return len(text.encode("utf-8")), json.loads(text)


def walk(root: Path, name: str, arguments: dict[str, Any], key: str) -> list[dict[str, Any]]:
    """Every row of a paged tool, following next_cursor, each page within the size bound."""
    rows: list[dict[str, Any]] = []
    cursor = None
    for _ in range(100):
        args = dict(arguments, **({"cursor": cursor} if cursor else {}))
        size, page = call(root, name, args)
        assert size <= MAX_RESULT_BYTES
        rows += page[key]
        if not page["more"]:
            assert page["next_cursor"] is None
            return rows
        cursor = page["next_cursor"]
    raise AssertionError("paging did not finish")


def test_compact_features_near_holds_100_features_under_20_kb(big: Path) -> None:
    size, out = call(big, "features_near", {**NEAR, "compact": True, "limit": 100})
    assert len(out["rows"]) == 100 and out["returned"] == 100
    assert size < MAX_RESULT_BYTES
    assert out["total"] == 271 and out["more"] is True and out["next_cursor"] == "100"
    first = dict(zip(out["columns"], out["rows"][0], strict=True))
    assert list(first) == [
        "id", "kind", "confidence", "area_m2", "centroid", "crop_px", "has_storeys",
        "confirmed_by", "same_as",
    ]  # fmt: skip
    assert first["kind"] == "building" and first["crop_px"][2:] == [83, 80]
    assert out["reviewers"] == [REVIEWER] and first["confirmed_by"] == 0


def test_compact_default_page_is_100(big: Path) -> None:
    _, out = call(big, "features_near", {**NEAR, "compact": True})
    assert out["returned"] == 100


def test_the_full_form_stops_at_the_size_bound_and_gives_a_cursor(big: Path) -> None:
    size, out = call(big, "features_near", {**NEAR, "limit": 200})
    assert size <= MAX_RESULT_BYTES
    assert out["more"] is True and 0 < out["returned"] < 200
    assert "cursor" in out["how_to_get_the_rest"]


def test_walking_the_cursors_gives_every_feature_once(big: Path) -> None:
    rows = walk(big, "features_near", {**NEAR, "compact": True, "limit": 50}, "rows")
    ids = [r[0] for r in rows]
    assert len(ids) == len(set(ids)) == 270 + 1  # 270 published here plus the 1935 file's one
    full = walk(big, "features_near", NEAR, "features")
    assert sorted(f["id"] for f in full) == sorted(ids)


def test_source_filter_keeps_one_file(big: Path) -> None:
    _, out = call(big, "features_near", {**NEAR, "compact": True, "source": "fip_v3_1935_229"})
    assert out["total"] == 1
    assert out["rows"][0][0] == "bld_fip_v3_1935_229_0001"


def test_plate_features_says_who_is_inside_the_control_hull(big: Path) -> None:
    rows = walk(big, "plate_features", {"source_id": PLATE}, "rows")
    assert len(rows) == 270
    _, first = call(big, "plate_features", {"source_id": PLATE})
    assert first["columns"][-1] == "inside_control_hull"
    for r in rows:
        i = int(r[0].rsplit("_", 1)[1]) - 1
        assert r[-1] is ((i % 30) * 10 + 4 <= 150 and (i // 30) * 10 + 4 <= 100)
    assert first["inside_control_hull_count"] + first["outside_control_hull_count"] == 270
    assert first["inside_control_hull_count"] == sum(r[-1] for r in rows)
    assert first["returned"] == 100 and first["more"] is True


def test_plate_features_without_a_hull_says_null(repo: Path) -> None:
    # the small repo's alignment record has a hull with no coordinates
    out = EvidenceStore(repo).plate_features(PLATE)
    assert {row[-1] for row in out["rows"]} == {None}
    assert "null" in out["control_hull_note"]
    assert out["total"] == 2  # published only; the rejected one is left out


def test_plate_features_can_include_other_statuses(repo: Path) -> None:
    out = EvidenceStore(repo).plate_features(PLATE, status=["published", "rejected"])
    assert out["total"] == 3


def test_plate_work_lists_flagged_proposals_in_pages(big: Path) -> None:
    size, first = call(big, "plate_work", {"source_id": PLATE})
    assert size <= MAX_RESULT_BYTES
    assert first["proposals"]["count"] == 500
    assert first["total"] == first["proposals"]["flagged_count"] == 334  # i % 3 in (0, 1)
    assert first["more"] is True
    item = first["flagged"][0]
    assert set(item) == {"id", "flags", "score", "area_m2", "crop_px"}
    assert item["flags"] and item["crop_px"][1:] == [7, 20, 30]
    rows = walk(big, "plate_work", {"source_id": PLATE}, "flagged")
    assert len({r["id"] for r in rows}) == len(rows) == 334


def test_plate_work_flagged_ids_match_the_flags(repo: Path) -> None:
    out = EvidenceStore(repo).plate_work(PLATE)
    assert [r["id"] for r in out["flagged"]] == ["prop_1", "prop_2"]
    assert out["flagged"][0] == {"id": "prop_1", "flags": ["touches_edge"], "score": 0.8,
                                 "area_m2": 21.0, "crop_px": [10, 5, 30, 40]}  # fmt: skip
    assert out["more"] is False and out["total"] == 2


def test_find_places_pages(big: Path) -> None:
    size, first = call(big, "find_places", {"query": "sumach", "limit": 200})
    assert size <= MAX_RESULT_BYTES
    assert first["address_matches"] == 150
    rows = walk(big, "find_places", {"query": "sumach", "limit": 200}, "addresses")
    assert len({r["address_id"] for r in rows}) == len(rows) == 150


@pytest.mark.parametrize("cursor", ["abc", "-1", "9999", "1.5", ""])
def test_a_bad_cursor_is_refused(big: Path, cursor: str) -> None:
    with pytest.raises(BadRequest):
        EvidenceStore(big).plate_features(PLATE, cursor=cursor)


def test_a_non_boolean_compact_is_refused(big: Path) -> None:
    result = Server(EvidenceStore(big)).call_tool("features_near", {**NEAR, "compact": "yes"})
    assert result["isError"] is True


@settings(max_examples=40, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(limit=st.integers(1, 200), compact=st.booleans(), start=st.integers(0, 269))
def test_property_no_page_passes_the_size_bound(
    big: Path, limit: int, compact: bool, start: int
) -> None:
    args = {**NEAR, "compact": compact, "limit": limit, "cursor": str(start)}
    size, out = call(big, "features_near", args)
    assert size <= MAX_RESULT_BYTES
    assert out["returned"] == len(out["rows" if compact else "features"]) >= 1
    assert out["more"] == (start + out["returned"] < out["total"])


@pytest.mark.parametrize("source_id", ["fip_v3_1911_229", "fip_v3_1935_229"])
def test_the_committed_evidence_pages_within_the_bound(source_id: str) -> None:
    from buried_pipeline.paths import find_repo_root

    root = find_repo_root()
    if not (root / "data" / "evidence" / f"{source_id}.geojson").is_file():
        pytest.skip("the evidence file is not in this checkout")
    rows = walk(root, "plate_features", {"source_id": source_id}, "rows")
    assert len({r[0] for r in rows}) == len(rows) > 0
    size, first = call(root, "plate_features", {"source_id": source_id})
    assert size <= MAX_RESULT_BYTES and first["returned"] == min(100, first["total"])
