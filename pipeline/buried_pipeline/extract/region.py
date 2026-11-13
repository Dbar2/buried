"""An optional pixel region for `extract` (spec 04 requirement 23.5, design "Extraction region").

Pure. The region is a full-resolution pixel rectangle. It is clipped to the map area's bounding
box, so a region never reaches outside the map content, and every proposal that touches one of
the region's own sides is dropped: a building cut by the side of the region is not a building the
plate draws, and the next region would propose it whole.

Known limit, not hidden: the working image of a region has its own size, so its resampling grid
and its contrast tiles (CLAHE) are not those of a whole-plate run. A proposal well inside the
region can therefore differ from the same building in a whole-plate run (spec 04 requirement 8.5,
property S10). That property is not proved by this module and spec 04 task 2.6 stays open.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from buried_pipeline.errors import PipelineError
from buried_pipeline.extract.propose import Candidate

BORDER_TOLERANCE_PX = 1  # a vertex this close to a region side touches it
MAX_REGION_SIDE_M = 300.0


@dataclass(frozen=True)
class BorderSides:
    left: bool = False
    top: bool = False
    right: bool = False
    bottom: bool = False


def _rect(region: dict[str, int]) -> tuple[int, int, int, int]:
    return region["x"], region["y"], region["x"] + region["width"], region["y"] + region["height"]


class RegionTooLarge(PipelineError):
    """The region is longer than `MAX_REGION_SIDE_M` on a side."""


def check_region(
    region_px: dict[str, int], raster_size: tuple[int, int], source_pixel_size_m: float
) -> None:
    """Refuse a region off the raster or longer than `MAX_REGION_SIDE_M` on a side."""
    x0, y0, x1, y1 = _rect(region_px)
    width, height = raster_size
    if region_px["width"] < 1 or region_px["height"] < 1 or x0 < 0 or y0 < 0:
        raise PipelineError("the extraction region must be a rectangle with a positive size")
    if x1 > width or y1 > height:
        raise PipelineError(f"the extraction region reaches outside the plate ({width} x {height} "
                            "px)")
    longest_m = max(region_px["width"], region_px["height"]) * source_pixel_size_m
    if longest_m > MAX_REGION_SIDE_M:
        raise RegionTooLarge(f"the extraction region is {longest_m:.0f} m on a side; the limit is "
                             f"{MAX_REGION_SIDE_M:.0f} m")


def window_for(region_px: dict[str, int] | None, map_area_crop: dict[str, int]) -> dict[str, int]:
    """The rectangle to search: the map area's bounding box, or the region clipped to it."""
    if region_px is None:
        return dict(map_area_crop)
    rx0, ry0, rx1, ry1 = _rect(region_px)
    mx0, my0, mx1, my1 = _rect(map_area_crop)
    x0, y0, x1, y1 = max(rx0, mx0), max(ry0, my0), min(rx1, mx1), min(ry1, my1)
    if x1 <= x0 or y1 <= y0:
        raise PipelineError("the extraction region does not overlap the plate's map area")
    return {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}


def region_border_sides(region_px: dict[str, int], map_area_crop: dict[str, int]) -> BorderSides:
    """The sides of the window that are the region's own. A side lying on or beyond the map
    area's bounding box is the map area's edge, not a cut through the drawing."""
    rx0, ry0, rx1, ry1 = _rect(region_px)
    mx0, my0, mx1, my1 = _rect(map_area_crop)
    return BorderSides(left=rx0 > mx0, top=ry0 > my0, right=rx1 < mx1, bottom=ry1 < my1)


def touches_border(
    ring: Sequence[Sequence[int]], window: dict[str, int], sides: BorderSides
) -> bool:
    x0, y0, x1, y1 = _rect(window)
    t = BORDER_TOLERANCE_PX
    return any(
        (sides.left and x <= x0 + t)
        or (sides.right and x >= x1 - t)
        or (sides.top and y <= y0 + t)
        or (sides.bottom and y >= y1 - t)
        for x, y in ring
    )


def drop_touching_border(
    candidates: Sequence[Candidate], window: dict[str, int], sides: BorderSides
) -> tuple[list[Candidate], int]:
    kept = [c for c in candidates if not touches_border(c.pixel_polygon, window, sides)]
    return kept, len(candidates) - len(kept)
