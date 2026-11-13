"""Outline mask, closing, outline width and small dark marks (design.md "Steps" 3 and 4, 8)."""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from buried_pipeline.extract.params import ExtractParams


def outline_mask(norm: np.ndarray, inside: np.ndarray, params: ExtractParams) -> np.ndarray:
    """Dark-line pixels (normalised grey below `outline.max_grey`) inside the map area, then a
    morphological closing to bridge small gaps in printed lines. Returns a bool array."""
    dark = ((norm < params.outline.max_grey) & inside).astype(np.uint8)
    k = round(params.outline.closing_kernel_m / params.working_pixel_size_m)
    if k >= 2:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k | 1, k | 1))
        dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, kernel)
    return (dark > 0) & inside


def outline_width_px(mask: np.ndarray) -> float:
    """Typical outline width in working pixels: twice the median distance-transform value at the
    ridge pixels (local maxima) of the mask. At least 1."""
    if not mask.any():
        return 1.0
    dist = cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 5)
    ridge = (dist == cv2.dilate(dist, np.ones((3, 3), np.uint8))) & (dist > 0)
    if not ridge.any():
        return 1.0
    return max(1.0, 2.0 * float(np.median(dist[ridge])))


@dataclass(frozen=True)
class MarkComponents:
    """8-connected components of the outline mask, labelled, with their pixel areas."""

    labels: np.ndarray  # int32, 0 = not outline
    areas: np.ndarray  # int64, indexed by label (areas[0] is the background and unused)


def mark_components(mask: np.ndarray) -> MarkComponents:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(
        mask.astype(np.uint8), connectivity=8
    )
    del count
    return MarkComponents(labels=labels, areas=stats[:, cv2.CC_STAT_AREA].astype(np.int64))


def components_smaller_than(
    components: MarkComponents, max_area_m2: float, working_pixel_size_m: float
) -> np.ndarray:
    """Mask of the pixels in components whose area is below `max_area_m2`."""
    limit_px = max_area_m2 / (working_pixel_size_m**2)
    small = components.areas < limit_px
    small[0] = False
    return small[components.labels]
