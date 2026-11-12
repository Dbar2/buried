"""`buried align-check <SOURCE_ID>`: measure a raster's alignment error against control points."""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime
from typing import Any

from buried_pipeline import __version__
from buried_pipeline.align.compute import (
    AlignmentResult,
    ControlPoint,
    build_record,
    compute_alignment,
)
from buried_pipeline.align.control import ControlFile, parse_control_file
from buried_pipeline.align.references import check_references
from buried_pipeline.align.supplied import supplied_mapping
from buried_pipeline.errors import PipelineError
from buried_pipeline.fetch.manifest import sha256_file
from buried_pipeline.inspect.georef import find_raster, read_raster_info, to_proj_for
from buried_pipeline.inspect.report import build_report
from buried_pipeline.io.atomic import atomic_write_json
from buried_pipeline.io.registry import Registry
from buried_pipeline.paths import Paths
from buried_pipeline.timeutil import rfc3339
from buried_pipeline.validate.schema import SchemaSet, load_schema

RASTER_TYPES = ("fire_insurance_plan", "aerial_photograph")


def schema_problems(schema: SchemaSet, def_name: str, doc: Any, label: str) -> list[str]:
    return [f"{label} {i.pointer}: {i.message}" for i in schema.issues(def_name, doc)]


def load_control_file(
    paths: Paths, source_id: str, schema: SchemaSet
) -> tuple[ControlFile, str]:
    path = paths.control_file(source_id)
    if not path.exists():
        raise PipelineError(
            f"No control file for {source_id}: expected {path.relative_to(paths.root)}"
        )
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise PipelineError(f"Control file is not valid JSON: {path}: {exc}") from exc
    problems = schema_problems(schema, "controlPoints", doc, path.name)
    if problems:
        raise PipelineError(
            "The control file does not match the Schema (controlPoints); no alignment record "
            "was written:\n  " + "\n  ".join(problems)
        )
    return parse_control_file(doc, source_id), sha256_file(path)


def load_reference_layers(
    paths: Paths, registry: Registry, control: ControlFile
) -> dict[str, dict[str, Any]]:
    """Present layers for the registered reference sources the points cite."""
    layers: dict[str, dict[str, Any]] = {}
    for source_id in sorted({p.reference_source for p in control.points}):
        if not registry.has(source_id):
            continue
        if registry.get(source_id).type != "present_day_reference":
            continue
        layer_path = paths.present_layer(source_id)
        if layer_path.exists():
            layers[source_id] = json.loads(layer_path.read_text(encoding="utf-8"))
    return layers


def format_summary(
    source_id: str, control: ControlFile, result: AlignmentResult, skipped: str | None
) -> str:
    ref_sources = ", ".join(sorted({p.reference_source for p in control.points}))
    desc = {p.id: (p.reference_kind, p.description) for p in control.points}
    lines = [f"{source_id}  points: {len(control.points)}  references: {ref_sources}", ""]
    lines.append("Supplied georeferencing (residual = mapped position minus reference):")
    lines.append(f"{'id':<10} {'kind':<16} {'dE (m)':>9} {'dN (m)':>9} {'|r| (m)':>9}  description")
    for r in result.supplied.residuals:
        kind, text = desc[r.id]
        lines.append(f"{r.id:<10} {kind:<16} {r.dx_m:>9.3f} {r.dy_m:>9.3f} {r.r_m:>9.3f}  {text}")
    if result.refined:
        lines.append("")
        lines.append("Refined affine, in-sample residuals:")
        for r in result.refined.residuals:
            lines.append(f"{r.id:<10} {'':<16} {r.dx_m:>9.3f} {r.dy_m:>9.3f} {r.r_m:>9.3f}")
    lines.append("")
    lines.append(
        f"supplied   RMSE {result.supplied.rmse_m:.3f} m   "
        f"max {result.supplied.max_residual_m:.3f} m"
    )
    if result.refined:
        lines.append(
            f"refined    RMSE in-sample {result.refined.rmse_in_sample_m:.3f} m   "
            f"leave-one-out {result.refined.rmse_loo_m:.3f} m   "
            f"max {result.refined.max_residual_m:.3f} m"
        )
    else:
        lines.append(f"refined    not computed ({skipped})")
    lines.append(
        f"chosen: {result.chosen}   basis ({result.error_basis.replace('_', ' ')}): "
        f"{result.error_basis_m:.3f} m"
    )
    lines.append(
        f"published alignment_error_m: {result.alignment_error_m:.1f} m   "
        "(max(2.0, 2 x basis), rounded up to 0.1 m; this is not an RMSE)"
    )
    lines.append(f"possible outliers: {', '.join(result.outliers) if result.outliers else 'none'}")
    return "\n".join(lines)


def run_align_check(
    paths: Paths,
    registry: Registry,
    source_id: str,
    now: datetime,
    out: Callable[[str], None] = print,
    schema: SchemaSet | None = None,
) -> AlignmentResult:
    source = registry.get(source_id)
    if source.type not in RASTER_TYPES:
        raise PipelineError(f"{source_id} is not a raster source")

    schema = schema or load_schema(paths.root)
    control, control_sha = load_control_file(paths, source_id, schema)
    layers = load_reference_layers(paths, registry, control)
    problems = check_references(control.points, layers)
    if problems:
        raise PipelineError(
            "align-check refused to run; fix the control file:\n  " + "\n  ".join(problems)
        )

    info = read_raster_info(find_raster(paths.raw_source_dir(source_id)))
    report = build_report(info.transform, info.width, info.height, to_proj_for(info.crs))
    pixel_size = max(report.pixel_size_x_m, report.pixel_size_y_m)
    mapping = supplied_mapping(info.transform, info.crs)

    result = compute_alignment(
        [ControlPoint(p.id, p.pixel, p.reference) for p in control.points], mapping.predict
    )
    record = build_record(
        source_id=source_id,
        reference_sources=[p.reference_source for p in control.points],
        control_file=paths.control_file(source_id).relative_to(paths.root).as_posix(),
        control_sha256=control_sha,
        measured_at=rfc3339(now),
        tool_version=__version__,
        source_pixel_size_m=pixel_size,
        supplied_crs=mapping.crs,
        supplied_operation=mapping.operation,
        result=result,
    )
    out(format_summary(source_id, control, result, result.refined_skipped))
    # The record is checked against the Schema before it is written; a failing record is a bug
    # in this tool, never something to write and fix later.
    problems = schema_problems(schema, "alignmentRecord", record, "alignment record")
    if problems:
        raise PipelineError(
            "The alignment record does not match the Schema (alignmentRecord); nothing was "
            "written:\n  " + "\n  ".join(problems)
        )
    atomic_write_json(paths.alignment_record(source_id), record)
    out(f"alignment record written to {paths.alignment_record(source_id).relative_to(paths.root)}")
    return result
