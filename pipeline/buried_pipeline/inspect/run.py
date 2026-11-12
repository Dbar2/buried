"""The `buried inspect` command body: inspect rasters, print a table, propose the origin."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from buried_pipeline.errors import PipelineError
from buried_pipeline.inspect.georef import inspect_source
from buried_pipeline.inspect.report import Bounds, project_bounds, propose_origin
from buried_pipeline.io.registry import Registry
from buried_pipeline.paths import Paths

PLATE_TYPE = "fire_insurance_plan"
RASTER_TYPES = ("fire_insurance_plan", "aerial_photograph")


def report_bounds(report: dict[str, Any]) -> Bounds:
    b = report["bounds_26917"]
    return (b["min_e"], b["min_n"], b["max_e"], b["max_n"])


def load_report(paths: Paths, source_id: str) -> dict[str, Any]:
    path = paths.inspect_report(source_id)
    if not path.exists():
        raise PipelineError(
            f"No inspect report for {source_id}: run `buried inspect` on it first ({path})"
        )
    return json.loads(path.read_text(encoding="utf-8"))


def plate_bounds(paths: Paths, registry: Registry) -> list[Bounds]:
    """Bounds from the inspect reports of every registered showcase plate."""
    ids = [s.id for s in registry.by_type(PLATE_TYPE)]
    if not ids:
        raise PipelineError("No plates in the Registry")
    return [report_bounds(load_report(paths, i)) for i in ids]


def format_table(reports: list[dict[str, Any]]) -> str:
    header = (
        f"{'source':<18} {'size (px)':<13} {'crs':<12} {'georef from':<13} "
        f"{'pixel (m)':<19} bounds EPSG:26917 (min_e, min_n, max_e, max_n)"
    )
    lines = [header]
    for r in reports:
        b = r["bounds_26917"]
        px = r["pixel_size_m"]
        lines.append(
            f"{r['source']:<18} {r['width_px']}x{r['height_px']:<8} {r['crs']:<12} "
            f"{r['georef_source']:<13} {px['x']:.4f} x {px['y']:.4f}  "
            f"{b['min_e']:.2f}, {b['min_n']:.2f}, {b['max_e']:.2f}, {b['max_n']:.2f}"
        )
    return "\n".join(lines)


def run_inspect(
    paths: Paths,
    registry: Registry,
    ids: list[str],
    propose_origin_flag: bool,
    out: Callable[[str], None] = print,
) -> None:
    if not ids:
        ids = [s.id for s in registry.sources if s.type in RASTER_TYPES and
               paths.raw_source_dir(s.id).is_dir()]
        if not ids:
            raise PipelineError("Nothing to inspect: no fetched rasters. Run `buried fetch`.")
    for source_id in ids:
        if registry.get(source_id).type not in RASTER_TYPES:
            raise PipelineError(f"{source_id} is not a raster source")

    reports = [inspect_source(paths, source_id) for source_id in ids]
    out(format_table(reports))
    for r in reports:
        for note in r["notes"]:
            out(f"{r['source']}: {note}")
        rel_report = paths.inspect_report(r["source"]).relative_to(paths.root)
        out(f"{r['source']}: report written to {rel_report}")

    if propose_origin_flag:
        all_bounds = plate_bounds(paths, registry)
        origin = propose_origin(all_bounds)
        bounds = project_bounds(all_bounds)
        n_plates = len(all_bounds)
        out("")
        out(f"Proposed project origin from {n_plates} plates (not written):")
        out(f"  E0 = {origin[0]:.0f}  N0 = {origin[1]:.0f}  (EPSG:26917)")
        out("Proposed project bounds (union + 250 m, rounded outward to 100 m):")
        out(f"  min_e = {bounds[0]:.0f}  min_n = {bounds[1]:.0f}  "
            f"max_e = {bounds[2]:.0f}  max_n = {bounds[3]:.0f}")
