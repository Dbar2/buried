"""A10: the control hull is the convex hull (spec 02 task 15.2, requirement 18.1).

The oracle shares no code with the implementation: positions are integer millimetres, so
collinearity is decided exactly with integer cross products, and containment and convexity are
checked edge by edge.
"""

from __future__ import annotations

import math

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from buried_pipeline.align.hull import control_hull, hull_area_m2, hull_matches
from buried_pipeline.errors import PipelineError

E0_MM = 632_000_000
N0_MM = 4_834_500_000

mm_points = st.lists(
    st.tuples(st.integers(0, 600_000), st.integers(0, 600_000)),
    min_size=3,
    max_size=12,
)

ROUNDING_SLACK_M = 0.002  # the hull is rounded to 0.001 m, so edges can move by 0.0007 m


def metres(p: tuple[int, int]) -> tuple[float, float]:
    return ((E0_MM + p[0]) / 1000.0, (N0_MM + p[1]) / 1000.0)


def all_collinear(points: list[tuple[int, int]]) -> bool:
    a = points[0]
    others = [p for p in points if p != a]
    if not others:
        return True
    b = others[0]
    return all((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) == 0 for p in points)


def shoelace(ring: list[list[float]]) -> float:
    """Signed area, taken relative to the first vertex so that coordinates near 4.8e6 do not
    cancel away the answer."""
    e_0, n_0 = ring[0]
    total = 0.0
    for (e1, n1), (e2, n2) in zip(ring, ring[1:], strict=False):
        total += (e1 - e_0) * (n2 - n_0) - (e2 - e_0) * (n1 - n_0)
    return total / 2.0


@settings(max_examples=200, deadline=None)
@given(points=mm_points)
def test_a10_the_control_hull_is_the_convex_hull(points) -> None:
    refs = [metres(p) for p in points]
    if all_collinear(points):
        with pytest.raises(PipelineError):
            control_hull(refs)
        return

    hull = control_hull(refs)
    ring = hull["coordinates"][0]
    assert ring[0] == ring[-1]
    vertices = ring[:-1]
    assert len(vertices) >= 3

    # Every vertex is one of the input positions (to the rounding of 0.001 m).
    for e, n in vertices:
        assert any(math.hypot(e - r[0], n - r[1]) <= 0.001 for r in refs)

    # Counter-clockwise and convex: no turn goes the wrong way beyond rounding.
    for i, (e1, n1) in enumerate(vertices):
        e0, n0 = vertices[i - 1]
        e2, n2 = vertices[(i + 1) % len(vertices)]
        cross = (e1 - e0) * (n2 - n1) - (n1 - n0) * (e2 - e1)
        reach = math.hypot(e1 - e0, n1 - n0) + math.hypot(e2 - e1, n2 - n1)
        assert cross >= -ROUNDING_SLACK_M * reach

    # Every input position is inside or on the hull: never to the right of a CCW edge.
    for r in refs:
        for (e1, n1), (e2, n2) in zip(ring, ring[1:], strict=False):
            length = math.hypot(e2 - e1, n2 - n1)
            side = ((e2 - e1) * (r[1] - n1) - (n2 - n1) * (r[0] - e1)) / length
            assert side >= -ROUNDING_SLACK_M

    # The stored area is the area of the stored ring, and the ring is counter-clockwise.
    assert shoelace(ring) > 0
    assert hull_area_m2(hull) == pytest.approx(shoelace(ring), abs=0.001)

    # Order does not matter, and the stored hull matches its own references.
    assert control_hull(list(reversed(refs))) == hull
    assert hull_matches(hull, refs)
