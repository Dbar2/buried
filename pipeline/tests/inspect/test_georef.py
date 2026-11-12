from __future__ import annotations

import json
import math
import tempfile
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from pyproj import Transformer

from buried_pipeline.cli import main
from buried_pipeline.errors import PipelineError
from buried_pipeline.inspect.georef import find_raster, inspect_source, read_raster_info
from buried_pipeline.inspect.supplied_points import parse_supplied_points
from buried_pipeline.paths import Paths
from tests.conftest import make_root
from tests.helpers.rasters import (
    NORTH_UP_26917,
    ROTATED_26917,
    esri_wkt,
    write_geotiff,
    write_jpeg,
    write_pam,
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
    with pytest.raises(PipelineError, match="No TIFF or JPEG raster"):
        find_raster(empty)
    write_geotiff(empty / "a.tif", NORTH_UP_26917)
    write_geotiff(empty / "b.tif", NORTH_UP_26917)
    with pytest.raises(PipelineError, match="More than one"):
        find_raster(empty)


def test_find_raster_accepts_a_jpeg_and_skips_overviews_and_thumbnails(tmp_path: Path) -> None:
    plate = write_jpeg(tmp_path / "v3-1935-229.jpg")
    (tmp_path / "v3-1935-229.jpg.ovr").write_bytes(b"overview")
    (tmp_path / "v3-1935-229.jgw").write_text("0\n" * 6, encoding="utf-8")
    (tmp_path / "v3-1935-229.txt").write_text("1 2 3 4\n", encoding="utf-8")
    write_jpeg(tmp_path / "v3-1935-229_thumb.jpg")
    write_jpeg(tmp_path / "Thumbnail.JPG")
    assert find_raster(tmp_path) == plate


def test_jpeg_with_only_thumbnails_is_not_a_plate(tmp_path: Path) -> None:
    write_jpeg(tmp_path / "plate_thumb.jpg")
    with pytest.raises(PipelineError, match="No TIFF or JPEG raster"):
        find_raster(tmp_path)


# --- JPEG plates and the georeferencing order (spec 02 requirement 14) -------------------------


def test_jpeg_with_pam_sidecar_uses_pam(tmp_path: Path) -> None:
    jpg = write_jpeg(tmp_path / "p.jpg")
    write_pam(jpg, ROTATED_26917, esri_wkt())
    info = read_raster_info(jpg)
    assert info.georef_source == "pam_aux_xml"
    assert info.crs_source == "pam_aux_xml"
    assert info.crs == "EPSG:26917"
    assert info.transform == pytest.approx(ROTATED_26917)
    assert (info.width, info.height, info.bands) == (200, 100, 1)
    assert info.notes == []


def test_jpeg_with_world_file_and_prj(tmp_path: Path) -> None:
    jpg = write_jpeg(tmp_path / "p.jpg")
    write_world_file(jpg, ROTATED_26917)
    write_prj(jpg, esri_wkt())
    info = read_raster_info(jpg)
    assert info.georef_source == "world_file"
    assert info.crs_source == "prj_file"
    assert info.crs == "EPSG:26917"
    assert info.transform == pytest.approx(ROTATED_26917)


def test_jpeg_with_world_file_takes_its_crs_from_the_pam_srs(tmp_path: Path) -> None:
    jpg = write_jpeg(tmp_path / "p.jpg")
    write_world_file(jpg, ROTATED_26917)
    write_pam(jpg, None, esri_wkt())  # SRS only: no GeoTransform in the sidecar
    info = read_raster_info(jpg)
    assert info.georef_source == "world_file"
    assert info.crs_source == "pam_srs"
    assert info.crs == "EPSG:26917"
    assert info.transform == pytest.approx(ROTATED_26917)


def test_prj_file_is_preferred_to_the_pam_srs_for_a_world_file(tmp_path: Path) -> None:
    jpg = write_jpeg(tmp_path / "p.jpg")
    write_world_file(jpg, ROTATED_26917)
    write_pam(jpg, None, esri_wkt(26917))
    write_prj(jpg, esri_wkt(26917))
    assert read_raster_info(jpg).crs_source == "prj_file"


def test_pam_beats_an_agreeing_world_file_without_a_warning(tmp_path: Path) -> None:
    jpg = write_jpeg(tmp_path / "p.jpg")
    write_pam(jpg, ROTATED_26917, esri_wkt())
    write_world_file(jpg, ROTATED_26917)
    info = read_raster_info(jpg)
    assert info.georef_source == "pam_aux_xml"
    assert info.notes == []


def test_pam_and_a_disagreeing_world_file_warns_and_says_pam_was_used(tmp_path: Path) -> None:
    jpg = write_jpeg(tmp_path / "p.jpg")
    write_pam(jpg, ROTATED_26917, esri_wkt())
    a, b, c, d, e, f = ROTATED_26917
    write_world_file(jpg, (a, b, c + 5.0, d, e, f))
    info = read_raster_info(jpg)
    assert info.georef_source == "pam_aux_xml"
    assert info.transform == pytest.approx(ROTATED_26917)
    assert len(info.notes) == 1
    note = info.notes[0]
    assert "WARNING" in note and "Used the PAM sidecar" in note and "world file" in note


def test_geotiff_tags_beat_a_pam_sidecar(tmp_path: Path) -> None:
    tif = write_geotiff(tmp_path / "t.tif", NORTH_UP_26917)
    write_pam(tif, ROTATED_26917, esri_wkt())
    info = read_raster_info(tif)
    assert info.georef_source == "geotiff_tags"
    assert info.transform == pytest.approx(NORTH_UP_26917)
    assert len(info.notes) == 1 and "PAM sidecar" in info.notes[0]


def test_plain_tiff_with_a_pam_sidecar_uses_pam(tmp_path: Path) -> None:
    tif = write_plain_tiff(tmp_path / "t.tif")
    write_pam(tif, ROTATED_26917, esri_wkt())
    info = read_raster_info(tif)
    assert info.georef_source == "pam_aux_xml"
    assert info.transform == pytest.approx(ROTATED_26917)


def test_jpeg_with_nothing_fails(tmp_path: Path) -> None:
    jpg = write_jpeg(tmp_path / "p.jpg")
    with pytest.raises(PipelineError, match=r"No georeferencing: .*p\.jpg.*no GeoTIFF tags"):
        read_raster_info(jpg)


def test_jpeg_with_a_world_file_but_no_crs_fails_loudly(tmp_path: Path) -> None:
    jpg = write_jpeg(tmp_path / "p.jpg")
    write_world_file(jpg, ROTATED_26917)
    with pytest.raises(PipelineError, match=r"No georeferencing: .*world file has a transform"):
        read_raster_info(jpg)


def test_pam_transform_without_srs_fails_loudly(tmp_path: Path) -> None:
    jpg = write_jpeg(tmp_path / "p.jpg")
    write_pam(jpg, ROTATED_26917, None)
    with pytest.raises(PipelineError, match=r"No georeferencing: .*PAM sidecar has a transform"):
        read_raster_info(jpg)


def test_pam_transform_without_srs_is_not_rescued_by_a_prj_alone(tmp_path: Path) -> None:
    # A .prj is only paired with a world file. It is not paired with a PAM transform.
    jpg = write_jpeg(tmp_path / "p.jpg")
    write_pam(jpg, ROTATED_26917, None)
    write_prj(jpg, esri_wkt())
    with pytest.raises(PipelineError, match="No georeferencing"):
        read_raster_info(jpg)


def test_malformed_sidecars_fail(tmp_path: Path) -> None:
    jpg = write_jpeg(tmp_path / "p.jpg")
    pam = jpg.with_name("p.jpg.aux.xml")
    pam.write_text("<PAMDataset>", encoding="utf-8")
    with pytest.raises(PipelineError, match="not valid XML"):
        read_raster_info(jpg)
    pam.write_text(
        "<PAMDataset><GeoTransform>1, 2, 3</GeoTransform></PAMDataset>", encoding="utf-8"
    )
    with pytest.raises(PipelineError, match="should hold 6 numbers"):
        read_raster_info(jpg)
    pam.unlink()
    jpg.with_name("p.jgw").write_text("1\n2\n3\n4\n5\n", encoding="utf-8")
    with pytest.raises(PipelineError, match="should hold 6 numbers"):
        read_raster_info(jpg)


def test_identity_pam_transform_counts_as_none(tmp_path: Path) -> None:
    jpg = write_jpeg(tmp_path / "p.jpg")
    write_pam(jpg, (1.0, 0.0, 0.0, 0.0, 1.0, 0.0), esri_wkt())
    with pytest.raises(PipelineError, match="No georeferencing"):
        read_raster_info(jpg)


@settings(max_examples=60, deadline=None)
@given(
    a=st.floats(0.02, 0.5),
    e=st.floats(0.02, 0.5),
    b=st.floats(-0.2, 0.2),
    d=st.floats(-0.2, 0.2),
    c=st.floats(600000, 660000),
    f=st.floats(4800000, 4860000),
)
def test_world_file_and_pam_read_back_the_transform_written(
    a: float, e: float, b: float, d: float, c: float, f: float
) -> None:
    """The same transform written as a world file and as a PAM sidecar reads back the same."""
    transform = (a, b, c, d, -e, f)
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        world_jpg = write_jpeg(root / "w.jpg")
        write_world_file(world_jpg, transform)
        write_prj(world_jpg, esri_wkt())
        pam_jpg = write_jpeg(root / "x.jpg")
        write_pam(pam_jpg, transform, esri_wkt())
        from_world = read_raster_info(world_jpg)
        from_pam = read_raster_info(pam_jpg)
    assert from_world.transform == pytest.approx(transform, abs=1e-6)
    assert from_pam.transform == pytest.approx(transform, abs=1e-6)
    assert from_world.notes == [] and from_pam.notes == []


def test_inspect_report_for_a_jpeg_plate(tmp_path: Path) -> None:
    paths = make_root(tmp_path)
    jpg = write_jpeg(paths.raw / "fip_v3_1935_229" / "v3-1935-229.jpg")
    write_pam(jpg, ROTATED_26917, esri_wkt())
    (jpg.parent / "v3-1935-229.jpg.ovr").write_bytes(b"overview")
    report = inspect_source(paths, "fip_v3_1935_229")
    assert report["file"] == "data/raw/fip_v3_1935_229/v3-1935-229.jpg"
    assert report["georef_source"] == "pam_aux_xml"
    assert report["crs_source"] == "pam_aux_xml"
    assert report["rotation_terms"] == {"b": 0.033, "d": 0.034}
    assert report["pixel_size_m"]["x"] == pytest.approx(math.hypot(0.11, 0.034))
    assert report["supplied_control_points"] is None  # no .txt shipped
    assert json.loads(paths.inspect_report("fip_v3_1935_229").read_text()) == report


# --- supplied control points (spec 02 requirement 14.6) ---------------------------------------

POINTS_TEXT = (
    "1756.217285\t-1487.507812\t632485.119019\t4835022.022877\n"
    "606.393066\t-743.503906\t632329.676000\t4835068.325053\n"
    "\n"
    "919.572729   -1852.480609   632401.378226   4834950.320650\n"
    "2538.705768\t-3183.595954\t632632.359938\t4834847.397527\n"
)


def test_supplied_points_are_parsed_and_marked_not_independent(tmp_path: Path) -> None:
    paths = make_root(tmp_path)
    jpg = write_jpeg(paths.raw / "fip_v3_1935_229" / "v3-1935-229.jpg")
    write_pam(jpg, ROTATED_26917, esri_wkt())
    (jpg.parent / "v3-1935-229.txt").write_text(POINTS_TEXT, encoding="utf-8")
    report = inspect_source(paths, "fip_v3_1935_229")
    block = report["supplied_control_points"]
    assert block["file"] == "data/raw/fip_v3_1935_229/v3-1935-229.txt"
    assert block["count"] == 4
    assert block["independent"] is False
    assert block["columns"] == ["source_x", "source_y", "map_easting", "map_northing"]
    assert block["map_crs"] == "EPSG:26917"
    assert "not independent" in block["note"] and "never used" in block["note"]
    assert block["points"][0] == {
        "source_x": 1756.217285,
        "source_y": -1487.507812,
        "map_easting": 632485.119019,
        "map_northing": 4835022.022877,
    }
    assert block["points"][3]["map_northing"] == 4834847.397527
    assert report["notes"] == []


def test_a_points_file_for_another_name_is_not_picked_up(tmp_path: Path) -> None:
    paths = make_root(tmp_path)
    jpg = write_jpeg(paths.raw / "fip_v3_1935_229" / "v3-1935-229.jpg")
    write_pam(jpg, ROTATED_26917, esri_wkt())
    (jpg.parent / "readme.txt").write_text(POINTS_TEXT, encoding="utf-8")
    assert inspect_source(paths, "fip_v3_1935_229")["supplied_control_points"] is None


@pytest.mark.parametrize(
    "text, fragment",
    [
        ("1 2 3\n", "line 1: expected 4 numbers, found 3"),
        ("1 2 3 4\n5 6 7 x\n", "line 2: not a number"),
        ("1 2 3 nan\n", "line 1: a value is not finite"),
    ],
)
def test_unreadable_points_file_warns_and_inspect_still_works(
    tmp_path: Path, text: str, fragment: str
) -> None:
    paths = make_root(tmp_path)
    jpg = write_jpeg(paths.raw / "fip_v3_1935_229" / "v3-1935-229.jpg")
    write_pam(jpg, ROTATED_26917, esri_wkt())
    (jpg.parent / "v3-1935-229.txt").write_text(text, encoding="utf-8")
    report = inspect_source(paths, "fip_v3_1935_229")
    assert report["supplied_control_points"] is None
    assert len(report["notes"]) == 1
    assert "WARNING" in report["notes"][0] and fragment in report["notes"][0]


def test_parse_supplied_points_counts_and_order() -> None:
    points = parse_supplied_points(POINTS_TEXT)
    assert len(points) == 4
    assert [p["map_easting"] for p in points] == [
        632485.119019, 632329.676, 632401.378226, 632632.359938
    ]  # fmt: skip


@settings(max_examples=60, deadline=None)
@given(
    st.lists(
        st.tuples(*[st.floats(-1e7, 1e7, allow_nan=False, allow_infinity=False)] * 4),
        max_size=12,
    )
)
def test_parse_supplied_points_round_trips_any_numbers(rows: list[tuple[float, ...]]) -> None:
    text = "".join("\t".join(repr(v) for v in row) + "\n" for row in rows)
    points = parse_supplied_points(text)
    assert [tuple(p.values()) for p in points] == rows


def test_cli_inspect_prints_the_georef_source_and_supplied_point_count(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    paths = make_root(tmp_path)
    jpg = write_jpeg(paths.raw / "fip_v3_1935_229" / "v3-1935-229.jpg")
    write_pam(jpg, ROTATED_26917, esri_wkt())
    (jpg.parent / "v3-1935-229.txt").write_text(POINTS_TEXT, encoding="utf-8")
    assert main(["--root", str(paths.root), "inspect", "fip_v3_1935_229"]) == 0
    out = capsys.readouterr().out
    assert "pam_aux_xml" in out
    assert "4 supplied control points" in out and "provenance only" in out


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
