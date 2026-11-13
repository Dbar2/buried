"""`buried publish <SOURCE_ID>`: read the inputs, build the evidence file, validate the would-be
`data/` state, and write it atomically only if it is valid (spec 02 requirements 10.1, 10.3, 10.8,
10.9).

`prepare_publish` does everything except the write, so the Studio service can return the same file
without touching `data/` (spec 04 requirement 1.7).
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from buried_pipeline.errors import PipelineError
from buried_pipeline.fetch.manifest import sha256_file
from buried_pipeline.inspect.georef import find_raster, read_raster_info
from buried_pipeline.io.atomic import atomic_write_text
from buried_pipeline.io.registry import Registry
from buried_pipeline.paths import Paths
from buried_pipeline.publish.build import BuildInputs, BuildResult, build_evidence, canonical_text
from buried_pipeline.publish.decisions import parse_decisions
from buried_pipeline.tile.run import check_source, chosen_mapping, load_alignment
from buried_pipeline.validate.errors import ValidationError
from buried_pipeline.validate.run import validate_would_be
from buried_pipeline.validate.schema import SchemaSet, load_schema


@dataclass(frozen=True)
class PublishPlan:
    source_id: str
    build: BuildResult
    text: str  # the canonical evidence file text
    errors: list[ValidationError]  # empty means the would-be data/ state passes the Validator


def read_json(path: Path, what: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise PipelineError(f"{what} not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise PipelineError(f"{what} is not valid JSON: {path}: {exc}") from exc


def prepare_publish(
    paths: Paths,
    registry: Registry,
    schema: SchemaSet,
    source_id: str,
    decisions_doc: Any,
    now: datetime,
    proposals_doc: dict[str, Any] | None = None,
) -> PublishPlan:
    """Build and validate. Raises `PipelineError` (a `PublishRefusal` for refusals that name
    proposals) when the inputs cannot be used; returns validation errors in the plan."""
    source = registry.get(source_id)  # 10.9: unregistered
    check_source(source)  # 10.9: attribution not confirmed, not a plate
    record = load_alignment(paths, schema, source_id)
    if record["status"] != "measured":
        raise PipelineError(f"{source_id}: the alignment record is not measured; nothing is "
                            "published from a plate with no measured alignment error")

    info = read_raster_info(find_raster(paths.raw_source_dir(source_id)))
    decisions = parse_decisions(decisions_doc, source_id)
    if proposals_doc is None:
        proposals_doc = read_json(
            paths.proposals_file(source_id),
            f"the proposal file (run `buried extract {source_id}` first)",
        )
    evidence_path = paths.evidence_file(source_id)
    existing = read_json(evidence_path, "the evidence file") if evidence_path.is_file() else None

    result = build_evidence(BuildInputs(
        source_id=source_id,
        proposals=proposals_doc,
        decisions=decisions,
        existing=existing,
        alignment_error_m=float(record["alignment_error_m"]),
        source_pixel_size_m=float(record["source_pixel_size_m"]),
        alignment_record_sha256=sha256_file(paths.alignment_record(source_id)),
        mapping=chosen_mapping(record, info.transform, info.crs),
        raster_size=(info.width, info.height),
    ))
    errors = validate_would_be(paths, {evidence_path: result.doc}, now, schema)
    return PublishPlan(source_id, result, canonical_text(result.doc), errors)


def run_publish(
    paths: Paths,
    registry: Registry,
    source_id: str,
    now: datetime,
    decisions_path: Path | None = None,
    out: Callable[[str], None] = print,
    schema: SchemaSet | None = None,
) -> PublishPlan:
    schema = schema or load_schema(paths.root)
    path = decisions_path or paths.review_file(source_id)
    decisions_doc = read_json(path, "the decisions file")
    plan = prepare_publish(paths, registry, schema, source_id, decisions_doc, now)
    if plan.errors:
        for e in plan.errors:
            out(e.format())
        raise PipelineError(f"{source_id}: the evidence file failed validation "
                            f"({len(plan.errors)} errors); nothing was written")
    target = paths.evidence_file(source_id)
    atomic_write_text(target, plan.text)
    c = plan.build.counts
    out(f"{source_id}: wrote {target.relative_to(paths.root).as_posix()}")
    out(f"  accepted {c.accepted}, published now {c.published_now}, already published "
        f"{c.already_published}, rejected {c.rejected}, undecided {c.undecided}")
    if c.published_now:
        out("  new features: " + ", ".join(plan.build.new_feature_ids))
        out(f"  run `buried match` if another published plate overlaps {source_id}")
    return plan
