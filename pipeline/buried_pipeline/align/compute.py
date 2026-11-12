"""Pure alignment computation: control points + supplied mapping -> result and record body."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

from buried_pipeline.align.affine import Affine6, Point, UnstableFit, fit_local_affine
from buried_pipeline.align.hull import control_hull, hull_area_m2
from buried_pipeline.align.residuals import (
    ERROR_FLOOR_M,
    ERROR_MULTIPLIER,
    ERROR_ROUND_UP_M,
    MIN_POINTS_REFINED,
    Residual,
    choose_transform,
    error_basis,
    leave_one_out,
    local_residuals_for,
    max_residual,
    outlier_ids,
    published_error,
    residuals_for,
    rmse,
)
from buried_pipeline.errors import PipelineError
from buried_pipeline.schema_version import SCHEMA_VERSION

MIN_POINTS = 3


@dataclass(frozen=True)
class ControlPoint:
    id: str
    pixel: Point
    reference: Point


@dataclass(frozen=True)
class SuppliedResult:
    residuals: list[Residual]
    rmse_m: float
    max_residual_m: float


@dataclass(frozen=True)
class RefinedResult:
    affine: Affine6
    residuals: list[Residual]
    rmse_in_sample_m: float
    rmse_loo_m: float
    max_residual_m: float


@dataclass(frozen=True)
class AlignmentResult:
    supplied: SuppliedResult
    refined: RefinedResult | None
    refined_skipped: str | None
    chosen: str
    error_basis: str
    error_basis_m: float
    alignment_error_m: float
    chosen_residuals: list[Residual]
    outliers: list[str]


def compute_alignment(
    points: Sequence[ControlPoint], predict_supplied: Callable[[float, float], Point]
) -> AlignmentResult:
    """Everything `align-check` reports. Points are put in id order first, so the result does
    not depend on the order they were listed in."""
    if len(points) < MIN_POINTS:
        raise PipelineError(f"At least {MIN_POINTS} control points are needed, got {len(points)}")
    ordered = sorted(points, key=lambda p: p.id)
    ids = [p.id for p in ordered]
    if len(set(ids)) != len(ids):
        raise PipelineError("Control point ids are not unique")
    pixels = [p.pixel for p in ordered]
    refs = [p.reference for p in ordered]

    sup_res = residuals_for(ids, pixels, refs, predict_supplied)
    supplied = SuppliedResult(sup_res, rmse(sup_res), max_residual(sup_res))

    refined: RefinedResult | None = None
    skipped: str | None = None
    if len(ordered) < MIN_POINTS_REFINED:
        skipped = f"refined fit needs {MIN_POINTS_REFINED} or more points, got {len(ordered)}"
    else:
        try:
            local = fit_local_affine(pixels, refs)
            in_res = local_residuals_for(ids, pixels, refs, local)
            loo_res = leave_one_out(ids, pixels, refs)
            refined = RefinedResult(
                affine=local.to_affine6(),
                residuals=in_res,
                rmse_in_sample_m=rmse(in_res),
                rmse_loo_m=rmse(loo_res),
                max_residual_m=max_residual(in_res),
            )
        except UnstableFit as exc:
            skipped = f"refined fit skipped: {exc}"

    chosen = choose_transform(supplied.rmse_m, refined.rmse_loo_m if refined else None)
    basis_name, basis_m = error_basis(
        chosen, supplied.rmse_m, refined.rmse_loo_m if refined else None
    )
    if basis_m <= 0.0:
        raise PipelineError(
            "The error basis is exactly 0 m. Real control points never fit that well; the "
            "points were probably copied from the georeferencing instead of read from the plate."
        )
    chosen_res = refined.residuals if (chosen == "refined" and refined) else supplied.residuals
    return AlignmentResult(
        supplied=supplied,
        refined=refined,
        refined_skipped=skipped,
        chosen=chosen,
        error_basis=basis_name,
        error_basis_m=basis_m,
        alignment_error_m=published_error(basis_m),
        chosen_residuals=chosen_res,
        outliers=outlier_ids(chosen_res),
    )


def _res_json(rs: Sequence[Residual]) -> list[dict[str, Any]]:
    return [{"id": r.id, "dx_m": r.dx_m, "dy_m": r.dy_m, "r_m": r.r_m} for r in rs]


def build_record(
    *,
    source_id: str,
    reference_sources: Sequence[str],
    control_file: str,
    control_sha256: str,
    measured_at: str,
    tool_version: str,
    source_pixel_size_m: float,
    supplied_crs: str,
    supplied_operation: str,
    result: AlignmentResult,
    control_references: Sequence[tuple[float, float]],
) -> dict[str, Any]:
    """The `alignmentRecord` document (spec 01 design). `control_references` are the control
    points' reference positions; the record states their convex hull (spec 01 requirement 30)."""
    hull = control_hull(control_references)
    record: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "source": source_id,
        "reference_sources": sorted(set(reference_sources)),
        "control_file": control_file,
        "control_sha256": control_sha256,
        "measured_at": measured_at,
        "tool_version": tool_version,
        "status": "measured",
        "source_pixel_size_m": source_pixel_size_m,
        "supplied": {
            "crs": supplied_crs,
            "operation": supplied_operation,
            "residuals": _res_json(result.supplied.residuals),
            "rmse_m": result.supplied.rmse_m,
            "max_residual_m": result.supplied.max_residual_m,
        },
    }
    if result.refined is not None:
        record["refined"] = {
            "affine": list(result.refined.affine),
            "residuals": _res_json(result.refined.residuals),
            "rmse_in_sample_m": result.refined.rmse_in_sample_m,
            "rmse_loo_m": result.refined.rmse_loo_m,
            "max_residual_m": result.refined.max_residual_m,
        }
    record.update(
        {
            "chosen": result.chosen,
            "error_basis": result.error_basis,
            "error_basis_m": result.error_basis_m,
            "error_rule": {
                "multiplier": ERROR_MULTIPLIER,
                "floor_m": ERROR_FLOOR_M,
                "round_up_to_m": ERROR_ROUND_UP_M,
            },
            "alignment_error_m": result.alignment_error_m,
            "outliers": result.outliers,
            "control_hull": hull,
            "control_hull_area_m2": hull_area_m2(hull),
        }
    )
    return record
