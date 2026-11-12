"""Hypothesis strategies for alignment properties.

Affines have pixel scale 0.02 to 0.2 m/px, rotation up to 10 degrees, small shear, and translation
inside UTM 17N near Toronto. Control points lie inside a 20000 x 20000 px raster.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from hypothesis import strategies as st

from buried_pipeline.align.affine import Affine6, is_stable
from buried_pipeline.align.compute import ControlPoint

RASTER_PX = 20000.0


@st.composite
def affines(draw: st.DrawFn) -> Affine6:
    sx = draw(st.floats(0.02, 0.2))
    sy = draw(st.floats(0.02, 0.2))
    theta = math.radians(draw(st.floats(-10.0, 10.0)))
    shear = draw(st.floats(-0.02, 0.02))
    east = draw(st.floats(600_000.0, 660_000.0))
    north = draw(st.floats(4_800_000.0, 4_850_000.0))
    a = sx * math.cos(theta)
    d = sx * math.sin(theta)
    b = -sy * math.sin(theta) + shear * sy
    e = -sy * math.cos(theta)
    return (a, b, east, d, e, north)


pixels = st.tuples(st.floats(0.0, RASTER_PX), st.floats(0.0, RASTER_PX))

EPS = 2.220446049250313e-16  # double-precision machine epsilon


def coordinate_tolerance(values: Sequence[float]) -> float:
    """Metres below which two quantities built from these coordinates cannot be told apart.

    A double near 4.8e6 resolves to about 1e-9; the tolerance is 4 units in the last place of the
    largest coordinate involved, so it grows with coordinate magnitude instead of being fixed.
    """
    return 4.0 * EPS * max(abs(v) for v in values)


unit_vectors = st.tuples(st.floats(-1.0, 1.0), st.floats(-1.0, 1.0)).filter(
    lambda v: math.hypot(*v) <= 1.0
)


def _min_gap(pts: list[tuple[float, float]]) -> float:
    return min(math.dist(p, q) for i, p in enumerate(pts) for q in pts[i + 1 :])


def stable_pixel_sets(min_size: int = 4, max_size: int = 10):
    """Distinct pixel positions that pass the stability rule (s_min/s_max >= 0.05)."""
    return (
        st.lists(pixels, min_size=min_size, max_size=max_size, unique=True)
        .filter(is_stable)
        .filter(lambda pts: _min_gap(pts) > 1.0)
    )


def noise_vectors(n: int, delta: float):
    """n east/north noise vectors, each of length at most delta."""
    unit = st.tuples(st.floats(-1.0, 1.0), st.floats(-1.0, 1.0)).filter(
        lambda v: math.hypot(*v) <= 1.0
    )
    return st.lists(unit, min_size=n, max_size=n).map(
        lambda vs: [(delta * x, delta * y) for x, y in vs]
    )


@st.composite
def control_scenarios(draw: st.DrawFn, min_noise_m: float = 0.02):
    """(supplied affine, true affine, control points). Every reference carries noise of at least
    min_noise_m in each component, so no error basis is exactly zero."""
    true = draw(affines())
    pts = draw(stable_pixel_sets())
    delta = draw(st.floats(min_noise_m, 3.0))
    magnitude = st.floats(min_noise_m, max(min_noise_m, delta))
    sign = st.sampled_from([-1.0, 1.0])
    noise = [(draw(sign) * draw(magnitude), draw(sign) * draw(magnitude)) for _ in pts]
    refs = [
        (true[0] * x + true[1] * y + true[2] + nx, true[3] * x + true[4] * y + true[5] + ny)
        for (x, y), (nx, ny) in zip(pts, noise, strict=True)
    ]
    # The supplied mapping is the truth with a translation bias and a tiny scale error, so its
    # residuals are metres (sometimes beating the refined fit, sometimes not).
    bias_e = draw(st.floats(-10.0, 10.0))
    bias_n = draw(st.floats(-10.0, 10.0))
    scale_a = 1.0 + draw(st.floats(-1e-4, 1e-4))
    scale_e = 1.0 + draw(st.floats(-1e-4, 1e-4))
    supplied = (
        true[0] * scale_a, true[1], true[2] + bias_e,
        true[3], true[4] * scale_e, true[5] + bias_n,
    )  # fmt: skip
    points = [
        ControlPoint(f"p{i:02d}", px, ref)
        for i, (px, ref) in enumerate(zip(pts, refs, strict=True))
    ]
    return supplied, true, points


# --- A9: control point references ---------------------------------------------------------------

# The raster used by run-level tests: 0.2 m pixels, 1000 x 750 px, north-up.
RUN_TRANSFORM: Affine6 = (0.2, 0.0, 630000.0, 0.0, -0.2, 4834000.0)
RUN_WIDTH, RUN_HEIGHT = 1000, 750


@dataclass(frozen=True)
class ReferenceScenario:
    layers: dict[str, dict[str, Any]]
    control: dict[str, Any]
    expect_ok: bool
    bad_point: str | None
    mode: str


def _feature(fid: str, geometry: dict[str, Any]) -> dict[str, Any]:
    return {"type": "Feature", "id": fid, "geometry": geometry, "properties": {}}


def _to_pixel(e: float, n: float, dpx: tuple[float, float]) -> list[float]:
    return [
        (e - RUN_TRANSFORM[2]) / RUN_TRANSFORM[0] + dpx[0],
        (RUN_TRANSFORM[5] - n) / -RUN_TRANSFORM[4] + dpx[1],
    ]


@st.composite
def reference_scenarios(draw: st.DrawFn) -> ReferenceScenario:
    mm = lambda v: round(v, 3)  # noqa: E731 - coordinates are stored to millimetres
    n_int = draw(st.integers(3, 6))
    inters = [
        (
            f"i{k}",
            mm(draw(st.floats(630010.0, 630190.0))),
            mm(draw(st.floats(4833850.0, 4833990.0))),
        )
        for k in range(n_int)
    ]
    bx = mm(draw(st.floats(630020.0, 630150.0)))
    by = mm(draw(st.floats(4833860.0, 4833950.0)))
    bw = mm(draw(st.floats(1.0, 30.0)))
    bh = mm(draw(st.floats(1.0, 30.0)))
    ring = [[bx, by], [bx + bw, by], [bx + bw, by + bh], [bx, by + bh], [bx, by]]
    vertex = draw(st.integers(0, 3))

    layers = {
        "present_toronto_intersections_2026": {
            "features": [_feature(i, {"type": "Point", "coordinates": [e, n]}) for i, e, n in inters]
        },
        "present_toronto_building_outlines_2026": {
            "features": [_feature("b0", {"type": "Polygon", "coordinates": [ring]})]
        },
    }

    # Pixel picks are whole-pixel offsets of at least 2 px, so the supplied RMSE is never 0.
    def pick() -> tuple[float, float]:
        return (draw(st.sampled_from([-3.0, -2.0, 2.0, 3.0])),
                draw(st.sampled_from([-3.0, -2.0, 2.0, 3.0])))  # fmt: skip

    points: list[dict[str, Any]] = []
    for i, e, n in inters:
        points.append({
            "id": f"c_{i}", "description": "synthetic intersection", "pixel": _to_pixel(e, n, pick()),
            "reference": [e, n], "reference_source": "present_toronto_intersections_2026",
            "reference_kind": "intersection", "reference_feature_id": i,
        })  # fmt: skip
    ve, vn = ring[vertex]
    points.append({
        "id": "c_b0", "description": "synthetic building corner", "pixel": _to_pixel(ve, vn, pick()),
        "reference": [ve, vn], "reference_source": "present_toronto_building_outlines_2026",
        "reference_kind": "building_corner", "reference_feature_id": "b0",
        "reference_vertex": {"polygon": 0, "vertex": vertex},
    })  # fmt: skip

    mode = draw(st.sampled_from(["exact", "tiny_off", "far_off", "missing_feature", "wrong_vertex"]))
    target = draw(st.sampled_from([p["id"] for p in points]))
    point = next(p for p in points if p["id"] == target)
    angle = draw(st.floats(0.0, 2 * math.pi))
    bad: str | None = None
    if mode == "tiny_off":
        r = draw(st.floats(0.0, 0.0009))
        point["reference"] = [point["reference"][0] + r * math.cos(angle),
                              point["reference"][1] + r * math.sin(angle)]  # fmt: skip
    elif mode == "far_off":
        r = draw(st.floats(0.0011, 5.0))
        point["reference"] = [point["reference"][0] + r * math.cos(angle),
                              point["reference"][1] + r * math.sin(angle)]  # fmt: skip
        bad = target
    elif mode == "missing_feature":
        point["reference_feature_id"] = "does_not_exist"
        bad = target
    elif mode == "wrong_vertex":
        point = next(p for p in points if p["id"] == "c_b0")
        point["reference_vertex"] = {"polygon": 0, "vertex": (vertex + 1) % 4}
        bad = "c_b0"
    control = {
        "schema_version": "1.0.0",
        "source": "fip_v3_1911_229",
        "pixel_convention": "gdal_corner",
        "points": points,
    }
    return ReferenceScenario(layers, control, bad is None, bad, mode)
