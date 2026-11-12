from __future__ import annotations

import json
from pathlib import Path

import pytest
from pyproj import Transformer

from buried_pipeline.cli import main
from buried_pipeline.errors import PipelineError
from buried_pipeline.inspect.georef import find_raster, inspect_source, read_raster_info
from buried_pipeline.paths import Paths
from tests.conftest import make_root
from tests.helpers.rasters import (
    NORTH_UP_26917,
    write_geotiff,
    write_plain_tiff,
    write_prj,
    write_world_file,
)


def test_geotiff_tags_in_26917(tmp_path: Path) -> None:
    tif = write_geotiff(tmp_path / "a.tif", NORTH_UP_26917)
    info = read_raster_info(tif)
    assert info.georef_source == "geotiff_tags"
    assert info.crs == "EPSG:26917"
    assert (info.width, info.height, info.bands) == (200, 100, 1)
    assert info.transform == pytest.approx(NORTH_UP_26917)
    assert info.notes == []


def test_report_for_26917_raster(tmp_path: Path) -> None:
    paths = make_root(tmp_path)
    write_geotiff(paths.raw / "fip_v3_1911_229" / "plate.tif", NORTH_UP_26917)
    report = inspect_source(paths, "fip_v3_1911_229")
    assert report["pixel_size_m"]["x"] == pytest.approx(0.1)
    assert report["pixel_size_m"]["y"] == pytest.approx(0.1)
    assert report["pixel_size_max_m"] == pytest.approx(0.1)
    assert report["bounds_26917"] == pytest.approx(
        {"min_e": 630000.0, "min_n": 4833990.0, "max_e": 630020.0, "max_n": 4834000.0}
    )
    assert report["corners_26917"]["bottom_right"] == pytest.approx([630020.0, 4833990.0])
    assert json.loads(paths.inspect_report("fip_v3_1911_229").read_text()) == report


def test_report_for_web_mercator_raster_reprojects(tmp_path: Path) -> None:
    to_3857 = Transformer.from_crs("EPSG:26917", "EPSG:3857", always_xy=True)
    e3857, n3857 = to_3857.transform(630000.0, 4834000.0)
    # Web Mercator at ~43.65N stretches by ~1/cos(lat) = 1.38; ground pixels are smaller than 0.1.
    transform = (0.1, 0.0, e3857, 0.0, -0.1, n3857)
    tif = write_geotiff(tmp_path / "m.tif", transform, crs="EPSG:3857")
    info = read_raster_info(tif)
    assert info.crs == "EPSG:3857"
    paths = make_root(tmp_path / "root")
    write_geotiff(paths.raw / "fip_v3_1911_229" / "m.tif", transform, crs="EPSG:3857")
    report = inspect_source(paths, "fip_v3_1911_229")
    # Web Mercator at ~43.65N stretches by ~1/cos(lat) = 1.38; ground pixels are smaller than 0.1.
    assert 0.06 < report["pixel_size_m"]["x"] < 0.09
    assert report["corners_26917"]["top_left"] == pytest.approx([630000.0, 4834000.0], abs=0.01)


def test_no_georeferencing_fails(tmp_path: Path) -> None:
    tif = write_plain_tiff(tmp_path / "plain.tif")
    with pytest.raises(PipelineError, match=r"No georeferencing: .*plain\.tif"):
        read_raster_info(tif)


def test_world_file_with_prj_is_detected(tmp_path: Path) -> None:
    from rasterio.crs import CRS
    from rasterio.enums import WktVersion

    tif = write_plain_tiff(tmp_path / "w.tif")
    write_world_file(tif, NORTH_UP_26917)
    write_prj(tif, CRS.from_epsg(26917).to_wkt(version=WktVersion.WKT1_ESRI))
    info = read_raster_info(tif)
    assert info.georef_source == "world_file"
    assert info.crs == "EPSG:26917"
    assert info.transform == pytest.approx(NORTH_UP_26917)


def test_world_file_without_crs_fails(tmp_path: Path) -> None:
    tif = write_plain_tiff(tmp_path / "w.tif")
    write_world_file(tif, NORTH_UP_26917)
    with pytest.raises(PipelineError, match="No georeferencing"):
        read_raster_info(tif)


def test_tags_and_disagreeing_world_file_warns_and_says_which_was_used(tmp_path: Path) -> None:
    tif = write_geotiff(tmp_path / "d.tif", NORTH_UP_26917)
    off = (NORTH_UP_26917[0], 0.0, NORTH_UP_26917[2] + 5.0, 0.0, NORTH_UP_26917[4],
           NORTH_UP_26917[5])  # fmt: skip
    write_world_file(tif, off)
    info = read_raster_info(tif)
    assert info.georef_source == "geotiff_tags"
    assert info.transform == pytest.approx(NORTH_UP_26917)
    assert len(info.notes) == 1
    assert "WARNING" in info.notes[0] and "GeoTIFF tags" in info.notes[0]


def test_agreeing_world_file_is_silent(tmp_path: Path) -> None:
    tif = write_geotiff(tmp_path / "ok.tif", NORTH_UP_26917)
    write_world_file(tif, NORTH_UP_26917)
    assert read_raster_info(tif).notes == []


def test_find_raster_errors(tmp_path: Path) -> None:
    with pytest.raises(PipelineError, match="Not fetched"):
        find_raster(tmp_path / "missing")
    empty = tmp_path / "empty"
    empty.mkdir()
    with pytest.raises(PipelineError, match="No GeoTIFF"):
        find_raster(empty)
    write_geotiff(empty / "a.tif", NORTH_UP_26917)
    write_geotiff(empty / "b.tif", NORTH_UP_26917)
    with pytest.raises(PipelineError, match="More than one"):
        find_raster(empty)


def _setup_two_plates(paths: Paths) -> None:
    write_geotiff(paths.raw / "fip_v3_1911_229" / "a.tif", NORTH_UP_26917)
    shifted = (0.1, 0.0, 631000.0, 0.0, -0.1, 4835000.0)
    write_geotiff(paths.raw / "fip_v3_1935_229" / "b.tif", shifted)


def test_cli_inspect_table_and_propose_origin(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    paths = make_root(tmp_path)
    _setup_two_plates(paths)
    assert main(["--root", str(paths.root), "inspect", "--propose-origin"]) == 0
    out = capsys.readouterr().out
    assert "fip_v3_1911_229" in out and "fip_v3_1935_229" in out
    assert "geotiff_tags" in out
    # union (630000, 4833990)-(631020, 4835000): centre (630510, 4834495) -> (630500, 4834400)
    assert "E0 = 630500  N0 = 4834400" in out
    # +250 outward to 100: (629700, 4833700)-(631300, 4835300)
    assert "min_e = 629700  min_n = 4833700  max_e = 631300  max_n = 4835300" in out
    assert not paths.project_json.exists()  # never written by inspect


def test_cli_inspect_missing_georef_exits_1(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    paths = make_root(tmp_path)
    write_plain_tiff(paths.raw / "fip_v3_1911_229" / "p.tif")
    assert main(["--root", str(paths.root), "inspect", "fip_v3_1911_229"]) == 1
    assert "No georeferencing" in capsys.readouterr().err
    assert not paths.inspect_report("fip_v3_1911_229").exists()


def test_propose_origin_needs_every_plate_inspected(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    paths = make_root(tmp_path)
    write_geotiff(paths.raw / "fip_v3_1911_229" / "a.tif", NORTH_UP_26917)
    assert main(["--root", str(paths.root), "inspect", "fip_v3_1911_229", "--propose-origin"]) == 1
    assert "No inspect report for fip_v3_1935_229" in capsys.readouterr().err
