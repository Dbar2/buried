"""The Service end to end on a synthetic plate (spec 04 tasks 3.1, 6.1 and 8.1): health, the
registered plates, extract and publish, and their refusals."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from buried_pipeline.service.limits import Limiter
from buried_pipeline.validate.run import validate_would_be
from tests.service.helpers import (
    FULL_PLATE,
    MAP_AREA,
    SOURCE,
    ServiceWorld,
    client_for,
    extract_body,
    make_service_world,
    snapshot_of_files,
    use_synthetic_params,
)
from tests.validate.builders import NOW

CONFIRMED_AT = "2026-11-12T10:00:00Z"


@pytest.fixture(scope="module")
def sw(tmp_path_factory: pytest.TempPathFactory) -> ServiceWorld:
    return make_service_world(tmp_path_factory.mktemp("service"))


@pytest.fixture
def synthetic(monkeypatch: pytest.MonkeyPatch) -> None:
    use_synthetic_params(monkeypatch)


def error_code(response) -> str:
    body = response.json()
    assert set(body) == {"error"} and set(body["error"]) == {"code", "message", "details"}
    return body["error"]["code"]


# --- health and the registered plates -------------------------------------------------------------


def test_health_reports_versions_and_provider(sw: ServiceWorld) -> None:
    r = client_for(sw).get("/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["api_version"] == "1.0.0"
    assert body["data_version"] == sw.snapshot.data_version
    assert body["label_provider"] == "none" and "test_mode" not in body
    assert body["limits"]["extract"] == 30 and body["limits"]["concurrent_extractions"] == 2


def test_registered_plates_list_what_is_on_this_machine(sw: ServiceWorld) -> None:
    r = client_for(sw).get("/v1/plates/registered")
    assert r.status_code == 200
    plates = {p["source"]["id"]: p for p in r.json()["plates"]}
    assert set(plates) == {SOURCE, "fip_v3_1935_229"}  # plates only, not the City layers
    here = plates[SOURCE]
    assert here["raster_available"] and here["plate_ref"] == sw.plate_ref
    assert here["has_alignment_record"] and here["has_map_area"]
    assert here["tile_sidecar"] is None  # this synthetic root has no tile
    other = plates["fip_v3_1935_229"]
    assert not other["raster_available"] and other["plate_ref"] is None
    assert r.json()["data_version"] == sw.snapshot.data_version


# --- extract --------------------------------------------------------------------------------------


def test_extract_returns_a_proposal_file_for_the_region(sw: ServiceWorld, synthetic: None) -> None:
    client = client_for(sw)
    r = client.post("/v1/extract", json=extract_body(sw))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["dropped"] == {"touching_region_border": 0, "outside_project_bounds": 0}
    text = body["proposal_file_text"]
    doc = json.loads(text)
    assert text == json.dumps(doc, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    assert sw.snapshot.contract.issues("proposalFile", doc) == []
    assert doc["region_px"] == FULL_PLATE and len(doc["features"]) == 3
    canon = sw.world.paths.alignment_record(SOURCE).read_bytes()
    assert doc["alignment_record_sha256"] == hashlib.sha256(canon).hexdigest()


def test_a_region_drops_what_touches_its_own_border(sw: ServiceWorld, synthetic: None) -> None:
    r = client_for(sw).post("/v1/extract", json=extract_body(
        sw, region_px={"x": 0, "y": 0, "width": 320, "height": 520}))  # fmt: skip
    assert r.status_code == 200, r.text
    doc = json.loads(r.json()["proposal_file_text"])
    assert r.json()["dropped"]["touching_region_border"] >= 1
    assert all(max(x for x, _ in f["properties"]["pixel_polygon"]) < 320 for f in doc["features"])


def test_extract_uses_the_alignment_record_in_the_request(sw: ServiceWorld, synthetic: None) -> None:
    record = json.loads(sw.world.paths.alignment_record(SOURCE).read_text(encoding="utf-8"))
    text = json.dumps(record, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    r = client_for(sw).post("/v1/extract", json=extract_body(sw, alignment_record_text=text))
    assert r.status_code == 200, r.text
    doc = json.loads(r.json()["proposal_file_text"])
    assert doc["alignment_record_sha256"] == hashlib.sha256(text.encode()).hexdigest()


def test_extract_refuses_a_plate_with_no_alignment_record(sw: ServiceWorld) -> None:
    path = sw.world.paths.alignment_record(SOURCE)
    hidden = path.with_suffix(".hidden")
    path.rename(hidden)
    try:
        r = client_for(sw).post("/v1/extract", json=extract_body(sw))
    finally:
        hidden.rename(path)
    assert r.status_code == 403 and error_code(r) == "not_allowed"
    assert "no alignment record" in r.json()["error"]["message"]


def test_extract_refuses_what_it_cannot_identify(sw: ServiceWorld) -> None:
    client = client_for(sw)
    r = client.post("/v1/extract", json=extract_body(sw, plate_ref="a" * 64))
    assert r.status_code == 404 and error_code(r) == "not_found"
    changed = {**sw.snapshot.source_record(SOURCE), "title": "Another title"}
    r = client.post("/v1/extract", json=extract_body(sw, source=changed))
    assert r.status_code == 403 and error_code(r) == "not_allowed"


def test_extract_refuses_a_region_over_the_size_limit(
    sw: ServiceWorld, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("buried_pipeline.extract.region.MAX_REGION_SIDE_M", 10.0)
    r = client_for(sw).post("/v1/extract", json=extract_body(sw))  # 600 px x 0.06 m = 36 m
    assert r.status_code == 413 and error_code(r) == "too_large"


def test_extract_refuses_a_region_off_the_plate(sw: ServiceWorld) -> None:
    off = {"x": 400, "y": 0, "width": 400, "height": 100}
    r = client_for(sw).post("/v1/extract", json=extract_body(sw, region_px=off))
    assert r.status_code == 422 and error_code(r) == "invalid_request"


# --- the contract rules ---------------------------------------------------------------------------


def test_a_request_that_does_not_match_the_schema_gets_422_with_the_errors(
    sw: ServiceWorld,
) -> None:
    body = extract_body(sw)
    del body["region_px"]
    r = client_for(sw).post("/v1/extract", json=body)
    assert r.status_code == 422 and error_code(r) == "invalid_request"
    assert any("region_px" in d["reason"] for d in r.json()["error"]["details"])


def test_a_body_that_is_not_json_gets_422(sw: ServiceWorld) -> None:
    r = client_for(sw).post("/v1/extract", content=b"{nope", headers={"content-type": "x/y"})
    assert r.status_code == 422 and error_code(r) == "invalid_request"


def test_a_different_api_version_gets_409(sw: ServiceWorld) -> None:
    r = client_for(sw).post("/v1/extract", json=extract_body(sw, api_version="0.0.1"))
    assert r.status_code == 409 and error_code(r) == "version_mismatch"


def test_a_different_data_version_gets_409_naming_both(sw: ServiceWorld) -> None:
    r = client_for(sw).post("/v1/extract", json=extract_body(sw, data_version="0" * 64))
    assert r.status_code == 409 and error_code(r) == "data_version_mismatch"
    assert r.json()["error"]["details"] == [{"studio": "0" * 64, "service": sw.snapshot.data_version}]


def test_a_body_over_the_limit_gets_413(sw: ServiceWorld) -> None:
    r = client_for(sw, max_body_bytes=1000).post("/v1/extract", content=b"x" * 5000)
    assert r.status_code == 413 and error_code(r) == "too_large"


def test_requests_over_the_hourly_limit_get_429_with_retry_after(
    sw: ServiceWorld, synthetic: None
) -> None:
    client = client_for(sw, limiter=Limiter(hourly={"extract": 1, "match_publish": 1}))
    assert client.post("/v1/extract", json=extract_body(sw)).status_code == 200
    r = client.post("/v1/extract", json=extract_body(sw))
    assert r.status_code == 429 and error_code(r) == "rate_limited"
    assert int(r.headers["retry-after"]) >= 1


def test_the_address_is_the_first_forwarded_hop(sw: ServiceWorld) -> None:
    client = client_for(sw, limiter=Limiter(hourly={"extract": 1, "match_publish": 1}))
    body = {"x": 1}
    for who, expected in (("1.1.1.1, 9.9.9.9", 422), ("2.2.2.2", 422), ("1.1.1.1", 429)):
        r = client.post("/v1/extract", json=body, headers={"x-forwarded-for": who})
        assert r.status_code == expected, (who, r.text)


# --- publish --------------------------------------------------------------------------------------


def proposals_from_service(sw: ServiceWorld, client, **over) -> tuple[str, dict]:
    r = client.post("/v1/extract", json=extract_body(sw, **over))
    assert r.status_code == 200, r.text
    text = r.json()["proposal_file_text"]
    return text, json.loads(text)


def publish_body(sw: ServiceWorld, text: str, decisions: dict, **over) -> dict:
    body = {
        "api_version": "1.0.0",
        "data_version": sw.snapshot.data_version,
        "dry_run": True,
        "source_id": SOURCE,
        "workspace": {"sources": [], "control_files": [], "alignment_records": [],
                      "evidence_files": [], "tile_sidecars": []},
        "proposal_file_text": text,
        "decisions": decisions,
    }  # fmt: skip
    body.update(over)
    return body


def accept(pid: str, **extra) -> dict:
    return {"proposal_id": pid, "decision": "accept", "confirmed_by": "Test Reviewer",
            "confirmed_at": CONFIRMED_AT, **extra}  # fmt: skip


def decisions_for(doc: dict, accepted: int | None = None) -> dict:
    ids = [f["id"] for f in doc["features"]]
    take = ids if accepted is None else ids[:accepted]
    return {
        "source": SOURCE,
        "decisions": [accept(i) for i in take],
        "reviewed_areas": [{"pixel_polygon": MAP_AREA, "confirmed_by": "Test Reviewer",
                            "confirmed_at": CONFIRMED_AT}],
    }  # fmt: skip


def test_extract_then_publish_gives_a_valid_evidence_file_and_writes_nothing(
    sw: ServiceWorld, synthetic: None
) -> None:
    before = snapshot_of_files(sw.root)
    client = client_for(sw)
    text, doc = proposals_from_service(sw, client)
    r = client.post("/v1/publish", json=publish_body(sw, text, decisions_for(doc)))
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["ok"] is True
    assert result["counts"]["published_now"] == 3 and result["counts"]["undecided"] == 0
    assert result["new_feature_ids"] == [f"bld_{SOURCE}_000{k}" for k in (1, 2, 3)]
    evidence = json.loads(result["evidence_file_text"])
    assert evidence["origin_source"] == SOURCE and len(evidence["features"]) == 3
    # The same Validator `buried validate` uses accepts the returned collection.
    target = sw.world.paths.evidence_file(SOURCE)
    assert validate_would_be(sw.world.paths, {target: evidence}, NOW) == []
    assert not target.exists()
    assert snapshot_of_files(sw.root) == before  # nothing under data/ was written (req 1.7)


def test_a_publish_that_is_not_a_dry_run_also_writes_nothing(
    sw: ServiceWorld, synthetic: None
) -> None:
    before = snapshot_of_files(sw.root)
    client = client_for(sw)
    text, doc = proposals_from_service(sw, client)
    r = client.post("/v1/publish", json=publish_body(sw, text, decisions_for(doc), dry_run=False))
    assert r.json()["ok"] is True
    assert snapshot_of_files(sw.root) == before


def test_publish_names_the_undecided_proposals_inside_a_reviewed_area(
    sw: ServiceWorld, synthetic: None
) -> None:
    client = client_for(sw)
    text, doc = proposals_from_service(sw, client)
    r = client.post("/v1/publish", json=publish_body(sw, text, decisions_for(doc, accepted=1)))
    result = r.json()
    assert result["ok"] is False
    named = {e["review_item_id"] for e in result["errors"]}
    assert named == {f["id"] for f in doc["features"][1:]}
    assert "evidence_file_text" not in result


def test_publish_refuses_proposals_made_under_another_alignment_record(
    sw: ServiceWorld, synthetic: None
) -> None:
    client = client_for(sw)
    record = json.loads(sw.world.paths.alignment_record(SOURCE).read_text(encoding="utf-8"))
    record["measured_at"] = "2026-11-12T11:00:00Z"
    other = json.dumps(record, sort_keys=True, indent=2) + "\n"
    text, doc = proposals_from_service(sw, client, alignment_record_text=other)
    r = client.post("/v1/publish", json=publish_body(sw, text, decisions_for(doc)))
    assert r.json()["ok"] is False
    assert "run `buried extract" in r.json()["errors"][0]["reason"]


def test_publish_reports_validation_errors_against_their_review_item(
    sw: ServiceWorld, synthetic: None
) -> None:
    client = client_for(sw)
    text, doc = proposals_from_service(sw, client)
    decisions = decisions_for(doc)
    decisions["decisions"][0]["confirmed_at"] = "2999-01-01T00:00:00Z"
    result = client.post("/v1/publish", json=publish_body(sw, text, decisions)).json()
    assert result["ok"] is False
    future = [e for e in result["errors"] if "future" in e["reason"]]
    assert future and future[0]["review_item_id"] == doc["features"][0]["id"]
    assert future[0]["feature_id"] == f"bld_{SOURCE}_0001"


def test_merge_split_and_trace_are_refused_by_name(sw: ServiceWorld, synthetic: None) -> None:
    client = client_for(sw)
    text, doc = proposals_from_service(sw, client)
    ids = [f["id"] for f in doc["features"]]
    merge = {
        "type": "merge", "proposal_ids": ids[:2], "pixel_polygon": [[60, 60], [300, 60], [300, 200]],
        "confirmed_by": "Test Reviewer", "confirmed_at": CONFIRMED_AT,
    }  # fmt: skip
    decisions = {"version": 2, "source": SOURCE, "decisions": [merge],
                 "reviewed_areas": decisions_for(doc)["reviewed_areas"]}  # fmt: skip
    result = client_for(sw).post("/v1/publish", json=publish_body(sw, text, decisions)).json()
    assert result["ok"] is False and "not supported yet" in result["errors"][0]["reason"]


def test_workspace_content_is_refused_not_ignored(sw: ServiceWorld, synthetic: None) -> None:
    client = client_for(sw)
    text, doc = proposals_from_service(sw, client)
    body = publish_body(sw, text, decisions_for(doc))
    body["workspace"]["sources"] = [sw.snapshot.source_record(SOURCE)]
    r = client.post("/v1/publish", json=body)
    assert r.status_code == 403 and error_code(r) == "not_allowed"


def test_publish_for_an_unregistered_source_is_404(sw: ServiceWorld, synthetic: None) -> None:
    client = client_for(sw)
    text, doc = proposals_from_service(sw, client)
    body = publish_body(sw, text, decisions_for(doc), source_id="fip_v3_1911_999")
    r = client.post("/v1/publish", json=body)
    assert r.status_code == 404 and error_code(r) == "not_found"


def test_the_service_can_be_started_from_the_environment(sw: ServiceWorld) -> None:
    from buried_pipeline.service.app import create_app

    app = create_app(env={"BURIED_REPO_ROOT": str(sw.root)})
    assert app.state.snapshot.data_version == sw.snapshot.data_version
    assert Path(app.state.config.root) == sw.root.resolve()
