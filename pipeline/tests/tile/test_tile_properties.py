"""Property T1: tile corners are exact and independent of the downsample factor."""

from __future__ import annotations

import math

from hypothesis import given, settings
from hypothesis import strategies as st

from buried_pipeline.align.affine import apply_affine
from buried_pipeline.tile.corners import (
    bilinear,
    bilinear_error_m,
    pixel_corners,
    tile_corners,
    tile_size,
)
from tests.align.strategies import affines

sizes = st.tuples(st.integers(1, 30000), st.integers(1, 30000))
limits = st.sampled_from([64, 256, 1024, 2048, 4096])


@settings(max_examples=200)
@given(t=affines(), size=sizes, limit=limits)
def test_t1_corners_are_exact_and_independent_of_the_downsample_factor(t, size, limit) -> None:
    width, height = size
    mapping = lambda x, y: apply_affine(t, x, y)  # noqa: E731

    # 1. The corners are the transform of the full-resolution pixel corners, whatever the tile size.
    corners = tile_corners(mapping, width, height)
    assert corners == [apply_affine(t, x, y) for x, y in pixel_corners(width, height)]

    # 2. For an affine transform, bilinear interpolation of those corners reproduces it.
    assert bilinear_error_m(mapping, corners, width, height) < 1e-6

    # 3. A tile pixel edge (i, j) lands where the full-resolution pixel (i * sx, j * sy) does,
    #    whatever the factor.
    tile_w, tile_h = tile_size(width, height, limit)
    for i, j in ((0, 0), (tile_w, tile_h), (tile_w // 2, tile_h // 3), (tile_w, 0), (0, tile_h)):
        expected = mapping(i * width / tile_w, j * height / tile_h)
        got = bilinear(corners, i / tile_w, j / tile_h)
        assert math.dist(expected, got) < 1e-6


@given(size=sizes, limit=limits)
def test_t1_tile_size_never_enlarges_and_respects_the_limit(size, limit) -> None:
    width, height = size
    tile_w, tile_h = tile_size(width, height, limit)
    assert 1 <= tile_w <= width and 1 <= tile_h <= height
    if max(width, height) <= limit:
        assert (tile_w, tile_h) == (width, height)
    else:
        assert max(tile_w, tile_h) == limit
        # The aspect ratio survives to within one pixel of rounding.
        assert abs(tile_w - width * limit / max(width, height)) <= 1
        assert abs(tile_h - height * limit / max(width, height)) <= 1
