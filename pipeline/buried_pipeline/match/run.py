"""`buried match`: read the evidence files, alignment records, tile sidecars and decisions, run
`compute_match`, validate the whole would-be `data/` state, and write the changed evidence files
and the review list (spec 02 requirements 13.1, 13.12, 13.14).
"""

from __future__ import annotations

import itertools
import math
import os
import tempfile
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

from shapely.geometry import Polygon

from buried_pipeline.align.pairwise import (
    MIN_SHARED,
    PAIRWISE_FLOOR_M,
    PAIRWISE_MULTIPLIER,
    PlatePoint,
    pairwise_error,
    plate_points,
)
from buried_pipeline.align.residuals import ceil_tenth
from buried_pipeline.errors import PipelineError
from buried_pipeline.fetch.manifest import sha256_file
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


def plate_min_own_term(record: dict[str, Any]) -> float:
    """A plate's digitising term: at least 1.0 m and 2 source pixels (evidence.md)."""
    return max(1.0, 2.0 * float(record["source_pixel_size_m"]))


def pairwise_figures(
    paths: Paths, records: dict[str, dict[str, Any]], out: Callable[[str], None]
) -> tuple[dict[tuple[str, str], float], list[dict[str, Any]]]:
    """The pairwise alignment error of every two plates that share enough control references
    (requirement 13.15), from the committed control files and alignment records. Returns the
    figures keyed by the two source ids in sorted order, and one report row per pair of plates
    saying what was used or why not. A plate whose control file no longer matches its alignment
    record (stale record) takes no part."""
    points: dict[str, list[PlatePoint]] = {}
    report: list[dict[str, Any]] = []
    for sid in sorted(records):
        control_path = paths.control_file(sid)
        if not control_path.is_file():
            out(f"{sid}: no control file, no pairwise figure")
            continue
        if sha256_file(control_path) != records[sid].get("control_sha256"):
            out(f"{sid}: control file changed since its alignment record, no pairwise figure")
            continue
        try:
            points[sid] = plate_points(records[sid], read_json(control_path, "the control file"))
        except ValueError as exc:
            out(f"{sid}: {exc}, no pairwise figure")
    figures: dict[tuple[str, str], float] = {}
    for a, b in itertools.combinations(sorted(records), 2):
        row: dict[str, Any] = {"plates": [a, b]}
        result = pairwise_error(points[a], points[b]) if a in points and b in points else None
        if result is None:
            row["used"] = False
            row["reason"] = (
                f"fewer than {MIN_SHARED} shared control references, or a plate has no usable "
                "control file; the plates' absolute errors are used"
            )
        else:
            figures[(a, b)] = result.error_m
            row.update(
                used=True,
                shared_references=[list(k) for k in result.shared],
                differences_m=[[round(dx, 4), round(dy, 4)] for dx, dy in result.differences_m],
                basis_m=round(result.basis_m, 4),
                pairwise_error_m=result.error_m,
                floor_m=PAIRWISE_FLOOR_M,
                multiplier=PAIRWISE_MULTIPLIER,
                chosen={a: records[a]["chosen"], b: records[b]["chosen"]},
                control_sha256={a: records[a]["control_sha256"], b: records[b]["control_sha256"]},
            )
        report.append(row)
    return figures, report


def load_inputs(
    paths: Paths,
    registry: Registry,
    decisions_path: Path | None,
    out: Callable[[str], None],
    pairwise: list[dict[str, Any]] | None = None,
) -> MatchInputs:
    docs: dict[str, dict[str, Any]] = {}
    for file in sorted((paths.data / "evidence").glob("*.geojson")):
        docs[file.stem] = read_json(file, "an evidence file")

    plate_sources = frozenset(
        s.id for s in registry.by_type(PLATE_TYPE) if s.id in docs
    )
    min_error: dict[str, float] = {}
    min_own: dict[str, float] = {}
    records: dict[str, dict[str, Any]] = {}
    for sid in sorted(plate_sources):
        record_path = paths.alignment_record(sid)
        if not record_path.is_file():
            raise PipelineError(
                f"{sid} has an evidence file but no alignment record "
                f"({record_path.relative_to(paths.root).as_posix()})"
            )
        records[sid] = read_json(record_path, "the alignment record")
        min_error[sid] = plate_min_error(records[sid])
        min_own[sid] = plate_min_own_term(records[sid])
    pairwise_errors, pairwise_rows = pairwise_figures(paths, records, out)
    if pairwise is not None:
        pairwise.extend(pairwise_rows)

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
        min_own_term_m=min_own,
        pairwise_error_m=pairwise_errors,
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
    pairwise_rows: list[dict[str, Any]] = []
    inputs = load_inputs(paths, registry, decisions_path, out, pairwise_rows)
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
    atomic_write_json(paths.match_pairwise, {"pairwise": pairwise_rows})

    for row in pairwise_rows:
        a, b = row["plates"]
        if row["used"]:
            out(
                f"pairwise {a} / {b}: {row['pairwise_error_m']} m from "
                f"{len(row['shared_references'])} shared references "
                f"(RMS of differences {row['basis_m']} m)"
            )
        else:
            out(f"pairwise {a} / {b}: not used ({row['reason']})")
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
