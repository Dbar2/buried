"""Grey band, local-contrast normalisation and tone class (design.md "Steps" 1, 2 and 7).

Pure functions on in-memory arrays. The plates are greyscale; a grey tone is reported as a
`tone_class` and is never a material (requirement 17.3).
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from buried_pipeline.extract.params import ExtractParams, ToneParams

TONE_CLASSES = ("light", "mid", "dark", "hatched", "mixed")

# The hatch measure looks for gradient energy in a narrow band of diagonal orientations.
HATCH_BAND_HALF_WIDTH_DEG = 10.0


def to_grey(pixels: np.ndarray) -> np.ndarray:
    """One 8-bit grey band. A three-band image is averaged; one band is returned unchanged."""
    if pixels.ndim == 2:
        return pixels
    return np.round(pixels.astype(np.float32).mean(axis=2)).astype(np.uint8)


def working_size(
    width: int, height: int, source_pixel_size_m: float, working_m: float
) -> tuple[int, int]:
    """Size in pixels of a `width` x `height` raster at the working pixel size."""
    scale = source_pixel_size_m / working_m
    return max(1, round(width * scale)), max(1, round(height * scale))


def resample(grey: np.ndarray, new_w: int, new_h: int) -> np.ndarray:
    """Area-averaging resample to the working pixel size."""
    if grey.shape[1] == new_w and grey.shape[0] == new_h:
        return grey
    return cv2.resize(grey, (new_w, new_h), interpolation=cv2.INTER_AREA)


def normalise(grey: np.ndarray, inside: np.ndarray, params: ExtractParams) -> np.ndarray:
    """CLAHE over `normalise.window_m` tiles, scaled to 0..1 (float32).

    Pixels outside the map area are first set to the median grey inside it, so the margin, archive
    labels and ruler never affect a tile's statistics; they are masked out again by the caller.
    """
    work = grey.copy()
    if inside.any():
        work[~inside] = np.uint8(np.median(grey[inside]))
    tile_px = max(8.0, params.normalise.window_m / params.working_pixel_size_m)
    grid = (
        max(1, round(grey.shape[1] / tile_px)),
        max(1, round(grey.shape[0] / tile_px)),
    )
    clahe = cv2.createCLAHE(clipLimit=params.normalise.clip_limit, tileGridSize=grid)
    out = clahe.apply(work)
    return (out.astype(np.float32) / 255.0).astype(np.float32)


def gradients(norm: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per-pixel gradient of the normalised image (Sobel, scaled to grey units per pixel)."""
    gx = cv2.Sobel(norm, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    gy = cv2.Sobel(norm, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    return gx, gy


def hatch_measure(gx: np.ndarray, gy: np.ndarray, min_density: float) -> float:
    """Share of gradient energy in the strongest narrow band of diagonal orientations, 0 to 1.

    Orientation is that of the gradient, taken modulo 180 degrees; hatching drawn at 45 or 135
    degrees puts its energy in a band around one of those two angles. Isotropic noise puts about a
    fifth of its energy in either band. If the mean energy per pixel is below `min_density` the
    area has no hatching to speak of (a single slash in a large fill would otherwise score 1), and
    the measure is 0.
    """
    if gx.size == 0:
        return 0.0
    energy = gx.astype(np.float64) ** 2 + gy.astype(np.float64) ** 2
    total = float(energy.sum())
    if total <= 0.0 or total / gx.size < min_density:
        return 0.0
    angle = np.degrees(np.arctan2(gy, gx)) % 180.0
    best = 0.0
    for centre in (45.0, 135.0):
        in_band = np.abs(angle - centre) <= HATCH_BAND_HALF_WIDTH_DEG
        best = max(best, float(energy[in_band].sum()) / total)
    return min(1.0, best)


@dataclass(frozen=True)
class ToneStats:
    median: float
    spread: float  # interquartile range
    hatch: float


def tone_stats(
    norm_values: np.ndarray, gx: np.ndarray, gy: np.ndarray, min_density: float
) -> ToneStats:
    """Median, interquartile range and hatch measure of a region's interior.

    `norm_values` are the normalised greys of the fill pixels (outline and text pixels removed);
    `gx`, `gy` are the gradients over the whole interior.
    """
    if norm_values.size == 0:
        return ToneStats(median=0.0, spread=0.0, hatch=0.0)
    q1, med, q3 = np.percentile(norm_values.astype(np.float64), [25, 50, 75])
    return ToneStats(
        median=float(med),
        spread=float(q3 - q1),
        hatch=hatch_measure(gx, gy, min_density),
    )


def classify_tone(stats: ToneStats, tone: ToneParams) -> str:
    """Requirement 17.2: hatched, else mixed, else light / dark / mid."""
    if stats.hatch >= tone.hatch_min:
        return "hatched"
    if stats.spread >= tone.mixed_spread:
        return "mixed"
    if stats.median >= tone.light_min:
        return "light"
    if stats.median <= tone.dark_max:
        return "dark"
    return "mid"


def fill_uniformity(stats: ToneStats, tone: ToneParams) -> float:
    """1 for a uniform fill, low for hatching or mixed tones."""
    value = 1.0 - min(1.0, stats.spread / tone.mixed_spread)
    value = min(value, 1.0 - stats.hatch)
    return float(min(1.0, max(0.0, value)))
