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


def world_file_path(raster: Path) -> Path:
    suffix = {".tif": ".tfw", ".tiff": ".tfw", ".jpg": ".jgw", ".jpeg": ".jgw"}[
        raster.suffix.lower()
    ]
    return raster.with_suffix(suffix)


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


def esri_wkt(epsg: int = 26917) -> str:
    """ESRI-flavoured WKT, as in U of T's `.prj` and PAM files (NAD_1983_UTM_Zone_17N)."""
    from rasterio.crs import CRS
    from rasterio.enums import WktVersion

    return CRS.from_epsg(epsg).to_wkt(version=WktVersion.WKT1_ESRI)


def write_jpeg(path: Path, width: int = 200, height: int = 100) -> Path:
    """A one-band JPEG with no georeferencing in it, like U of T's 1935 plates."""
    import cv2

    path.parent.mkdir(parents=True, exist_ok=True)
    data = np.full((height, width), 128, dtype="uint8")
    if not cv2.imwrite(str(path), data):
        raise RuntimeError(f"could not write {path}")
    return path


def write_pam(
    raster: Path,
    transform: Transform6 | None = None,
    wkt: str | None = None,
) -> Path:
    """The `<raster>.aux.xml` sidecar GDAL and ArcGIS write: SRS and GeoTransform (GDAL order)."""
    from xml.sax.saxutils import escape

    parts = ["<PAMDataset>"]
    if wkt is not None:
        parts.append(f"  <SRS>{escape(wkt)}</SRS>")
    if transform is not None:
        a, b, c, d, e, f = transform
        values = ", ".join(repr(float(v)) for v in (c, a, b, f, d, e))
        parts.append(f"  <GeoTransform> {values}</GeoTransform>")
    parts.append("</PAMDataset>")
    path = raster.with_name(raster.name + ".aux.xml")
    path.write_text("\n".join(parts) + "\n", encoding="utf-8")
    return path


# North-up, 0.1 m pixels, near Toronto in UTM 17N.
NORTH_UP_26917: Transform6 = (0.1, 0.0, 630000.0, 0.0, -0.1, 4834000.0)
# Rotated about 16 degrees, like the real 1935 plates (a, b, c, d, e, f).
ROTATED_26917: Transform6 = (0.11, 0.033, 630000.0, 0.034, -0.118, 4834000.0)
