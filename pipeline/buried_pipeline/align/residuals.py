"""Pure residual maths: residuals, RMSE, leave-one-out, outliers, choice, published error rule.

Sums use math.fsum so results do not depend on the order of the points.
"""

from __future__ import annotations

import math
import statistics
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from buried_pipeline.align.affine import Point, apply_affine, fit_affine

ERROR_MULTIPLIER = 2.0
ERROR_FLOOR_M = 2.0
ERROR_ROUND_UP_M = 0.1
OUTLIER_FACTOR = 3.0
MIN_POINTS_REFINED = 4


@dataclass(frozen=True)
class Residual:
    id: str
    dx_m: float
    dy_m: float
    r_m: float


def make_residual(point_id: str, predicted: Point, reference: Point) -> Residual:
    """r = T(p) - q, east and north components in metres, and its magnitude."""
    dx = predicted[0] - reference[0]
    dy = predicted[1] - reference[1]
    return Residual(point_id, dx, dy, math.hypot(dx, dy))


def residuals_for(
    ids: Sequence[str],
    pixels: Sequence[Point],
    references: Sequence[Point],
    predict: Callable[[float, float], Point],
) -> list[Residual]:
    return [
        make_residual(i, predict(x, y), q)
        for i, (x, y), q in zip(ids, pixels, references, strict=True)
    ]


def rmse(rs: Sequence[Residual]) -> float:
    if not rs:
        raise ValueError("RMSE of no residuals")
    return math.sqrt(math.fsum(r.dx_m * r.dx_m + r.dy_m * r.dy_m for r in rs) / len(rs))


def max_residual(rs: Sequence[Residual]) -> float:
    return max(r.r_m for r in rs)


def leave_one_out(
    ids: Sequence[str], pixels: Sequence[Point], references: Sequence[Point]
) -> list[Residual]:
    """Residual of each point under an affine fitted to all the other points.

    Raises UnstableFit when any subset is too close to a line.
    """
    out = []
    for i in range(len(ids)):
        rest_p = [p for j, p in enumerate(pixels) if j != i]
        rest_q = [q for j, q in enumerate(references) if j != i]
        t = fit_affine(rest_p, rest_q)
        out.append(make_residual(ids[i], apply_affine(t, *pixels[i]), references[i]))
    return out


def outlier_ids(rs: Sequence[Residual]) -> list[str]:
    """Ids whose residual magnitude is more than 3 times the median magnitude. Sorted."""
    if not rs:
        return []
    threshold = OUTLIER_FACTOR * statistics.median(r.r_m for r in rs)
    return sorted(r.id for r in rs if r.r_m > threshold)


def choose_transform(supplied_rmse_m: float, refined_loo_rmse_m: float | None) -> str:
    """'refined' only when a refined fit exists and its leave-one-out RMSE is lower."""
    if refined_loo_rmse_m is not None and refined_loo_rmse_m < supplied_rmse_m:
        return "refined"
    return "supplied"


def error_basis(
    chosen: str, supplied_rmse_m: float, refined_loo_rmse_m: float | None
) -> tuple[str, float]:
    """(name, B): the out-of-sample RMSE of the chosen transform."""
    if chosen == "refined":
        if refined_loo_rmse_m is None:
            raise ValueError("refined chosen without a leave-one-out RMSE")
        return ("refined_loo_rmse", refined_loo_rmse_m)
    return ("supplied_rmse", supplied_rmse_m)


def ceil_tenth(x: float) -> float:
    """Smallest multiple of 0.1 not less than x; float noise below 1e-9 does not add 0.1."""
    return math.ceil(round(x * 10, 9)) / 10


def published_error(basis_m: float) -> float:
    """alignment_error_m = ceil_0.1(max(2.0, 2 x B))."""
    return ceil_tenth(max(ERROR_FLOOR_M, ERROR_MULTIPLIER * basis_m))
