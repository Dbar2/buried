"""Pairwise registration of two plates (spec 02 requirement 13.15, design "Pairwise registration").

Two plates are measured against the same City control references. For every reference both plates
cite, take where plate A puts it and where plate B puts it under their chosen transforms:

    A's position = q + r_A        B's position = q + r_B

where q is the City reference position and r the plate's out-of-sample residual (T(p) - q) at that
point. A transform `T_BA` that takes B's positions to A's positions is fitted to those pairs
(similarity for four or five references, affine for six or more; least squares, centred). Matching
compares A's footprints with `T_BA` applied to B's. The registration is a comparison tool only:
published geometry is never changed by it.

    pairwise_error_m = ceil_0.1(max(0.5, 2 x leave-one-out RMS of the registration))

The leave-one-out RMS is the RMS of the distance, at each shared reference, between where A puts
it and where the registration fitted to the other references predicts it from B. It is the same
shape of rule as the alignment error (twice an out-of-sample RMS, rounded up), with a floor of
0.5 m because the references are read by eye and a handful of points can fit well by luck.

For a plate whose chosen transform is the refined fit, `r` is the leave-one-out residual (the same
out-of-sample basis the alignment error uses); for a plate that kept the supplied georeferencing it
is the supplied residual, which is already out of sample.

Pure: no file, network or clock access. `plate_points` turns parsed documents into the inputs;
`match/run.py` does the reading. A degenerate set of points (coincident or, for the affine,
nearly collinear) falls back from affine to similarity; if the similarity is degenerate too there
is no registration and `register` returns None.
"""

from __future__ import annotations

import hashlib
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Final

import numpy as np

from buried_pipeline.align.affine import (
    DET_MIN,
    LocalAffine,
    NotInvertible,
    Point,
    UnstableFit,
    fit_local_affine,
)
from buried_pipeline.align.residuals import ceil_tenth, leave_one_out

MIN_SHARED: Final = 4
AFFINE_MIN_SHARED: Final = 6
PAIRWISE_FLOOR_M: Final = 0.5
PAIRWISE_MULTIPLIER: Final = 2.0
PAIRWISE_ROUND_UP_M: Final = 0.1

SIMILARITY: Final = "similarity"
AFFINE: Final = "affine"

# (reference source, reference feature id, polygon, vertex); the vertex is (-1, -1) for a point.
RefKey = tuple[str, str, int, int]


@dataclass(frozen=True)
class PlatePoint:
    """One control point of one plate: which reference it cites, that reference's position in
    EPSG:26917 (east, north) and the plate's residual there in metres (east, north) under its
    chosen transform, out of sample."""

    key: RefKey
    east_m: float
    north_m: float
    dx_m: float
    dy_m: float

    def position(self) -> Point:
        """Where the plate puts the reference: `q + r`."""
        return (self.east_m + self.dx_m, self.north_m + self.dy_m)


@dataclass(frozen=True)
class Registration:
    """`T_BA` (B positions to A positions) and its inverse `T_AB`, with what it was built from."""

    model: str  # SIMILARITY or AFFINE
    b_to_a: LocalAffine
    a_to_b: LocalAffine
    shared: tuple[RefKey, ...]
    positions_a: tuple[Point, ...]  # where A puts each shared reference
    positions_b: tuple[Point, ...]  # where B puts each shared reference
    loo_residuals_m: tuple[Point, ...]  # (east, north) of T_BA(B) - A, fitted without the point
    loo_rms_m: float
    error_m: float  # the published pairwise error


def pairwise_error_from_basis(basis_m: float) -> float:
    """`ceil_0.1(max(floor, 2 x basis))`."""
    return float(ceil_tenth(max(PAIRWISE_FLOOR_M, PAIRWISE_MULTIPLIER * basis_m)))


def invert_local(t: LocalAffine) -> LocalAffine:
    """The inverse of a locally held affine: swap the two origins and invert the linear part."""
    det = t.a * t.e - t.b * t.d
    if abs(det) <= DET_MIN:
        raise NotInvertible(f"determinant {det!r} is too small")
    return LocalAffine(t.e / det, -t.b / det, -t.d / det, t.a / det, t.q0, t.p0)


def fit_similarity(src: Sequence[Point], dst: Sequence[Point]) -> LocalAffine:
    """Least-squares similarity (rotation, uniform scale, translation) from `src` to `dst`, held
    relative to the two centroids. Needs two distinct points."""
    if len(src) != len(dst):
        raise ValueError("src and dst differ in length")
    if len(src) < 2:
        raise UnstableFit("a similarity needs at least 2 points")
    s = np.asarray(src, dtype=float)
    d = np.asarray(dst, dtype=float)
    s_mean, d_mean = s.mean(axis=0), d.mean(axis=0)
    sc, dc = s - s_mean, d - d_mean
    denom = math.fsum((sc * sc).ravel().tolist())
    if denom <= 1e-12:
        raise UnstableFit("the points coincide")
    alpha = math.fsum((sc * dc).ravel().tolist()) / denom
    beta = math.fsum((sc[:, 0] * dc[:, 1] - sc[:, 1] * dc[:, 0]).tolist()) / denom
    return LocalAffine(
        alpha,
        -beta,
        beta,
        alpha,
        (float(s_mean[0]), float(s_mean[1])),
        (float(d_mean[0]), float(d_mean[1])),
    )


def _fit(model: str, src: Sequence[Point], dst: Sequence[Point]) -> LocalAffine:
    return fit_local_affine(src, dst) if model == AFFINE else fit_similarity(src, dst)


def _register(
    model: str,
    shared: tuple[RefKey, ...],
    positions_a: list[Point],
    positions_b: list[Point],
) -> Registration:
    b_to_a = _fit(model, positions_b, positions_a)
    a_to_b = invert_local(b_to_a)
    loo: list[Point] = []
    for i in range(len(shared)):
        rest_b = [p for j, p in enumerate(positions_b) if j != i]
        rest_a = [p for j, p in enumerate(positions_a) if j != i]
        t = _fit(model, rest_b, rest_a)
        loo.append(t.residual_components(positions_b[i], positions_a[i]))
    rms = math.sqrt(math.fsum(dx * dx + dy * dy for dx, dy in loo) / len(loo))
    return Registration(
        model=model,
        b_to_a=b_to_a,
        a_to_b=a_to_b,
        shared=shared,
        positions_a=tuple(positions_a),
        positions_b=tuple(positions_b),
        loo_residuals_m=tuple(loo),
        loo_rms_m=rms,
        error_m=pairwise_error_from_basis(rms),
    )


def register(a: Sequence[PlatePoint], b: Sequence[PlatePoint]) -> Registration | None:
    """The registration `T_BA` of plate B onto plate A, or None when the plates share fewer than
    `MIN_SHARED` references or the shared points are too degenerate to fit.

    The model is a similarity for four or five shared references and an affine for six or more;
    an affine that is unstable (points nearly on a line, in the fit or in one of the leave-one-out
    fits) falls back to a similarity. Callers pass one point per reference key.
    """
    by_a = {p.key: p for p in a}
    by_b = {p.key: p for p in b}
    shared = tuple(sorted(by_a.keys() & by_b.keys()))
    if len(shared) < MIN_SHARED:
        return None
    positions_a = [by_a[k].position() for k in shared]
    positions_b = [by_b[k].position() for k in shared]
    models = [AFFINE, SIMILARITY] if len(shared) >= AFFINE_MIN_SHARED else [SIMILARITY]
    for model in models:
        try:
            return _register(model, shared, positions_a, positions_b)
        except (UnstableFit, NotInvertible):
            continue
    return None


def compose(outer: LocalAffine, inner: LocalAffine, at: Point) -> Point:
    """`outer(inner(at))`, for checking that a registration and its inverse cancel."""
    return outer.apply(*inner.apply(*at))


def ref_key(point: Mapping[str, Any]) -> RefKey:
    vertex = point.get("reference_vertex")
    return (
        str(point["reference_source"]),
        str(point["reference_feature_id"]),
        int(vertex["polygon"]) if vertex else -1,
        int(vertex["vertex"]) if vertex else -1,
    )


def control_sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def plate_points(record: Mapping[str, Any], control: Mapping[str, Any]) -> list[PlatePoint]:
    """A plate's reference positions and out-of-sample residuals at each of its control points.

    `record` is the plate's alignment record and `control` its control file (both parsed). The
    caller has checked that the record's `control_sha256` is the control file's hash, so the two
    describe the same points. Raises ValueError when they do not line up.
    """
    by_id = {p["id"]: p for p in control["points"]}
    if record["chosen"] == "refined":
        ids = sorted(by_id)
        pixels = [(float(by_id[i]["pixel"][0]), float(by_id[i]["pixel"][1])) for i in ids]
        refs = [(float(by_id[i]["reference"][0]), float(by_id[i]["reference"][1])) for i in ids]
        try:
            residuals = {r.id: (r.dx_m, r.dy_m) for r in leave_one_out(ids, pixels, refs)}
        except UnstableFit as exc:  # the record says refined, so this cannot happen on its points
            raise ValueError(f"leave-one-out fit failed: {exc}") from exc
    else:
        residuals = {r["id"]: (r["dx_m"], r["dy_m"]) for r in record["supplied"]["residuals"]}
    if set(residuals) != set(by_id):
        raise ValueError("the alignment record and the control file list different points")
    keys = [ref_key(by_id[i]) for i in sorted(by_id)]
    if len(set(keys)) != len(keys):
        raise ValueError("a reference is cited by two control points of one plate")
    return [
        PlatePoint(
            ref_key(by_id[i]),
            float(by_id[i]["reference"][0]),
            float(by_id[i]["reference"][1]),
            *residuals[i],
        )
        for i in sorted(by_id)
    ]
