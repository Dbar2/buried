"""Properties of extraction (spec 02 tasks 7.4 to 7.7 and 7.9: X1 to X5)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from shapely.geometry import Polygon

from buried_pipeline.extract.document import build_collection, dumps
from buried_pipeline.extract.maparea import MapArea
from buried_pipeline.extract.propose import Candidate, find_candidates
from buried_pipeline.extract.score import COMPONENT_NAMES, make_quality
from tests.helpers.synthetic_plate import (
    PIXEL_SIZE_M,
    Rect,
    draw_plate,
    iou_rect,
    synthetic_params,
)

PARAMS = synthetic_params()
SLOW = settings(
    max_examples=60,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.data_too_large],
)


def whole(width: int, height: int, margin: int = 5) -> list[tuple[int, int]]:
    return [
        (margin, margin),
        (width - margin, margin),
        (width - margin, height - margin),
        (margin, height - margin),
    ]


def map_area(polygon: list[tuple[int, int]]) -> MapArea:
    return MapArea(
        source="fip_v3_1911_229",
        pixel_polygon=tuple(polygon),
        excluded="test",
        fold_lines=(),
        confirmed_by="test",
        confirmed_at="2026-01-01T00:00:00Z",
        sha256="a" * 64,
    )


# --- a plate of four cells, one rectangle in each ------------------------------------------------

CELL_W, CELL_H = 150, 130
FILLS = {"dark": 70, "mid": 150, "light": 215}


@st.composite
def cell_plates(draw: st.DrawFn) -> tuple[list[Rect], list[str]]:
    """Up to four non-touching rectangles, each inside its own cell with a margin, each in one of
    three well-separated grey tones."""
    rects: list[Rect] = []
    tones: list[str] = []
    for col in range(2):
        for row in range(2):
            if not draw(st.booleans()) and rects:
                continue
            w = draw(st.integers(70, 110))
            h = draw(st.integers(60, 95))
            x0 = col * CELL_W + draw(st.integers(14, CELL_W - w - 14))
            y0 = row * CELL_H + draw(st.integers(14, CELL_H - h - 14))
            tone = draw(st.sampled_from(sorted(FILLS)))
            rects.append(Rect(x0, y0, x0 + w, y0 + h, FILLS[tone]))
            tones.append(tone)
    return rects, tones


# --- X5 -----------------------------------------------------------------------------------------


@SLOW
@given(cell_plates())
def test_x5_synthetic_rectangles_are_recovered_with_their_tone_and_no_extras(
    plate: tuple[list[Rect], list[str]],
) -> None:
    rects, tones = plate
    width, height = 2 * CELL_W, 2 * CELL_H
    img = draw_plate(width, height, rects)
    candidates, _ = find_candidates(
        img, (0, 0), whole(width, height), [], PIXEL_SIZE_M, PARAMS
    )

    assert len(candidates) == len(rects)  # no extras, none missed
    unmatched = list(range(len(candidates)))
    for rect, tone in zip(rects, tones, strict=True):
        scores = [(iou_rect(list(candidates[i].pixel_polygon), rect), i) for i in unmatched]
        best, index = max(scores)
        assert best >= 0.9
        assert candidates[index].tone_class == tone
        unmatched.remove(index)


# --- X1 -----------------------------------------------------------------------------------------


@st.composite
def messy_plates(draw: st.DrawFn) -> np.ndarray:
    """Overlapping rectangles, noise and random strokes: whatever comes out must be valid."""
    seed = draw(st.integers(0, 2**32 - 1))
    rng = np.random.default_rng(seed)
    width, height = 260, 200
    rects = []
    for _ in range(draw(st.integers(0, 7))):
        x0, y0 = int(rng.integers(5, width - 40)), int(rng.integers(5, height - 40))
        rects.append(
            Rect(
                x0,
                y0,
                x0 + int(rng.integers(8, 120)),
                y0 + int(rng.integers(8, 100)),
                int(rng.integers(60, 230)),
            )
        )
    img = draw_plate(width, height, [Rect(r.x0, r.y0, min(r.x1, width - 3), min(r.y1, height - 3), r.fill) for r in rects])
    noise = rng.normal(0, draw(st.sampled_from([0.0, 6.0, 20.0])), img.shape)
    return np.clip(img.astype(np.float64) + noise, 0, 255).astype(np.uint8)


def identity(x: float, y: float) -> tuple[float, float]:
    return 630000.0 + x * PIXEL_SIZE_M, 4834000.0 - y * PIXEL_SIZE_M


@SLOW
@given(messy_plates())
def test_x1_proposals_are_valid_polygons_above_the_minimum_area(img: np.ndarray) -> None:
    height, width = img.shape
    area = whole(width, height)
    candidates, _ = find_candidates(img, (0, 0), area, [], PIXEL_SIZE_M, PARAMS)
    doc, _ = build_collection(
        "fip_v3_1911_229", PARAMS, "b" * 64, map_area(area), candidates, identity
    )
    for feature in doc["features"]:
        ground = Polygon(feature["geometry"]["coordinates"][0])
        pixels = Polygon(feature["properties"]["pixel_polygon"])
        assert ground.is_valid and ground.geom_type == "Polygon"
        assert pixels.is_valid and pixels.area > 0
        assert feature["properties"]["area_m2"] >= PARAMS.regions.min_area_m2
        assert abs(ground.area - feature["properties"]["area_m2"]) < 1e-5


# --- X3 -----------------------------------------------------------------------------------------


@st.composite
def affine_maps(draw: st.DrawFn) -> tuple[float, float, float, float, float, float]:
    """A pixel-to-ground affine near Toronto in UTM 17N: any rotation, either handedness."""
    scale = draw(st.floats(0.05, 0.15))
    theta = np.radians(draw(st.floats(-180, 180)))
    flip = draw(st.sampled_from([-1.0, 1.0]))
    a, b = scale * np.cos(theta), -scale * np.sin(theta) * flip
    d, e = scale * np.sin(theta), scale * np.cos(theta) * flip
    return (
        float(a),
        float(b),
        draw(st.floats(629000, 631000)),
        float(d),
        float(e),
        draw(st.floats(4833000, 4835000)),
    )


@st.composite
def pixel_rings(draw: st.DrawFn) -> tuple[tuple[int, int], ...]:
    x0, y0 = draw(st.integers(0, 4000)), draw(st.integers(0, 4000))
    w, h = draw(st.integers(40, 400)), draw(st.integers(40, 400))
    cut = draw(st.integers(1, 20))
    ring = [(x0, y0), (x0 + w, y0), (x0 + w, y0 + h - cut), (x0 + w - cut, y0 + h), (x0, y0 + h)]
    if draw(st.booleans()):
        ring.reverse()
    return tuple(ring)


@SLOW
@given(affine_maps(), st.lists(pixel_rings(), min_size=1, max_size=4, unique=True))
def test_x3_geometry_is_the_chosen_transform_applied_to_the_pixel_polygon(
    affine: tuple[float, float, float, float, float, float], rings: list[tuple[tuple[int, int], ...]]
) -> None:
    a, b, c, d, e, f = affine

    def mapping(x: float, y: float) -> tuple[float, float]:
        return a * x + b * y + c, d * x + e * y + f

    quality = make_quality(1, 1, 1, 1, 1)
    candidates = [Candidate(r, "mid", quality, ()) for r in rings]
    area = [(0, 0), (5000, 0), (5000, 5000), (0, 5000)]
    params = synthetic_params()
    doc, _ = build_collection(
        "fip_v3_1911_229", params, "c" * 64, map_area(area), candidates, mapping
    )
    assert len(doc["features"]) + _dropped_small(doc, candidates, mapping, params) == len(rings)
    for feature in doc["features"]:
        pixel = feature["properties"]["pixel_polygon"]
        ring = feature["geometry"]["coordinates"][0]
        assert ring[0] == ring[-1]
        assert len(ring) == len(pixel) + 1
        for (x, y), (easting, northing) in zip(pixel, ring, strict=False):
            ex, ey = mapping(float(x), float(y))
            assert abs(easting - ex) <= 1e-6 and abs(northing - ey) <= 1e-6
        # GeoJSON exterior rings run counter-clockwise.
        assert Polygon(ring).exterior.is_ccw


def _dropped_small(doc, candidates, mapping, params) -> int:  # type: ignore[no-untyped-def]
    """Candidates below the minimum area once georeferenced are the only ones allowed to vanish."""
    kept = {tuple(map(tuple, f["properties"]["pixel_polygon"])) for f in doc["features"]}
    count = 0
    for cand in candidates:
        ring = cand.pixel_polygon
        pixel_set = tuple(ring)
        reversed_set = tuple(reversed(ring))
        if pixel_set in kept or reversed_set in kept:
            continue
        ground = Polygon([mapping(float(x), float(y)) for x, y in ring])
        assert ground.area < params.regions.min_area_m2
        count += 1
    return count


# --- X4 -----------------------------------------------------------------------------------------


@given(*[st.floats(-2.0, 3.0, allow_nan=False) for _ in COMPONENT_NAMES])
def test_x4_scores_are_bounded_and_equal_the_minimum_component(
    a: float, b: float, c: float, d: float, e: float
) -> None:
    q = make_quality(a, b, c, d, e)
    parts = [getattr(q, name) for name in COMPONENT_NAMES]
    assert all(0.0 <= p <= 1.0 for p in parts)
    assert 0.0 <= q.score <= 1.0
    assert q.score == min(parts)
    assert q.score in parts


@SLOW
@given(messy_plates())
def test_x4_every_proposal_score_is_the_minimum_of_its_components(img: np.ndarray) -> None:
    height, width = img.shape
    candidates, _ = find_candidates(img, (0, 0), whole(width, height), [], PIXEL_SIZE_M, PARAMS)
    for cand in candidates:
        parts = [getattr(cand.quality, name) for name in COMPONENT_NAMES]
        assert all(0.0 <= p <= 1.0 for p in parts)
        assert cand.quality.score == min(parts)


# --- X2 -----------------------------------------------------------------------------------------


@SLOW
@given(messy_plates())
def test_x2_two_runs_give_byte_identical_output(img: np.ndarray) -> None:
    height, width = img.shape
    area = whole(width, height)

    def once() -> str:
        candidates, _ = find_candidates(img.copy(), (0, 0), area, [], PIXEL_SIZE_M, PARAMS)
        doc, _ = build_collection(
            "fip_v3_1911_229", PARAMS, "d" * 64, map_area(area), candidates, identity
        )
        return dumps(doc)

    first = once()
    assert once() == first


def test_x2_two_extract_runs_write_byte_identical_files(tmp_path: Path) -> None:
    from tests.extract.test_run import SOURCE, build, extract

    paths = build(tmp_path)
    extract(paths)
    first = paths.proposals_file(SOURCE).read_bytes()
    paths.proposals_file(SOURCE).unlink()
    extract(paths)
    assert paths.proposals_file(SOURCE).read_bytes() == first
    assert len(first) > 1000
