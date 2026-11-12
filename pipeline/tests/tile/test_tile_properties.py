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


@st.composite
def windows(draw: st.DrawFn):
    """A raster size and a pixel window (the bounding box of a map area) inside it."""
    width = draw(st.integers(2, 30000))
    height = draw(st.integers(2, 30000))
    x = draw(st.integers(0, width - 1))
    y = draw(st.integers(0, height - 1))
    w = draw(st.integers(1, width - x))
    h = draw(st.integers(1, height - y))
    return width, height, (x, y, w, h)


@settings(max_examples=200)
@given(t=affines(), win=windows(), limit=limits)
def test_t1_window_corners_are_exact_and_independent_of_the_downsample_factor(
    t, win, limit
) -> None:
    """T1 for a map-area tile (requirement 19.3): the corners are the transform of the window's
    full-resolution pixel corners, whatever the shrink factor and wherever the window sits."""
    _width, _height, (x, y, w, h) = win
    mapping = lambda px, py: apply_affine(t, px, py)  # noqa: E731

    corners = tile_corners(mapping, w, h, (float(x), float(y)))
    assert corners == [
        apply_affine(t, px, py) for px, py in ((x, y), (x + w, y), (x + w, y + h), (x, y + h))
    ]
    assert bilinear_error_m(mapping, corners, w, h, (float(x), float(y))) < 1e-6

    tile_w, tile_h = tile_size(w, h, limit)
    for i, j in ((0, 0), (tile_w, tile_h), (tile_w // 2, tile_h // 3), (tile_w, 0), (0, tile_h)):
        expected = mapping(x + i * w / tile_w, y + j * h / tile_h)
        got = bilinear(corners, i / tile_w, j / tile_h)
        assert math.dist(expected, got) < 1e-6
