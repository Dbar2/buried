from __future__ import annotations

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from pyproj import Transformer

from buried_pipeline.align.affine import apply_affine
from buried_pipeline.controlcrops.pixels import (
    CROSSHAIR_MIN_ARM_PX,
    CROSSHAIR_MIN_GAP_PX,
    CropWindow,
    crop_size_px,
    crop_window,
    crosshair_sizes_px,
    draw_crosshair,
    pixel_in_crop,
    pixel_in_raster,
    predicted_pixel,
    to_rgb,
)

# Rotated about 16 degrees, like the real 1935 plates.
ROTATED = (0.11, 0.033, 632000.0, 0.034, -0.118, 4835000.0)


def identity(e: float, n: float) -> tuple[float, float]:
    return (e, n)


# --- predicted pixel -------------------------------------------------------------------------


@settings(max_examples=100, deadline=None)
@given(x=st.floats(-500, 6000), y=st.floats(-500, 6000))
def test_predicted_pixel_inverts_the_supplied_mapping(x: float, y: float) -> None:
    east, north = apply_affine(ROTATED, x, y)
    px = predicted_pixel((east, north), identity, ROTATED)
    assert px == pytest.approx((x, y), abs=1e-6)


@settings(max_examples=60, deadline=None)
@given(x=st.floats(0, 5000), y=st.floats(0, 5000))
def test_predicted_pixel_in_another_crs(x: float, y: float) -> None:
    # A raster whose transform is in EPSG:3857: pixel -> 3857 -> 26917 -> predicted pixel.
    to_3857 = Transformer.from_crs("EPSG:26917", "EPSG:3857", always_xy=True)
    to_26917 = Transformer.from_crs("EPSG:3857", "EPSG:26917", always_xy=True)
    e0, n0 = to_3857.transform(632000.0, 4835000.0)
    t = (0.15, 0.02, e0, 0.02, -0.15, n0)
    mx, my = apply_affine(t, x, y)
    east, north = to_26917.transform(mx, my)
    px = predicted_pixel((east, north), lambda e, n: to_3857.transform(e, n), t)
    assert px == pytest.approx((x, y), abs=1e-4)


def test_pixel_in_raster_edges() -> None:
    assert pixel_in_raster((0.0, 0.0), 10, 5)
    assert pixel_in_raster((9.999, 4.999), 10, 5)
    assert not pixel_in_raster((10.0, 2.0), 10, 5)
    assert not pixel_in_raster((2.0, 5.0), 10, 5)
    assert not pixel_in_raster((-0.001, 2.0), 10, 5)


# --- crop size and window --------------------------------------------------------------------


def test_crop_size_is_60_m_at_native_resolution() -> None:
    assert crop_size_px(60.0, 0.1, 0.1, 5000, 5000) == (600, 600)
    assert crop_size_px(60.0, 0.0581, 0.0592, 6000, 7000) == (1033, 1014)


def test_crop_size_never_exceeds_the_raster_and_needs_positive_inputs() -> None:
    assert crop_size_px(60.0, 0.1, 0.1, 400, 300) == (400, 300)
    with pytest.raises(ValueError):
        crop_size_px(60.0, 0.0, 0.1, 100, 100)
    with pytest.raises(ValueError):
        crop_size_px(-1.0, 0.1, 0.1, 100, 100)


def test_crop_window_centred_and_clamped() -> None:
    assert crop_window((500.0, 400.0), (600, 600), 1000, 800) == CropWindow(
        200, 100, 600, 600, False
    )
    # Near the top-left corner: moved to 0, 0.
    assert crop_window((30.0, 50.0), (600, 600), 1000, 800) == CropWindow(0, 0, 600, 600, True)
    # Near the bottom-right corner: moved to the last position that fits.
    assert crop_window((990.0, 790.0), (600, 600), 1000, 800) == CropWindow(
        400, 200, 600, 600, True
    )


def test_crop_window_that_does_not_fit_is_an_error() -> None:
    with pytest.raises(ValueError):
        crop_window((5.0, 5.0), (101, 50), 100, 100)


@settings(max_examples=200, deadline=None)
@given(
    width=st.integers(1, 3000),
    height=st.integers(1, 3000),
    cw=st.integers(1, 3000),
    ch=st.integers(1, 3000),
    fx=st.floats(0.0, 0.999999),
    fy=st.floats(0.0, 0.999999),
)
def test_crop_window_always_lies_inside_the_raster_and_holds_the_pixel(
    width: int, height: int, cw: int, ch: int, fx: float, fy: float
) -> None:
    cw, ch = min(cw, width), min(ch, height)
    pixel = (fx * width, fy * height)
    w = crop_window(pixel, (cw, ch), width, height)
    assert (w.width, w.height) == (cw, ch)
    assert 0 <= w.left and w.left + w.width <= width
    assert 0 <= w.top and w.top + w.height <= height
    cx, cy = pixel_in_crop(pixel, w)
    assert 0.0 <= cx < cw and 0.0 <= cy < ch
    if not w.shifted:
        # Centred to within half a pixel.
        assert abs(cx - cw / 2.0) <= 0.5 + 1e-9 and abs(cy - ch / 2.0) <= 0.5 + 1e-9


# --- crosshair -------------------------------------------------------------------------------


def test_crosshair_sizes_have_a_floor_on_coarse_plates() -> None:
    assert crosshair_sizes_px(0.0581, 0.0592) == (7, 51)
    gap, arm = crosshair_sizes_px(0.5, 0.5)
    assert gap == CROSSHAIR_MIN_GAP_PX and arm == CROSSHAIR_MIN_ARM_PX


def test_crosshair_changes_only_the_four_arms_and_leaves_the_gap_alone() -> None:
    rgb = np.full((101, 101, 3), 128, dtype=np.uint8)
    before = rgb.copy()
    out = draw_crosshair(rgb, (50.4, 50.9), gap_px=5, arm_px=20, alpha=0.5, colour=(230, 30, 30))
    assert np.array_equal(rgb, before)  # the input is not modified
    changed = np.argwhere((out != rgb).any(axis=2))
    assert len(changed) == 4 * 20
    for y, x in changed:
        assert (y == 50 and 5 <= abs(x - 50) < 25) or (x == 50 and 5 <= abs(y - 50) < 25)
    assert tuple(out[50, 50 + 5]) == (179, 79, 79)  # 128 * 0.5 + (230, 30, 30) * 0.5
    assert tuple(out[50, 50]) == (128, 128, 128)  # the centre pixel is not drawn on
    assert tuple(out[50, 50 + 4]) == (128, 128, 128)  # inside the gap
    assert tuple(out[50 + 24, 50]) == (179, 79, 79)  # last pixel of the lower arm
    assert tuple(out[50 + 25, 50]) == (128, 128, 128)  # just past it


def test_crosshair_at_the_image_edge_skips_pixels_outside() -> None:
    rgb = np.full((20, 20, 3), 100, dtype=np.uint8)
    out = draw_crosshair(rgb, (1.0, 1.0), gap_px=3, arm_px=30)
    assert out.shape == rgb.shape
    changed = np.argwhere((out != rgb).any(axis=2))
    assert all(0 <= y < 20 and 0 <= x < 20 for y, x in changed)
    assert len(changed) == 2 * 16  # right arm and lower arm only, cut by the image


def test_crosshair_rejects_bad_alpha() -> None:
    rgb = np.zeros((5, 5, 3), dtype=np.uint8)
    with pytest.raises(ValueError):
        draw_crosshair(rgb, (2.0, 2.0), 1, 1, alpha=0.0)
    with pytest.raises(ValueError):
        draw_crosshair(rgb, (2.0, 2.0), 1, 1, alpha=1.5)


@settings(max_examples=100, deadline=None)
@given(
    cx=st.floats(-10, 70),
    cy=st.floats(-10, 70),
    gap=st.integers(1, 10),
    arm=st.integers(1, 30),
)
def test_crosshair_never_touches_pixels_off_its_arms(
    cx: float, cy: float, gap: int, arm: int
) -> None:
    rgb = np.random.default_rng(1).integers(0, 256, size=(60, 60, 3), dtype=np.uint8)
    out = draw_crosshair(rgb, (cx, cy), gap, arm)
    import math

    ix, iy = math.floor(cx), math.floor(cy)
    for y, x in np.argwhere((out != rgb).any(axis=2)):
        on_row = y == iy and gap <= abs(x - ix) < gap + arm
        on_col = x == ix and gap <= abs(y - iy) < gap + arm
        assert on_row or on_col


# --- to_rgb ----------------------------------------------------------------------------------


def test_to_rgb_repeats_one_band_and_takes_three() -> None:
    gray = np.arange(6, dtype=np.uint8).reshape(1, 2, 3)
    out = to_rgb(gray)
    assert out.shape == (2, 3, 3)
    assert all(np.array_equal(out[:, :, c], gray[0]) for c in range(3))
    four = np.arange(24, dtype=np.uint8).reshape(4, 2, 3)
    out4 = to_rgb(four)
    assert out4.shape == (2, 3, 3)
    assert np.array_equal(out4[:, :, 2], four[2])


def test_to_rgb_refuses_what_it_cannot_show_unchanged() -> None:
    with pytest.raises(ValueError, match="8-bit"):
        to_rgb(np.zeros((1, 2, 2), dtype=np.uint16))
    with pytest.raises(ValueError, match="2 bands"):
        to_rgb(np.zeros((2, 2, 2), dtype=np.uint8))
