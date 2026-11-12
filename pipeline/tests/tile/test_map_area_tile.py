"""`buried tile` with a map area (spec 02 tasks 14.2 and 14.3, requirements 16 and 19)."""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import pytest
import rasterio
from rasterio.transform import Affine

from buried_pipeline.errors import PipelineError
from buried_pipeline.io.registry import load_registry
from buried_pipeline.paths import Paths
from buried_pipeline.tile.run import downsample, encode_jpeg, run_tile
from buried_pipeline.validate.schema import load_schema
from tests.conftest import make_root
from tests.tile.test_run import SOURCE, TRANSFORM, build, full_extent, write_map_area
from tests.validate.builders import alignment


def tile(paths: Paths, ids=(SOURCE,)):
    return run_tile(paths, load_registry(paths.sources_json), list(ids), lambda _m: None)


def sidecar(paths: Paths) -> dict:
    return json.loads((paths.data / "tiles" / f"{SOURCE}.json").read_text())


def write_pattern_plate(paths: Paths, width: int, height: int) -> np.ndarray:
    """A plate whose value is a function of position, so any shift or crop shows."""
    ys, xs = np.indices((height, width))
    data = ((xs * 7 + ys * 3) % 251).astype("uint8")
    raster = paths.raw / SOURCE / "plate.tif"
    raster.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(raster, "w", driver="GTiff", width=width, height=height, count=1,
                       dtype="uint8", crs="EPSG:26917", transform=Affine(*TRANSFORM)) as dst:
        dst.write(data, 1)
    return data


def test_a_plate_without_a_map_area_is_refused_naming_the_file(tmp_path: Path) -> None:
    paths = build(tmp_path, width=400, height=300)
    paths.map_area_file(SOURCE).unlink()
    with pytest.raises(PipelineError) as caught:
        tile(paths)
    assert f"data/control/map_area/{SOURCE}.json" in str(caught.value)
    assert "No command writes or suggests it" in str(caught.value)
    assert not (paths.data / "tiles").exists()


def test_the_tile_is_the_bounding_box_of_the_map_area(tmp_path: Path) -> None:
    polygon = [[100, 50], [700, 80], [650, 400], [120, 380]]
    paths = build(tmp_path, width=800, height=500, polygon=polygon)
    (result,) = tile(paths)
    assert result.crop_px == {"x": 100, "y": 50, "width": 600, "height": 350}
    side = sidecar(paths)
    assert side["crop_px"] == {"x": 100, "y": 50, "width": 600, "height": 350}
    assert (side["width_px"], side["height_px"]) == (600, 350)
    # Corners: the transform of the bounding box corners, not of the whole raster.
    e0, n0, px = 632000.0, 4835000.0, 0.05
    assert side["corners"] == {
        "top_left": [e0 + 100 * px, n0 - 50 * px],
        "top_right": [e0 + 700 * px, n0 - 50 * px],
        "bottom_right": [e0 + 700 * px, n0 - 400 * px],
        "bottom_left": [e0 + 100 * px, n0 - 400 * px],
    }
    assert load_schema(paths.root).issues("tileSidecar", side) == []


def test_the_sidecar_carries_the_polygon_through_the_transform(tmp_path: Path) -> None:
    polygon = [[100, 50], [700, 80], [650, 400], [120, 380]]
    paths = build(tmp_path, width=800, height=500, polygon=polygon)
    tile(paths)
    ring = sidecar(paths)["map_area"]["coordinates"][0]
    assert len(ring) == 5 and ring[0] == ring[-1]
    for (x, y), (e, n) in zip(polygon, ring, strict=False):
        assert e == pytest.approx(632000.0 + x * 0.05)
        assert n == pytest.approx(4835000.0 - y * 0.05)


def test_pixels_inside_the_box_but_outside_the_polygon_are_not_masked(tmp_path: Path) -> None:
    # A triangle (with one extra collinear vertex, as a map area needs four): the box's top-right
    # corner lies outside it.
    polygon = [[100, 100], [500, 100], [100, 400], [100, 250]]
    paths = build(tmp_path, width=600, height=500, polygon=polygon)
    data = write_pattern_plate(paths, 600, 500)
    (result,) = tile(paths)
    window = data[100:400, 100:500]
    expected = encode_jpeg(window)
    assert result.image.read_bytes() == expected
    decoded = cv2.imread(str(result.image), cv2.IMREAD_UNCHANGED)
    assert decoded.shape == window.shape
    assert abs(int(decoded[5, 390]) - int(window[5, 390])) < 40  # corner outside the triangle


def test_nothing_is_recoloured_the_tile_is_the_encoded_window(tmp_path: Path) -> None:
    paths = build(tmp_path, width=900, height=700, polygon=[[10, 20], [880, 20], [880, 690], [10, 690]])
    data = write_pattern_plate(paths, 900, 700)
    (result,) = tile(paths)
    assert result.image.read_bytes() == encode_jpeg(data[20:690, 10:880])


def test_a_large_window_is_still_shrunk_to_4096(tmp_path: Path) -> None:
    paths = build(tmp_path, width=6000, height=3000, polygon=[[500, 100], [5900, 100],
                                                              [5900, 2900], [500, 2900]])
    (result,) = tile(paths)
    assert (result.width_px, result.height_px) == (4096, 2124)
    side = sidecar(paths)
    assert side["tile_pixel_size_m"] == pytest.approx(0.06 * 5400 / 4096)


def test_the_full_photograph_is_written_uncropped_at_2048(tmp_path: Path) -> None:
    paths = build(tmp_path, width=6000, height=3000, polygon=[[500, 100], [5900, 100],
                                                              [5900, 2900], [500, 2900]])
    (result,) = tile(paths)
    side = sidecar(paths)
    assert side["full_image"] == f"{SOURCE}_full.jpg"
    assert (side["full_width_px"], side["full_height_px"]) == (2048, 1024)
    img = cv2.imread(str(paths.data / "tiles" / side["full_image"]), cv2.IMREAD_UNCHANGED)
    assert img.shape == (1024, 2048)
    assert result.full_image == paths.data / "tiles" / side["full_image"]


def test_the_full_photograph_is_the_whole_raster_area_averaged(tmp_path: Path) -> None:
    paths = build(tmp_path, width=500, height=400, polygon=[[100, 100], [300, 100], [300, 300],
                                                            [100, 300]])
    data = write_pattern_plate(paths, 500, 400)
    tile(paths)
    full = (paths.data / "tiles" / f"{SOURCE}_full.jpg").read_bytes()
    assert full == encode_jpeg(data)  # small enough to need no shrinking
    big = write_pattern_plate(paths, 4000, 1000)
    write_map_area(paths, [[0, 0], [4000, 0], [4000, 1000], [0, 1000]])
    tile(paths)
    full = (paths.data / "tiles" / f"{SOURCE}_full.jpg").read_bytes()
    assert full == encode_jpeg(downsample(big, 2048, 512))


def test_a_vertex_outside_the_raster_is_refused_and_nothing_is_written(tmp_path: Path) -> None:
    paths = build(tmp_path, width=400, height=300)
    write_map_area(paths, [[0, 0], [401, 0], [400, 300], [0, 300]])
    with pytest.raises(PipelineError, match=r"vertices outside the raster \(400 x 300 px\)"):
        tile(paths)
    assert not (paths.data / "tiles").exists()


def test_a_vertex_on_the_far_edge_is_inside(tmp_path: Path) -> None:
    paths = build(tmp_path, width=400, height=300)
    write_map_area(paths, [[0, 0], [400, 0], [400, 300], [0, 300]])
    (result,) = tile(paths)
    assert result.crop_px == {"x": 0, "y": 0, "width": 400, "height": 300}


@pytest.mark.parametrize(
    ("polygon", "message"),
    [
        ([[0, 0], [100, 100], [100, 0], [0, 100]], "not a single valid polygon"),
        ([[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]], "repeats its first vertex"),
        ([[0, 0], [50, 0], [100, 0], [150, 0]], "not a single valid polygon"),
    ],
)
def test_a_map_area_that_is_not_one_valid_polygon_is_refused(
    tmp_path: Path, polygon, message: str
) -> None:
    paths = build(tmp_path, width=400, height=300)
    write_map_area(paths, polygon)
    with pytest.raises(PipelineError, match=message):
        tile(paths)
    assert not (paths.data / "tiles").exists()


def test_a_map_area_for_another_source_is_refused(tmp_path: Path) -> None:
    paths = build(tmp_path, width=400, height=300)
    doc = json.loads(paths.map_area_file(SOURCE).read_text())
    doc["source"] = "fip_v3_1935_229"
    paths.map_area_file(SOURCE).write_text(json.dumps(doc), encoding="utf-8")
    with pytest.raises(PipelineError, match="is the map area for fip_v3_1935_229"):
        tile(paths)


def test_a_map_area_that_fails_the_schema_is_refused(tmp_path: Path) -> None:
    paths = build(tmp_path, width=400, height=300)
    doc = json.loads(paths.map_area_file(SOURCE).read_text())
    del doc["excluded"]
    paths.map_area_file(SOURCE).write_text(json.dumps(doc), encoding="utf-8")
    with pytest.raises(PipelineError, match="does not match the Schema"):
        tile(paths)


def test_a_map_area_that_is_not_json_is_refused(tmp_path: Path) -> None:
    paths = build(tmp_path, width=400, height=300)
    paths.map_area_file(SOURCE).write_text("{ not json", encoding="utf-8")
    with pytest.raises(PipelineError, match="is not valid JSON"):
        tile(paths)


def test_no_command_writes_the_map_area_file(tmp_path: Path) -> None:
    paths = make_root(tmp_path)
    paths.control_dir.mkdir(parents=True)
    assert not paths.map_area_dir.exists()
    # Tiling a plate that has none must not create one, or the directory.
    from tests.helpers.rasters import write_geotiff

    write_geotiff(paths.raw / SOURCE / "plate.tif", TRANSFORM, width=100, height=100)
    paths.alignment_dir.mkdir(parents=True)
    paths.alignment_record(SOURCE).write_text(json.dumps(alignment(SOURCE)), encoding="utf-8")
    with pytest.raises(PipelineError):
        tile(paths)
    assert not paths.map_area_dir.exists()


def test_full_extent_helper_matches_the_unchanged_whole_plate_tile(tmp_path: Path) -> None:
    paths = build(tmp_path, width=300, height=200, polygon=full_extent(300, 200))
    data = write_pattern_plate(paths, 300, 200)
    (result,) = tile(paths)
    assert result.image.read_bytes() == encode_jpeg(data)
