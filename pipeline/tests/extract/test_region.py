"""`extract/region.py`: the pure region rules (spec 04 task 2.5, requirement 23.5).

What these tests do not claim: that a proposal well inside a region equals the same building in a
whole-plate run (spec 04 requirement 8.5, property S10, task 2.6). The working image of a region
has its own resampling grid and contrast tiles, so that is not guaranteed here and is not tested
here.
"""

from __future__ import annotations

import pytest

from buried_pipeline.errors import PipelineError
from buried_pipeline.extract.propose import Candidate
from buried_pipeline.extract.region import (
    BorderSides,
    RegionTooLarge,
    check_region,
    drop_touching_border,
    region_border_sides,
    touches_border,
    window_for,
)
from buried_pipeline.extract.score import make_quality

MAP_CROP = {"x": 100, "y": 100, "width": 1000, "height": 800}


def region(x: int, y: int, w: int, h: int) -> dict[str, int]:
    return {"x": x, "y": y, "width": w, "height": h}


def candidate(*ring: tuple[int, int]) -> Candidate:
    q = make_quality(outline_closure=1, fill_uniformity=1, text_clear=1, edge_clear=1,
                     shape_fidelity=1)  # fmt: skip
    return Candidate(pixel_polygon=tuple(ring), tone_class="mid", quality=q, weaknesses=())


def test_no_region_searches_the_whole_map_area() -> None:
    assert window_for(None, MAP_CROP) == MAP_CROP


def test_a_region_is_clipped_to_the_map_areas_bounding_box() -> None:
    assert window_for(region(0, 0, 400, 400), MAP_CROP) == region(100, 100, 300, 300)
    assert window_for(region(300, 300, 200, 200), MAP_CROP) == region(300, 300, 200, 200)


def test_a_region_off_the_map_area_is_refused() -> None:
    with pytest.raises(PipelineError, match="does not overlap"):
        window_for(region(0, 0, 50, 50), MAP_CROP)


def test_only_the_regions_own_sides_are_borders() -> None:
    # Reaches past the map area on the left and top: those sides are not the region's border.
    sides = region_border_sides(region(0, 0, 500, 500), MAP_CROP)
    assert sides == BorderSides(left=False, top=False, right=True, bottom=True)
    inside = region_border_sides(region(300, 300, 200, 200), MAP_CROP)
    assert inside == BorderSides(True, True, True, True)
    whole = region_border_sides(region(100, 100, 1000, 800), MAP_CROP)
    assert whole == BorderSides()


def test_a_polygon_touching_a_region_border_is_dropped_and_counted() -> None:
    window = region(300, 300, 200, 200)
    sides = BorderSides(True, True, True, True)
    inside = candidate((350, 350), (400, 350), (400, 400), (350, 400))
    on_left = candidate((300, 350), (340, 350), (340, 400), (300, 400))
    near_bottom = candidate((350, 450), (400, 450), (400, 499), (350, 499))
    kept, dropped = drop_touching_border([inside, on_left, near_bottom], window, sides)
    assert kept == [inside] and dropped == 2


def test_a_side_that_is_not_the_regions_border_drops_nothing() -> None:
    window = region(100, 100, 300, 300)
    ring = [(100, 150), (150, 150), (150, 200), (100, 200)]
    assert not touches_border(ring, window, BorderSides(left=False, right=True))
    assert touches_border(ring, window, BorderSides(left=True))


def test_the_size_limit_is_in_metres_on_the_ground() -> None:
    check_region(region(0, 0, 5000, 5000), (6000, 6000), 0.059)  # 295 m
    with pytest.raises(RegionTooLarge, match="limit is 300 m"):
        check_region(region(0, 0, 5200, 100), (6000, 6000), 0.059)  # 307 m


def test_a_region_off_the_raster_or_empty_is_refused() -> None:
    with pytest.raises(PipelineError, match="outside the plate"):
        check_region(region(5900, 0, 200, 100), (6000, 6000), 0.059)
    with pytest.raises(PipelineError, match="positive size"):
        check_region(region(0, 0, 0, 100), (6000, 6000), 0.059)
