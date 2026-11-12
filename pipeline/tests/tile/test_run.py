from __future__ import annotations

import copy
import json
from pathlib import Path

import cv2
import numpy as np
import pytest
import rasterio
from rasterio.transform import Affine

from buried_pipeline.align.affine import apply_affine
from buried_pipeline.cli import main
from buried_pipeline.errors import PipelineError
from buried_pipeline.io.registry import load_registry
from buried_pipeline.paths import Paths
from buried_pipeline.tile.run import downsample, read_pixels, run_tile
from buried_pipeline.validate.schema import load_schema
from tests.conftest import SOURCES_DOC, make_root
from tests.helpers.rasters import ROTATED_26917, esri_wkt, write_geotiff, write_jpeg, write_pam
from tests.validate.builders import alignment

SOURCE = "fip_v3_1911_229"
TRANSFORM = (0.05, 0.0, 632000.0, 0.0, -0.05, 4835000.0)


def build(tmp_path: Path, width: int = 6000, height: int = 3000, transform=TRANSFORM) -> Paths:
    paths = make_root(tmp_path)
    write_geotiff(paths.raw / SOURCE / "plate.tif", transform, width=width, height=height)
    paths.alignment_dir.mkdir(parents=True)
    paths.alignment_record(SOURCE).write_text(json.dumps(alignment(SOURCE)), encoding="utf-8")
    return paths


def tile(paths: Paths, ids=(SOURCE,)):
    return run_tile(paths, load_registry(paths.sources_json), list(ids), lambda _m: None)


def sidecar(paths: Paths, sid: str = SOURCE):
    return json.loads((paths.data / "tiles" / f"{sid}.json").read_text())


def test_a_large_plate_is_shrunk_to_4096_and_gets_exact_corners(tmp_path: Path) -> None:
    paths = build(tmp_path)
    (result,) = tile(paths)
    assert (result.width_px, result.height_px) == (4096, 2048)
    img = cv2.imread(str(result.image), cv2.IMREAD_UNCHANGED)
    assert img.shape == (2048, 4096)

    side = sidecar(paths)
    assert side["corners"] == {
        "top_left": [632000.0, 4835000.0],
        "top_right": [632300.0, 4835000.0],
        "bottom_right": [632300.0, 4834850.0],
        "bottom_left": [632000.0, 4834850.0],
    }
    assert side["image"] == f"{SOURCE}.jpg"
    assert (side["width_px"], side["height_px"]) == (4096, 2048)
    assert side["transform"] == "supplied"
    assert side["alignment_error_m"] == 4.3  # from the record, not recomputed
    assert side["source_pixel_size_m"] == 0.06
    assert side["tile_pixel_size_m"] == pytest.approx(0.06 * 6000 / 4096)
    assert side["attribution_line"] == "test attribution"
    assert load_schema(paths.root).issues("tileSidecar", side) == []
    assert not list((paths.data / "tiles").glob("*.tmp"))


def test_a_small_plate_is_not_enlarged(tmp_path: Path) -> None:
    paths = build(tmp_path, width=900, height=600)
    (result,) = tile(paths)
    assert (result.width_px, result.height_px) == (900, 600)


def test_rotated_plate_corners_are_the_transform_of_the_full_resolution_corners(
    tmp_path: Path,
) -> None:
    paths = build(tmp_path, width=5000, height=4500, transform=ROTATED_26917)
    tile(paths)
    side = sidecar(paths)
    assert side["corners"]["bottom_right"] == pytest.approx(
        list(apply_affine(ROTATED_26917, 5000, 4500)), abs=1e-9
    )
    assert side["corners"]["top_right"][1] != side["corners"]["top_left"][1]


def test_refined_transform_is_used_when_the_record_chose_it(tmp_path: Path) -> None:
    paths = build(tmp_path, width=1000, height=500)
    refined = (0.05, 0.0, 632100.0, 0.0, -0.05, 4835100.0)  # 100 m from the supplied position
    residuals = [{"id": f"cp_{i}", "dx_m": 0.1, "dy_m": 0.1, "r_m": 0.15} for i in range(4)]
    rec = alignment(SOURCE)
    rec["supplied"]["residuals"] = residuals
    rec["refined"] = {"affine": list(refined), "residuals": residuals, "rmse_in_sample_m": 0.1,
                      "rmse_loo_m": 0.9, "max_residual_m": 0.15}
    rec.update(chosen="refined", error_basis="refined_loo_rmse", error_basis_m=0.9,
               alignment_error_m=2.0)
    paths.alignment_record(SOURCE).write_text(json.dumps(rec), encoding="utf-8")
    tile(paths)
    side = sidecar(paths)
    assert side["transform"] == "refined"
    assert side["alignment_error_m"] == 2.0
    assert side["corners"]["top_left"] == [632100.0, 4835100.0]
    assert side["corners"]["bottom_right"] == pytest.approx([632150.0, 4835075.0])


def test_no_alignment_record_is_refused_and_nothing_is_written(tmp_path: Path) -> None:
    paths = build(tmp_path)
    paths.alignment_record(SOURCE).unlink()
    with pytest.raises(PipelineError, match="no alignment record"):
        tile(paths)
    assert not (paths.data / "tiles").exists()


def test_unconfirmed_attribution_is_refused(tmp_path: Path) -> None:
    doc = copy.deepcopy(SOURCES_DOC)
    doc["sources"][0]["attribution_status"] = "to_be_confirmed"
    paths = make_root(tmp_path, doc)
    write_geotiff(paths.raw / SOURCE / "plate.tif", TRANSFORM, width=100, height=100)
    paths.alignment_dir.mkdir(parents=True)
    paths.alignment_record(SOURCE).write_text(json.dumps(alignment(SOURCE)), encoding="utf-8")
    with pytest.raises(PipelineError, match="attribution"):
        tile(paths)
    assert not (paths.data / "tiles").exists()


def test_only_plates_are_tiled_for_now(tmp_path: Path) -> None:
    paths = build(tmp_path)
    with pytest.raises(PipelineError, match="only fire insurance plates"):
        tile(paths, ["present_toronto_intersections_2026"])


def test_unregistered_source_is_refused(tmp_path: Path) -> None:
    paths = build(tmp_path)
    with pytest.raises(PipelineError, match="not in the Registry"):
        tile(paths, ["fip_v3_1911_999"])


def test_a_malformed_alignment_record_is_refused(tmp_path: Path) -> None:
    paths = build(tmp_path)
    rec = alignment(SOURCE)
    rec["error_rule"]["floor_m"] = 0.5
    paths.alignment_record(SOURCE).write_text(json.dumps(rec), encoding="utf-8")
    with pytest.raises(PipelineError, match="does not match the Schema"):
        tile(paths)


def test_a_curved_georeferencing_fails_the_bilinear_check_and_writes_nothing(
    tmp_path: Path,
) -> None:
    # A web-mercator raster 60 km wide: mapping into UTM is not an affine map at that size.
    paths = make_root(tmp_path)
    write_geotiff(
        paths.raw / SOURCE / "plate.tif",
        (600.0, 0.0, -8_860_000.0, 0.0, -600.0, 5_440_000.0),
        crs="EPSG:3857",
        width=100,
        height=100,
    )
    paths.alignment_dir.mkdir(parents=True)
    paths.alignment_record(SOURCE).write_text(json.dumps(alignment(SOURCE)), encoding="utf-8")
    with pytest.raises(PipelineError, match="bilinear interpolation"):
        tile(paths)
    assert not (paths.data / "tiles").exists()


def test_default_run_tiles_plates_with_records_and_names_the_others(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    paths = build(tmp_path, width=300, height=200)
    assert main(["--root", str(paths.root), "tile"]) == 0
    out = capsys.readouterr().out
    assert "fip_v3_1935_229: skipped, no alignment record" in out
    assert f"{SOURCE}: wrote data/tiles/{SOURCE}.jpg" in out
    assert (paths.data / "tiles" / f"{SOURCE}.jpg").is_file()


def test_default_run_with_no_records_fails(tmp_path: Path) -> None:
    paths = make_root(tmp_path)
    with pytest.raises(PipelineError, match="No plate has an alignment record"):
        run_tile(paths, load_registry(paths.sources_json), [], lambda _m: None)


def test_second_run_gives_identical_files(tmp_path: Path) -> None:
    paths = build(tmp_path, width=500, height=300)
    tile(paths)
    first = [(paths.data / "tiles" / f"{SOURCE}{s}").read_bytes() for s in (".jpg", ".json")]
    tile(paths)
    second = [(paths.data / "tiles" / f"{SOURCE}{s}").read_bytes() for s in (".jpg", ".json")]
    assert first == second


def test_a_jpeg_plate_with_a_pam_sidecar_is_tiled(tmp_path: Path) -> None:
    paths = make_root(tmp_path)
    jpg = write_jpeg(paths.raw / SOURCE / "plate.jpg", width=400, height=300)
    write_pam(jpg, TRANSFORM, esri_wkt())
    paths.alignment_dir.mkdir(parents=True)
    paths.alignment_record(SOURCE).write_text(json.dumps(alignment(SOURCE)), encoding="utf-8")
    tile(paths)
    assert sidecar(paths)["corners"]["top_left"] == pytest.approx([632000.0, 4835000.0])


# --- pixels -----------------------------------------------------------------------------------


def test_area_averaging_not_nearest_neighbour() -> None:
    checker = (np.indices((64, 64)).sum(axis=0) % 2 * 255).astype(np.uint8)
    small = downsample(checker, 32, 32)
    # Every 2x2 block holds two black and two white pixels, so area averaging gives ~127.5.
    assert small.min() >= 126 and small.max() <= 129


def test_downsample_returns_the_same_array_when_the_size_is_unchanged() -> None:
    a = np.arange(12, dtype=np.uint8).reshape(3, 4)
    assert downsample(a, 4, 3) is a


def test_grey_plate_stays_one_band_and_values_are_not_adjusted(tmp_path: Path) -> None:
    paths = build(tmp_path, width=200, height=100)  # constant 128
    tile(paths)
    img = cv2.imread(str(paths.data / "tiles" / f"{SOURCE}.jpg"), cv2.IMREAD_UNCHANGED)
    assert img.ndim == 2
    assert abs(int(img.mean()) - 128) <= 1


def test_palette_is_expanded_to_rgb_and_nothing_else(tmp_path: Path) -> None:
    path = tmp_path / "pal.tif"
    data = np.array([[0, 1], [2, 1]], dtype="uint8")
    with rasterio.open(path, "w", driver="GTiff", width=2, height=2, count=1, dtype="uint8",
                       crs="EPSG:26917", transform=Affine(*TRANSFORM)) as dst:
        dst.write(data, 1)
        dst.write_colormap(1, {0: (255, 0, 0, 255), 1: (0, 255, 0, 255), 2: (0, 0, 255, 255)})
    bgr = read_pixels(path)
    assert bgr.shape == (2, 2, 3)
    assert tuple(bgr[0, 0]) == (0, 0, 255)  # red in BGR order
    assert tuple(bgr[0, 1]) == (0, 255, 0)
    assert tuple(bgr[1, 0]) == (255, 0, 0)


def test_three_band_image_is_returned_in_bgr_order(tmp_path: Path) -> None:
    path = tmp_path / "rgb.tif"
    data = np.zeros((3, 2, 2), dtype="uint8")
    data[0] = 10  # red
    data[1] = 20  # green
    data[2] = 30  # blue
    with rasterio.open(path, "w", driver="GTiff", width=2, height=2, count=3, dtype="uint8",
                       crs="EPSG:26917", transform=Affine(*TRANSFORM)) as dst:
        dst.write(data)
    assert tuple(read_pixels(path)[0, 0]) == (30, 20, 10)


@pytest.mark.parametrize(("count", "dtype", "message"),
                         [(2, "uint8", "2 bands"), (1, "uint16", "only 8-bit")])
def test_other_layouts_are_refused_not_converted(tmp_path: Path, count, dtype, message) -> None:
    path = tmp_path / "odd.tif"
    with rasterio.open(path, "w", driver="GTiff", width=4, height=4, count=count, dtype=dtype,
                       crs="EPSG:26917", transform=Affine(*TRANSFORM)) as dst:
        dst.write(np.zeros((count, 4, 4), dtype=dtype))
    with pytest.raises(PipelineError, match=message):
        read_pixels(path)
