"""`find_places` returns the finds in data/finds.json (spec 06 task P4): slug, tag, readings and the
review state of each reading's feature, paged under the 20 KB cap with one cursor over finds and
then addresses."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from buried_pipeline.mcp.server import Server
from buried_pipeline.mcp.store import MAX_RESULT_BYTES, EvidenceStore
from tests.mcp.conftest import PLATE, write

P1935 = "fip_v3_1935_229"
CROP = {"x": 100, "y": 200, "width": 300, "height": 150}


def reading(source: str, fid: str, *lettered: str) -> dict[str, Any]:
    return {"source": source, "feature_id": fid, "lettered": list(lettered), "crop_px": CROP,
            "read_by": "Synthetic Reader", "read_on": "2026-11-13"}  # fmt: skip


def find(n: int, slug: str, tag: str, noun: str, *readings: dict[str, Any],
         kind: str = "building") -> dict[str, Any]:  # fmt: skip
    return {"id": f"find_{n:04d}", "slug": slug, "kind": kind, "order": n, "tag": tag,
            "noun": noun, "readings": list(readings)}  # fmt: skip


def with_finds(root: Path, finds: list[dict[str, Any]]) -> Path:
    write(root / "data" / "finds.json", {"schema_version": "1.0.0", "finds": finds})
    return root


def set_review(root: Path, n: int, review: dict[str, Any] | None) -> None:
    path = root / "data" / "evidence" / f"{PLATE}.geojson"
    doc = json.loads(path.read_text(encoding="utf-8"))
    prov = doc["features"][n - 1]["properties"]["provenance"]
    if review is None:
        prov.pop("review", None)
    else:
        prov["review"] = review
    write(path, doc)


def call(root: Path, arguments: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    result = Server(EvidenceStore(root)).call_tool("find_places", arguments)
    assert result["isError"] is False, result["content"][0]["text"]
    text = result["content"][0]["text"]
    return len(text.encode("utf-8")), json.loads(text)


def test_a_find_comes_with_its_slug_tag_readings_and_review_state(repo: Path) -> None:
    set_review(repo, 1, {"state": "draft_hand"})
    set_review(repo, 2, {"state": "reviewed", "by": "A. Reviewer", "on": "2026-11-13"})
    with_finds(repo, [find(
        1, "overall-factory", "Overall factory", "factory",
        reading(PLATE, f"bld_{PLATE}_0001", "Glove & Overall Factory", "Hamilton Carhartt Mfr. Ltd."),
        reading(PLATE, f"bld_{PLATE}_0002", "Glove & Overall Fac."),
    )])  # fmt: skip
    _, out = call(repo, {"query": "overall"})
    assert out["find_matches"] == 1 and out["addresses"] == []
    (f,) = out["finds"]
    assert (f["slug"], f["tag"], f["noun"], f["kind"]) == (
        "overall-factory", "Overall factory", "factory", "building")
    first, second = f["readings"]
    assert first["lettered"] == ["Glove & Overall Factory", "Hamilton Carhartt Mfr. Ltd."]
    assert first["crop_px"] == CROP and first["feature_status"] == "published"
    assert first["review"] == {"state": "draft_hand"}  # a draft says no one reviewed it
    assert second["review"] == {"state": "reviewed", "by": "A. Reviewer", "on": "2026-11-13"}
    assert f["source"] == "data/finds.json"


def test_a_find_matches_on_tag_noun_slug_or_any_lettered_line(repo: Path) -> None:
    with_finds(repo, [
        find(1, "coal-yard", "Coal yard", "yard", reading(PLATE, f"bld_{PLATE}_0001",
                                                          "Coal & Wood Yard", "J. W. Corson & Co.")),
        find(2, "bank", "Bank", "bank", reading(PLATE, f"bld_{PLATE}_0002", "Bank of Nova Scotia")),
    ])  # fmt: skip
    for query, slug in [("corson", "coal-yard"), ("yard", "coal-yard"), ("COAL-YARD", "coal-yard"),
                        ("nova scotia", "bank"), ("bank", "bank")]:  # fmt: skip
        _, out = call(repo, {"query": query})
        assert [f["slug"] for f in out["finds"]] == [slug], query


def test_every_word_must_match_and_a_miss_gives_no_finds(repo: Path) -> None:
    with_finds(repo, [find(1, "bank", "Bank", "bank",
                           reading(PLATE, f"bld_{PLATE}_0001", "Bank of Nova Scotia"))])  # fmt: skip
    assert call(repo, {"query": "bank carhartt"})[1]["finds"] == []
    assert call(repo, {"query": "nowhere"})[1]["finds"] == []


def test_a_reading_whose_feature_is_missing_says_so_instead_of_inventing_a_state(
    repo: Path,
) -> None:
    with_finds(repo, [find(1, "bank", "Bank", "bank", reading(PLATE, f"bld_{PLATE}_0099", "Bank"),
                           reading(P1935, f"bld_{P1935}_0001", "Bank"))])  # fmt: skip
    (f,) = call(repo, {"query": "bank"})[1]["finds"]
    for r in f["readings"]:
        assert r["feature_status"] is None and r["review"] is None


def test_a_feature_with_no_review_state_reports_none(repo: Path) -> None:
    set_review(repo, 1, None)
    with_finds(repo, [find(1, "bank", "Bank", "bank", reading(PLATE, f"bld_{PLATE}_0001", "Bank"))])
    (f,) = call(repo, {"query": "bank"})[1]["finds"]
    assert f["readings"][0]["review"] is None


def test_without_a_finds_file_the_tool_answers_as_before(repo: Path) -> None:
    _, out = call(repo, {"query": "sumach"})
    assert out["finds"] == [] and out["find_matches"] == 0
    assert [a["address"] for a in out["addresses"]] == ["75 Sumach St"]
    assert out["address_matches"] == 1 and out["more"] is False


def test_finds_and_addresses_can_match_the_same_query(repo: Path) -> None:
    with_finds(repo, [find(1, "sumach-works", "Sumach works", "works",
                           reading(PLATE, f"bld_{PLATE}_0001", "Sumach Works"))])  # fmt: skip
    _, out = call(repo, {"query": "sumach"})
    assert [f["slug"] for f in out["finds"]] == ["sumach-works"]
    assert [a["address"] for a in out["addresses"]] == ["75 Sumach St"]
    assert out["returned"] == 2


def test_finds_keep_their_order_not_the_file_order(repo: Path) -> None:
    with_finds(repo, [
        find(2, "b-shop", "Shop B", "shop", reading(PLATE, f"bld_{PLATE}_0002", "Shop")),
        find(1, "a-shop", "Shop A", "shop", reading(PLATE, f"bld_{PLATE}_0001", "Shop")),
    ])  # fmt: skip
    assert [f["slug"] for f in call(repo, {"query": "shop"})[1]["finds"]] == ["a-shop", "b-shop"]


def test_many_finds_page_under_the_cap_with_one_cursor_over_finds_then_addresses(
    repo: Path,
) -> None:
    long_line = "Placeholder lettering of some length for the size test"
    many = [
        find(i, f"sumach-find-{i:03d}", f"Sumach find {i}", "works",
             reading(PLATE, f"bld_{PLATE}_0001", f"Sumach {long_line} {i}", long_line, long_line),
             reading(P1935, f"bld_{P1935}_0001", f"Sumach {long_line} {i}", long_line, long_line))
        for i in range(1, 61)
    ]  # fmt: skip
    with_finds(repo, many)
    size, first = call(repo, {"query": "sumach", "limit": 200})
    assert size <= MAX_RESULT_BYTES
    assert first["find_matches"] == 60 and first["more"] is True  # 60 finds do not fit in one page

    finds: list[str] = []
    addresses: list[str] = []
    cursor = None
    for _ in range(100):
        arguments: dict[str, Any] = {"query": "sumach", "limit": 200}
        if cursor:
            arguments["cursor"] = cursor
        size, page = call(repo, arguments)
        assert size <= MAX_RESULT_BYTES
        finds += [f["slug"] for f in page["finds"]]
        addresses += [a["address"] for a in page["addresses"]]
        if not page["more"]:
            break
        cursor = page["next_cursor"]
    else:
        raise AssertionError("paging did not finish")
    assert finds == [f"sumach-find-{i:03d}" for i in range(1, 61)]  # every find once, in order
    assert addresses == ["75 Sumach St"]


def test_a_cursor_past_the_finds_continues_with_the_addresses(repo: Path) -> None:
    with_finds(repo, [find(1, "sumach-works", "Sumach works", "works",
                           reading(PLATE, f"bld_{PLATE}_0001", "Sumach Works"))])  # fmt: skip
    _, out = call(repo, {"query": "sumach", "limit": 1})
    assert [f["slug"] for f in out["finds"]] == ["sumach-works"] and out["addresses"] == []
    assert out["more"] is True and out["next_cursor"] == "1"
    _, rest = call(repo, {"query": "sumach", "limit": 1, "cursor": "1"})
    assert rest["finds"] == [] and [a["address"] for a in rest["addresses"]] == ["75 Sumach St"]
    assert rest["more"] is False
