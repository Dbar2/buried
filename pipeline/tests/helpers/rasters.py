"""Synthetic rasters for tests. A few hundred pixels, written into a temp dir."""

from __future__ import annotations

import warnings
from pathlib import Path

import numpy as np
import rasterio
from rasterio.errors import NotGeoreferencedWarning
from rasterio.transform import Affine

Transform6 = tuple[float, float, float, float, float, float]


def write_geotiff(
    path: Path,
    transform: Transform6,
    crs: str = "EPSG:26917",
    width: int = 200,
    height: int = 100,
) -> Path:
    """GeoTIFF with internal georeferencing tags."""
    path.parent.mkdir(parents=True, exist_ok=True)
    data = np.full((1, height, width), 128, dtype="uint8")
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=width,
        height=height,
        count=1,
        dtype="uint8",
        crs=crs,
        transform=Affine(*transform),
    ) as dst:
        dst.write(data)
    return path


def write_plain_tiff(path: Path, width: int = 200, height: int = 100) -> Path:
    """TIFF with no georeferencing at all."""
    path.parent.mkdir(parents=True, exist_ok=True)
    data = np.full((1, height, width), 128, dtype="uint8")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", NotGeoreferencedWarning)
        with rasterio.open(
            path, "w", driver="GTiff", width=width, height=height, count=1, dtype="uint8"
        ) as dst:
            dst.write(data)
    return path


def world_file_path(tif: Path) -> Path:
    return tif.with_suffix(".tfw")


def write_world_file(tif: Path, transform: Transform6) -> Path:
    """World file for a transform. World files hold pixel-centre coordinates of the first pixel."""
    a, b, c, d, e, f = transform
    # World file order: A (x scale), D (y rotation), B (x rotation), E (y scale), C, F.
    cx = c + a * 0.5 + b * 0.5
    cy = f + d * 0.5 + e * 0.5
    lines = [a, d, b, e, cx, cy]
    path = world_file_path(tif)
    path.write_text("\n".join(repr(float(v)) for v in lines) + "\n", encoding="utf-8")
    return path


def write_prj(tif: Path, wkt: str) -> Path:
    path = tif.with_suffix(".prj")
    path.write_text(wkt, encoding="utf-8")
    return path


# North-up, 0.1 m pixels, near Toronto in UTM 17N.
NORTH_UP_26917: Transform6 = (0.1, 0.0, 630000.0, 0.0, -0.1, 4834000.0)
