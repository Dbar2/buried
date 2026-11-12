"""Check every control point's reference against its present layer. Pure.

A point is refused when its reference source has no layer, the cited feature is not in the layer,
the layer's geometry does not fit the kind, or `reference` is more than 0.001 m from the cited
intersection point or building vertex.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any

from buried_pipeline.align.control import ControlFilePoint

TOLERANCE_M = 0.001

# Which present layer each kind of point may cite (spec 01 design, reference table).
REFERENCE_TABLE: dict[str, tuple[str, ...]] = {
    "intersection": ("present_toronto_intersections_2026",),
    "building_corner": ("present_toronto_building_outlines_2026",),
}


def _feature_index(layer: Mapping[str, Any]) -> dict[str, Any]:
    return {str(f["id"]): f for f in layer.get("features", [])}


def _exterior_ring(geometry: Mapping[str, Any], polygon: int) -> list[Any] | None:
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")
    if gtype == "Polygon":
        polys = [coords]
    elif gtype == "MultiPolygon":
        polys = coords
    else:
        return None
    if not (0 <= polygon < len(polys)) or not polys[polygon]:
        return None
    return polys[polygon][0]


def point_problem(
    point: ControlFilePoint, layers: Mapping[str, Mapping[str, Any]]
) -> str | None:
    """Why this point's reference is refused, or None."""
    allowed = REFERENCE_TABLE[point.reference_kind]
    if point.reference_source not in allowed:
        return (
            f"{point.reference_kind} points may cite {list(allowed)}, "
            f"not {point.reference_source}"
        )
    layer = layers.get(point.reference_source)
    if layer is None:
        return (
            f"reference source {point.reference_source} is not registered or has no present "
            "layer under data/present/"
        )
    feature = _feature_index(layer).get(point.reference_feature_id)
    if feature is None:
        return (
            f"feature {point.reference_feature_id!r} is not in {point.reference_source}"
        )
    geometry = feature["geometry"]
    if point.reference_kind == "intersection":
        if geometry.get("type") != "Point":
            return f"feature {point.reference_feature_id!r} is not a Point"
        target = geometry["coordinates"]
    else:
        assert point.reference_vertex is not None
        polygon, vertex = point.reference_vertex
        ring = _exterior_ring(geometry, polygon)
        if ring is None:
            return f"feature {point.reference_feature_id!r} has no polygon {polygon}"
        if not 0 <= vertex < len(ring):
            return (
                f"polygon {polygon} of {point.reference_feature_id!r} has {len(ring)} exterior "
                f"vertices; vertex {vertex} does not exist"
            )
        target = ring[vertex]
    distance = math.hypot(point.reference[0] - target[0], point.reference[1] - target[1])
    if distance > TOLERANCE_M:
        return (
            f"reference {list(point.reference)} is {distance:.3f} m from the cited "
            f"{point.reference_kind.replace('_', ' ')} at {[target[0], target[1]]} "
            f"(limit {TOLERANCE_M} m)"
        )
    return None


def check_references(
    points: Sequence[ControlFilePoint], layers: Mapping[str, Mapping[str, Any]]
) -> list[str]:
    """One message per refused point, each naming the point. Empty means all are good."""
    messages = []
    for point in points:
        problem = point_problem(point, layers)
        if problem:
            messages.append(f"control point {point.id}: {problem}")
    return messages
