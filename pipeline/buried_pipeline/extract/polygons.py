"""From a region mask to a polygon (design.md "Steps" 5 and 6).

Contour tracing, Douglas-Peucker simplification, conversion to full-resolution integer pixel
coordinates, validity repair, and the chosen transform applied to the pixel vertices.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence

import cv2
import numpy as np
from shapely.geometry import Polygon
from shapely.validation import make_valid

PixelRing = tuple[tuple[int, int], ...]
Mapping = Callable[[float, float], tuple[float, float]]  # full-resolution pixel -> EPSG:26917

GROUND_DECIMALS = 6


def trace_outer_contour(mask: np.ndarray) -> np.ndarray | None:
    """The longest external contour of a binary mask as an (N, 2) int array of (x, y) pixel
    indices, or None if the mask is empty."""
    contours, _ = cv2.findContours(
        mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE
    )
    if not contours:
        return None
    best = max(contours, key=lambda c: (cv2.contourArea(c), len(c)))
    return best.reshape(-1, 2)


def simplify(contour: np.ndarray, tolerance_px: float) -> np.ndarray:
    """Douglas-Peucker at `tolerance_px`; returns an (M, 2) int array."""
    approx = cv2.approxPolyDP(contour.reshape(-1, 1, 2).astype(np.int32), tolerance_px, True)
    return approx.reshape(-1, 2)


def outer_boundary(
    simplified: np.ndarray, offset_xy: tuple[int, int]
) -> list[tuple[float, float]]:
    """Corner-convention ring of the pixels a traced contour encloses.

    A traced contour runs through the centres of the region's outermost pixels, half a pixel inside
    the region's true edge. The ring is the simplified contour moved to corner coordinates (a pixel
    index i has its centre at i + 0.5) and grown by half a pixel with mitred corners, so a
    rectangular region comes back as the rectangle it is. Coordinates are in working pixels of the
    whole working image.
    """
    pts = [(float(u) + offset_xy[0] + 0.5, float(v) + offset_xy[1] + 0.5) for u, v in simplified]
    poly = Polygon(pts)
    if not poly.is_valid:
        poly = make_valid(poly)
    grown = poly.buffer(0.5, join_style="mitre", mitre_limit=2.0)
    parts = [g for g in getattr(grown, "geoms", [grown]) if isinstance(g, Polygon) and g.area > 0]
    if not parts:
        return pts
    best = max(parts, key=lambda g: (g.area, g.wkt))
    return [(float(x), float(y)) for x, y in best.exterior.coords][:-1]


def to_full_pixels(
    points_working: Sequence[tuple[float, float]],
    window_origin_px: tuple[int, int],
    scale_xy: tuple[float, float],
) -> list[tuple[int, int]]:
    """Working-pixel corner coordinates to integer full-resolution pixel vertices."""
    return [
        (
            int(round(window_origin_px[0] + x * scale_xy[0])),
            int(round(window_origin_px[1] + y * scale_xy[1])),
        )
        for x, y in points_working
    ]


def _dedupe(points: Sequence[tuple[int, int]]) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for p in points:
        if not out or p != out[-1]:
            out.append(p)
    while len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return out


def valid_pixel_ring(points: Sequence[tuple[int, int]]) -> tuple[PixelRing | None, bool]:
    """A valid simple integer ring from the points, and whether it had to be repaired.

    An invalid polygon is repaired with `make_valid`; if that yields more than one polygon the
    largest is kept (the caller's `shape_fidelity` then shows the loss). Returns (None, repaired)
    if no valid ring with positive area of at least three vertices results.
    """
    ring = _dedupe(points)
    if len(ring) < 3:
        return None, False
    poly = Polygon(ring)
    repaired = False
    if not poly.is_valid:
        repaired = True
        fixed = make_valid(poly)
        parts = [g for g in getattr(fixed, "geoms", [fixed]) if isinstance(g, Polygon)]
        parts = [g for g in parts if g.area > 0]
        if not parts:
            return None, True
        poly = max(parts, key=lambda g: (g.area, g.wkt))
        ring = _dedupe([(int(round(x)), int(round(y))) for x, y in poly.exterior.coords])
        if len(ring) < 3:
            return None, True
        poly = Polygon(ring)
        if not poly.is_valid:
            return None, True
    if poly.area <= 0:
        return None, repaired
    return tuple(ring), repaired


def signed_area(ring: Sequence[Sequence[float]]) -> float:
    total = 0.0
    n = len(ring)
    for i in range(n):
        x0, y0 = ring[i]
        x1, y1 = ring[(i + 1) % n]
        total += x0 * y1 - x1 * y0
    return total / 2.0


def georeference(
    ring: PixelRing, mapping: Mapping
) -> tuple[PixelRing, list[tuple[float, float]]]:
    """Apply the chosen transform to every vertex. The ring order is reversed if needed so that
    the ground ring is counter-clockwise (GeoJSON); the pixel ring is reversed with it, so vertex i
    of one is always vertex i of the other. Ground coordinates are rounded to 6 decimals."""
    ground = [mapping(float(x), float(y)) for x, y in ring]
    ground = [(round(e, GROUND_DECIMALS), round(n, GROUND_DECIMALS)) for e, n in ground]
    if signed_area(ground) < 0:
        ring = tuple(reversed(ring))
        ground = list(reversed(ground))
    return ring, ground


def fill_polygon(
    canvas: np.ndarray, corner_points: Sequence[tuple[float, float]], value: int = 1
) -> None:
    """Fill a polygon given in corner coordinates (pixel i spans i to i + 1) into `canvas`, so a
    pixel is set when its centre is inside. Sub-pixel vertices are kept to 1/16 pixel."""
    pts = np.array(
        [[round((x - 0.5) * 16), round((y - 0.5) * 16)] for x, y in corner_points], dtype=np.int32
    )
    cv2.fillPoly(canvas, [pts.reshape(-1, 1, 2)], value, shift=4)


def rasterise_ring(
    ring: PixelRing,
    crop_xywh: tuple[int, int, int, int],
    window_origin_px: tuple[int, int],
    scale_xy: tuple[float, float],
) -> np.ndarray:
    """The full-resolution ring drawn into a working-resolution crop (bool array), for the
    shape-fidelity comparison with the region mask."""
    x0, y0, w, h = crop_xywh
    corner = [
        (
            (px - window_origin_px[0]) / scale_xy[0] - x0,
            (py - window_origin_px[1]) / scale_xy[1] - y0,
        )
        for px, py in ring
    ]
    canvas = np.zeros((h, w), dtype=np.uint8)
    fill_polygon(canvas, corner)
    return canvas > 0
