"""Typed control points. Pure: takes parsed JSON, returns typed points or raises PipelineError.

The shape of a control file is the Schema's `controlPoints` definition (spec 01); `align-check`
validates the file against it before calling `parse_control_file`, so this module only converts
and applies the two rules the Schema cannot state: the file is for the raster being checked, and
point ids are unique.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from buried_pipeline.errors import PipelineError


@dataclass(frozen=True)
class ControlFilePoint:
    id: str
    description: str
    pixel: tuple[float, float]
    reference: tuple[float, float]
    reference_source: str
    reference_kind: str
    reference_feature_id: str
    reference_vertex: tuple[int, int] | None  # (polygon, vertex)


@dataclass(frozen=True)
class ControlFile:
    source: str
    points: list[ControlFilePoint]


def _point(raw: dict[str, Any]) -> ControlFilePoint:
    vertex = raw.get("reference_vertex")
    return ControlFilePoint(
        id=raw["id"],
        description=raw["description"],
        pixel=(float(raw["pixel"][0]), float(raw["pixel"][1])),
        reference=(float(raw["reference"][0]), float(raw["reference"][1])),
        reference_source=raw["reference_source"],
        reference_kind=raw["reference_kind"],
        reference_feature_id=raw["reference_feature_id"],
        reference_vertex=(vertex["polygon"], vertex["vertex"]) if vertex else None,
    )


def parse_control_file(doc: dict[str, Any], expected_source: str) -> ControlFile:
    """Convert a schema-valid control file. `doc` must already satisfy `controlPoints`."""
    if doc["source"] != expected_source:
        raise PipelineError(
            f"Control file is for {doc['source']!r}, "
            f"but align-check was run for {expected_source!r}"
        )
    points = [_point(raw) for raw in doc["points"]]
    ids = [p.id for p in points]
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup:
        raise PipelineError(f"Control point ids are not unique: {dup}")
    return ControlFile(source=expected_source, points=points)
