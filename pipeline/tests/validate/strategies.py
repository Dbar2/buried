"""Hypothesis strategies for the Validator properties (P13 to P15, P19 to P21).

Every strategy builds a dataset that the Validator accepts, so a property can break exactly one
thing and expect an error.
"""

from __future__ import annotations

import math
from typing import Any

from hypothesis import strategies as st

from buried_pipeline.align.residuals import published_error
from tests.validate.builders import (
    E0,
    N0,
    P1911,
    P1935,
    alignment,
    evidence,
    feature,
    link_features,
    minimal_dataset,
    polygon,
)


def independent_ceil_tenth(x: float) -> float:
    """Smallest multiple of 0.1 not below x (to within 1e-9), found by search, not by formula."""
    k = max(0, int(x * 10) - 2)
    while k / 10 < x - 1e-9:
        k += 1
    return k / 10


def independent_alignment_error(basis: float) -> float:
    return independent_ceil_tenth(max(2.0, 2.0 * basis))


rect_sizes = st.tuples(st.integers(2, 40), st.integers(2, 40))


@st.composite
def building_features(draw: st.DrawFn, origin: str = P1911, seq: int = 1) -> dict[str, Any]:
    w, h = draw(rect_sizes)
    de = draw(st.integers(0, 600))
    dn = draw(st.integers(0, 600))
    f = feature(origin, seq)
    f["geometry"] = polygon(E0 + de, N0 + dn, float(w), float(h))
    f["properties"]["position_error_m"] = draw(st.sampled_from([4.5, 4.6, 5.0, 8.0, 20.0]))
    f["properties"]["attributes"] = draw(
        st.sampled_from([{"storeys": 1}, {"storeys": 3, "use": "synthetic"}, {"storeys": 2}])
    )
    return f


@st.composite
def minimal_datasets(draw: st.DrawFn) -> dict[str, Any]:
    n = draw(st.integers(1, 4))
    features = [draw(building_features(P1911, i + 1)) for i in range(n)]
    return minimal_dataset(features)


@st.composite
def linked_datasets(draw: st.DrawFn) -> tuple[dict[str, Any], int]:
    """Two plates with n features each, the i-th of each linked. Returns (dataset, n)."""
    n = draw(st.integers(1, 3))
    a = [draw(building_features(P1911, i + 1)) for i in range(n)]
    b = [draw(building_features(P1935, i + 1)) for i in range(n)]
    for x, y in zip(a, b, strict=True):
        link_features(x, y)
    ds = minimal_dataset(a)
    ds[f"data/alignment/{P1935}.json"] = alignment(P1935)
    ds[f"data/evidence/{P1935}.geojson"] = evidence(P1935, b)
    return ds, n


unregistered_sources = st.sampled_from(["fip_v3_1999_001", "fip_v9_2001_777", "aerial_1947_zzz"])


def lonlat_pairs():
    return st.tuples(st.floats(-180.0, 180.0), st.floats(-90.0, 90.0)).map(list)


# --- alignment error budget (P15) ----------------------------------------------------------------


@st.composite
def budgets(draw: st.DrawFn) -> dict[str, float]:
    basis = draw(st.floats(0.05, 8.0))
    a = published_error(basis)
    pixel = draw(st.floats(0.01, 0.2))
    digitising = draw(st.one_of(st.floats(0.01, 5.0), st.just(2 * pixel), st.just(1.0)))
    required = independent_ceil_tenth(math.hypot(a, digitising))
    position = draw(
        st.one_of(st.floats(0.1, 40.0), st.just(required), st.just(max(required - 0.1, 0.1)),
                  st.just(required + 0.1))
    )
    provenance_alignment = draw(st.sampled_from([a, a, a, a + 0.1, max(a - 0.1, 0.1)]))
    return {"basis": basis, "alignment": a, "pixel": pixel, "digitising": digitising,
            "position": position, "provenance_alignment": provenance_alignment}


# --- alignment records (P21) ---------------------------------------------------------------------


@st.composite
def alignment_variants(draw: st.DrawFn) -> dict[str, Any]:
    chosen = draw(st.sampled_from(["supplied", "refined"]))
    supplied_rmse = draw(st.floats(0.05, 6.0))
    loo = draw(st.floats(0.05, 6.0))
    in_sample = draw(st.floats(0.01, 3.0))
    basis = supplied_rmse if chosen == "supplied" else loo
    wrong_basis = draw(st.sampled_from([None, None, "other_rmse", "in_sample", "nudged"]))
    reported_basis = {
        None: basis,
        "other_rmse": loo if chosen == "supplied" else supplied_rmse,
        "in_sample": in_sample,
        "nudged": basis + 0.01,
    }[wrong_basis]
    right_error = independent_alignment_error(reported_basis)
    error_kind = draw(st.sampled_from(["exact", "exact", "exact", "plus_tenth", "minus_tenth",
                                       "unrounded", "no_floor", "single"]))
    if error_kind == "exact":
        reported_error = right_error
    elif error_kind == "plus_tenth":
        reported_error = right_error + 0.1
    elif error_kind == "minus_tenth":
        reported_error = right_error - 0.1
    elif error_kind == "unrounded":
        reported_error = max(2.0, 2.0 * reported_basis)
    elif error_kind == "no_floor":
        reported_error = independent_ceil_tenth(2.0 * reported_basis)
    else:
        reported_error = independent_ceil_tenth(reported_basis)
    return {
        "chosen": chosen, "supplied_rmse": supplied_rmse, "loo": loo, "in_sample": in_sample,
        "reported_basis": reported_basis, "reported_error": reported_error,
        "basis_ok": reported_basis == basis,
        "error_ok": reported_error == independent_alignment_error(reported_basis),
    }
