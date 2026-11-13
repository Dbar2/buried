"""Properties U1 to U6 of `buried publish` (spec 02 design "Correctness properties")."""

from __future__ import annotations

import copy
import json
import math
import re
from typing import Any

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from buried_pipeline.errors import PipelineError
from buried_pipeline.io.registry import load_registry
from buried_pipeline.publish.build import build_evidence, canonical_text
from buried_pipeline.publish.decisions import PublishRefusal
from buried_pipeline.publish.run import run_publish
from buried_pipeline.validate.run import run_validate
from buried_pipeline.validate.schema import load_schema
from tests.extract.test_run import HEIGHT, MAP_AREA
from tests.publish.strategies import (
    EMPTY_CORNER,
    NOW,
    SOURCE,
    World,
    accept,
    area,
    decisions_doc,
    inputs,
    make_world,
    pixel_sizes,
    positive_m,
    reviews,
)

SLOW = settings(max_examples=40, deadline=None, suppress_health_check=[HealthCheck.too_slow])
FAST = settings(max_examples=120, deadline=None)

AREAS = st.sampled_from([MAP_AREA, EMPTY_CORNER])


@pytest.fixture(scope="module")
def world(tmp_path_factory: pytest.TempPathFactory) -> World:
    return make_world(tmp_path_factory.mktemp("publish_properties"))


def is_confirmed(d: dict[str, Any]) -> bool:
    at = d.get("confirmed_at", "")
    return bool(d.get("confirmed_by")) and bool(re.search(r"(Z|[+-]\d\d:\d\d)$", at))


# U1 ---------------------------------------------------------------------------------------------


@SLOW
@given(data=st.data(), polygon=AREAS, future=st.booleans())
def test_u1_publish_writes_a_valid_file_or_nothing(
    world: World, data: st.DataObject, polygon: list[list[int]], future: bool
) -> None:
    review = data.draw(reviews(world.ids, allow_unconfirmed=True))
    if future and review:
        review[0] = {**review[0], "confirmed_at": "2999-01-01T00:00:00Z"}  # a time not yet come
    path = world.paths.work / "review" / f"{SOURCE}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(decisions_doc(review, [area(polygon)])), encoding="utf-8")
    target = world.paths.evidence_file(SOURCE)
    registry = load_registry(world.paths.sources_json)
    schema = load_schema(world.paths.root)
    try:
        try:
            run_publish(world.paths, registry, SOURCE, NOW, out=lambda _m: None, schema=schema)
        except PipelineError:
            assert not target.exists()  # refused: nothing written
        else:
            assert target.is_file()
            report = run_validate(world.paths, [target], NOW, out=lambda _m: None, schema=schema)
            assert report.errors == []
    finally:
        target.unlink(missing_ok=True)


# U2 ---------------------------------------------------------------------------------------------


@FAST
@given(data=st.data(), polygon=AREAS)
def test_u2_only_accepted_confirmed_proposals_are_published(
    world: World, data: st.DataObject, polygon: list[list[int]]
) -> None:
    review = data.draw(reviews(world.ids, allow_unconfirmed=True))
    doc = decisions_doc(review, [area(polygon)])
    expected = {
        d["proposal_id"] for d in review if d["decision"] == "accept" and is_confirmed(d)
    }
    try:
        result = build_evidence(inputs(world, doc))
    except PublishRefusal:
        return  # an undecided proposal inside the area: nothing is built
    published = {
        f["properties"]["provenance"]["proposal_id"] for f in result.doc["features"]
    }
    assert published == expected
    rejected = {d["proposal_id"] for d in review if d["decision"] == "reject"}
    assert not published & rejected
    assert result.counts.published_now == len(expected)


# U3 ---------------------------------------------------------------------------------------------


@FAST
@given(data=st.data())
def test_u3_publishing_the_same_inputs_twice_gives_the_same_bytes(
    world: World, data: st.DataObject
) -> None:
    review = data.draw(reviews(world.ids))
    doc = decisions_doc(review, [area(EMPTY_CORNER)])
    first = build_evidence(inputs(world, doc))
    second = build_evidence(inputs(world, doc, existing=first.doc))
    assert canonical_text(second.doc) == canonical_text(first.doc)
    assert second.new_feature_ids == ()
    third = build_evidence(inputs(world, doc))  # from scratch, again
    assert canonical_text(third.doc) == canonical_text(first.doc)


# U4 ---------------------------------------------------------------------------------------------


@FAST
@given(
    data=st.data(),
    sequences=st.lists(st.integers(1, 9000), min_size=0, max_size=6, unique=True),
    statuses=st.lists(st.sampled_from(["published", "rejected", "merged"]), min_size=6, max_size=6),
)
def test_u4_ids_are_never_reused_or_renumbered(
    world: World, data: st.DataObject, sequences: list[int], statuses: list[str]
) -> None:
    template = build_evidence(
        inputs(world, decisions_doc([accept(world.ids[0])], [area(EMPTY_CORNER)]))
    ).doc["features"][0]
    existing_features = []
    for k, seq in enumerate(sequences):
        f = copy.deepcopy(template)
        f["id"] = f"bld_{SOURCE}_{seq:04d}"
        f["properties"]["status"] = statuses[k]
        f["properties"]["provenance"]["proposal_id"] = f"{SOURCE}_p_old{k:09d}"
        existing_features.append(f)
    existing = {"type": "FeatureCollection", "features": existing_features}

    review = data.draw(reviews(world.ids))
    result = build_evidence(inputs(world, decisions_doc(review, [area(EMPTY_CORNER)]),
                                   existing=existing))  # fmt: skip
    out = result.doc["features"]
    assert out[: len(existing_features)] == existing_features  # unchanged, same order
    new_seqs = [int(f["id"][-4:]) for f in out[len(existing_features):]]
    top = max(sequences, default=0)
    assert new_seqs == list(range(top + 1, top + 1 + len(new_seqs)))
    assert len({f["id"] for f in out}) == len(out)


# U5 ---------------------------------------------------------------------------------------------


@FAST
@given(
    data=st.data(),
    alignment_error=positive_m,
    pixel_size=pixel_sizes,
    reviewer=st.one_of(st.none(), positive_m),
)
def test_u5_position_error_is_at_least_the_rule_and_the_reviewers_value(
    world: World, data: st.DataObject, alignment_error: float, pixel_size: float,
    reviewer: float | None,
) -> None:  # fmt: skip
    extra = {} if reviewer is None else {"position_error_m": reviewer}
    doc = decisions_doc([accept(i, **extra) for i in world.ids])
    result = build_evidence(inputs(world, doc, alignment_error_m=alignment_error,
                                   pixel_size_m=pixel_size))  # fmt: skip
    assert result.doc["features"]
    for f in result.doc["features"]:
        p = f["properties"]
        prov = p["provenance"]
        assert prov["alignment_error_m"] == alignment_error
        assert prov["digitising_error_m"] >= max(1.0, 2.0 * pixel_size)
        floor = math.ceil(round(math.hypot(alignment_error, prov["digitising_error_m"]) * 10, 9))
        assert p["position_error_m"] >= floor / 10
        if reviewer is not None:
            assert p["position_error_m"] >= reviewer


# U6 ---------------------------------------------------------------------------------------------


def margin_rect(x0: int, y0: int, w: int, h: int) -> list[list[int]]:
    """A rectangle in the plate's left margin strip (x from 11 to 55), where no building is
    drawn and which lies inside the map area."""
    return [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]]


rects = st.builds(
    margin_rect,
    st.integers(11, 40),
    st.integers(11, HEIGHT - 120),
    st.integers(5, 15),
    st.integers(5, 100),
)


@FAST
@given(first=st.lists(rects, max_size=3), second=st.lists(rects, max_size=3))
def test_u6_reviewed_areas_are_kept_across_runs_and_mapped_area_is_set(
    world: World, first: list[list[list[int]]], second: list[list[list[int]]]
) -> None:
    a = build_evidence(inputs(world, decisions_doc([], [area(r) for r in first] or [area(EMPTY_CORNER)])))
    b = build_evidence(inputs(world, decisions_doc([], [area(r) for r in second] or [area(EMPTY_CORNER)]),
                              existing=a.doc))  # fmt: skip
    old = a.doc["reviewed_areas"]
    assert b.doc["reviewed_areas"][: len(old)] == old  # kept, unchanged, in order
    geometries = [x["geometry"] for x in b.doc["reviewed_areas"]]
    assert len({str(g) for g in geometries}) == len(geometries)  # no identical area twice
    assert b.doc["mapped_area"]["method"] == "map_area"
    assert a.doc["mapped_area"] == b.doc["mapped_area"]
    again = build_evidence(inputs(world, decisions_doc([], [area(r) for r in second] or [area(EMPTY_CORNER)]),
                                  existing=b.doc))  # fmt: skip
    assert again.doc["reviewed_areas"] == b.doc["reviewed_areas"]
