"""Regions bounded by outlines (design.md "Steps" 4).

Regions are the 4-connected parts of the map area that are not wall. Small dark components (printed
numbers, letters, marks) are not wall: they are filled into the region around them. Each region then
claims the wall pixels nearest to it, up to half the outline width, so neighbouring buildings meet
on the centre of their shared line instead of leaving a gap.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from buried_pipeline.extract.params import ExtractParams


@dataclass(frozen=True)
class Region:
    label: int
    x: int  # bounding box in working pixels, grown by the dilation reach and clipped to the image
    y: int
    width: int
    height: int
    area_px: int  # after dilation


@dataclass(frozen=True)
class LabelledRegions:
    labels: np.ndarray  # int32; dilated regions, 0 = no region
    regions: tuple[Region, ...]  # kept regions, in label order
    dropped: dict[str, int]  # how many labelled regions each filter removed


def label_free(free: np.ndarray) -> tuple[int, np.ndarray, np.ndarray, np.ndarray]:
    """4-connected labelling of the free mask. Returns (count, labels, stats, centroids); label 0
    is everything that is not free."""
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(
        free.astype(np.uint8), connectivity=4
    )
    return count, labels, stats, centroids


def claim_wall(
    labels: np.ndarray, wall: np.ndarray, reach_px: float
) -> np.ndarray:
    """Give each wall pixel within `reach_px` of a region to its nearest region (Euclidean)."""
    sites = labels > 0
    if not sites.any() or not wall.any():
        return labels
    src = np.where(sites, 0, 255).astype(np.uint8)
    dist, pixel_labels = cv2.distanceTransformWithLabels(
        src, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL
    )
    lut = np.zeros(int(pixel_labels.max()) + 1, dtype=np.int32)
    lut[pixel_labels[sites]] = labels[sites]
    claim = wall & ~sites & (dist <= reach_px)
    out = labels.copy()
    out[claim] = lut[pixel_labels[claim]]
    return out


def build_regions(
    free: np.ndarray,
    wall: np.ndarray,
    inside: np.ndarray,
    outline_width: float,
    params: ExtractParams,
) -> LabelledRegions:
    """Label, dilate and filter the regions.

    Dropped: regions below `regions.min_area_m2` or above `regions.max_area_m2` (the street
    network is one connected region and is far above any building), and regions whose centroid is
    outside the map area.
    """
    count, labels, stats, centroids = label_free(free)
    reach = 0.5 * outline_width + 1.0
    claimed = claim_wall(labels, wall, reach)
    areas = np.bincount(claimed.ravel(), minlength=count)
    px_m2 = params.working_pixel_size_m**2
    height, width = labels.shape
    grow = int(np.ceil(reach)) + 1

    dropped = {"too_small": 0, "too_large": 0, "centroid_outside": 0}
    kept: list[Region] = []
    for label in range(1, count):
        area_m2 = float(areas[label]) * px_m2
        if area_m2 < params.regions.min_area_m2:
            dropped["too_small"] += 1
            continue
        if area_m2 > params.regions.max_area_m2:
            dropped["too_large"] += 1
            continue
        cx = min(width - 1, max(0, int(round(float(centroids[label][0])))))
        cy = min(height - 1, max(0, int(round(float(centroids[label][1])))))
        if not inside[cy, cx]:
            dropped["centroid_outside"] += 1
            continue
        left = int(stats[label, cv2.CC_STAT_LEFT])
        top = int(stats[label, cv2.CC_STAT_TOP])
        x0 = max(0, left - grow)
        y0 = max(0, top - grow)
        x1 = min(width, left + int(stats[label, cv2.CC_STAT_WIDTH]) + grow)
        y1 = min(height, top + int(stats[label, cv2.CC_STAT_HEIGHT]) + grow)
        kept.append(Region(label, x0, y0, x1 - x0, y1 - y0, int(areas[label])))
    return LabelledRegions(labels=claimed, regions=tuple(kept), dropped=dropped)
