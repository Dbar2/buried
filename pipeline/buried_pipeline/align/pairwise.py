"""The pairwise alignment error of two plates (spec 02 requirement 13.15, design "Pairwise error").

Two plates are measured against the same City control references, so what matters when one plate's
footprint is compared with another's is how far apart the two plates put the same ground point,
not how far each is from the City layer. For every control reference both plates cite, take where
plate A puts it and where plate B puts it under their chosen transforms. The difference is
`T_A(p_A) - T_B(p_B) = r_A - r_B`, where `r` is the plate's residual at that reference, so the
reference's own error cancels.

    B_pair = sqrt(mean(|r_A - r_B|^2))              over the shared references
    pairwise_error_m = ceil_0.1(max(PAIRWISE_FLOOR_M, 2 x B_pair))

The same shape of rule as the alignment error (conservative: twice the RMS, rounded up). For a
plate whose chosen transform is the refined fit, `r` is the leave-one-out residual, the same
out-of-sample basis the alignment error uses; for a plate that kept the supplied georeferencing it
is the supplied residual, which is already out of sample.

The floor is 1.0 m, half the 2.0 m floor of the alignment error. The reference error cancels in
the difference, which is why the floor may be lower; it cannot be zero because the control points
were read by eye, the transforms are measured at four to a few more points inside a hull and
extrapolated outside it, and the RMS of so few points can be small by luck. The figure is only
defined with at least `MIN_SHARED` shared references, and `None` otherwise.

Pure: no file, network or clock access. `plate_points` and `shared_keys` turn parsed documents into
the inputs; `match/run.py` does the reading.
"""

from __future__ import annotations

import hashlib
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Final

from buried_pipeline.align.affine import UnstableFit
from buried_pipeline.align.residuals import ceil_tenth, leave_one_out

MIN_SHARED: Final = 4
PAIRWISE_FLOOR_M: Final = 1.0
PAIRWISE_MULTIPLIER: Final = 2.0
PAIRWISE_ROUND_UP_M: Final = 0.1

# (reference source, reference feature id, polygon, vertex); the vertex is (-1, -1) for a point.
RefKey = tuple[str, str, int, int]


@dataclass(frozen=True)
class PlatePoint:
    """One control point of one plate: which reference it cites and its residual in metres
    (east, north) under the plate's chosen transform, out of sample."""

    key: RefKey
    dx_m: float
    dy_m: float


@dataclass(frozen=True)
class PairwiseResult:
    shared: tuple[RefKey, ...]
    differences_m: tuple[tuple[float, float], ...]  # r_A - r_B, in the order of `shared`
    basis_m: float  # B_pair, the RMS of the differences
    error_m: float  # the published pairwise error


def pairwise_error_from_basis(basis_m: float) -> float:
    """`ceil_0.1(max(floor, 2 x B_pair))`."""
    return float(ceil_tenth(max(PAIRWISE_FLOOR_M, PAIRWISE_MULTIPLIER * basis_m)))


def pairwise_error(a: Sequence[PlatePoint], b: Sequence[PlatePoint]) -> PairwiseResult | None:
    """The pairwise error of two plates, or None when they share fewer than `MIN_SHARED`
    references. Symmetric: swapping the plates negates each difference and changes nothing else.
    Callers pass one point per reference key (`plate_points` refuses a plate that cites a
    reference twice)."""
    by_key_a = {p.key: p for p in a}
    by_key_b = {p.key: p for p in b}
    shared = tuple(sorted(by_key_a.keys() & by_key_b.keys()))
    if len(shared) < MIN_SHARED:
        return None
    diffs = tuple(
        (by_key_a[k].dx_m - by_key_b[k].dx_m, by_key_a[k].dy_m - by_key_b[k].dy_m) for k in shared
    )
    basis = math.sqrt(math.fsum(dx * dx + dy * dy for dx, dy in diffs) / len(diffs))
    return PairwiseResult(shared, diffs, basis, pairwise_error_from_basis(basis))


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
    """A plate's out-of-sample residual at each of its control points.

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
    return [PlatePoint(ref_key(by_id[i]), *residuals[i]) for i in sorted(by_id)]
