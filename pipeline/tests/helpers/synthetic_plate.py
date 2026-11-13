"""Synthetic greyscale plates for the extraction tests: grey-filled rectangles with black outlines
on white paper, like the real scans in miniature. No file I/O."""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from buried_pipeline.extract.params import (
    ExtractParams,
    NormaliseParams,
    OutlineParams,
    RegionParams,
    TextParams,
    ToneParams,
)

PAPER = 235
INK = 15
PIXEL_SIZE_M = 0.12


@dataclass(frozen=True)
class Rect:
    """A building drawn as an outline centred on the rectangle [x0, x1] x [y0, y1] (pixels)."""

    x0: int
    y0: int
    x1: int
    y1: int
    fill: int  # grey 0..255 of the interior


def draw_plate(
    width: int,
    height: int,
    rects: list[Rect],
    outline_px: int = 3,
    paper: int = PAPER,
    ink: int = INK,
) -> np.ndarray:
    img = np.full((height, width), paper, dtype=np.uint8)
    for r in rects:
        cv2.rectangle(img, (r.x0, r.y0), (r.x1, r.y1), int(r.fill), thickness=-1)
    for r in rects:
        cv2.rectangle(img, (r.x0, r.y0), (r.x1, r.y1), int(ink), thickness=outline_px)
    return img


def hatch_image(
    size: int, angle_deg: float = 45.0, spacing: int = 6, fill: int = 200, ink: int = INK
) -> np.ndarray:
    """A square grey fill with parallel one-pixel lines at `angle_deg` (0 = horizontal lines)."""
    img = np.full((size, size), fill, dtype=np.uint8)
    theta = np.radians(angle_deg)
    dx, dy = np.cos(theta), -np.sin(theta)
    reach = size * 2
    for k in range(-size, size, spacing):
        # Lines through the points (k, 0) shifted along the perpendicular of the direction.
        cx, cy = size / 2 + k * -dy, size / 2 + k * dx
        p0 = (int(cx - dx * reach), int(cy - dy * reach))
        p1 = (int(cx + dx * reach), int(cy + dy * reach))
        cv2.line(img, p0, p1, int(ink), thickness=1)
    return img


def synthetic_params() -> ExtractParams:
    """A parameter set suited to `draw_plate` at 0.12 m per pixel. Not the committed v1."""
    return ExtractParams(
        id="test",
        tuned_on=("fip_v3_1911_229",),
        working_pixel_size_m=PIXEL_SIZE_M,
        normalise=NormaliseParams(window_m=20.0, clip_limit=1.5),
        outline=OutlineParams(max_grey=0.25, closing_kernel_m=0.25),
        tone=ToneParams(
            light_min=0.75,
            dark_max=0.4,
            hatch_min=0.5,
            hatch_min_density=0.01,
            mixed_spread=0.25,
        ),
        text=TextParams(max_mark_area_m2=0.6),
        regions=RegionParams(
            min_area_m2=6.0, max_area_m2=600.0, hole_fill_m2=0.6, min_outline_closure=0.6
        ),
        simplify_tolerance_m=0.3,
        sha256="0" * 64,
    )


def iou_rect(poly: list[tuple[int, int]], rect: Rect) -> float:
    """Intersection over union of a pixel polygon and a rectangle, in pixels (shapely)."""
    from shapely.geometry import Polygon, box

    p = Polygon(poly)
    b = box(rect.x0, rect.y0, rect.x1, rect.y1)
    union = p.union(b).area
    return 0.0 if union == 0 else p.intersection(b).area / union
