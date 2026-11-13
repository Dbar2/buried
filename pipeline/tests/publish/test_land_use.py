"""Publish: land-use areas traced by a person (spec 04 requirement 24, tasks 2.1 and 19.1).

The use texts below are placeholders, not readings of any plate: no real use enters a fixture.
"""

from __future__ import annotations

import copy
import hashlib
import json
from typing import Any

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from shapely.geometry import shape

from buried_pipeline.errors import PipelineError
from buried_pipeline.io.registry import load_registry
from buried_pipeline.publish.build import canonical_text
from buried_pipeline.publish.decisions import trace_review_item_id
from buried_pipeline.publish.run import prepare_publish
from buried_pipeline.validate.schema import load_schema
from tests.extract.test_run import HEIGHT, WIDTH
from tests.publish.strategies import (
    CONFIRMED_AT,
    NOW,
    REVIEWER,
    SOURCE,
    World,
    accept,
    decisions_doc,
    make_world,
)

USE = "Placeholder lettering"
# The synthetic plate's map area is (10, 10) to (WIDTH - 10, HEIGHT - 10). The three drawn
# buildings sit left of x = 250, so a box on the right misses them.
BOX = (400, 100, 520, 200)


@pytest.fixture(scope="module")
def world(tmp_path_factory: pytest.TempPathFactory) -> World:
    return make_world(tmp_path_factory.mktemp("land_use"))


def ring(x0: int, y0: int, x1: int, y1: int) -> list[list[int]]:
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]


def trace(box: tuple[int, int, int, int] = BOX, use: str | None = USE, **extra: Any) -> dict:
    x0, y0, _, _ = box
    doc: dict[str, Any] = {
        "type": "trace",
        "kind": "land_use",
        "pixel_geometry": {"type": "Polygon", "coordinates": [ring(*box)]},
        "attributes": {"use": use} if use is not None else {},
        "attribute_reads": [
            {"attribute": "use", "crop_px": {"x": x0 + 4, "y": y0 + 4, "width": 40, "height": 12},
             "read_by": "person"}
        ],  # fmt: skip
        "confirmed_by": REVIEWER,
        "confirmed_at": CONFIRMED_AT,
    }
    doc.update(extra)
    return doc


def v2(world: World, traces: list[dict[str, Any]], accept_all: bool = True) -> dict[str, Any]:
    review = [{**accept(pid), "type": "accept"} for pid in world.ids] if accept_all else []
    for d in review:
        del d["decision"]
    doc = decisions_doc(review)
    doc["version"] = 2
    doc["decisions"] = [*review, *traces]
    return doc


def publish(world: World, doc: dict[str, Any], existing: dict[str, Any] | None = None):
    registry = load_registry(world.paths.sources_json)
    schema = load_schema(world.paths.root)
    target = world.paths.evidence_file(SOURCE)
    saved = target.read_text(encoding="utf-8") if target.is_file() else None
    try:
        if existing is None:
            target.unlink(missing_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(canonical_text(existing), encoding="utf-8")
        return prepare_publish(world.paths, registry, schema, SOURCE, doc, NOW)
    finally:
        if saved is None:
            target.unlink(missing_ok=True)
        else:
            target.write_text(saved, encoding="utf-8")


def refusal_text(world: World, doc: dict[str, Any]) -> str:
    with pytest.raises(PipelineError) as raised:
        publish(world, doc)
    return str(raised.value)


def land_use(plan: Any) -> list[dict[str, Any]]:
    return [f for f in plan.build.doc["features"] if f["properties"]["kind"] == "land_use"]


# --- what is published ----------------------------------------------------------------------------


def test_a_traced_area_is_published_as_a_valid_use_feature(world: World) -> None:
    plan = publish(world, v2(world, [trace()]))
    assert plan.errors == []
    ids = [f["id"] for f in plan.build.doc["features"]]
    assert ids == [f"bld_{SOURCE}_000{n}" for n in (1, 2, 3)] + [f"use_{SOURCE}_0004"]
    (feature,) = land_use(plan)
    p = feature["properties"]
    assert p["attributes"] == {"use": USE}
    assert p["confidence"] == "documented"
    assert p["confidence_reason"] == f"Area and use traced by a person from {SOURCE}"
    assert p["position_error_m"] == 4.5  # sqrt(4.3^2 + 1.0^2) up to 0.1 m, as for a building
    assert p["observations"] == [
        {"source": SOURCE, "present": True, "visibility": "clear", "method": "origin"}
    ]
    prov = p["provenance"]
    assert prov["confirmed_by"] == REVIEWER and prov["origin_source"] == SOURCE
    assert prov["crop_px"] == {"x": 400, "y": 100, "width": 120, "height": 100}
    assert prov["attribute_reads"] == [
        {"attribute": "use", "crop_px": {"x": 404, "y": 104, "width": 40, "height": 12},
         "read_by": "person", "confirmed_by": REVIEWER, "confirmed_at": CONFIRMED_AT}
    ]  # fmt: skip
    assert "extraction_params_id" not in prov and "tone_class" not in prov
    assert len(feature["geometry"]["coordinates"][0]) == 5
    counts = plan.build.counts
    assert (counts.accepted, counts.published_now) == (4, 4)


def test_the_review_item_id_is_the_documented_hash(world: World) -> None:
    plan = publish(world, v2(world, [trace()]))
    (feature,) = land_use(plan)
    text = json.dumps(
        {"coordinates": [ring(*BOX)], "kind": "land_use", "type": "Polygon"},
        sort_keys=True, indent=2, ensure_ascii=False,
    ) + "\n"  # fmt: skip
    expected = f"{SOURCE}_t_{hashlib.sha256(text.encode()).hexdigest()[:12]}"
    assert feature["properties"]["provenance"]["proposal_id"] == expected
    assert expected == trace_review_item_id(SOURCE, "land_use", "Polygon", [ring(*BOX)])
    assert plan.build.review_item_by_feature[feature["id"]] == expected


def test_the_reviewer_may_raise_the_error_and_the_confidence(world: World) -> None:
    doc = v2(world, [trace(position_error_m=9.0, confidence="estimated",
                           confidence_reason="Edge of the yard is faint")])  # fmt: skip
    (feature,) = land_use(publish(world, doc))
    assert feature["properties"]["position_error_m"] == 9.0
    assert feature["properties"]["confidence"] == "estimated"
    low = v2(world, [trace(position_error_m=0.5)])
    (feature,) = land_use(publish(world, low))
    assert feature["properties"]["position_error_m"] == 4.5  # never below the rule


def test_traces_may_come_before_the_accepts_in_the_file(world: World) -> None:
    doc = v2(world, [trace()], accept_all=False)
    doc["decisions"] = [trace(), *[{**accept(pid), "type": "accept"} for pid in world.ids]]
    for d in doc["decisions"][1:]:
        del d["decision"]
    plan = publish(world, doc)
    assert plan.errors == [] and len(land_use(plan)) == 1


# --- refusals -------------------------------------------------------------------------------------


def test_an_area_without_lettered_text_is_refused(world: World) -> None:
    assert "its use as lettered" in refusal_text(world, v2(world, [trace(use=None)]))
    blank = v2(world, [trace(use="   ")])
    assert "non-empty text" in refusal_text(world, blank)


def test_an_area_without_the_crop_it_was_read_from_is_refused(world: World) -> None:
    for reads in ([], None):
        extra = {} if reads is None else {"attribute_reads": reads}
        doc = v2(world, [{k: v for k, v in trace(**extra).items() if reads is not None
                          or k != "attribute_reads"}])  # fmt: skip
        assert "crop its use was read from" in refusal_text(world, doc)
    no_crop = trace()
    del no_crop["attribute_reads"][0]["crop_px"]
    assert "needs a crop_px" in refusal_text(world, v2(world, [no_crop]))
    other = trace()
    other["attribute_reads"][0]["attribute"] = "storeys"
    text = refusal_text(world, v2(world, [other]))
    assert "crop its use was read from" in text


def test_an_unconfirmed_trace_is_refused_not_dropped(world: World) -> None:
    for key in ("confirmed_by", "confirmed_at"):
        t = trace()
        del t[key]
        assert "a trace needs" in refusal_text(world, v2(world, [t]))


@pytest.mark.parametrize(
    "box",
    [
        (5, 100, 120, 200),  # crosses the left margin
        (400, 100, WIDTH - 5, 200),  # crosses the right margin
        (400, 2, 520, 200),  # crosses the top margin
        (0, 0, WIDTH, HEIGHT),  # the whole photograph
        (400, 100, WIDTH + 50, 200),  # off the plate
    ],
)
def test_an_area_outside_the_map_area_is_refused(world: World, box: tuple[int, ...]) -> None:
    text = refusal_text(world, v2(world, [trace(box)]))  # type: ignore[arg-type]
    assert "outside the plate" in text or "not wholly inside the plate's map area" in text


def test_an_area_may_touch_the_map_area_edge(world: World) -> None:
    plan = publish(world, v2(world, [trace((10, 100, 120, 200))]))
    assert plan.errors == [] and len(land_use(plan)) == 1


def test_a_read_crop_off_the_plate_is_refused(world: World) -> None:
    t = trace()
    t["attribute_reads"][0]["crop_px"] = {"x": WIDTH - 5, "y": 120, "width": 40, "height": 12}
    assert "outside the plate" in refusal_text(world, v2(world, [t]))


def test_a_trace_that_is_not_a_simple_polygon_is_refused(world: World) -> None:
    t = trace()
    t["pixel_geometry"]["coordinates"] = [[[400, 100], [520, 200], [520, 100], [400, 200]]]
    assert "not one simple polygon" in refusal_text(world, v2(world, [t]))
    line = trace()
    line["pixel_geometry"] = {"type": "LineString", "coordinates": [[400, 100], [520, 200]]}
    assert "must be a Polygon" in refusal_text(world, v2(world, [line]))


@pytest.mark.parametrize("kind", ["building", "water"])
def test_the_other_trace_kinds_are_still_refused_by_name(world: World, kind: str) -> None:
    text = refusal_text(world, v2(world, [{**trace(), "kind": kind}]))
    assert f"trace of kind '{kind}' is not supported yet" in text


def test_tracing_the_same_area_twice_is_refused(world: World) -> None:
    assert "more than one trace" in refusal_text(world, v2(world, [trace(), trace()]))


def test_a_material_still_needs_its_read(world: World) -> None:
    t = trace()
    t["attributes"]["material"] = "Placeholder"
    assert "material was set without a read" in refusal_text(world, v2(world, [t]))


# --- stability ------------------------------------------------------------------------------------


def test_publishing_twice_gives_the_same_file(world: World) -> None:
    doc = v2(world, [trace(), trace((400, 300, 520, 400), use="Second placeholder")])
    first = publish(world, doc)
    assert first.errors == []
    again = publish(world, doc, existing=copy.deepcopy(first.build.doc))
    assert again.text == first.text
    assert again.build.new_feature_ids == ()
    assert again.build.counts.already_published == 5


def test_the_order_of_traces_in_the_file_does_not_change_the_ids(world: World) -> None:
    one, two = trace(), trace((400, 300, 520, 400), use="Second placeholder")
    a = publish(world, v2(world, [one, two]))
    b = publish(world, v2(world, [two, one]))
    assert a.text == b.text


def test_a_later_trace_continues_the_numbering_and_leaves_the_first_alone(world: World) -> None:
    first = publish(world, v2(world, [trace()]))
    both = v2(world, [trace(), trace((400, 300, 520, 400), use="Second placeholder")])
    later = publish(world, both, existing=copy.deepcopy(first.build.doc))
    assert later.errors == []
    assert later.build.new_feature_ids == (f"use_{SOURCE}_0005",)
    assert later.build.doc["features"][:4] == first.build.doc["features"]


# --- properties -----------------------------------------------------------------------------------

MARGIN = 10


@settings(max_examples=60, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    x0=st.integers(0, WIDTH + 20),
    y0=st.integers(0, HEIGHT + 20),
    w=st.integers(2, 200),
    h=st.integers(2, 200),
)
def test_published_areas_never_reach_outside_the_map_area(
    world: World, x0: int, y0: int, w: int, h: int
) -> None:
    """A land-use area is published only when it lies inside the map area, and then its ground
    geometry lies inside the file's `mapped_area`."""
    box = (x0, y0, x0 + w, y0 + h)
    inside = (
        box[0] >= MARGIN and box[1] >= MARGIN and box[2] <= WIDTH - MARGIN
        and box[3] <= HEIGHT - MARGIN
    )  # fmt: skip
    try:
        plan = publish(world, v2(world, [trace(box)]))
    except PipelineError:
        assert not inside
        return
    assert inside and plan.errors == []
    (feature,) = land_use(plan)
    mapped = shape(plan.build.doc["mapped_area"]["geometry"])
    assert mapped.buffer(0.01).covers(shape(feature["geometry"]))


@settings(max_examples=40, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    boxes=st.lists(
        st.tuples(st.integers(300, 500), st.integers(20, 400), st.integers(5, 80),
                  st.integers(5, 80)),
        min_size=1, max_size=4, unique=True,
    ),  # fmt: skip
    use=st.text(alphabet="ABCDEFGH ", min_size=1, max_size=12).filter(lambda s: s.strip() != ""),
)
def test_ids_are_stable_and_unique(
    world: World, boxes: list[tuple[int, int, int, int]], use: str
) -> None:
    traces = [trace((x, y, x + w, y + h), use=use) for x, y, w, h in boxes]
    plan = publish(world, v2(world, traces))
    assert plan.errors == []
    ids = [f["id"] for f in land_use(plan)]
    assert len(ids) == len(set(ids)) == len(boxes)
    assert ids == sorted(ids)
    reversed_plan = publish(world, v2(world, list(reversed(traces))))
    assert reversed_plan.text == plan.text
    again = publish(world, v2(world, traces), existing=copy.deepcopy(plan.build.doc))
    assert again.text == plan.text
