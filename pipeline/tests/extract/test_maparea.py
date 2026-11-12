"""The map area reader (spec 02 task 14.1, requirement 16) and the part of property X6 that does
not need the extractor: a map area vertex outside the raster is always refused."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from buried_pipeline.errors import PipelineError
from buried_pipeline.extract.maparea import (
    bounding_box,
    ground_polygon,
    load_map_area,
    map_area_relative,
    missing_message,
    parse_map_area,
    vertices_outside_raster,
)
from buried_pipeline.validate.schema import load_schema
from tests.conftest import make_root

SOURCE = "fip_v3_1911_229"
SQUARE = [[100, 150], [4100, 150], [4100, 3050], [100, 3050]]


def doc(polygon: list[list[int]] | None = None, **over: Any) -> dict[str, Any]:
    d: dict[str, Any] = {
        "schema_version": "1.1.0",
        "source": SOURCE,
        "pixel_convention": "gdal_corner",
        "pixel_polygon": polygon or SQUARE,
        "excluded": "margin, title block, scale bar (synthetic)",
        "confirmed_by": "test reviewer",
        "confirmed_at": "2026-11-12T10:00:00Z",
    }
    d.update(over)
    return d


def parse(d: dict[str, Any], width: int = 4200, height: int = 3100):
    return parse_map_area(d, SOURCE, width, height, "0" * 64)


# --- pure functions -------------------------------------------------------------------------------


def test_bounding_box_of_a_rectangle_and_of_a_slanted_polygon() -> None:
    assert bounding_box(SQUARE) == {"x": 100, "y": 150, "width": 4000, "height": 2900}
    assert bounding_box([[10, 20], [90, 5], [95, 60], [30, 80]]) == {
        "x": 10, "y": 5, "width": 85, "height": 75,
    }


def test_vertices_on_the_far_edge_are_inside_and_one_past_it_is_outside() -> None:
    assert vertices_outside_raster([[0, 0], [400, 300]], 400, 300) == []
    assert vertices_outside_raster([[401, 0], [0, 301], [-1, 5]], 400, 300) == [
        (401, 0), (0, 301), (-1, 5),
    ]


def test_ground_polygon_is_closed_and_keeps_vertex_order() -> None:
    mapping = lambda x, y: (632000.0 + 0.05 * x, 4835000.0 - 0.05 * y)  # noqa: E731
    g = ground_polygon(mapping, [[0, 0], [100, 0], [100, 40], [0, 40]])
    ring = g["coordinates"][0]
    assert g["type"] == "Polygon"
    assert ring[0] == ring[-1] == [632000.0, 4835000.0]
    assert ring[2] == pytest.approx([632005.0, 4834998.0])
    assert len(ring) == 5


def test_the_missing_message_names_the_file_to_write() -> None:
    text = missing_message(SOURCE)
    assert map_area_relative(SOURCE) == f"data/control/map_area/{SOURCE}.json"
    assert map_area_relative(SOURCE) in text
    assert "margin" in text and "archive labels" in text


# --- parse_map_area -------------------------------------------------------------------------------


def test_a_good_map_area_parses_with_its_crop() -> None:
    area = parse(doc(fold_lines=[[[2000, 150], [2000, 3050]]]))
    assert area.crop_px == {"x": 100, "y": 150, "width": 4000, "height": 2900}
    assert area.fold_lines == (((2000, 150), (2000, 3050)),)
    assert area.sha256 == "0" * 64
    assert area.confirmed_by == "test reviewer"


def test_a_map_area_for_another_source_is_refused() -> None:
    with pytest.raises(PipelineError, match="is the map area for fip_v3_1935_229"):
        parse(doc(source="fip_v3_1935_229"))


def test_a_polygon_that_crosses_itself_is_refused() -> None:
    with pytest.raises(PipelineError, match="not a single valid polygon"):
        parse(doc([[0, 0], [100, 100], [100, 0], [0, 100]]))


def test_a_fold_line_outside_the_raster_is_refused() -> None:
    with pytest.raises(PipelineError, match="outside the raster"):
        parse(doc(fold_lines=[[[10, 10], [5000, 10]]]))


def test_the_refusal_lists_a_few_vertices_and_the_file_to_fix() -> None:
    far = [[0, 0], [9000, 0], [9000, 9000], [0, 9000]]
    with pytest.raises(PipelineError) as caught:
        parse(doc(far))
    assert "(9000, 0)" in str(caught.value)
    assert map_area_relative(SOURCE) in str(caught.value)


# --- X6, the part that needs no extractor --------------------------------------------------------

W, H = 800, 600
ints = st.integers(0, 2000)


@st.composite
def rectangles(draw: st.DrawFn):
    x0 = draw(st.integers(-200, W + 200))
    y0 = draw(st.integers(-200, H + 200))
    x1 = draw(st.integers(-200, W + 200))
    y1 = draw(st.integers(-200, H + 200))
    if x0 == x1 or y0 == y1:
        x1, y1 = x0 + 10, y0 + 10
    lo_x, hi_x, lo_y, hi_y = min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1)
    return [[lo_x, lo_y], [hi_x, lo_y], [hi_x, hi_y], [lo_x, hi_y]]


@settings(max_examples=300)
@given(polygon=rectangles())
def test_x6_a_vertex_outside_the_raster_is_refused_and_inside_is_accepted(polygon) -> None:
    """tile, extract and publish all read the map area through parse_map_area, so refusing here
    refuses all three (requirement 16.4)."""
    inside = all(0 <= x <= W and 0 <= y <= H for x, y in polygon)
    if inside:
        assert parse(doc(polygon), W, H).crop_px["width"] > 0
    else:
        with pytest.raises(PipelineError, match="outside the raster"):
            parse(doc(polygon), W, H)


# --- load_map_area (reads the disk) ---------------------------------------------------------------


def write(tmp_path: Path, d: dict[str, Any]):
    paths = make_root(tmp_path)
    paths.map_area_dir.mkdir(parents=True)
    paths.map_area_file(SOURCE).write_text(json.dumps(d), encoding="utf-8")
    return paths


def test_load_reads_and_hashes_the_file(tmp_path: Path) -> None:
    paths = write(tmp_path, doc())
    area = load_map_area(paths, load_schema(paths.root), SOURCE, 4200, 3100)
    assert area.pixel_polygon[0] == (100, 150)
    assert len(area.sha256) == 64


def test_load_with_no_file_names_the_file(tmp_path: Path) -> None:
    paths = make_root(tmp_path)
    with pytest.raises(PipelineError, match=f"data/control/map_area/{SOURCE}.json"):
        load_map_area(paths, load_schema(paths.root), SOURCE, 4200, 3100)


def test_load_with_a_schema_problem_lists_it(tmp_path: Path) -> None:
    bad = doc()
    del bad["confirmed_by"]
    paths = write(tmp_path, bad)
    with pytest.raises(PipelineError, match="does not match the Schema"):
        load_map_area(paths, load_schema(paths.root), SOURCE, 4200, 3100)


def test_load_does_not_create_or_change_anything(tmp_path: Path) -> None:
    paths = write(tmp_path, doc())
    before = paths.map_area_file(SOURCE).read_bytes()
    load_map_area(paths, load_schema(paths.root), SOURCE, 4200, 3100)
    assert paths.map_area_file(SOURCE).read_bytes() == before
    assert [p.name for p in paths.map_area_dir.iterdir()] == [f"{SOURCE}.json"]
