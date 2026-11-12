"""Synthetic vector layers for tests: a small GPKG written with pyogrio, in any CRS."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import numpy as np
import pyogrio.raw
import shapely
from pyproj import Transformer
from shapely.geometry.base import BaseGeometry

LAYER = "layer"


def write_gpkg(
    path: Path,
    rows: Sequence[tuple[BaseGeometry, int, str]],
    crs: str = "EPSG:4326",
    geometry_type: str = "Point",
) -> Path:
    """Rows are (geometry, ID, NAME). The file has integer field ID and string field NAME."""
    path.parent.mkdir(parents=True, exist_ok=True)
    geometry = np.array([shapely.to_wkb(g) for g, _, _ in rows], dtype=object)
    ids = np.array([i for _, i, _ in rows], dtype="int64")
    names = np.array([n for _, _, n in rows], dtype=object)
    pyogrio.raw.write(
        path,
        geometry=geometry,
        field_data=[ids, names],
        fields=["ID", "NAME"],
        layer=LAYER,
        driver="GPKG",
        geometry_type=geometry_type,
        crs=crs,
    )
    return path


def to_lonlat(easting: float, northing: float) -> tuple[float, float]:
    """EPSG:26917 metres to lon/lat, to build layers in EPSG:4326 around known positions."""
    lon, lat = Transformer.from_crs("EPSG:26917", "EPSG:4326", always_xy=True).transform(
        easting, northing
    )
    return (float(lon), float(lat))
