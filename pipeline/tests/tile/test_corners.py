from __future__ import annotations

import math

import pytest

from buried_pipeline.align.affine import apply_affine
from buried_pipeline.tile.corners import (
    bilinear,
    bilinear_error_m,
    check_fractions,
    pixel_corners,
    tile_corners,
    tile_pixel_size_m,
    tile_size,
)

NORTH_UP = (0.05, 0.0, 632000.0, 0.0, -0.05, 4835000.0)
ROTATED = (0.055, 0.0175, 632276.0, 0.0176, -0.055, 4835121.5)


def mapping(t):
    return lambda x, y: apply_affine(t, x, y)


@pytest.mark.parametrize(
    ("size", "expected"),
    [
        ((5751, 6871), (3428, 4096)),
        ((6871, 5751), (4096, 3428)),
        ((4096, 4096), (4096, 4096)),
        ((4097, 100), (4096, 100)),
        ((3855, 3463), (3855, 3463)),
        ((1, 1), (1, 1)),
        ((100000, 3), (4096, 1)),
    ],
)
def test_tile_size(size, expected) -> None:
    assert tile_size(*size) == expected


def test_tile_size_refuses_an_empty_raster() -> None:
    with pytest.raises(ValueError):
        tile_size(0, 10)


def test_pixel_corners_are_in_gdal_corner_convention() -> None:
    assert pixel_corners(6, 4) == [(0.0, 0.0), (6.0, 0.0), (6.0, 4.0), (0.0, 4.0)]


def test_north_up_corners() -> None:
    c = tile_corners(mapping(NORTH_UP), 1000, 800)
    assert c[0] == pytest.approx((632000.0, 4835000.0))
    assert c[1] == pytest.approx((632050.0, 4835000.0))
    assert c[2] == pytest.approx((632050.0, 4834960.0))
    assert c[3] == pytest.approx((632000.0, 4834960.0))


def test_rotated_corners_follow_the_transform() -> None:
    t = ROTATED
    c = tile_corners(mapping(t), 3855, 3463)
    assert c[2] == pytest.approx(apply_affine(t, 3855, 3463))
    assert c[1][1] != c[0][1]  # the top edge is not level


def test_check_points_are_corners_midpoints_and_centre() -> None:
    f = check_fractions()
    assert len(f) == 9 and len(set(f)) == 9
    assert (0.5, 0.5) in f and (0.0, 0.5) in f and (1.0, 1.0) in f


def test_bilinear_at_the_corners_and_centre() -> None:
    c = tile_corners(mapping(ROTATED), 1000, 1000)
    assert bilinear(c, 0, 0) == pytest.approx(c[0])
    assert bilinear(c, 1, 0) == pytest.approx(c[1])
    assert bilinear(c, 1, 1) == pytest.approx(c[2])
    assert bilinear(c, 0, 1) == pytest.approx(c[3])
    assert bilinear(c, 0.5, 0.5) == pytest.approx(apply_affine(ROTATED, 500, 500))


def test_an_affine_has_no_bilinear_error() -> None:
    m = mapping(ROTATED)
    assert bilinear_error_m(m, tile_corners(m, 5000, 6000), 5000, 6000) < 1e-6


def test_a_curved_mapping_is_caught() -> None:
    # A squared term cannot be reproduced by bilinear interpolation of the corners.
    def curved(x: float, y: float) -> tuple[float, float]:
        return (x * 0.05 + 632000.0, 4835000.0 - y * 0.05 + 2e-6 * x * x)

    corners = tile_corners(curved, 4000, 4000)
    assert bilinear_error_m(curved, corners, 4000, 4000) > 0.01


def test_tile_pixel_size_uses_the_larger_shrink() -> None:
    assert tile_pixel_size_m(0.06, 5751, 6871, 3429, 4096) == pytest.approx(
        0.06 * 6871 / 4096
    )
    assert tile_pixel_size_m(0.06, 100, 100, 100, 100) == pytest.approx(0.06)
    assert math.isfinite(tile_pixel_size_m(0.06, 1, 1, 1, 1))
