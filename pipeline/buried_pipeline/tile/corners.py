"""Pure tile maths: output size, corner coordinates and the bilinear check.

A tile is the plate shrunk to at most 4096 px on its long edge. Its four corners are the chosen
transform applied to the *full-resolution* raster's pixel corners, so they do not depend on how
far the image was shrunk. Consumers drape the image on the quad those corners make, which is an
exact affine map only if bilinear interpolation between the corners reproduces the chosen
transform; `bilinear_error_m` measures that (spec 02 requirement 7.5).
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence

Point = tuple[float, float]
Mapping = Callable[[float, float], Point]  # raster pixel (x, y) -> EPSG:26917 (E, N)

MAX_LONG_EDGE_PX = 4096
BILINEAR_TOLERANCE_M = 0.01
CORNER_NAMES = ("top_left", "top_right", "bottom_right", "bottom_left")


def tile_size(width: int, height: int, max_long_edge: int = MAX_LONG_EDGE_PX) -> tuple[int, int]:
    """Output size in pixels: the long edge is at most `max_long_edge`, aspect kept, never
    enlarged, each edge at least 1 px."""
    if width < 1 or height < 1:
        raise ValueError("raster has no pixels")
    long_edge = max(width, height)
    if long_edge <= max_long_edge:
        return (width, height)
    scale = max_long_edge / long_edge
    return (max(1, round(width * scale)), max(1, round(height * scale)))


def pixel_corners(width: int, height: int) -> list[Point]:
    """Top-left, top-right, bottom-right, bottom-left corners of the full-resolution raster in
    pixel coordinates (GDAL convention: (0, 0) is the top-left corner of the top-left pixel)."""
    return [(0.0, 0.0), (float(width), 0.0), (float(width), float(height)), (0.0, float(height))]


def tile_corners(mapping: Mapping, width: int, height: int) -> list[Point]:
    """The chosen transform applied to the full-resolution pixel corners (requirement 7.4)."""
    return [mapping(x, y) for x, y in pixel_corners(width, height)]


def check_fractions() -> list[Point]:
    """(u, v) across and down the raster at the nine check points."""
    return [(u, v) for v in (0.0, 0.5, 1.0) for u in (0.0, 0.5, 1.0)]


def bilinear(corners: Sequence[Point], u: float, v: float) -> Point:
    """Position at fraction u across and v down the quad (top_left, top_right, bottom_right,
    bottom_left)."""
    tl, tr, br, bl = corners
    top = (tl[0] + u * (tr[0] - tl[0]), tl[1] + u * (tr[1] - tl[1]))
    bottom = (bl[0] + u * (br[0] - bl[0]), bl[1] + u * (br[1] - bl[1]))
    return (top[0] + v * (bottom[0] - top[0]), top[1] + v * (bottom[1] - top[1]))


def bilinear_error_m(mapping: Mapping, corners: Sequence[Point], width: int, height: int) -> float:
    """Largest distance between the chosen transform and bilinear interpolation of the corners
    at the nine check points."""
    worst = 0.0
    for u, v in check_fractions():
        exact = mapping(u * width, v * height)
        approx = bilinear(corners, u, v)
        worst = max(worst, math.dist(exact, approx))
    return worst


def tile_pixel_size_m(
    source_pixel_size_m: float, width: int, height: int, tile_width: int, tile_height: int
) -> float:
    """Metres per tile pixel: the source pixel size times the larger shrink factor."""
    return source_pixel_size_m * max(width / tile_width, height / tile_height)
