"""Geometry helpers for the Validator: position walking, ring closure and shapely validity."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from shapely.errors import ShapelyError
from shapely.geometry import box, shape
from shapely.geometry.base import BaseGeometry
from shapely.validation import explain_validity

POLYGONAL = ("Polygon", "MultiPolygon")
LINEAR = ("LineString", "MultiLineString")


def iter_positions(coordinates: Any) -> Iterator[tuple[float, float]]:
    """Every [easting, northing] pair in a nested GeoJSON coordinates array."""
    if (
        isinstance(coordinates, list)
        and len(coordinates) >= 2
        and all(isinstance(c, int | float) and not isinstance(c, bool) for c in coordinates)
    ):
        yield (float(coordinates[0]), float(coordinates[1]))
        return
    if isinstance(coordinates, list):
        for item in coordinates:
            yield from iter_positions(item)


def position_outside(coordinates: Any, bounds: dict[str, float]) -> tuple[float, float] | None:
    """The first position outside the bounds rectangle, or None."""
    for e, n in iter_positions(coordinates):
        inside_e = bounds["min_e"] <= e <= bounds["max_e"]
        inside_n = bounds["min_n"] <= n <= bounds["max_n"]
        if not (inside_e and inside_n):
            return (e, n)
    return None


def _rings(geometry: dict[str, Any]) -> Iterator[tuple[str, list[Any]]]:
    gtype = geometry["type"]
    coords = geometry["coordinates"]
    if gtype == "Polygon":
        for r, ring in enumerate(coords):
            yield (f"/coordinates/{r}", ring)
    elif gtype == "MultiPolygon":
        for p, polygon in enumerate(coords):
            for r, ring in enumerate(polygon):
                yield (f"/coordinates/{p}/{r}", ring)


def geometry_problems(geometry: dict[str, Any]) -> list[tuple[str, str]]:
    """(pointer suffix, reason) for each geometry problem. Empty means the geometry is sound.

    Polygons must have closed rings and be valid, non-empty and of positive area. Lines must have
    positive length. Points are always sound.
    """
    gtype = geometry["type"]
    problems: list[tuple[str, str]] = []
    if gtype in POLYGONAL:
        for pointer, ring in _rings(geometry):
            if ring[0] != ring[-1]:
                problems.append((pointer, "ring is not closed (first and last position differ)"))
    if problems:
        return problems
    try:
        shp: BaseGeometry = shape(geometry)
    except (ShapelyError, ValueError, TypeError) as exc:
        return [("", f"geometry cannot be read: {exc}")]
    if shp.is_empty:
        return [("", "geometry is empty")]
    if gtype in POLYGONAL:
        if not shp.is_valid:
            return [("", f"polygon is invalid: {explain_validity(shp)}")]
        if shp.area <= 0.0:
            return [("", "polygon has zero area")]
    elif gtype in LINEAR:
        if shp.length <= 0.0:
            return [("", "line has zero length")]
    return []


def to_shape(geometry: dict[str, Any]) -> BaseGeometry:
    return shape(geometry)


def pixel_polygon_problem(vertices: list[list[int]]) -> str | None:
    """Why a pixel polygon (open ring of integer [x, y] vertices) is not one simple polygon, or
    None. Used for map area files by the Validator and by the pipeline's map area reader.

    The first vertex must not be repeated at the end, there must be at least 4 distinct vertices,
    and the ring must be valid (no self-crossing, no zero area).
    """
    if len(vertices) < 4:
        return f"has {len(vertices)} vertices, needs at least 4"
    if vertices[0] == vertices[-1]:
        return "repeats its first vertex at the end; list each vertex once"
    if len({(v[0], v[1]) for v in vertices}) != len(vertices):
        return "lists the same vertex twice"
    try:
        polygon = shape({"type": "Polygon", "coordinates": [[*vertices, vertices[0]]]})
    except (ShapelyError, ValueError, TypeError) as exc:
        return f"cannot be read as a polygon: {exc}"
    if polygon.is_empty:
        return "is empty"
    if not polygon.is_valid:
        return f"is not a single valid polygon: {explain_validity(polygon)}"
    if polygon.area <= 0.0:
        return "has zero area"
    return None


def bounds_box(bounds: dict[str, float]) -> BaseGeometry:
    return box(bounds["min_e"], bounds["min_n"], bounds["max_e"], bounds["max_n"])
