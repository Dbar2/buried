"""`buried extract --preview`: the map area with every proposal outlined, coloured by quality band.

A debugging aid so a person can judge an extraction at a glance (requirement 21). It is not
evidence and is never published: it goes to `data/work/extract/<source id>_preview.jpg`. The colours
are for the person reading the preview, not the product palette.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import cv2
import numpy as np

from buried_pipeline.errors import PipelineError

MAX_LONG_EDGE_PX = 4096
JPEG_QUALITY = 88

# Quality bands by score: high is at least HIGH_MIN, medium at least MEDIUM_MIN, else low.
HIGH_MIN = 0.9
MEDIUM_MIN = 0.6
BAND_COLOURS_BGR = {"high": (60, 200, 60), "medium": (0, 150, 255), "low": (50, 50, 230)}
MAP_AREA_COLOUR_BGR = (220, 160, 0)


def quality_band(score: float) -> str:
    if score >= HIGH_MIN:
        return "high"
    if score >= MEDIUM_MIN:
        return "medium"
    return "low"


def preview_scale(width: int, height: int) -> float:
    return min(1.0, MAX_LONG_EDGE_PX / max(width, height))


def draw_preview(
    grey_window: np.ndarray,
    window_origin_px: tuple[int, int],
    map_area_px: Sequence[Sequence[int]],
    proposals: Sequence[dict[str, Any]],
) -> bytes:
    """JPEG bytes of the grey window, downsampled to at most 4096 px on the long edge, with the
    map area boundary and every proposal's pixel polygon drawn on it. `proposals` are the
    features of the proposal file."""
    height, width = grey_window.shape[:2]
    scale = preview_scale(width, height)
    size = (max(1, round(width * scale)), max(1, round(height * scale)))
    base = grey_window
    if scale < 1.0:
        base = cv2.resize(grey_window, size, interpolation=cv2.INTER_AREA)
    canvas = cv2.cvtColor(base, cv2.COLOR_GRAY2BGR) if base.ndim == 2 else base.copy()

    def to_canvas(points: Sequence[Sequence[int]]) -> np.ndarray:
        return (
            np.array(
                [
                    [(x - window_origin_px[0]) * scale, (y - window_origin_px[1]) * scale]
                    for x, y in points
                ],
                dtype=np.float64,
            )
            .round()
            .astype(np.int32)
            .reshape(-1, 1, 2)
        )

    cv2.polylines(canvas, [to_canvas(map_area_px)], True, MAP_AREA_COLOUR_BGR, 2, cv2.LINE_AA)
    for band in ("low", "medium", "high"):  # best last, so it is drawn on top
        for feature in proposals:
            props = feature["properties"]
            if quality_band(props["quality"]["score"]) != band:
                continue
            cv2.polylines(
                canvas, [to_canvas(props["pixel_polygon"])], True, BAND_COLOURS_BGR[band], 2,
                cv2.LINE_AA,
            )
    ok, buf = cv2.imencode(".jpg", canvas, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if not ok:
        raise PipelineError("JPEG encoding of the preview failed")
    return bytes(buf.tobytes())
