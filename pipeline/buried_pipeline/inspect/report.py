"""Pure maths for `buried inspect`. No file or network access.

A transform is a 6-tuple (a, b, c, d, e, f) with x' = a*col + b*row + c, y' = d*col + e*row + f
(the same layout as rasterio's Affine). `to_proj` is a function from raster-CRS (x, y) to
EPSG:26917 (easting, northing).
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass

Transform6 = tuple[float, float, float, float, float, float]
Point = tuple[float, float]
ToProj = Callable[[float, float], Point]
Bounds = tuple[float, float, float, float]  # min_e, min_n, max_e, max_n

EDGE_SAMPLES = 16  # intervals per edge when densifying
ORIGIN_ROUND_M = 100.0
BOUNDS_MARGIN_M = 250.0


def pixel_to_crs(t: Transform6, col: float, row: float) -> Point:
    a, b, c, d, e, f = t
    return (a * col + b * row + c, d * col + e * row + f)


def corners(t: Transform6, width: int, height: int, to_proj: ToProj) -> list[Point]:
    """Top-left, top-right, bottom-right, bottom-left, in EPSG:26917."""
    pixel_corners = [(0, 0), (width, 0), (width, height), (0, height)]
    return [to_proj(*pixel_to_crs(t, x, y)) for x, y in pixel_corners]


def edge_points(
    t: Transform6, width: int, height: int, to_proj: ToProj, samples: int = EDGE_SAMPLES
) -> list[Point]:
    """Points along the four pixel edges (samples intervals each), in EPSG:26917."""
    out: list[Point] = []
    for i in range(samples + 1):
        s = i / samples
        for x, y in (
            (s * width, 0.0),
            (s * width, float(height)),
            (0.0, s * height),
            (float(width), s * height),
        ):
            out.append(to_proj(*pixel_to_crs(t, x, y)))
    return out


def densified_bounds(
    t: Transform6, width: int, height: int, to_proj: ToProj, samples: int = EDGE_SAMPLES
) -> Bounds:
    pts = edge_points(t, width, height, to_proj, samples)
    es = [p[0] for p in pts]
    ns = [p[1] for p in pts]
    return (min(es), min(ns), max(es), max(ns))


def pixel_size_m(
    t: Transform6, width: int, height: int, to_proj: ToProj
) -> tuple[float, float]:
    """Metres per pixel along x and y: the images of unit steps at the raster centre.

    Measured in EPSG:26917, so the answer does not depend on the transform's own units.
    """
    cx, cy = width / 2.0, height / 2.0
    origin = to_proj(*pixel_to_crs(t, cx, cy))
    step_x = to_proj(*pixel_to_crs(t, cx + 1.0, cy))
    step_y = to_proj(*pixel_to_crs(t, cx, cy + 1.0))
    return (math.dist(origin, step_x), math.dist(origin, step_y))


def rotation_terms(t: Transform6) -> tuple[float, float]:
    """The transform's b and d coefficients, as is. Both zero for a north-up raster."""
    return (t[1], t[3])


def union_bounds(all_bounds: Sequence[Bounds]) -> Bounds:
    if not all_bounds:
        raise ValueError("no bounds to union")
    return (
        min(b[0] for b in all_bounds),
        min(b[1] for b in all_bounds),
        max(b[2] for b in all_bounds),
        max(b[3] for b in all_bounds),
    )


def propose_origin(all_bounds: Sequence[Bounds]) -> Point:
    """Centre of the union of bounds, each coordinate rounded down to a multiple of 100 m."""
    u = union_bounds(all_bounds)
    centre_e = (u[0] + u[2]) / 2.0
    centre_n = (u[1] + u[3]) / 2.0
    return (
        math.floor(centre_e / ORIGIN_ROUND_M) * ORIGIN_ROUND_M,
        math.floor(centre_n / ORIGIN_ROUND_M) * ORIGIN_ROUND_M,
    )


def project_bounds(all_bounds: Sequence[Bounds]) -> Bounds:
    """Union plus 250 m on every side, rounded outward to multiples of 100 m."""
    u = union_bounds(all_bounds)
    return (
        math.floor((u[0] - BOUNDS_MARGIN_M) / ORIGIN_ROUND_M) * ORIGIN_ROUND_M,
        math.floor((u[1] - BOUNDS_MARGIN_M) / ORIGIN_ROUND_M) * ORIGIN_ROUND_M,
        math.ceil((u[2] + BOUNDS_MARGIN_M) / ORIGIN_ROUND_M) * ORIGIN_ROUND_M,
        math.ceil((u[3] + BOUNDS_MARGIN_M) / ORIGIN_ROUND_M) * ORIGIN_ROUND_M,
    )


@dataclass(frozen=True)
class GeorefReport:
    width: int
    height: int
    transform: Transform6
    corners: list[Point]
    bounds: Bounds
    pixel_size_x_m: float
    pixel_size_y_m: float
    rotation_b: float
    rotation_d: float


def build_report(t: Transform6, width: int, height: int, to_proj: ToProj) -> GeorefReport:
    px, py = pixel_size_m(t, width, height, to_proj)
    rot_b, rot_d = rotation_terms(t)
    return GeorefReport(
        width=width,
        height=height,
        transform=t,
        corners=corners(t, width, height, to_proj),
        bounds=densified_bounds(t, width, height, to_proj),
        pixel_size_x_m=px,
        pixel_size_y_m=py,
        rotation_b=rot_b,
        rotation_d=rot_d,
    )


def corner_disagreement_m(
    t1: Transform6, t2: Transform6, width: int, height: int, to_proj: ToProj
) -> float:
    """Largest distance in metres between the same pixel corner under two transforms."""
    c1 = corners(t1, width, height, to_proj)
    c2 = corners(t2, width, height, to_proj)
    return max(math.dist(p, q) for p, q in zip(c1, c2, strict=True))
