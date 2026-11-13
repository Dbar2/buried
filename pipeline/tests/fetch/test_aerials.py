from __future__ import annotations

import json
from pathlib import Path

import pytest

from buried_pipeline.errors import PipelineError
from buried_pipeline.fetch.aerials import (
    AERIAL_INDEX_URL,
    MAX_CANDIDATES,
    check_aerial_url,
    parse_candidates,
    proposed_source_id,
    query_params,
    run_aerial_candidates,
    union_bounds,
)
from buried_pipeline.io.registry import load_registry
from buried_pipeline.paths import Paths
from tests.fakes import FakeHttp

FIXTURE = Path(__file__).parent.parent / "fixtures" / "fetch" / "aerial_index_two.json"
QUERY_URL = AERIAL_INDEX_URL + "/query"


def index_response() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def write_inspect_reports(paths: Paths) -> None:
    paths.inspect_dir.mkdir(parents=True)
    for i, source_id in enumerate(("fip_v3_1911_229", "fip_v3_1935_229")):
        report = {
            "source": source_id,
            "bounds_26917": {
                "min_e": 632200.0 + i * 100,
                "min_n": 4834700.0,
                "max_e": 632700.0 + i * 100,
                "max_n": 4835300.0 - i * 50,
            },
        }
        paths.inspect_report(source_id).write_text(json.dumps(report), encoding="utf-8")


def test_parse_two_records_sorted_with_ids_and_bounds() -> None:
    candidates = parse_candidates(index_response())
    assert [c["source_id"] for c in candidates] == [
        "aerial_1947_s0012_fl1947_it0001h",
        "aerial_1947_s0012_fl1947_it0002h",
    ]
    first = candidates[0]
    assert first["Name"] == "S0012_FL1947_IT0001H"
    assert first["zip_url"].endswith("it0001h.zip")
    assert first["footprint_bounds"] == {
        "min_e": 631800.0,
        "min_n": 4834500.0,
        "max_e": 632500.0,
        "max_n": 4835100.0,
    }


def test_query_uses_envelope_in_26917() -> None:
    params = query_params((1.0, 2.0, 3.0, 4.0))
    assert params["geometry"] == "1.0,2.0,3.0,4.0"
    assert params["inSR"] == "26917" and params["outSR"] == "26917"
    assert params["spatialRel"] == "esriSpatialRelIntersects"
    assert params["outFields"] == "Name,url,zip_url,thumbnail_url"
    assert params["returnGeometry"] == "true" and params["f"] == "json"


def test_union_bounds() -> None:
    assert union_bounds([(0, 0, 2, 2), (1, -1, 3, 1)]) == (0, -1, 3, 2)


def test_more_than_ten_records_is_an_error_and_writes_nothing(paths: Paths) -> None:
    write_inspect_reports(paths)
    one = index_response()["features"][0]
    many = []
    for i in range(MAX_CANDIDATES + 1):
        feature = json.loads(json.dumps(one))
        feature["attributes"]["Name"] = f"S0012_FL1947_IT{i:04d}H"
        many.append(feature)
    http = FakeHttp(documents={QUERY_URL: {"features": many}})
    with pytest.raises(PipelineError, match="limit 10"):
        run_aerial_candidates(paths, load_registry(paths.sources_json), http)
    assert not (paths.work / "aerial_candidates.json").exists()


def test_server_error_and_transfer_limit_are_errors() -> None:
    with pytest.raises(PipelineError, match="query failed"):
        parse_candidates({"error": {"code": 400}})
    with pytest.raises(PipelineError, match="transfer limit"):
        parse_candidates({"features": [], "exceededTransferLimit": True})


@pytest.mark.parametrize("name", ["S0012 FL1947", "S0012-FL1947", "../x", ""])
def test_name_that_is_not_a_source_id_is_refused(name: str) -> None:
    with pytest.raises(PipelineError):
        proposed_source_id(name)


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/datapub/toronto/air_photos_1947/Black and White/s0012_fl1947_it0001h.zip",
        "http://maps.library.utoronto.ca/datapub/toronto/air_photos_1947/Black and White/s0012_fl1947_it0001h.zip",
        "https://maps.library.utoronto.ca/datapub/toronto/air_photos_1947/Black and White/s0012_fl1947_it0001h.zip?x=1",
        "https://maps.library.utoronto.ca/datapub/toronto/air_photos_1947/../s0012_fl1947_it0001h.zip",
        "https://maps.library.utoronto.ca/datapub/toronto/air_photos_1947/Black and White/s0012_fl1947_it0002h.zip",
    ],
)
def test_aerial_url_guard(url: str) -> None:
    with pytest.raises(PipelineError):
        check_aerial_url("aerial_1947_s0012_fl1947_it0001h", url)


def test_run_writes_candidates_file_and_downloads_nothing(paths: Paths) -> None:
    write_inspect_reports(paths)
    http = FakeHttp(documents={QUERY_URL: index_response()})
    lines: list[str] = []
    run_aerial_candidates(paths, load_registry(paths.sources_json), http, lines.append)
    assert [kind for kind, _, _ in http.requests] == ["json"]
    sent = http.requests[0][2]
    assert sent is not None and sent["geometry"] == "632200.0,4834700.0,632800.0,4835300.0"
    doc = json.loads((paths.work / "aerial_candidates.json").read_text(encoding="utf-8"))
    assert len(doc["candidates"]) == 2
    assert "2 aerial records" in lines[0]
