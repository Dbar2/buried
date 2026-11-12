from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest

from buried_pipeline.cli import main
from buried_pipeline.controlcrops.run import run_control_crops, street_names
from buried_pipeline.errors import PipelineError
from buried_pipeline.io.registry import load_registry
from buried_pipeline.paths import Paths
from tests.conftest import make_root
from tests.helpers.rasters import (
    NORTH_UP_26917,
    ROTATED_26917,
    esri_wkt,
    write_geotiff,
    write_jpeg,
    write_pam,
)

SOURCE = "fip_v3_1911_229"
LAYER = "present_toronto_intersections_2026"
# 0.1 m pixels, 1000 x 800 px = 100 x 80 m. Pixel (x, y) is (630000 + 0.1 x, 4834000 - 0.1 y).


def feature(fid: str, east: float, north: float, desc: str, cls: str = "MNRSL") -> dict:
    return {
        "type": "Feature",
        "id": fid,
        "geometry": {"type": "Point", "coordinates": [east, north]},
        "properties": {
            "INTERSECTION_DESC": desc,
            "CLASSIFICATION": cls,
            "CLASSIFICATION_DESC": "Minor-Single Level",
        },
    }


FEATURES = [
    feature("100", 630050.0, 4833960.0, "Queen St E / River St"),  # pixel (500, 400): middle
    feature("101", 630003.0, 4833995.0, "Queen St E / Sumach St", "SEUSL"),  # pixel (30, 50): edge
    feature("102", 630099.0, 4833921.0, "Eastern Ave / Don Roadway"),  # pixel (990, 790): corner
    feature("103", 631000.0, 4833960.0, "Far Away Rd / Elsewhere St"),  # outside the plate
    feature("104", 630050.0, 4834100.0, "North Of Plate Rd"),  # outside the plate
]


def build(tmp_path: Path, features: list[dict] | None = None, plate: bool = True) -> Paths:
    paths = make_root(tmp_path)
    if plate:
        write_geotiff(paths.raw / SOURCE / "plate.tif", NORTH_UP_26917, width=1000, height=800)
    paths.present_dir.mkdir(parents=True, exist_ok=True)
    paths.present_layer(LAYER).write_text(
        json.dumps({"type": "FeatureCollection", "features": features or FEATURES}),
        encoding="utf-8",
    )
    return paths


def run(paths: Paths) -> tuple[dict, list[str]]:
    lines: list[str] = []
    index = run_control_crops(paths, load_registry(paths.sources_json), SOURCE, lines.append)
    return index, lines


def crop_dir(paths: Paths) -> Path:
    return paths.work / "control" / SOURCE


def test_only_intersections_inside_the_plate_get_a_crop(tmp_path: Path) -> None:
    paths = build(tmp_path)
    index, lines = run(paths)
    assert [c["intersection_id"] for c in index["crops"]] == ["100", "101", "102"]
    assert index["count"] == 3
    assert sorted(p.name for p in crop_dir(paths).glob("*.png")) == ["100.png", "101.png", "102.png"]
    assert "3 of 5 intersections" in lines[0]


def test_index_gives_everything_needed_to_mark_a_crossing(tmp_path: Path) -> None:
    paths = build(tmp_path)
    index, _ = run(paths)
    on_disk = json.loads((crop_dir(paths) / "index.json").read_text())
    assert on_disk == index
    assert index["source"] == SOURCE
    assert index["pixel_convention"] == "gdal_corner"
    assert index["reference_source"] == LAYER
    assert index["crs"] == "EPSG:26917"
    assert index["crop_side_m"] == 60.0
    assert index["crop_size_px"] == [600, 600]
    assert "prediction, not a measurement" in index["predicted_with"]

    middle = index["crops"][0]
    assert middle["file"] == "100.png"
    assert middle["streets"] == ["Queen St E", "River St"]
    assert middle["description"] == "Queen St E / River St"
    assert (middle["easting"], middle["northing"]) == (630050.0, 4833960.0)
    assert middle["classification"] == "MNRSL"
    assert middle["predicted_pixel"] == pytest.approx([500.0, 400.0], abs=1e-6)
    assert middle["crop_top_left_px"] == [200, 100]
    assert middle["crop_size_px"] == [600, 600]
    assert middle["predicted_pixel_in_crop"] == pytest.approx([300.0, 300.0], abs=1e-6)
    assert middle["moved_to_stay_inside_plate"] is False

    edge = index["crops"][1]
    assert edge["predicted_pixel"] == pytest.approx([30.0, 50.0], abs=1e-6)
    assert edge["crop_top_left_px"] == [0, 0]
    assert edge["predicted_pixel_in_crop"] == pytest.approx([30.0, 50.0], abs=1e-6)
    assert edge["moved_to_stay_inside_plate"] is True
    assert edge["classification"] == "SEUSL"

    corner = index["crops"][2]
    assert corner["crop_top_left_px"] == [400, 200]
    assert corner["predicted_pixel_in_crop"] == pytest.approx([590.0, 590.0], abs=1e-6)


def test_the_png_is_the_native_plate_with_only_a_crosshair_drawn_on_it(tmp_path: Path) -> None:
    paths = build(tmp_path)
    index, _ = run(paths)
    image = cv2.imread(str(crop_dir(paths) / "100.png"), cv2.IMREAD_COLOR)  # BGR
    assert image.shape == (600, 600, 3)  # native pixels: 60 m at 0.1 m per pixel
    gap, arm = index["crosshair"]["gap_px"], index["crosshair"]["arm_px"]
    assert gap == 4 and arm == 30  # 0.4 m and 3 m at 0.1 m per pixel
    # The plate is flat grey (128). Drawn pixels are 128 blended 50/50 with (230, 30, 30).
    assert tuple(image[300, 300 + gap]) == (79, 79, 179)  # BGR
    assert tuple(image[300 - gap - arm + 1, 300]) == (79, 79, 179)
    assert tuple(image[300, 300]) == (128, 128, 128)  # centre: left clear
    assert tuple(image[300, 300 + gap - 1]) == (128, 128, 128)  # gap: left clear
    changed = (image != 128).any(axis=2).sum()
    assert changed == 4 * arm  # nothing else was touched


def test_every_png_matches_the_size_the_index_states(tmp_path: Path) -> None:
    paths = build(tmp_path)
    index, _ = run(paths)
    for crop in index["crops"]:
        image = cv2.imread(str(crop_dir(paths) / crop["file"]), cv2.IMREAD_COLOR)
        assert [image.shape[1], image.shape[0]] == crop["crop_size_px"]


def test_a_rotated_jpeg_plate_works_the_same_way(tmp_path: Path) -> None:
    paths = build(tmp_path, plate=False)
    jpg = write_jpeg(paths.raw / SOURCE / "plate.jpg", width=1000, height=800)
    write_pam(jpg, ROTATED_26917, esri_wkt())
    # Pixel (500, 400) under ROTATED_26917 is this easting/northing.
    e = 630000.0 + 0.11 * 500 + 0.033 * 400
    n = 4834000.0 + 0.034 * 500 - 0.118 * 400
    paths.present_layer(LAYER).write_text(
        json.dumps({"type": "FeatureCollection", "features": [feature("7", e, n, "A St / B St")]}),
        encoding="utf-8",
    )
    index, _ = run(paths)
    assert index["georef_source"] == "pam_aux_xml"
    (crop,) = index["crops"]
    assert crop["predicted_pixel"] == pytest.approx([500.0, 400.0], abs=1e-6)
    # About 60 m: 60 / 0.115 and 60 / 0.1226 pixels (unit steps measured on the ground).
    assert index["crop_size_px"] == [round(60 / index["pixel_size_m"]["x"]),
                                     round(60 / index["pixel_size_m"]["y"])]  # fmt: skip


def test_a_second_run_removes_crops_of_the_first(tmp_path: Path) -> None:
    paths = build(tmp_path)
    run(paths)
    stale = crop_dir(paths) / "999.png"
    stale.write_bytes(b"old")
    (crop_dir(paths) / "notes.txt").write_text("keep me", encoding="utf-8")
    index, _ = run(paths)
    assert not stale.exists()
    assert (crop_dir(paths) / "notes.txt").exists()  # only PNGs and the index are managed
    assert index["count"] == 3


def test_missing_layer_says_which_command_to_run(tmp_path: Path) -> None:
    paths = build(tmp_path)
    paths.present_layer(LAYER).unlink()
    with pytest.raises(PipelineError, match=f"buried present {LAYER}"):
        run(paths)


def test_plate_not_fetched(tmp_path: Path) -> None:
    paths = build(tmp_path, plate=False)
    with pytest.raises(PipelineError, match="Not fetched"):
        run(paths)


def test_a_source_that_is_not_a_raster_is_refused(tmp_path: Path) -> None:
    paths = build(tmp_path)
    with pytest.raises(PipelineError, match="not a raster source"):
        run_control_crops(paths, load_registry(paths.sources_json), LAYER, lambda _m: None)


def test_unsafe_intersection_id_is_refused_before_writing(tmp_path: Path) -> None:
    paths = build(tmp_path, [feature("../evil", 630050.0, 4833960.0, "X / Y")])
    with pytest.raises(PipelineError, match="not safe as a file name"):
        run(paths)
    assert not crop_dir(paths).exists()


def test_no_intersections_inside_gives_an_empty_index(tmp_path: Path) -> None:
    paths = build(tmp_path, [feature("103", 631000.0, 4833960.0, "Far / Away")])
    index, _ = run(paths)
    assert index["count"] == 0 and index["crops"] == []
    assert list(crop_dir(paths).glob("*.png")) == []


def test_street_names() -> None:
    assert street_names("Adelaide St E / Eastern Ave Diversion / Bayview Ave") == [
        "Adelaide St E", "Eastern Ave Diversion", "Bayview Ave"
    ]  # fmt: skip
    assert street_names("Anna Hilliard Lane") == ["Anna Hilliard Lane"]
    assert street_names(None) == []


def test_cli_control_crops(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    paths = build(tmp_path)
    assert main(["--root", str(paths.root), "control-crops", SOURCE]) == 0
    assert "3 of 5 intersections" in capsys.readouterr().out
    assert (crop_dir(paths) / "index.json").exists()


def test_cli_control_crops_error_exits_1(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    paths = build(tmp_path, plate=False)
    assert main(["--root", str(paths.root), "control-crops", SOURCE]) == 1
    assert "Not fetched" in capsys.readouterr().err
