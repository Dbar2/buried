"""Pure clip functions for present-day layers (shapely + pyproj; no file or network access).

Rules (spec 02 requirement 12): keep every feature whose geometry intersects the project bounds,
cut nothing, reproject to EPSG:26917, keep only the id field and the listed fields, sort by id,
write coordinates to millimetres.
"""

from __future__ import annotations

import json
import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import box
from shapely.geometry.base import BaseGeometry

from buried_pipeline.errors import PipelineError
from buried_pipeline.inspect.report import Bounds
from buried_pipeline.schema_version import SCHEMA_VERSION

TARGET_CRS = "EPSG:26917"
MAX_FEATURES = 20000
MAX_BYTES = 5_000_000  # "5 MB" read as 5,000,000 bytes, the stricter reading
COORD_DECIMALS = 3
BBOX_EDGE_SAMPLES = 16


@dataclass(frozen=True)
class RawFeature:
    """A feature as read from the downloaded file: layer-CRS geometry plus all its fields."""

    geometry: BaseGeometry
    properties: dict[str, Any]


def to_native(value: Any) -> Any:
    """JSON-safe Python value from a numpy/pyogrio scalar. NaN and NaT become None."""
    if value is None:
        return None
    if isinstance(value, np.generic):
        if isinstance(value, np.datetime64):
            return None if np.isnat(value) else str(value)
        value = value.item()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, bool | int | float | str):
        return value
    return str(value)


def id_text(value: Any) -> str:
    """Feature id as a string. Integral floats lose their '.0'."""
    value = to_native(value)
    if value is None or value == "":
        raise PipelineError("A feature has an empty id field value")
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def bounds_polygon(bounds: Bounds) -> BaseGeometry:
    return box(*bounds)


def layer_bbox(bounds: Bounds, layer_crs: str) -> tuple[float, float, float, float]:
    """The project bounds as a bbox in the layer CRS: densified boundary, then min/max."""
    inverse = Transformer.from_crs(TARGET_CRS, layer_crs, always_xy=True)
    min_e, min_n, max_e, max_n = bounds
    xs: list[float] = []
    ys: list[float] = []
    for i in range(BBOX_EDGE_SAMPLES + 1):
        s = i / BBOX_EDGE_SAMPLES
        e = min_e + s * (max_e - min_e)
        n = min_n + s * (max_n - min_n)
        for pe, pn in ((e, min_n), (e, max_n), (min_e, n), (max_e, n)):
            xs.append(pe)
            ys.append(pn)
    out_x, out_y = inverse.transform(np.array(xs), np.array(ys))
    if not (np.all(np.isfinite(out_x)) and np.all(np.isfinite(out_y))):
        raise PipelineError(f"Project bounds cannot be expressed in the layer CRS {layer_crs}")
    return (float(out_x.min()), float(out_y.min()), float(out_x.max()), float(out_y.max()))


def reproject(geometry: BaseGeometry, transformer: Transformer) -> BaseGeometry:
    """Reproject a (2D) geometry. Non-finite results stop the run."""

    def convert(coords: np.ndarray) -> np.ndarray:
        x, y = transformer.transform(coords[:, 0], coords[:, 1])
        out = np.column_stack([x, y])
        if not np.all(np.isfinite(out)):
            raise PipelineError("Reprojection produced non-finite coordinates")
        return out

    return shapely.transform(shapely.force_2d(geometry), convert)


def round_geometry(geometry: BaseGeometry) -> BaseGeometry:
    return shapely.transform(geometry, lambda c: np.round(c, COORD_DECIMALS))


def single_point(geometry: BaseGeometry, geometry_types: Sequence[str]) -> BaseGeometry:
    """A MultiPoint holding one point becomes that Point when the dataset expects Points (the
    City's intersections file stores every point as a one-point MultiPoint). A MultiPoint with
    several points is never reduced."""
    if (
        geometry.geom_type == "MultiPoint"
        and "MultiPoint" not in geometry_types
        and "Point" in geometry_types
    ):
        if len(geometry.geoms) != 1:
            raise PipelineError(
                f"A MultiPoint holds {len(geometry.geoms)} points; expected a single point"
            )
        return geometry.geoms[0]
    return geometry


def clip_features(
    features: Iterable[RawFeature],
    bounds: Bounds,
    layer_crs: str | None,
    id_field: str,
    kept_fields: Sequence[str],
    geometry_types: Sequence[str],
) -> list[dict[str, Any]]:
    """GeoJSON features (EPSG:26917, sorted by id) for every input that intersects `bounds`."""
    if not layer_crs:
        raise PipelineError("The file declares no CRS; refusing to guess one")
    transformer = Transformer.from_crs(layer_crs, TARGET_CRS, always_xy=True)
    window = bounds_polygon(bounds)

    kept: list[dict[str, Any]] = []
    for raw in features:
        if raw.geometry is None or raw.geometry.is_empty:
            continue
        projected = reproject(raw.geometry, transformer)
        if not projected.intersects(window):
            continue
        projected = single_point(projected, geometry_types)
        if projected.geom_type not in geometry_types:
            raise PipelineError(
                f"Unexpected geometry type {projected.geom_type}; expected {list(geometry_types)}"
            )
        props = {name: to_native(raw.properties.get(name)) for name in kept_fields}
        kept.append(
            {
                "type": "Feature",
                "id": id_text(raw.properties.get(id_field)),
                "geometry": json.loads(shapely.to_geojson(round_geometry(projected))),
                "properties": props,
            }
        )
        if len(kept) > MAX_FEATURES:
            raise PipelineError(
                f"More than {MAX_FEATURES} features intersect the project bounds; nothing written"
            )

    kept.sort(key=lambda f: f["id"])
    return _collapse_repeated_ids(kept, id_field)


def _collapse_repeated_ids(kept: list[dict[str, Any]], id_field: str) -> list[dict[str, Any]]:
    """One feature per id. Rows that share an id and agree on geometry and kept fields are one
    feature (the intersections file has one row per elevation of a multi-level intersection, all
    at the same point). Rows that share an id but differ stop the run."""
    unique: list[dict[str, Any]] = []
    for feature in kept:
        if unique and unique[-1]["id"] == feature["id"]:
            previous = unique[-1]
            if (
                previous["geometry"] != feature["geometry"]
                or previous["properties"] != feature["properties"]
            ):
                raise PipelineError(
                    f"Duplicate feature id {feature['id']!r} in field {id_field!r} with "
                    "different geometry or fields"
                )
            continue
        unique.append(feature)
    return unique


def check_size(text: str) -> None:
    size = len(text.encode("utf-8"))
    if size > MAX_BYTES:
        raise PipelineError(
            f"Present layer would be {size} bytes, over the {MAX_BYTES} byte limit; nothing written"
        )


def build_layer(
    *,
    source_id: str,
    package_id: str,
    resource_id: str,
    resource_url: str,
    retrieved_at: str,
    last_refreshed: str,
    source_sha256: str,
    id_field: str,
    clip_bounds: Bounds,
    attribution_line: str,
    features: list[dict[str, Any]],
) -> dict[str, Any]:
    """The `presentLayer` document (spec 01 design)."""
    return {
        "type": "FeatureCollection",
        "schema_version": SCHEMA_VERSION,
        "crs": TARGET_CRS,
        "source": source_id,
        "ckan_package_id": package_id,
        "ckan_resource_id": resource_id,
        "resource_url": resource_url,
        "retrieved_at": retrieved_at,
        "last_refreshed": last_refreshed,
        "source_sha256": source_sha256,
        "id_field": id_field,
        "clip_bounds": {
            "min_e": clip_bounds[0],
            "min_n": clip_bounds[1],
            "max_e": clip_bounds[2],
            "max_n": clip_bounds[3],
        },
        "attribution_line": attribution_line,
        "features": features,
    }


def layer_content(layer: dict[str, Any]) -> dict[str, Any]:
    """What `--recheck` compares: the clipped content, not the retrieval metadata."""
    return {
        "id_field": layer["id_field"],
        "clip_bounds": layer["clip_bounds"],
        "features": layer["features"],
    }
