from __future__ import annotations

import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from buried_pipeline.inspect.report import (
    build_report,
    corner_disagreement_m,
    corners,
    densified_bounds,
    pixel_size_m,
    project_bounds,
    propose_origin,
    union_bounds,
)


def ident(x: float, y: float) -> tuple[float, float]:
    return (x, y)


T = (0.1, 0.0, 1000.0, 0.0, -0.1, 5000.0)


def test_corners_order_and_values() -> None:
    assert corners(T, 200, 100, ident) == [
        (1000.0, 5000.0),
        (1020.0, 5000.0),
        (1020.0, 4990.0),
        (1000.0, 4990.0),
    ]


def test_pixel_size_comes_from_unit_steps_not_units() -> None:
    # A conversion that scales by 2 (as if the raster were in different units).
    px, py = pixel_size_m(T, 200, 100, lambda x, y: (2 * x, 2 * y))
    assert px == pytest.approx(0.2)
    assert py == pytest.approx(0.2)


def test_rotated_pixel_size_and_bounds() -> None:
    angle = math.radians(30)
    t = (0.1 * math.cos(angle), -0.1 * math.sin(angle), 0.0, 0.1 * math.sin(angle),
         -0.1 * math.cos(angle), 0.0)  # fmt: skip
    px, py = pixel_size_m(t, 100, 100, ident)
    assert px == pytest.approx(0.1)
    assert py == pytest.approx(0.1)
    report = build_report(t, 100, 100, ident)
    assert report.rotation_b == t[1] and report.rotation_d == t[3]
    assert report.bounds[0] <= min(c[0] for c in report.corners)
    assert report.bounds[2] >= max(c[0] for c in report.corners)


def test_densified_bounds_cover_curved_edges() -> None:
    # A bowed mapping: bounds must include the bulge on the top edge, not just the corners.
    def bowed(x: float, y: float) -> tuple[float, float]:
        return (x, y + (1000.0 - (x - 1010.0) ** 2) * 0.01)

    plain = corners(T, 200, 100, bowed)
    dense = densified_bounds(T, 200, 100, bowed)
    assert dense[3] > max(c[1] for c in plain)


def test_union_and_origin_and_bounds() -> None:
    boxes = [(1000.0, 2000.0, 1500.0, 2500.0), (1400.0, 2300.0, 2000.0, 3100.0)]
    assert union_bounds(boxes) == (1000.0, 2000.0, 2000.0, 3100.0)
    # centre (1500, 2550) rounded down to multiples of 100
    assert propose_origin(boxes) == (1500.0, 2500.0)
    # union +250: (750, 1750, 2250, 3350) rounded outward: (700, 1700, 2300, 3400)
    assert project_bounds(boxes) == (700.0, 1700.0, 2300.0, 3400.0)


def test_origin_rounds_down_not_nearest() -> None:
    assert propose_origin([(0.0, 0.0, 199.0, 199.0)]) == (0.0, 0.0)
    assert propose_origin([(0.0, 0.0, 201.0, 201.0)]) == (100.0, 100.0)


@given(
    st.lists(
        st.tuples(
            st.floats(300_000, 700_000),
            st.floats(4_000_000, 5_000_000),
            st.floats(1, 5000),
            st.floats(1, 5000),
        ),
        min_size=1,
        max_size=4,
    )
)
def test_project_bounds_contain_margin_and_are_multiples_of_100(raw) -> None:
    boxes = [(e, n, e + w, n + h) for e, n, w, h in raw]
    u = union_bounds(boxes)
    b = project_bounds(boxes)
    assert b[0] <= u[0] - 250 and b[1] <= u[1] - 250
    assert b[2] >= u[2] + 250 and b[3] >= u[3] + 250
    assert b[0] > u[0] - 350 and b[3] < u[3] + 350
    assert all(v % 100 == 0 for v in b)


def test_corner_disagreement() -> None:
    shifted = (T[0], T[1], T[2] + 3.0, T[3], T[4], T[5] + 4.0)
    assert corner_disagreement_m(T, shifted, 200, 100, ident) == pytest.approx(5.0)
