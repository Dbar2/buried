"""Publish: building evidence from decisions (spec 02 tasks 8.1 and 8.2, requirements 10.x)."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from buried_pipeline.cli import main
from buried_pipeline.errors import PipelineError
from buried_pipeline.io.registry import load_registry
from buried_pipeline.publish.build import build_evidence, canonical_text
from buried_pipeline.publish.decisions import PublishRefusal, parse_decisions
from buried_pipeline.publish.run import prepare_publish, run_publish
from buried_pipeline.validate.schema import load_schema
from tests.publish.strategies import (
    CONFIRMED_AT,
    EMPTY_CORNER,
    SOURCE,
    World,
    accept,
    area,
    decisions_doc,
    inputs,
    make_world,
    reject,
)
from tests.validate.builders import NOW


@pytest.fixture
def world(tmp_path: Path) -> World:
    return make_world(tmp_path)


def publish(world: World, doc: dict[str, Any], write: bool = False):
    registry = load_registry(world.paths.sources_json)
    schema = load_schema(world.paths.root)
    if write:
        path = world.paths.work / "review" / f"{SOURCE}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(doc), encoding="utf-8")
        return run_publish(world.paths, registry, SOURCE, NOW, out=lambda _m: None, schema=schema)
    return prepare_publish(world.paths, registry, schema, SOURCE, doc, NOW)


def refusal_text(world: World, doc: dict[str, Any]) -> str:
    with pytest.raises(PipelineError) as raised:
        publish(world, doc)
    return str(raised.value)


def test_accepted_proposals_become_valid_published_buildings(world: World) -> None:
    a, b, c = world.ids
    plan = publish(world, decisions_doc([accept(a), accept(b), reject(c)]))
    assert plan.errors == []
    features = plan.build.doc["features"]
    assert [f["id"] for f in features] == [f"bld_{SOURCE}_0001", f"bld_{SOURCE}_0002"]
    f = features[0]
    p = f["properties"]
    assert p["kind"] == "building" and p["status"] == "published"
    assert p["observations"] == [
        {"source": SOURCE, "present": True, "visibility": "clear", "method": "origin"}
    ]
    assert p["attributes"] == {}
    assert p["confidence"] == "estimated"
    assert p["confidence_reason"] == f"Footprint read from {SOURCE}; storeys not recorded"
    # alignment error 4.3 m and digitising 1.0 m: sqrt(4.3^2 + 1^2) = 4.41, up to 4.5 m
    assert p["position_error_m"] == 4.5
    prov = p["provenance"]
    assert prov["digitising_error_m"] == 1.0 and prov["alignment_error_m"] == 4.3
    assert prov["proposal_id"] == a and prov["confirmed_by"] == "Test Reviewer"
    assert prov["tone_class"] in {"light", "mid", "dark", "hatched", "mixed"}
    assert "material" not in p["attributes"]
    assert prov["crop_px"] == world.proposals["features"][0]["properties"]["crop_px"]
    c = plan.build.counts
    assert (c.accepted, c.published_now, c.rejected, c.undecided) == (2, 2, 1, 0)


def test_the_file_carries_mapped_area_and_reviewed_areas(world: World) -> None:
    plan = publish(world, decisions_doc([accept(i) for i in world.ids]))
    doc = plan.build.doc
    assert doc["mapped_area"]["method"] == "map_area"
    assert doc["mapped_area"]["geometry"] == world.proposals["map_area_geometry"]
    (reviewed,) = doc["reviewed_areas"]
    assert reviewed["method"] == "person" and reviewed["confirmed_by"] == "Test Reviewer"
    assert "covers" not in reviewed and len(reviewed["pixel_polygon"]) == 4
    assert plan.errors == []


def test_reviewed_area_covers_is_kept_when_given(world: World) -> None:
    doc = decisions_doc([accept(i) for i in world.ids], [area(covers=["building", "water"])])
    plan = publish(world, doc)
    assert plan.build.doc["reviewed_areas"][0]["covers"] == ["building", "water"]
    assert plan.errors == []


def test_an_edited_polygon_replaces_the_proposals_and_is_georeferenced(world: World) -> None:
    pid = world.ids[0]
    original = world.proposals["features"][0]["properties"]["pixel_polygon"]
    xs = [x for x, _ in original]
    ys = [y for _, y in original]
    box = [[min(xs), min(ys)], [max(xs) - 4, min(ys)], [max(xs) - 4, max(ys)], [min(xs), max(ys)]]
    others = [accept(i) for i in world.ids[1:]]
    plan = publish(world, decisions_doc([accept(pid, pixel_polygon=box), *others]))
    assert plan.errors == []
    f = plan.build.doc["features"][0]
    assert f["properties"]["provenance"]["crop_px"] == {
        "x": min(xs), "y": min(ys), "width": max(xs) - 4 - min(xs), "height": max(ys) - min(ys),
    }  # fmt: skip
    assert len(f["geometry"]["coordinates"][0]) == 5


def test_a_decision_without_reviewer_or_time_is_never_published(world: World) -> None:
    a, b, c = world.ids
    bad = accept(a)
    del bad["confirmed_by"]
    plan = publish(world, decisions_doc([bad, accept(b), reject(c)], [area(EMPTY_CORNER)]))
    assert [f["properties"]["provenance"]["proposal_id"] for f in plan.build.doc["features"]] == [b]
    counts = plan.build.counts
    assert counts.unconfirmed == 1 and counts.undecided == 1

    stamp = accept(a)
    stamp["confirmed_at"] = "2026-11-12T10:00:00"  # no time zone: not a confirmed_at
    plan = publish(world, decisions_doc([stamp], [area(EMPTY_CORNER)]))
    assert plan.build.doc["features"] == [] and plan.build.counts.unconfirmed == 1


def test_publishing_needs_a_reviewed_area(world: World) -> None:
    text = refusal_text(world, decisions_doc([accept(world.ids[0])], areas=[]))
    assert "at least one reviewed area" in text


def test_an_undecided_proposal_inside_a_reviewed_area_is_named(world: World) -> None:
    a, b, c = world.ids
    with pytest.raises(PublishRefusal) as raised:
        publish(world, decisions_doc([accept(a)]))
    named = {p.review_item_id for p in raised.value.problems}
    assert named == {b, c}


def test_an_unconfirmed_accept_inside_a_reviewed_area_counts_as_undecided(world: World) -> None:
    a, b, c = world.ids
    bad = accept(a)
    del bad["confirmed_at"]
    with pytest.raises(PublishRefusal) as raised:
        publish(world, decisions_doc([bad, accept(b), reject(c)]))
    assert [p.review_item_id for p in raised.value.problems] == [a]


def test_a_reviewed_area_outside_the_map_area_is_refused(world: World) -> None:
    outside = [[0, 0], [40, 0], [40, 40], [0, 40]]  # the map area starts at 10, 10
    text = refusal_text(world, decisions_doc([], [area(outside)]))
    assert "not inside the plate's map area" in text


def test_unknown_proposals_are_refused(world: World) -> None:
    text = refusal_text(world, decisions_doc([accept("fip_v3_1911_229_p_000000000000")]))
    assert "not in the proposal file" in text


def test_a_second_decision_for_one_proposal_is_refused(world: World) -> None:
    pid = world.ids[0]
    text = refusal_text(world, decisions_doc([accept(pid), reject(pid)]))
    assert "more than one decision" in text


def test_material_needs_a_read_and_a_grey_tone_is_never_a_material(world: World) -> None:
    pid = world.ids[0]
    others = [accept(i) for i in world.ids[1:]]
    text = refusal_text(world, decisions_doc([accept(pid, attributes={"material": "brick"}), *others]))
    assert "material was set without a read" in text

    read = {"attribute": "material", "crop_px": {"x": 70, "y": 70, "width": 40, "height": 20},
            "read_by": "person"}  # fmt: skip
    ok = accept(pid, attributes={"material": "brick"}, attribute_reads=[read])
    plan = publish(world, decisions_doc([ok, *others]))
    assert plan.errors == []
    prov = plan.build.doc["features"][0]["properties"]["provenance"]
    assert prov["attribute_reads"] == [{**read, "confirmed_by": "Test Reviewer",
                                        "confirmed_at": CONFIRMED_AT}]  # fmt: skip
    # extraction gave a tone class, and it stays a tone class
    assert "tone_class" in prov


def test_documented_needs_storeys(world: World) -> None:
    pid = world.ids[0]
    others = [accept(i) for i in world.ids[1:]]
    bare = accept(pid, confidence="documented", confidence_reason="Read from the plate")
    assert "documented needs storeys" in refusal_text(world, decisions_doc([bare, *others]))
    full = accept(pid, confidence="documented", confidence_reason="Read from the plate",
                  attributes={"storeys": 2})  # fmt: skip
    plan = publish(world, decisions_doc([full, *others]))
    assert plan.errors == []
    props = plan.build.doc["features"][0]["properties"]
    assert props["confidence"] == "documented" and props["attributes"] == {"storeys": 2}


def test_a_confidence_without_a_reason_is_refused(world: World) -> None:
    text = refusal_text(world, decisions_doc([accept(world.ids[0], confidence="estimated")]))
    assert "must give its reason" in text


def test_the_reviewer_can_raise_the_position_error_but_not_lower_it(world: World) -> None:
    a, b, c = world.ids
    plan = publish(world, decisions_doc([accept(a, position_error_m=9.0),
                                         accept(b, position_error_m=1.0), reject(c)]))  # fmt: skip
    errors = [f["properties"]["position_error_m"] for f in plan.build.doc["features"]]
    assert errors == [9.0, 4.5]


def test_a_stale_alignment_record_is_refused(world: World) -> None:
    doc = decisions_doc([accept(i) for i in world.ids])
    bad = inputs(world, doc)
    stale = type(bad)(**{**bad.__dict__, "alignment_record_sha256": "0" * 64})
    with pytest.raises(PublishRefusal, match="run `buried extract"):
        build_evidence(stale)


def test_v2_merge_split_and_trace_are_refused_by_name(world: World) -> None:
    doc = {"version": 2, "source": SOURCE, "reviewed_areas": [area()],
           "decisions": [{"type": "merge", "proposal_id": world.ids[0]}]}  # fmt: skip
    assert "not supported yet" in refusal_text(world, doc)


def test_a_v2_file_with_accept_and_reject_is_read(world: World) -> None:
    a, b, c = world.ids
    v2 = {
        "version": 2, "source": SOURCE, "reviewed_areas": [area()],
        "decisions": [{"type": "accept", "proposal_id": a, "confirmed_by": "R",
                       "confirmed_at": CONFIRMED_AT},
                      {"type": "reject", "proposal_id": b, "confirmed_by": "R",
                       "confirmed_at": CONFIRMED_AT},
                      {"type": "reject", "proposal_id": c}],
    }  # fmt: skip
    decisions = parse_decisions(v2, SOURCE)
    assert [d.decision for d in decisions.decisions] == ["accept", "reject", "reject"]
    assert publish(world, v2).build.counts.published_now == 1


# --- the command ----------------------------------------------------------------------------------


def test_publish_twice_gives_the_same_file(world: World) -> None:
    doc = decisions_doc([accept(world.ids[0]), accept(world.ids[1]), reject(world.ids[2])])
    publish(world, doc, write=True)
    target = world.paths.evidence_file(SOURCE)
    first = target.read_bytes()
    second_plan = publish(world, doc, write=True)
    assert target.read_bytes() == first
    assert second_plan.build.counts.published_now == 0
    assert second_plan.build.counts.already_published == 2


def test_new_ids_continue_after_every_existing_one_in_any_status(world: World) -> None:
    first = build_evidence(inputs(world, decisions_doc([accept(world.ids[0]), reject(world.ids[1]),
                                                        reject(world.ids[2])])))  # fmt: skip
    existing = copy.deepcopy(first.doc)
    f = existing["features"][0]
    f["properties"]["status"] = "rejected"
    f["properties"]["status_reason"] = "Not a building"
    f["id"] = f"bld_{SOURCE}_0007"
    again = build_evidence(inputs(world, decisions_doc([accept(world.ids[1]), reject(world.ids[2])],
                                                       [area()]), existing=existing))  # fmt: skip
    ids = [x["id"] for x in again.doc["features"]]
    assert ids == [f"bld_{SOURCE}_0007", f"bld_{SOURCE}_0008"]
    assert again.doc["features"][0] == existing["features"][0]


def test_an_existing_reviewed_area_is_kept_and_an_identical_one_is_not_added(world: World) -> None:
    doc = decisions_doc([accept(world.ids[0]), reject(world.ids[1]), reject(world.ids[2])])
    first = build_evidence(inputs(world, doc))
    second = build_evidence(inputs(world, doc, existing=first.doc))
    assert second.doc["reviewed_areas"] == first.doc["reviewed_areas"]
    shifted = [[12, 12], [WIDTH_HALF, 12], [WIDTH_HALF, 30], [12, 30]]
    third = build_evidence(inputs(world, decisions_doc([], [area(shifted)]), existing=first.doc))
    assert third.doc["reviewed_areas"][0] == first.doc["reviewed_areas"][0]
    assert len(third.doc["reviewed_areas"]) == 2


WIDTH_HALF = 200


def test_the_command_writes_a_file_that_buried_validate_accepts(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    review = world.paths.work / "review" / f"{SOURCE}.json"
    review.parent.mkdir(parents=True)
    review.write_text(json.dumps(decisions_doc([accept(i) for i in world.ids])), encoding="utf-8")
    root = str(world.paths.root)
    assert main(["--root", root, "publish", SOURCE]) == 0
    out = capsys.readouterr().out
    assert "published now 3" in out
    target = world.paths.evidence_file(SOURCE)
    assert target.read_text(encoding="utf-8") == canonical_text(json.loads(target.read_text()))
    assert main(["--root", root, "validate", str(target)]) == 0


def test_a_failing_validation_writes_nothing(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    future = accept(world.ids[0], confirmed_at="2999-01-01T00:00:00Z")
    doc = decisions_doc([future, reject(world.ids[1]), reject(world.ids[2])])
    review = world.paths.work / "review" / f"{SOURCE}.json"
    review.parent.mkdir(parents=True)
    review.write_text(json.dumps(doc), encoding="utf-8")
    assert main(["--root", str(world.paths.root), "publish", SOURCE]) == 1
    assert not world.paths.evidence_file(SOURCE).exists()
    assert "is in the future" in capsys.readouterr().out


def test_an_unconfirmed_source_is_refused(world: World) -> None:
    sources = json.loads(world.paths.sources_json.read_text(encoding="utf-8"))
    sources["sources"][0]["attribution_status"] = "to_be_confirmed"
    world.paths.sources_json.write_text(json.dumps(sources), encoding="utf-8")
    assert "attribution_status" in refusal_text(world, decisions_doc([accept(world.ids[0])]))


def test_an_unregistered_source_is_refused(world: World) -> None:
    registry = load_registry(world.paths.sources_json)
    with pytest.raises(PipelineError, match="not in the Registry"):
        prepare_publish(world.paths, registry, load_schema(world.paths.root),
                        "fip_v3_1911_999", {}, NOW)  # fmt: skip


def test_a_missing_proposal_file_says_to_run_extract(world: World) -> None:
    world.paths.proposals_file(SOURCE).unlink()
    assert "buried extract" in refusal_text(world, decisions_doc([]))
