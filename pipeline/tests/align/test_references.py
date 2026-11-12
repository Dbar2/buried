from __future__ import annotations

import json
import re
from dataclasses import replace
from pathlib import Path

import pytest

from buried_pipeline.align.control import ControlFilePoint, parse_control_file
from buried_pipeline.align.references import check_references, point_problem
from buried_pipeline.errors import PipelineError
from buried_pipeline.validate.schema import load_schema

FIXTURES = Path(__file__).parent.parent / "fixtures" / "align"


def load(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def layers():
    return {
        "present_toronto_intersections_2026": load("layer_intersections.json"),
        "present_toronto_building_outlines_2026": load("layer_buildings.json"),
    }


@pytest.fixture
def points() -> list[ControlFilePoint]:
    return parse_control_file(load("control_ok.json"), "fip_v3_1911_229").points


def by_id(points: list[ControlFilePoint], pid: str) -> ControlFilePoint:
    return next(p for p in points if p.id == pid)


def test_good_file_has_no_problems(points, layers) -> None:
    assert check_references(points, layers) == []


def test_reference_off_by_more_than_a_millimetre_is_refused(points, layers) -> None:
    p = by_id(points, "p1")
    moved = replace(p, reference=(p.reference[0] + 0.002, p.reference[1]))
    msg = point_problem(moved, layers)
    assert msg and "0.002 m" in msg
    assert check_references([moved], layers)[0].startswith("control point p1:")


def test_reference_within_a_millimetre_is_accepted(points, layers) -> None:
    p = by_id(points, "p1")
    near = replace(p, reference=(p.reference[0] + 0.0009, p.reference[1]))
    assert point_problem(near, layers) is None


def test_missing_feature_is_refused(points, layers) -> None:
    p = replace(by_id(points, "p1"), reference_feature_id="9999")
    assert "not in present_toronto_intersections_2026" in (point_problem(p, layers) or "")


def test_unregistered_or_missing_layer_is_refused(points, layers) -> None:
    del layers["present_toronto_intersections_2026"]
    msg = point_problem(by_id(points, "p1"), layers) or ""
    assert "no present layer" in msg


def test_kind_must_cite_its_own_layer(points, layers) -> None:
    p = replace(by_id(points, "p1"), reference_source="present_toronto_building_outlines_2026")
    assert "may cite" in (point_problem(p, layers) or "")


def test_building_corner_vertex_checks(points, layers) -> None:
    p = by_id(points, "p6")
    assert point_problem(p, layers) is None
    wrong_vertex = replace(p, reference_vertex=(0, 1))
    assert "from the cited building corner" in (point_problem(wrong_vertex, layers) or "")
    out_of_range = replace(p, reference_vertex=(0, 9))
    assert "vertex 9 does not exist" in (point_problem(out_of_range, layers) or "")
    no_polygon = replace(p, reference_vertex=(3, 0))
    assert "no polygon 3" in (point_problem(no_polygon, layers) or "")


def test_multipolygon_polygon_index(points, layers) -> None:
    p = replace(
        by_id(points, "p6"),
        reference_feature_id="B2",
        reference_vertex=(1, 1),
        reference=(630130.0, 4833800.0),
    )
    assert point_problem(p, layers) is None


def test_intersection_citing_a_polygon_is_refused(points, layers) -> None:
    layers["present_toronto_intersections_2026"]["features"][0]["geometry"] = {
        "type": "Polygon",
        "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    }
    assert "not a Point" in (point_problem(by_id(points, "p1"), layers) or "")


def test_every_bad_point_is_named(points, layers) -> None:
    bad = [replace(p, reference_feature_id="nope") for p in points[:2]]
    messages = check_references(bad, layers)
    assert [m.split(":")[0] for m in messages] == ["control point p1", "control point p2"]


# control file shape


def test_parse_good_file(points) -> None:
    assert [p.id for p in points] == ["p1", "p2", "p3", "p4", "p5", "p6"]
    assert by_id(points, "p6").reference_vertex == (0, 2)


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda d: d.update(source="fip_v3_1935_229"), "is for"),
        (lambda d: d["points"][1].update(id="p1"), "not unique"),
    ],
)
def test_parse_rejects(mutate, message: str) -> None:
    doc = load("control_ok.json")
    mutate(doc)
    with pytest.raises(PipelineError, match=message):
        parse_control_file(doc, "fip_v3_1911_229")


SCHEMA = load_schema(Path(__file__).resolve().parents[3])


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda d: d.update(pixel_convention="centre"), "'gdal_corner' was expected"),
        (lambda d: d.update(schema_version="2.0"), "does not match"),
        (lambda d: d.update(extra=1), "Additional properties"),
        (lambda d: d["points"].__delitem__(slice(2, None)), "needs at least 3"),
        (lambda d: d["points"][0].update(reference=[-79.35, 43.65]), "minimum of 166000"),
        (lambda d: d["points"][0].update(pixel=[-1, 5]), "minimum of 0"),
        (lambda d: d["points"][0].update(pixel=[1, "a"]), "not of type 'number'"),
        (lambda d: d["points"][0].update(reference_kind="landmark"), "is not one of"),
        (lambda d: d["points"][5].pop("reference_vertex"), "'reference_vertex' is a required"),
        (lambda d: d["points"][0].update(description=""), "non-empty"),
        (lambda d: d["points"][0].update(surprise=True), "Additional properties"),
    ],
)
def test_control_file_shape_is_the_schema(mutate, message: str) -> None:
    doc = load("control_ok.json")
    mutate(doc)
    problems = [i.message for i in SCHEMA.issues("controlPoints", doc)]
    assert any(re.search(message, p) for p in problems), problems
