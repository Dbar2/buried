"""Pure affine maths: fit by least squares, apply, invert, stability check.

An affine is (a, b, c, d, e, f) with E = a*x + b*y + c and N = d*x + e*y + f, from pixel
(x, y) to EPSG:26917 (E, N).
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

Affine6 = tuple[float, float, float, float, float, float]
Point = tuple[float, float]

STABILITY_MIN = 0.05  # s_min / s_max of the centred pixel coordinates
DET_MIN = 1e-12


class UnstableFit(ValueError):
    """The points are too close to a line for a stable affine fit."""


class NotInvertible(ValueError):
    """The affine's determinant is (nearly) zero."""


def stability_ratio(pixels: Sequence[Point]) -> float:
    """s_min / s_max of the singular values of the centred n x 2 pixel matrix (0 if degenerate)."""
    p = np.asarray(pixels, dtype=float)
    if p.ndim != 2 or p.shape[1] != 2 or p.shape[0] < 2:
        return 0.0
    centred = p - p.mean(axis=0)
    s = np.linalg.svd(centred, compute_uv=False)
    if s[0] <= 0.0:
        return 0.0
    return float(s[-1] / s[0])


def is_stable(pixels: Sequence[Point]) -> bool:
    return len(pixels) >= 3 and stability_ratio(pixels) >= STABILITY_MIN


def fit_affine(pixels: Sequence[Point], targets: Sequence[Point]) -> Affine6:
    """Least-squares affine from pixels to targets. Needs 3 or more stable points.

    Both sides are centred before solving, so large UTM coordinates do not cost precision.
    """
    if len(pixels) != len(targets):
        raise ValueError("pixels and targets differ in length")
    if len(pixels) < 3:
        raise UnstableFit("an affine needs at least 3 points")
    if not is_stable(pixels):
        raise UnstableFit(
            f"points are too close to a line (s_min/s_max = {stability_ratio(pixels):.4f}, "
            f"needs at least {STABILITY_MIN})"
        )
    p = np.asarray(pixels, dtype=float)
    q = np.asarray(targets, dtype=float)
    p_mean = p.mean(axis=0)
    q_mean = q.mean(axis=0)
    coeffs, *_ = np.linalg.lstsq(p - p_mean, q - q_mean, rcond=None)  # 2x2: columns E, N
    a, d = coeffs[0]
    b, e = coeffs[1]
    c = q_mean[0] - a * p_mean[0] - b * p_mean[1]
    f = q_mean[1] - d * p_mean[0] - e * p_mean[1]
    return (float(a), float(b), float(c), float(d), float(e), float(f))


def apply_affine(t: Affine6, x: float, y: float) -> Point:
    a, b, c, d, e, f = t
    return (a * x + b * y + c, d * x + e * y + f)


def determinant(t: Affine6) -> float:
    a, b, _c, d, e, _f = t
    return a * e - b * d


def invert_affine(t: Affine6) -> Affine6:
    det = determinant(t)
    if abs(det) <= DET_MIN:
        raise NotInvertible(f"determinant {det!r} is too small")
    a, b, c, d, e, f = t
    ia, ib = e / det, -b / det
    id_, ie = -d / det, a / det
    ic = -(ia * c + ib * f)
    if_ = -(id_ * c + ie * f)
    return (ia, ib, ic, id_, ie, if_)
