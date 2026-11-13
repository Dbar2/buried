"""The pure extraction pipeline on arrays (design.md "Steps" 1 to 8).

`find_candidates` takes the grey window of a plate (the map area's bounding box, at full
resolution), the map area polygon and the parameter set, and returns candidate footprints as
full-resolution integer pixel polygons with a tone class, a quality score and weakness flags. It
reads no file, calls no model and has no randomness, so the same inputs give the same output
(requirement 8.3). Georeferencing and ids are the next module's job.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

import cv2
import numpy as np
from shapely.geometry import LinearRing, LineString, Polygon

from buried_pipeline.extract.outline import (
    components_smaller_than,
    mark_components,
    outline_mask,
    outline_width_px,
)
from buried_pipeline.extract.params import ExtractParams
from buried_pipeline.extract.polygons import (
    PixelRing,
    fill_polygon,
    outer_boundary,
    rasterise_ring,
    simplify,
    to_full_pixels,
    trace_outer_contour,
    valid_pixel_ring,
)
from buried_pipeline.extract.regions import build_regions
from buried_pipeline.extract.score import Quality, iou, make_quality, weaknesses
from buried_pipeline.extract.tone import (
    classify_tone,
    fill_uniformity,
    gradients,
    normalise,
    resample,
    tone_stats,
    working_size,
)

PixelPoint = tuple[int, int]


@dataclass(frozen=True)
class Candidate:
    pixel_polygon: PixelRing  # full-resolution pixel vertices (GDAL corner convention)
    tone_class: str
    quality: Quality
    weaknesses: tuple[str, ...]


@dataclass
class ExtractStats:
    working_size_px: tuple[int, int] = (0, 0)
    outline_width_px: float = 0.0
    regions_labelled: int = 0
    dropped: dict[str, int] = field(default_factory=dict)
    repaired: int = 0


def _map_mask(
    polygon: Sequence[PixelPoint],
    origin: PixelPoint,
    scale: tuple[float, float],
    size: tuple[int, int],
) -> np.ndarray:
    canvas = np.zeros((size[1], size[0]), dtype=np.uint8)
    fill_polygon(canvas, _to_working(polygon, origin, scale))
    return canvas > 0


def _to_working(
    points: Sequence[PixelPoint], origin: PixelPoint, scale: tuple[float, float]
) -> list[tuple[float, float]]:
    """Full-resolution pixel vertices to working-pixel corner coordinates."""
    return [((x - origin[0]) / scale[0], (y - origin[1]) / scale[1]) for x, y in points]


def find_candidates(
    grey_window: np.ndarray,
    window_origin_px: PixelPoint,
    map_area_px: Sequence[PixelPoint],
    fold_lines_px: Sequence[Sequence[PixelPoint]],
    source_pixel_size_m: float,
    params: ExtractParams,
) -> tuple[list[Candidate], ExtractStats]:
    """Candidate footprints inside the map area. `grey_window` is the 8-bit grey crop of the full
    resolution raster whose top-left pixel is `window_origin_px`; `map_area_px` and
    `fold_lines_px` are in full-resolution raster pixels."""
    stats = ExtractStats()
    full_h, full_w = grey_window.shape
    new_w, new_h = working_size(full_w, full_h, source_pixel_size_m, params.working_pixel_size_m)
    scale = (full_w / new_w, full_h / new_h)  # full-resolution pixels per working pixel
    stats.working_size_px = (new_w, new_h)

    # 1. Resample; pixels outside the map area become "no data".
    grey = resample(grey_window, new_w, new_h)
    inside = _map_mask(map_area_px, window_origin_px, scale, (new_w, new_h))

    # 2. Normalise local contrast.
    norm = normalise(grey, inside, params)

    # 3. Outlines.
    outline = outline_mask(norm, inside, params)
    components = mark_components(outline)
    hole_small = components_smaller_than(
        components, params.regions.hole_fill_m2, params.working_pixel_size_m
    )
    mark_small = components_smaller_than(
        components, params.text.max_mark_area_m2, params.working_pixel_size_m
    )
    wall = outline & ~hole_small
    width_px = outline_width_px(wall)
    stats.outline_width_px = width_px

    # 4. Regions.
    free = inside & ~wall
    labelled = build_regions(free, wall, inside, width_px, params)
    stats.regions_labelled = len(labelled.regions) + sum(labelled.dropped.values())
    stats.dropped = dict(labelled.dropped)
    for key in ("open_outline", "no_contour", "invalid_polygon"):
        stats.dropped[key] = 0

    dist_to_outline = cv2.distanceTransform((~outline).astype(np.uint8), cv2.DIST_L2, 3)
    gx, gy = gradients(norm)
    tol_px = max(0.5, params.simplify_tolerance_m / params.working_pixel_size_m)
    erode_r = max(1, round(width_px))
    erode_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * erode_r + 1, 2 * erode_r + 1))

    boundary = LinearRing(_to_working(map_area_px, window_origin_px, scale))
    folds = [
        LineString(_to_working(line, window_origin_px, scale))
        for line in fold_lines_px
        if len(line) >= 2
    ]

    candidates: list[Candidate] = []
    for region in labelled.regions:
        ys = slice(region.y, region.y + region.height)
        xs = slice(region.x, region.x + region.width)
        mask = labelled.labels[ys, xs] == region.label

        contour = trace_outer_contour(mask)
        if contour is None:
            stats.dropped["no_contour"] += 1
            continue

        # Outline closure: share of the boundary within one outline width of an outline pixel.
        near = dist_to_outline[ys, xs][contour[:, 1], contour[:, 0]] <= width_px + 1.0
        closure = float(near.mean())
        if closure < params.regions.min_outline_closure:
            stats.dropped["open_outline"] += 1
            continue

        simplified = simplify(contour, tol_px)
        full_pts = to_full_pixels(
            outer_boundary(simplified, (region.x, region.y)), window_origin_px, scale
        )
        ring, repaired = valid_pixel_ring(full_pts)
        if ring is None:
            stats.dropped["invalid_polygon"] += 1
            continue
        stats.repaired += int(repaired)

        # Tone: median, spread and hatch measure over the interior.
        interior = cv2.erode(mask.astype(np.uint8), erode_kernel) > 0
        if not interior.any():
            interior = mask
        fill = interior & ~outline[ys, xs]
        if not fill.any():
            fill = interior
        t_stats = tone_stats(
            norm[ys, xs][fill],
            gx[ys, xs][interior],
            gy[ys, xs][interior],
            params.tone.hatch_min_density,
        )
        tone_class = classify_tone(t_stats, params.tone)

        # Scores.
        area_px = int(mask.sum())
        text_share = float((mark_small[ys, xs] & mask).sum()) / max(1, area_px)
        poly_working = Polygon(_to_working(ring, window_origin_px, scale))
        touches_edge = poly_working.distance(boundary) <= width_px
        touches_fold = any(poly_working.distance(line) <= width_px for line in folds)
        drawn = rasterise_ring(
            ring, (region.x, region.y, region.width, region.height), window_origin_px, scale
        )
        inter = float((drawn & mask).sum())
        union = float((drawn | mask).sum())

        quality = make_quality(
            outline_closure=closure,
            fill_uniformity=fill_uniformity(t_stats, params.tone),
            text_clear=1.0 - text_share,
            edge_clear=0.0 if (touches_edge or touches_fold) else 1.0,
            shape_fidelity=iou(inter, union),
        )
        candidates.append(
            Candidate(
                pixel_polygon=ring,
                tone_class=tone_class,
                quality=quality,
                weaknesses=weaknesses(quality, tone_class, touches_edge, touches_fold),
            )
        )
    return candidates, stats
