from __future__ import annotations

import math

import numpy as np
import pytest
import shapely
from pyproj import Transformer
from shapely.geometry import MultiPoint, Point, Polygon, box

from buried_pipeline.errors import PipelineError
from buried_pipeline.present import clip
from buried_pipeline.present.clip import (
    RawFeature,
    check_size,
    clip_features,
    id_text,
    layer_bbox,
    to_native,
)
from buried_pipeline.present.datasets import DATASETS, get_dataset
from tests.helpers.vectors import to_lonlat

BOUNDS = (629700.0, 4833700.0, 631300.0, 4835300.0)


def lonlat_point(e: float, n: float, fid: int, name: str = "x") -> RawFeature:
    return RawFeature(Point(*to_lonlat(e, n)), {"ID": fid, "NAME": name, "OTHER": "drop me"})


def test_keeps_inside_drops_outside_and_sorts_by_id() -> None:
    feats = [
        lonlat_point(630000, 4834000, 20),
        lonlat_point(640000, 4834000, 5),  # outside
        lonlat_point(630500, 4834500, 3),
    ]
    out = clip_features(feats, BOUNDS, "EPSG:4326", "ID", ["NAME"], ["Point"])
    assert [f["id"] for f in out] == ["20", "3"]  # string sort: "20" < "3"
    assert out[0]["geometry"]["type"] == "Point"
    assert out[0]["geometry"]["coordinates"] == pytest.approx([630000, 4834000], abs=1e-3)
    assert out[0]["properties"] == {"NAME": "x"}  # only kept fields; OTHER dropped


def test_features_crossing_the_bounds_are_kept_whole() -> None:
    crosser = Polygon([(631200, 4834000), (631600, 4834000), (631600, 4834100), (631200, 4834100)])
    lonlat = shapely.transform(
        crosser, lambda c: np.column_stack(Transformer.from_crs(
            "EPSG:26917", "EPSG:4326", always_xy=True).transform(c[:, 0], c[:, 1]))
    )  # fmt: skip
    out = clip_features(
        [RawFeature(lonlat, {"ID": 1, "NAME": "b"})],
        BOUNDS, "EPSG:4326", "ID", [], ["Polygon"],
    )  # fmt: skip
    ring = out[0]["geometry"]["coordinates"][0]
    eastings = [p[0] for p in ring]
    assert max(eastings) == pytest.approx(631600, abs=1e-3)  # not cut at 631300
    assert min(eastings) == pytest.approx(631200, abs=1e-3)


def test_layer_in_another_projected_crs() -> None:
    # EPSG:3857 input
    to_3857 = Transformer.from_crs("EPSG:26917", "EPSG:3857", always_xy=True)
    x, y = to_3857.transform(630000, 4834000)
    out = clip_features(
        [RawFeature(Point(x, y), {"ID": 1})], BOUNDS, "EPSG:3857", "ID", [], ["Point"]
    )
    assert out[0]["geometry"]["coordinates"] == pytest.approx([630000, 4834000], abs=1e-3)


def test_no_crs_stops() -> None:
    with pytest.raises(PipelineError, match="no CRS"):
        clip_features([], BOUNDS, None, "ID", [], ["Point"])


def test_unexpected_geometry_type_stops() -> None:
    with pytest.raises(PipelineError, match="Unexpected geometry type"):
        clip_features(
            [RawFeature(Point(*to_lonlat(630000, 4834000)), {"ID": 1})],
            BOUNDS, "EPSG:4326", "ID", [], ["Polygon"],
        )  # fmt: skip


def test_duplicate_ids_stop() -> None:
    feats = [lonlat_point(630000, 4834000, 1), lonlat_point(630100, 4834000, 1)]
    with pytest.raises(PipelineError, match="Duplicate feature id"):
        clip_features(feats, BOUNDS, "EPSG:4326", "ID", [], ["Point"])


def test_empty_and_null_geometries_are_skipped() -> None:
    feats = [RawFeature(None, {"ID": 1}), RawFeature(Point(), {"ID": 2})]
    assert clip_features(feats, BOUNDS, "EPSG:4326", "ID", [], ["Point"]) == []


def test_feature_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(clip, "MAX_FEATURES", 2)
    feats = [lonlat_point(630000 + i, 4834000, i) for i in range(3)]
    with pytest.raises(PipelineError, match="More than 2 features"):
        clip_features(feats, BOUNDS, "EPSG:4326", "ID", [], ["Point"])


def test_size_limit() -> None:
    check_size("x" * clip.MAX_BYTES)
    with pytest.raises(PipelineError, match="byte limit"):
        check_size("x" * (clip.MAX_BYTES + 1))


def test_missing_id_stops() -> None:
    with pytest.raises(PipelineError, match="empty id"):
        id_text(None)
    with pytest.raises(PipelineError, match="empty id"):
        id_text("")
    assert id_text(7.0) == "7"
    assert id_text(np.int64(12)) == "12"
    assert id_text("abc") == "abc"


def test_to_native() -> None:
    assert to_native(np.int64(3)) == 3 and isinstance(to_native(np.int64(3)), int)
    assert to_native(np.float64("nan")) is None
    assert to_native(float("inf")) is None
    assert to_native(np.datetime64("NaT", "D")) is None
    assert to_native(np.datetime64("2025-01-02")) == "2025-01-02"
    assert to_native(b"abc") == "abc"
    assert to_native(True) is True


def test_layer_bbox_covers_the_bounds_in_layer_crs() -> None:
    minx, miny, maxx, maxy = layer_bbox(BOUNDS, "EPSG:4326")
    for e, n in [(BOUNDS[0], BOUNDS[1]), (BOUNDS[2], BOUNDS[3]), (BOUNDS[0], BOUNDS[3])]:
        lon, lat = to_lonlat(e, n)
        assert minx <= lon <= maxx and miny <= lat <= maxy
    # UTM zone 17N is rotated relative to lon/lat, so the bbox is a little larger than the
    # four corners alone: it must contain every point on the boundary.
    inside = box(minx, miny, maxx, maxy)
    boundary_pt = Point(*to_lonlat((BOUNDS[0] + BOUNDS[2]) / 2, BOUNDS[3]))
    assert inside.contains(boundary_pt)


def test_coordinates_written_to_millimetres() -> None:
    f = lonlat_point(630000.123456, 4834000.987654, 1)
    out = clip_features([f], BOUNDS, "EPSG:4326", "ID", [], ["Point"])
    for value in out[0]["geometry"]["coordinates"]:
        assert round(value, 3) == value


def test_dataset_table_has_intersections_first_and_four_layers() -> None:
    assert DATASETS[0].source_id == "present_toronto_intersections_2026"
    assert len(DATASETS) == 4
    assert get_dataset("present_toronto_property_boundaries_2026").package_id == "property-boundaries"
    with pytest.raises(PipelineError):
        get_dataset("present_toronto_nope_2026")


def test_only_the_intersections_fields_are_confirmed_so_far() -> None:
    # Task 10.4 confirmed the intersections file; the other three wait for task 10.5.
    confirmed = [d.source_id for d in DATASETS if d.fields_confirmed]
    assert confirmed == ["present_toronto_intersections_2026"]
    intersections = get_dataset("present_toronto_intersections_2026")
    assert intersections.id_field == "INTERSECTION_ID"
    assert intersections.kept_fields == (
        "INTERSECTION_DESC", "CLASSIFICATION", "CLASSIFICATION_DESC"
    )  # fmt: skip
    assert intersections.resource_name == "Centreline Intersection - 2952.gpkg"


def test_one_point_multipoint_becomes_a_point() -> None:
    # The City's intersections file stores every point as a one-point MultiPoint.
    e, n = 630000.0, 4834000.0
    feats = [RawFeature(MultiPoint([(e, n)]), {"ID": 1, "NAME": "x"})]
    out = clip_features(feats, BOUNDS, "EPSG:26917", "ID", ["NAME"], ["Point"])
    assert out[0]["geometry"] == {"type": "Point", "coordinates": [e, n]}


def test_multipoint_with_several_points_is_not_reduced() -> None:
    feats = [RawFeature(MultiPoint([(630000.0, 4834000.0), (630001.0, 4834000.0)]), {"ID": 1})]
    with pytest.raises(PipelineError, match="holds 2 points"):
        clip_features(feats, BOUNDS, "EPSG:26917", "ID", [], ["Point"])


def test_multipoint_stays_when_the_dataset_expects_multipoints() -> None:
    feats = [RawFeature(MultiPoint([(630000.0, 4834000.0)]), {"ID": 1})]
    out = clip_features(feats, BOUNDS, "EPSG:26917", "ID", [], ["MultiPoint"])
    assert out[0]["geometry"]["type"] == "MultiPoint"


def test_rows_for_the_same_place_collapse_to_one_feature() -> None:
    # A multi-level intersection has one row per elevation, all at the same point.
    row = {"ID": 7, "NAME": "Queen St E / Don River"}
    feats = [
        RawFeature(MultiPoint([(630000.0, 4834000.0)]), dict(row, ELEV=1)),
        RawFeature(MultiPoint([(630000.0, 4834000.0)]), dict(row, ELEV=2)),
        RawFeature(MultiPoint([(630100.0, 4834000.0)]), {"ID": 8, "NAME": "other"}),
    ]
    out = clip_features(feats, BOUNDS, "EPSG:26917", "ID", ["NAME"], ["Point"])
    assert [f["id"] for f in out] == ["7", "8"]


def test_rows_with_one_id_but_different_fields_stop() -> None:
    feats = [
        RawFeature(Point(630000.0, 4834000.0), {"ID": 7, "NAME": "a"}),
        RawFeature(Point(630000.0, 4834000.0), {"ID": 7, "NAME": "b"}),
    ]
    with pytest.raises(PipelineError, match="Duplicate feature id"):
        clip_features(feats, BOUNDS, "EPSG:26917", "ID", ["NAME"], ["Point"])


def test_to_native_never_returns_nonfinite() -> None:
    for v in (math.nan, math.inf, -math.inf):
        assert to_native(v) is None
