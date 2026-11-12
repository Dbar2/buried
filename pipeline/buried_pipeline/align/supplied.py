"""The supplied georeferencing as a mapping: pixel -> raster CRS (affine) -> EPSG:26917 (pyproj)."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from pyproj import Transformer

from buried_pipeline.align.affine import Affine6, Point, apply_affine

TARGET_CRS = "EPSG:26917"


@dataclass(frozen=True)
class SuppliedMapping:
    predict: Callable[[float, float], Point]
    crs: str
    operation: str


def supplied_mapping(transform: Affine6, crs: str) -> SuppliedMapping:
    """Map pixel (x, y) with the raster's affine, then into EPSG:26917 (always x/y order)."""
    transformer = Transformer.from_crs(crs, TARGET_CRS, always_xy=True)

    def predict(x: float, y: float) -> Point:
        cx, cy = apply_affine(transform, x, y)
        east, north = transformer.transform(cx, cy)
        return (float(east), float(north))

    description = transformer.description or transformer.definition or "unnamed operation"
    return SuppliedMapping(predict=predict, crs=crs, operation=description)
