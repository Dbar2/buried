"""`buried match`: read the evidence files, alignment records, tile sidecars and decisions, run
`compute_match`, validate the whole would-be `data/` state, and write the changed evidence files
and the review list (spec 02 requirements 13.1, 13.12, 13.14).
"""

from __future__ import annotations

import math
import os
import tempfile
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

from shapely.geometry import Polygon

from buried_pipeline.align.residuals import ceil_tenth
from buried_pipeline.errors import PipelineError
from buried_pipeline.io.atomic import atomic_write_json
from buried_pipeline.io.registry import Registry
from buried_pipeline.match.apply import parse_decisions
from buried_pipeline.match.compute import AerialInfo, MatchInputs, MatchResult, compute_match
from buried_pipeline.paths import Paths
from buried_pipeline.publish.build import canonical_text
from buried_pipeline.publish.run import read_json
from buried_pipeline.validate.run import validate_would_be
from buried_pipeline.validate.schema import SchemaSet, load_schema

PLATE_TYPE = "fire_insurance_plan"
AERIAL_TYPE = "aerial_photograph"
CORNER_ORDER = ("top_left", "top_right", "bottom_right", "bottom_left")


def plate_min_error(record: dict[str, Any]) -> float:
    """The smallest position error a feature on this plate can have: the root-sum-square of its
    alignment error and its digitising term (at least 1.0 m and 2 source pixels), rounded up to
    0.1 m (design.md "What it compares")."""
    digitising = max(1.0, 2.0 * float(record["source_pixel_size_m"]))
    return float(ceil_tenth(math.hypot(float(record["alignment_error_m"]), digitising)))


def _write_all(files: dict[Path, str]) -> None:
    """Write every file or none: temp files first, then renames."""
    temps: dict[Path, Path] = {}
    try:
        for target, text in files.items():
            target.parent.mkdir(parents=True, exist_ok=True)
            fd, name = tempfile.mkstemp(dir=target.parent, prefix=f".{target.name}.", suffix=".tmp")
            temps[target] = Path(name)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(text)
                handle.flush()
                os.fsync(handle.fileno())
    except BaseException:
        for t in temps.values():
            t.unlink(missing_ok=True)
        raise
    for target, temp in temps.items():
        os.replace(temp, target)


def load_inputs(
    paths: Paths, registry: Registry, decisions_path: Path | None, out: Callable[[str], None]
) -> MatchInputs:
    docs: dict[str, dict[str, Any]] = {}
    for file in sorted((paths.data / "evidence").glob("*.geojson")):
        docs[file.stem] = read_json(file, "an evidence file")

    plate_sources = frozenset(
        s.id for s in registry.by_type(PLATE_TYPE) if s.id in docs
    )
    min_error: dict[str, float] = {}
    for sid in sorted(plate_sources):
        record_path = paths.alignment_record(sid)
        if not record_path.is_file():
            raise PipelineError(
                f"{sid} has an evidence file but no alignment record "
                f"({record_path.relative_to(paths.root).as_posix()})"
            )
        min_error[sid] = plate_min_error(read_json(record_path, "the alignment record"))

    aerials: dict[str, AerialInfo] = {}
    for source in registry.by_type(AERIAL_TYPE):
        sidecar_path = paths.tile_sidecar(source.id)
        if not paths.alignment_record(source.id).is_file():
            out(f"{source.id}: skipped, no alignment record (requirement 13.1)")
            continue
        if not sidecar_path.is_file():
            out(f"{source.id}: skipped, no tile sidecar")
            continue
        sidecar = read_json(sidecar_path, "the tile sidecar")
        corners = [tuple(sidecar["corners"][name]) for name in CORNER_ORDER]
        aerials[source.id] = AerialInfo(source.id, Polygon(corners), sidecar["image"])

    path = decisions_path or paths.match_decisions
    decisions_doc = read_json(path, "the match decisions file") if path.is_file() else None
    if decisions_path is not None and decisions_doc is None:
        raise PipelineError(f"the match decisions file does not exist: {path}")

    return MatchInputs(
        docs=docs,
        plate_sources=plate_sources,
        min_error_m=min_error,
        aerials=aerials,
        year_to={s.id: s.year_to for s in registry.sources},
        decisions=parse_decisions(decisions_doc),
    )


def changed_documents(
    paths: Paths, inputs: MatchInputs, result: MatchResult
) -> dict[Path, dict[str, Any]]:
    """Documents whose parsed content differs from what is on disk."""
    return {
        paths.evidence_file(source): doc
        for source, doc in sorted(result.docs.items())
        if doc != inputs.docs[source]
    }


def format_counts(result: MatchResult) -> list[str]:
    if not result.counts:
        return ["no source pair compared"]
    lines = []
    for (origin, other), c in sorted(result.counts.items()):
        lines.append(
            f"{origin} -> {other}: matched {c.matched}, absent {c.absent}, "
            f"not covered {c.not_covered}, sent to review {c.review}, "
            f"pending aerial checks {c.pending}"
        )
    return lines


def run_match(
    paths: Paths,
    registry: Registry,
    now: datetime,
    decisions_path: Path | None = None,
    out: Callable[[str], None] = print,
    schema: SchemaSet | None = None,
) -> MatchResult:
    schema = schema or load_schema(paths.root)
    inputs = load_inputs(paths, registry, decisions_path, out)
    if not inputs.docs:
        raise PipelineError("No evidence files under data/evidence/; publish a plate first")
    result = compute_match(inputs)

    changed = changed_documents(paths, inputs, result)
    if changed:
        errors = validate_would_be(paths, dict(changed), now, schema)
        if errors:
            for e in errors:
                out(e.format())
            raise PipelineError(
                f"the would-be data/ state failed validation ({len(errors)} errors); "
                "nothing was written"
            )
        _write_all({target: canonical_text(doc) for target, doc in changed.items()})

    review_doc = {"review": result.review}
    atomic_write_json(paths.match_review, review_doc)

    for line in format_counts(result):
        out(line)
    if changed:
        for target in changed:
            out(f"wrote {target.relative_to(paths.root).as_posix()}")
    else:
        out("no evidence file changed")
    out(
        f"{len(result.review)} items on the review list: "
        f"{paths.match_review.relative_to(paths.root).as_posix()}"
    )
    return result
