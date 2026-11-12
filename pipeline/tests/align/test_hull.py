"""Examples for the control hull (spec 02 task 15.1, requirement 18). The property A10 is in
test_align_properties.py."""

from __future__ import annotations

import pytest

from buried_pipeline.align.hull import control_hull, hull_area_m2, hull_matches
from buried_pipeline.errors import PipelineError

SQUARE = [(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)]


def shifted(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    return [(632000.0 + e, 4834500.0 + n) for e, n in points]


def test_a_square_is_its_own_hull_counter_clockwise_from_the_lowest_easting() -> None:
    hull = control_hull(shifted(SQUARE))
    assert hull["type"] == "Polygon"
    ring = hull["coordinates"][0]
    assert ring[0] == ring[-1]
    assert ring[:-1] == [[632000.0, 4834500.0], [632100.0, 4834500.0], [632100.0, 4834600.0],
                         [632000.0, 4834600.0]]
    assert hull_area_m2(hull) == 10000.0


def test_interior_points_do_not_change_the_hull() -> None:
    with_inside = shifted([*SQUARE, (50.0, 50.0), (10.0, 90.0)])
    assert control_hull(with_inside) == control_hull(shifted(SQUARE))


def test_input_order_does_not_change_the_bytes() -> None:
    pts = shifted([*SQUARE, (50.0, 50.0)])
    assert control_hull(list(reversed(pts))) == control_hull(pts)


def test_coordinates_are_rounded_to_three_decimals() -> None:
    hull = control_hull([(632000.12345, 4834500.98765), (632100.0, 4834500.0),
                         (632050.0, 4834600.0)])
    for e, n in hull["coordinates"][0]:
        assert e == round(e, 3)
        assert n == round(n, 3)


def test_collinear_points_have_no_hull() -> None:
    with pytest.raises(PipelineError, match="do not enclose an area"):
        control_hull(shifted([(0.0, 0.0), (10.0, 10.0), (20.0, 20.0)]))


def test_repeated_points_have_no_hull() -> None:
    with pytest.raises(PipelineError, match="do not enclose an area"):
        control_hull(shifted([(0.0, 0.0), (0.0, 0.0), (0.0, 0.0)]))


def test_hull_matches_ignores_ring_order_and_start() -> None:
    refs = shifted(SQUARE)
    hull = control_hull(refs)
    ring = hull["coordinates"][0][:-1]
    rotated = {"type": "Polygon", "coordinates": [[*ring[2:], *ring[:2], ring[2]]]}
    reversed_ring = {"type": "Polygon", "coordinates": [[*reversed(ring), ring[-1]]]}
    assert hull_matches(rotated, refs)
    assert hull_matches(reversed_ring, refs)


def test_hull_matches_tolerance_is_one_centimetre() -> None:
    refs = shifted(SQUARE)
    hull = control_hull(refs)
    near = {"type": "Polygon", "coordinates": [[list(p) for p in hull["coordinates"][0]]]}
    near["coordinates"][0][1][0] += 0.009
    far = {"type": "Polygon", "coordinates": [[list(p) for p in hull["coordinates"][0]]]}
    far["coordinates"][0][1][0] += 0.02
    assert hull_matches(near, refs)
    assert not hull_matches(far, refs)


def test_hull_matches_is_false_for_a_degenerate_reference_set() -> None:
    hull = control_hull(shifted(SQUARE))
    assert not hull_matches(hull, shifted([(0.0, 0.0), (1.0, 1.0), (2.0, 2.0)]))
