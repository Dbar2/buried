"""Control file shape (spec 01 design "controlPoints"), checked in code until spec 01's Schema
exists. Pure: takes parsed JSON, returns typed points or raises PipelineError."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any

from buried_pipeline.errors import PipelineError

SOURCE_ID_RE = re.compile(r"^[a-z0-9]+(_[a-z0-9]+)*$")
REFERENCE_KINDS = ("intersection", "building_corner")
# Position ranges from the Schema's `position` definition (EPSG:26917 metres).
E_RANGE = (166000.0, 834000.0)
N_RANGE = (0.0, 9400000.0)
MIN_POINTS = 3


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


def _number(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool) and math.isfinite(value)


def _pair(value: Any, where: str) -> tuple[float, float]:
    if not (isinstance(value, list) and len(value) == 2 and all(_number(v) for v in value)):
        raise PipelineError(f"{where}: expected [number, number]")
    return (float(value[0]), float(value[1]))


def _parse_point(index: int, raw: Any) -> ControlFilePoint:
    if not isinstance(raw, dict):
        raise PipelineError(f"Control point #{index} is not an object")
    pid = raw.get("id")
    if not isinstance(pid, str) or not pid:
        raise PipelineError(f"Control point #{index} has no id")
    where = f"Control point {pid}"
    allowed = {
        "id", "description", "pixel", "reference", "reference_source", "reference_kind",
        "reference_feature_id", "reference_vertex",
    }  # fmt: skip
    extra = sorted(raw.keys() - allowed)
    if extra:
        raise PipelineError(f"{where}: unknown fields {extra}")
    for key in ("description", "reference_source", "reference_feature_id"):
        if not isinstance(raw.get(key), str) or not raw[key]:
            raise PipelineError(f"{where}: {key} must be a non-empty string")
    if not SOURCE_ID_RE.match(raw["reference_source"]):
        raise PipelineError(f"{where}: reference_source is not a source id")
    kind = raw.get("reference_kind")
    if kind not in REFERENCE_KINDS:
        raise PipelineError(f"{where}: reference_kind must be one of {list(REFERENCE_KINDS)}")
    pixel = _pair(raw.get("pixel"), f"{where} pixel")
    if pixel[0] < 0 or pixel[1] < 0:
        raise PipelineError(f"{where}: pixel coordinates cannot be negative")
    reference = _pair(raw.get("reference"), f"{where} reference")
    if not (E_RANGE[0] <= reference[0] <= E_RANGE[1] and N_RANGE[0] <= reference[1] <= N_RANGE[1]):
        raise PipelineError(
            f"{where}: reference {list(reference)} is not an EPSG:26917 easting, northing "
            "(is it lon/lat?)"
        )
    vertex = raw.get("reference_vertex")
    parsed_vertex: tuple[int, int] | None = None
    if kind == "building_corner":
        if (
            not isinstance(vertex, dict)
            or set(vertex) != {"polygon", "vertex"}
            or not all(isinstance(vertex[k], int) and not isinstance(vertex[k], bool)
                       and vertex[k] >= 0 for k in vertex)
        ):
            raise PipelineError(
                f"{where}: a building_corner needs reference_vertex {{polygon, vertex}} (>= 0)"
            )
        parsed_vertex = (vertex["polygon"], vertex["vertex"])
    elif vertex is not None:
        raise PipelineError(f"{where}: reference_vertex is only for building_corner points")
    return ControlFilePoint(
        id=pid,
        description=raw["description"],
        pixel=pixel,
        reference=reference,
        reference_source=raw["reference_source"],
        reference_kind=kind,
        reference_feature_id=raw["reference_feature_id"],
        reference_vertex=parsed_vertex,
    )


def parse_control_file(doc: Any, expected_source: str) -> ControlFile:
    if not isinstance(doc, dict):
        raise PipelineError("Control file is not a JSON object")
    allowed = {"schema_version", "source", "pixel_convention", "points"}
    if set(doc) != allowed:
        raise PipelineError(
            f"Control file fields must be exactly {sorted(allowed)}; got {sorted(doc)}"
        )
    if doc["schema_version"] != "1.0.0":
        raise PipelineError(
            f"Control file schema_version must be 1.0.0, got {doc['schema_version']!r}"
        )
    if doc["source"] != expected_source:
        raise PipelineError(
            f"Control file is for {doc['source']!r}, "
            f"but align-check was run for {expected_source!r}"
        )
    if doc["pixel_convention"] != "gdal_corner":
        raise PipelineError("Control file pixel_convention must be 'gdal_corner'")
    if not isinstance(doc["points"], list):
        raise PipelineError("Control file points must be a list")
    if len(doc["points"]) < MIN_POINTS:
        raise PipelineError(
            f"Control file has {len(doc['points'])} points; at least {MIN_POINTS} are needed. "
            "No alignment record was written."
        )
    points = [_parse_point(i, raw) for i, raw in enumerate(doc["points"])]
    ids = [p.id for p in points]
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup:
        raise PipelineError(f"Control point ids are not unique: {dup}")
    return ControlFile(source=expected_source, points=points)
