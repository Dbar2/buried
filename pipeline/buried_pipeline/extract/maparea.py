"""The map area of a plate: read, check and apply (spec 02 requirement 16, spec 01 `mapArea`).

`data/control/map_area/<source id>.json` is written by a person, by hand or through the Studio.
No command writes or changes it, and none detects a neatline, margin or map area by itself or
suggests one silently (16.1, 16.5). `tile`, `extract` and `publish` read it through this module so
that they all apply the same polygon in the same way (16.4): the full-resolution pixel polygon,
mapped through the chosen transform when a coordinate is needed.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

from buried_pipeline.errors import PipelineError
from buried_pipeline.fetch.manifest import sha256_file
from buried_pipeline.paths import Paths
from buried_pipeline.validate.geometry import pixel_polygon_problem
from buried_pipeline.validate.schema import SchemaSet

PixelPoint = tuple[int, int]
Point = tuple[float, float]
Mapping = Callable[[float, float], Point]  # raster pixel (x, y) -> EPSG:26917 (E, N)


@dataclass(frozen=True)
class MapArea:
    source: str
    pixel_polygon: tuple[PixelPoint, ...]
    excluded: str
    fold_lines: tuple[tuple[PixelPoint, ...], ...]
    confirmed_by: str
    confirmed_at: str
    sha256: str

    @property
    def crop_px(self) -> dict[str, int]:
        return bounding_box(self.pixel_polygon)


def map_area_relative(source_id: str) -> str:
    return f"data/control/map_area/{source_id}.json"


def missing_message(source_id: str) -> str:
    """What every refusal says when a plate has no map area file: which file to write."""
    return (
        f"{source_id} has no map area. A person marks where the map content is on the plate "
        f"(excluding margin, title block, scale bar, north arrow and any archive labels or "
        f"ruler) and saves it as {map_area_relative(source_id)} in the shape of the Schema's "
        "mapArea definition. No command writes or suggests it."
    )


# --- pure ---------------------------------------------------------------------------------------


def bounding_box(pixel_polygon: Sequence[Sequence[int]]) -> dict[str, int]:
    """The axis-aligned pixel bounding box of the polygon as a `crop_px` rectangle."""
    xs = [v[0] for v in pixel_polygon]
    ys = [v[1] for v in pixel_polygon]
    return {"x": min(xs), "y": min(ys), "width": max(xs) - min(xs), "height": max(ys) - min(ys)}


def vertices_outside_raster(
    points: Sequence[Sequence[int]], width: int, height: int
) -> list[tuple[int, int]]:
    """Vertices not inside the raster's pixel extent. Pixel coordinates are corner-based, so a
    vertex may lie on the far edge: x from 0 to `width`, y from 0 to `height`."""
    return [
        (p[0], p[1]) for p in points if not (0 <= p[0] <= width and 0 <= p[1] <= height)
    ]


def ground_polygon(mapping: Mapping, pixel_polygon: Sequence[Sequence[int]]) -> dict[str, Any]:
    """The pixel polygon through a transform: a GeoJSON Polygon in EPSG:26917 metres, with the
    ring closed and the vertex order kept."""
    ring = [list(mapping(float(x), float(y))) for x, y in pixel_polygon]
    ring.append(list(ring[0]))
    return {"type": "Polygon", "coordinates": [ring]}


def parse_map_area(
    doc: dict[str, Any], source_id: str, width: int, height: int, sha256: str
) -> MapArea:
    """Convert a schema-valid map area document, applying the rules the Schema cannot state
    (requirement 16.2): the source is the file's source, the polygon is one simple polygon, and
    no vertex lies outside the raster."""
    if doc["source"] != source_id:
        raise PipelineError(
            f"{map_area_relative(source_id)} is the map area for {doc['source']}, not {source_id}"
        )
    polygon = [(int(x), int(y)) for x, y in doc["pixel_polygon"]]
    problem = pixel_polygon_problem([list(v) for v in polygon])
    if problem:
        raise PipelineError(
            f"The map area for {source_id} is not a single valid polygon: it {problem}"
        )
    folds = tuple(tuple((int(x), int(y)) for x, y in line) for line in doc.get("fold_lines", []))
    outside = vertices_outside_raster(polygon, width, height)
    for line in folds:
        outside += vertices_outside_raster(line, width, height)
    if outside:
        shown = ", ".join(str(v) for v in outside[:5])
        more = f" and {len(outside) - 5} more" if len(outside) > 5 else ""
        raise PipelineError(
            f"The map area for {source_id} has vertices outside the raster ({width} x {height} "
            f"px): {shown}{more}. Fix {map_area_relative(source_id)}."
        )
    return MapArea(
        source=source_id,
        pixel_polygon=tuple(polygon),
        excluded=doc["excluded"],
        fold_lines=folds,
        confirmed_by=doc["confirmed_by"],
        confirmed_at=doc["confirmed_at"],
        sha256=sha256,
    )


# --- I/O ----------------------------------------------------------------------------------------


def load_map_area(
    paths: Paths, schema: SchemaSet, source_id: str, width: int, height: int
) -> MapArea:
    """Read and check a plate's map area. Raises PipelineError, naming the file, if there is none
    or it cannot be used. `width` and `height` are the full-resolution raster's."""
    path = paths.map_area_file(source_id)
    if not path.is_file():
        raise PipelineError(missing_message(source_id))
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise PipelineError(f"{map_area_relative(source_id)} is not valid JSON: {exc}") from exc
    problems = [f"{i.pointer}: {i.message}" for i in schema.issues("mapArea", doc)]
    if problems:
        raise PipelineError(
            f"{map_area_relative(source_id)} does not match the Schema (mapArea):\n  "
            + "\n  ".join(problems)
        )
    return parse_map_area(doc, source_id, width, height, sha256_file(path))
