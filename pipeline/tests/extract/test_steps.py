"""The pure extraction steps on small synthetic greyscale images (spec 02 task 7.3, requirement 17)."""

from __future__ import annotations

import cv2
import numpy as np
import pytest

from buried_pipeline.extract.outline import (
    components_smaller_than,
    mark_components,
    outline_mask,
    outline_width_px,
)
from buried_pipeline.extract.polygons import (
    georeference,
    outer_boundary,
    simplify,
    trace_outer_contour,
    valid_pixel_ring,
)
from buried_pipeline.extract.propose import find_candidates
from buried_pipeline.extract.regions import build_regions
from buried_pipeline.extract.score import WEAKNESS_CUT, make_quality, weaknesses
from buried_pipeline.extract.tone import (
    ToneStats,
    classify_tone,
    fill_uniformity,
    gradients,
    hatch_measure,
    normalise,
    to_grey,
    tone_stats,
    working_size,
)
from tests.helpers.synthetic_plate import (
    PIXEL_SIZE_M,
    Rect,
    draw_plate,
    hatch_image,
    synthetic_params,
)

PARAMS = synthetic_params()


def whole(img: np.ndarray, margin: int = 5) -> list[tuple[int, int]]:
    h, w = img.shape
    return [(margin, margin), (w - margin, margin), (w - margin, h - margin), (margin, h - margin)]


# --- tone ---------------------------------------------------------------------------------------


def test_one_band_is_unchanged_and_three_bands_are_averaged() -> None:
    one = np.array([[10, 200]], dtype=np.uint8)
    assert to_grey(one) is one
    three = np.zeros((1, 2, 3), dtype=np.uint8)
    three[0, 0] = (0, 30, 60)
    three[0, 1] = (255, 255, 254)
    assert to_grey(three).tolist() == [[30, 255]]


def test_working_size_scales_by_pixel_size() -> None:
    assert working_size(1000, 500, 0.06, 0.12) == (500, 250)
    assert working_size(1000, 500, 0.12, 0.12) == (1000, 500)
    assert working_size(1, 1, 0.01, 0.12) == (1, 1)


def test_normalised_values_are_between_zero_and_one() -> None:
    img = draw_plate(200, 150, [Rect(30, 30, 120, 100, 150)])
    inside = np.ones(img.shape, dtype=bool)
    norm = normalise(img, inside, PARAMS)
    assert norm.dtype == np.float32
    assert float(norm.min()) >= 0.0 and float(norm.max()) <= 1.0


def test_the_margin_never_affects_the_normalised_map_area() -> None:
    a = draw_plate(200, 150, [Rect(60, 40, 140, 100, 150)])
    b = a.copy()
    inside = np.zeros(a.shape, dtype=bool)
    inside[20:130, 20:180] = True
    a[~inside] = 0  # black margin
    b[~inside] = 255  # white margin
    na = normalise(a, inside, PARAMS)
    nb = normalise(b, inside, PARAMS)
    assert np.array_equal(na[inside], nb[inside])


def test_hatch_measure_sees_diagonal_stripes_but_not_flat_fill_or_other_angles() -> None:
    def measure(img: np.ndarray) -> float:
        norm = img.astype(np.float32) / 255.0
        gx, gy = gradients(norm)
        return hatch_measure(gx, gy, PARAMS.tone.hatch_min_density)

    assert measure(hatch_image(120, 45.0)) >= PARAMS.tone.hatch_min
    assert measure(hatch_image(120, 135.0)) >= PARAMS.tone.hatch_min
    assert measure(hatch_image(120, 0.0)) < PARAMS.tone.hatch_min
    assert measure(np.full((120, 120), 200, dtype=np.uint8)) == 0.0
    noise = np.random.default_rng(1).integers(190, 210, (120, 120)).astype(np.uint8)
    assert measure(noise) < PARAMS.tone.hatch_min


def test_one_slash_in_a_large_fill_is_not_hatching() -> None:
    img = np.full((200, 200), 200, dtype=np.uint8)
    cv2.line(img, (0, 199), (199, 0), 15, thickness=1)
    gx, gy = gradients(img.astype(np.float32) / 255.0)
    assert hatch_measure(gx, gy, PARAMS.tone.hatch_min_density) == 0.0


@pytest.mark.parametrize(
    ("median", "spread", "hatch", "expected"),
    [
        (0.9, 0.02, 0.0, "light"),
        (0.5, 0.02, 0.0, "mid"),
        (0.2, 0.02, 0.0, "dark"),
        (0.9, 0.02, 0.8, "hatched"),
        (0.5, 0.4, 0.0, "mixed"),
        (0.9, 0.4, 0.8, "hatched"),  # hatched wins over mixed
    ],
)
def test_tone_class(median: float, spread: float, hatch: float, expected: str) -> None:
    assert classify_tone(ToneStats(median, spread, hatch), PARAMS.tone) == expected


def test_tone_stats_of_a_flat_fill() -> None:
    values = np.full(100, 0.6, dtype=np.float32)
    zeros = np.zeros(100, dtype=np.float32)
    stats = tone_stats(values, zeros, zeros, PARAMS.tone.hatch_min_density)
    assert stats.median == pytest.approx(0.6)
    assert stats.spread == 0.0
    assert stats.hatch == 0.0
    assert fill_uniformity(stats, PARAMS.tone) == 1.0
    assert tone_stats(values[:0], zeros[:0], zeros[:0], 0.1) == ToneStats(0.0, 0.0, 0.0)


def test_fill_uniformity_is_low_for_hatching_and_mixed_tones() -> None:
    assert fill_uniformity(ToneStats(0.5, 0.0, 0.8), PARAMS.tone) == pytest.approx(0.2)
    assert fill_uniformity(ToneStats(0.5, PARAMS.tone.mixed_spread, 0.0), PARAMS.tone) == 0.0


# --- outline ------------------------------------------------------------------------------------


def test_outline_mask_finds_dark_lines_only_inside_the_map_area_and_closes_small_gaps() -> None:
    norm = np.ones((60, 100), dtype=np.float32)
    norm[29:32, 10:50] = 0.0  # a 3 px wide line
    norm[29:32, 50:52] = 1.0  # a 2 px gap, as in a printed line
    norm[29:32, 52:90] = 0.0
    inside = np.ones(norm.shape, dtype=bool)
    inside[:, 80:] = False
    mask = outline_mask(norm, inside, PARAMS)
    assert mask[30, 20] and mask[30, 51]  # gap bridged by the closing
    assert not mask[30, 85]  # outside the map area
    assert not mask[10, 10]


def test_outline_width_is_the_typical_line_width() -> None:
    mask = np.zeros((60, 200), dtype=bool)
    mask[20:25, 10:190] = True  # 5 px wide
    assert outline_width_px(mask) == pytest.approx(5.0, abs=1.5)
    assert outline_width_px(np.zeros((5, 5), dtype=bool)) == 1.0


def test_small_components_are_picked_by_area_in_square_metres() -> None:
    mask = np.zeros((50, 50), dtype=bool)
    mask[5:8, 5:8] = True  # 9 px
    mask[20:40, 20:40] = True  # 400 px
    comps = mark_components(mask)
    limit_m2 = 100 * PIXEL_SIZE_M**2
    small = components_smaller_than(comps, limit_m2, PIXEL_SIZE_M)
    assert small[6, 6] and not small[30, 30] and not small[0, 0]


# --- regions ------------------------------------------------------------------------------------


def _regions_for(img: np.ndarray):
    inside = np.ones(img.shape, dtype=bool)
    norm = normalise(img, inside, PARAMS)
    outline = outline_mask(norm, inside, PARAMS)
    comps = mark_components(outline)
    holes = components_smaller_than(comps, PARAMS.regions.hole_fill_m2, PIXEL_SIZE_M)
    wall = outline & ~holes
    width = outline_width_px(wall)
    return build_regions(inside & ~wall, wall, inside, width, PARAMS), width


def test_neighbouring_buildings_meet_on_the_middle_of_their_shared_wall() -> None:
    left = Rect(20, 20, 100, 90, 150)
    right = Rect(100, 20, 180, 90, 150)  # shares the wall at x = 100
    img = draw_plate(220, 120, [left, right])
    found, _ = _regions_for(img)
    kept = [r for r in found.regions if r.area_px < 10000]
    assert len(kept) == 2
    a, b = (found.labels == r.label for r in kept)
    assert not (a & b).any()
    # No wall pixel between them is left unclaimed: the shared wall is shared out.
    column = found.labels[55, 85:116]
    assert (column > 0).all()


def test_a_printed_mark_inside_a_building_does_not_leave_a_hole() -> None:
    img = draw_plate(200, 150, [Rect(30, 30, 160, 120, 150)])
    cv2.putText(img, "12", (80, 85), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 15, 1)
    found, _ = _regions_for(img)
    building = [r for r in found.regions if r.area_px < 15000]
    assert len(building) == 1
    mask = found.labels == building[0].label
    assert mask[75:90, 80:100].all()


def test_regions_below_the_minimum_area_and_above_the_maximum_are_dropped() -> None:
    img = draw_plate(
        400, 300, [Rect(20, 20, 40, 40, 150), Rect(60, 20, 330, 270, 150)]
    )  # 2.4 m x 2.4 m, and 32 m x 30 m
    found, _ = _regions_for(img)
    assert found.dropped["too_small"] >= 1
    assert found.dropped["too_large"] >= 1


# --- polygons -----------------------------------------------------------------------------------


def test_a_rectangular_region_comes_back_as_its_rectangle() -> None:
    mask = np.zeros((40, 60), dtype=np.uint8)
    mask[10:30, 5:50] = 1
    contour = trace_outer_contour(mask)
    assert contour is not None
    simp = simplify(contour, 1.0)
    assert len(simp) == 4
    ring = outer_boundary(simp, (0, 0))
    xs = sorted({round(x, 6) for x, _ in ring})
    ys = sorted({round(y, 6) for _, y in ring})
    assert xs == [5.0, 50.0] and ys == [10.0, 30.0]
    assert trace_outer_contour(np.zeros((5, 5), dtype=np.uint8)) is None


def test_a_bow_tie_is_repaired_to_its_largest_part() -> None:
    ring, repaired = valid_pixel_ring([(0, 0), (10, 10), (10, 0), (0, 10)])
    assert repaired
    assert ring is not None and len(ring) >= 3


def test_degenerate_rings_are_refused() -> None:
    assert valid_pixel_ring([(0, 0), (5, 5)]) == (None, False)
    assert valid_pixel_ring([(0, 0), (5, 5), (10, 10)])[0] is None
    assert valid_pixel_ring([(1, 1), (1, 1), (1, 1)])[0] is None


def test_georeference_keeps_vertex_correspondence_and_counter_clockwise_order() -> None:
    ring = ((0, 0), (10, 0), (10, 5), (0, 5))  # counter-clockwise if y points up
    pixel, ground = georeference(ring, lambda x, y: (100.0 + x, 500.0 + y))
    assert pixel == ring
    assert ground == [(100.0 + x, 500.0 + y) for x, y in pixel]
    # Pixel y points down and north points up, so the usual transform flips the ring.
    pixel2, ground2 = georeference(ring, lambda x, y: (100.0 + x, 500.0 - y))
    assert pixel2 == tuple(reversed(ring))
    assert ground2 == [(100.0 + x, 500.0 - y) for x, y in pixel2]
    area = sum(
        ground2[i][0] * ground2[(i + 1) % 4][1] - ground2[(i + 1) % 4][0] * ground2[i][1]
        for i in range(4)
    )
    assert area > 0


# --- score --------------------------------------------------------------------------------------


def test_weaknesses_follow_the_components() -> None:
    q = make_quality(0.5, 1.0, 0.8, 1.0, 1.0)
    assert weaknesses(q, "hatched", True, True) == (
        "open_outline",
        "hatched_fill",
        "text_overlap",
        "touches_edge",
        "touches_fold",
    )
    assert weaknesses(make_quality(1, 1, 1, 1, 1), "mid", False, False) == ()
    assert weaknesses(make_quality(WEAKNESS_CUT, 1, WEAKNESS_CUT, 1, 1), "light", False, False) == ()


# --- the whole chain ----------------------------------------------------------------------------


def test_three_buildings_are_found_with_their_tone_classes_and_clean_scores() -> None:
    rects = [Rect(30, 30, 110, 90, 70), Rect(150, 40, 250, 120, 150), Rect(40, 140, 120, 230, 215)]
    img = draw_plate(300, 260, rects)
    cands, stats = find_candidates(img, (0, 0), whole(img), [], PIXEL_SIZE_M, PARAMS)
    assert sorted(c.tone_class for c in cands) == ["dark", "light", "mid"]
    assert all(c.weaknesses == () for c in cands)
    assert all(c.quality.score > 0.9 for c in cands)
    assert stats.dropped["too_large"] >= 1  # the paper around them is one big region


def test_text_inside_a_building_lowers_text_clear_and_is_flagged() -> None:
    img = draw_plate(300, 260, [Rect(30, 30, 230, 180, 150)])
    clean, _ = find_candidates(img, (0, 0), whole(img), [], PIXEL_SIZE_M, PARAMS)
    for i in range(12):  # small dark marks, each about 0.5 m2, like a block of lettering
        for j in range(10):
            x, y = 50 + i * 14, 50 + j * 12
            cv2.rectangle(img, (x, y), (x + 5, y + 5), 15, thickness=-1)
    marked, _ = find_candidates(img, (0, 0), whole(img), [], PIXEL_SIZE_M, PARAMS)
    assert len(clean) == len(marked) == 1
    assert marked[0].quality.text_clear < clean[0].quality.text_clear
    assert marked[0].quality.text_clear < WEAKNESS_CUT
    assert "text_overlap" in marked[0].weaknesses


def test_a_building_against_the_map_area_edge_scores_zero_and_is_flagged() -> None:
    img = draw_plate(300, 260, [Rect(8, 30, 110, 110, 150), Rect(150, 60, 250, 160, 150)])
    cands, _ = find_candidates(img, (0, 0), whole(img, 6), [], PIXEL_SIZE_M, PARAMS)
    by_edge = sorted(cands, key=lambda c: c.pixel_polygon[0][0])
    assert len(by_edge) == 2
    assert "touches_edge" in by_edge[0].weaknesses and by_edge[0].quality.score == 0.0
    assert by_edge[1].weaknesses == ()


def test_a_building_on_a_fold_line_is_flagged() -> None:
    img = draw_plate(300, 260, [Rect(150, 40, 250, 120, 150)])
    fold = [(200, 20), (200, 140)]
    cands, _ = find_candidates(img, (0, 0), whole(img), [fold], PIXEL_SIZE_M, PARAMS)
    assert len(cands) == 1
    assert "touches_fold" in cands[0].weaknesses and cands[0].quality.edge_clear == 0.0


def test_nothing_outside_the_map_area_is_proposed() -> None:
    img = draw_plate(400, 260, [Rect(30, 40, 120, 120, 150), Rect(260, 40, 360, 120, 150)])
    area = [(5, 5), (200, 5), (200, 255), (5, 255)]
    cands, _ = find_candidates(img, (0, 0), area, [], PIXEL_SIZE_M, PARAMS)
    assert len(cands) == 1
    assert all(x <= 200 for x, _ in cands[0].pixel_polygon)


def test_a_dashed_outline_with_big_gaps_is_not_a_building() -> None:
    img = np.full((260, 300), 235, dtype=np.uint8)
    cv2.rectangle(img, (60, 50), (240, 200), 150, thickness=-1)
    for x in range(60, 240, 30):  # dashes 10 px long with 20 px gaps, like a lot line
        for y in (50, 200):
            cv2.line(img, (x, y), (x + 10, y), 15, thickness=3)
    for y in range(50, 200, 30):
        for x in (60, 240):
            cv2.line(img, (x, y), (x, y + 10), 15, thickness=3)
    cands, _ = find_candidates(img, (0, 0), whole(img), [], PIXEL_SIZE_M, PARAMS)
    assert cands == []


def test_a_window_offset_moves_the_polygons_by_the_offset() -> None:
    img = draw_plate(300, 260, [Rect(150, 40, 250, 120, 150)])
    base, _ = find_candidates(img, (0, 0), whole(img), [], PIXEL_SIZE_M, PARAMS)
    shifted_area = [(x + 1000, y + 500) for x, y in whole(img)]
    moved, _ = find_candidates(img, (1000, 500), shifted_area, [], PIXEL_SIZE_M, PARAMS)
    assert len(base) == len(moved) == 1
    assert moved[0].pixel_polygon == tuple((x + 1000, y + 500) for x, y in base[0].pixel_polygon)
