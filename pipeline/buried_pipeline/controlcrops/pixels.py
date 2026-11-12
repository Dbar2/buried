"""Pure pixel maths for `control-crops`. No file or network access.

Pixels follow the control file's `gdal_corner` convention: (0, 0) is the top-left corner of the
top-left pixel, so the centre of that pixel is (0.5, 0.5). A predicted pixel is a float pair.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from buried_pipeline.align.affine import Affine6, Point, apply_affine, invert_affine

CROP_SIDE_M = 60.0
# The crosshair leaves a gap at its centre so the street crossing itself stays visible.
CROSSHAIR_GAP_M = 0.4
CROSSHAIR_ARM_M = 3.0
CROSSHAIR_MIN_GAP_PX = 3
CROSSHAIR_MIN_ARM_PX = 12
CROSSHAIR_ALPHA = 0.5
CROSSHAIR_RGB = (230, 30, 30)

ToRasterCrs = Callable[[float, float], Point]


@dataclass(frozen=True)
class CropWindow:
    left: int
    top: int
    width: int
    height: int
    shifted: bool  # True when the crop was moved to stay inside the raster


def predicted_pixel(
    point_26917: Point, to_raster_crs: ToRasterCrs, transform: Affine6
) -> Point:
    """Where the supplied georeferencing puts an EPSG:26917 point: (col, row) as floats.

    `to_raster_crs` takes EPSG:26917 (easting, northing) to the raster's CRS; `transform` is the
    raster's pixel-to-CRS affine (a, b, c, d, e, f).
    """
    x, y = to_raster_crs(*point_26917)
    return apply_affine(invert_affine(transform), x, y)


def pixel_in_raster(pixel: Point, width: int, height: int) -> bool:
    return 0.0 <= pixel[0] < width and 0.0 <= pixel[1] < height


def crop_size_px(
    side_m: float, pixel_size_x_m: float, pixel_size_y_m: float, width: int, height: int
) -> tuple[int, int]:
    """Crop width and height in pixels for a square of `side_m` metres at native resolution,
    never larger than the raster."""
    if min(side_m, pixel_size_x_m, pixel_size_y_m) <= 0:
        raise ValueError("side and pixel sizes must be positive")
    return (
        min(width, max(1, round(side_m / pixel_size_x_m))),
        min(height, max(1, round(side_m / pixel_size_y_m))),
    )


def crop_window(pixel: Point, size: tuple[int, int], width: int, height: int) -> CropWindow:
    """The crop centred on `pixel`, moved just far enough to lie inside the raster."""
    crop_w, crop_h = size
    if not (1 <= crop_w <= width and 1 <= crop_h <= height):
        raise ValueError("crop does not fit the raster")
    want_left = math.floor(pixel[0] - crop_w / 2.0 + 0.5)
    want_top = math.floor(pixel[1] - crop_h / 2.0 + 0.5)
    left = min(max(want_left, 0), width - crop_w)
    top = min(max(want_top, 0), height - crop_h)
    return CropWindow(left, top, crop_w, crop_h, shifted=(left, top) != (want_left, want_top))


def pixel_in_crop(pixel: Point, window: CropWindow) -> Point:
    """The pixel's position in the crop's own coordinates."""
    return (pixel[0] - window.left, pixel[1] - window.top)


def crosshair_sizes_px(pixel_size_x_m: float, pixel_size_y_m: float) -> tuple[int, int]:
    """(gap, arm) in pixels, from metres, with a floor so it stays visible on coarse plates."""
    pixel_m = max(pixel_size_x_m, pixel_size_y_m)
    gap = max(CROSSHAIR_MIN_GAP_PX, round(CROSSHAIR_GAP_M / pixel_m))
    arm = max(CROSSHAIR_MIN_ARM_PX, round(CROSSHAIR_ARM_M / pixel_m))
    return gap, arm


def to_rgb(bands: np.ndarray) -> np.ndarray:
    """(bands, rows, cols) uint8 to (rows, cols, 3). One band is repeated; three or more use the
    first three. Anything else stops, since a plate is never tinted or re-coloured here."""
    if bands.dtype != np.uint8:
        raise ValueError(f"expected 8-bit data, found {bands.dtype}")
    if bands.ndim != 3:
        raise ValueError("expected (bands, rows, cols)")
    if bands.shape[0] == 1:
        return np.repeat(np.moveaxis(bands, 0, -1), 3, axis=2)
    if bands.shape[0] >= 3:
        return np.ascontiguousarray(np.moveaxis(bands[:3], 0, -1))
    raise ValueError(f"cannot make RGB from {bands.shape[0]} bands")


def draw_crosshair(
    rgb: np.ndarray,
    centre: Point,
    gap_px: int,
    arm_px: int,
    alpha: float = CROSSHAIR_ALPHA,
    colour: tuple[int, int, int] = CROSSHAIR_RGB,
) -> np.ndarray:
    """A copy of `rgb` with a faint one-pixel crosshair centred on `centre` (crop coordinates).

    Four arms, each `arm_px` long and starting `gap_px` from the centre pixel, blended at `alpha`
    with `colour`. Pixels outside the image are skipped. Every other pixel is left unchanged.
    """
    if not 0.0 < alpha <= 1.0:
        raise ValueError("alpha must be in (0, 1]")
    out = rgb.copy()
    height, width = out.shape[:2]
    cx = math.floor(centre[0])
    cy = math.floor(centre[1])
    blend = np.array(colour, dtype=float) * alpha
    keep = 1.0 - alpha

    def paint(x: int, y: int) -> None:
        if 0 <= x < width and 0 <= y < height:
            out[y, x] = np.round(out[y, x] * keep + blend).astype(np.uint8)

    for step in range(gap_px, gap_px + arm_px):
        paint(cx + step, cy)
        paint(cx - step, cy)
        paint(cx, cy + step)
        paint(cx, cy - step)
    return out
