"""`buried extract` end to end on a synthetic plate (spec 02 task 7.8, requirements 8.2 to 8.7)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import pytest
import rasterio
from rasterio.transform import Affine

from buried_pipeline.cli import main
from buried_pipeline.errors import PipelineError
from buried_pipeline.extract.run import run_extract
from buried_pipeline.io.registry import load_registry
from buried_pipeline.paths import Paths
from tests.conftest import make_root
from tests.helpers.synthetic_plate import Rect, draw_plate, synthetic_params
from tests.tile.test_run import SOURCE, TRANSFORM, write_map_area
from tests.validate.builders import alignment

SCALE = 2  # the record says 0.06 m per source pixel, so draw at twice the working resolution
WIDTH, HEIGHT = 300 * SCALE, 260 * SCALE
RECTS = [
    Rect(30 * SCALE, 30 * SCALE, 110 * SCALE, 90 * SCALE, 70),
    Rect(150 * SCALE, 40 * SCALE, 250 * SCALE, 120 * SCALE, 150),
    Rect(40 * SCALE, 140 * SCALE, 120 * SCALE, 230 * SCALE, 215),
]
MAP_AREA = [[10, 10], [WIDTH - 10, 10], [WIDTH - 10, HEIGHT - 10], [10, HEIGHT - 10]]


def write_plate(path: Path, pixels: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(
        path, "w", driver="GTiff", width=pixels.shape[1], height=pixels.shape[0], count=1,
        dtype="uint8", crs="EPSG:26917", transform=Affine(*TRANSFORM),
    ) as dst:  # fmt: skip
        dst.write(pixels[np.newaxis])


def build(tmp_path: Path, polygon: list[list[int]] | None = None) -> Paths:
    paths = make_root(tmp_path)
    write_plate(paths.raw / SOURCE / "plate.tif", draw_plate(WIDTH, HEIGHT, RECTS, outline_px=6))
    paths.alignment_dir.mkdir(parents=True)
    paths.alignment_record(SOURCE).write_text(json.dumps(alignment(SOURCE)), encoding="utf-8")
    write_map_area(paths, polygon or MAP_AREA)
    return paths


def extract(paths: Paths, preview: bool = False, source: str = SOURCE):
    return run_extract(
        paths, load_registry(paths.sources_json), source, preview=preview,
        out=lambda _m: None, params=synthetic_params(),
    )  # fmt: skip


def read(paths: Paths) -> dict[str, Any]:
    return json.loads(paths.proposals_file(SOURCE).read_text(encoding="utf-8"))


def test_the_proposal_file_has_the_header_and_one_feature_per_building(tmp_path: Path) -> None:
    paths = build(tmp_path)
    result = extract(paths)
    doc = read(paths)

    assert result.count == len(doc["features"]) == 3
    assert doc["type"] == "FeatureCollection" and doc["crs"] == "EPSG:26917"
    assert doc["source"] == SOURCE and doc["params_id"] == "test"
    assert doc["params_sha256"] == "0" * 64
    assert len(doc["alignment_record_sha256"]) == 64
    assert len(doc["map_area_sha256"]) == 64
    assert doc["map_area_px"] == MAP_AREA
    ring = doc["map_area_geometry"]["coordinates"][0]
    assert ring[0] == ring[-1] and len(ring) == len(MAP_AREA) + 1

    ids = [f["id"] for f in doc["features"]]
    assert ids == sorted(ids)
    assert all(i.startswith(f"{SOURCE}_p_") and len(i) == len(SOURCE) + 3 + 12 for i in ids)
    for feature in doc["features"]:
        props = feature["properties"]
        assert set(props) == {
            "tone_class", "pixel_polygon", "crop_px", "area_m2", "quality", "weaknesses",
        }  # fmt: skip
        assert "material" not in props
        assert props["tone_class"] in {"light", "mid", "dark", "hatched", "mixed"}
        assert set(props["quality"]) == {
            "score", "outline_closure", "fill_uniformity", "text_clear", "edge_clear",
            "shape_fidelity",
        }  # fmt: skip


def test_geometry_is_the_chosen_transform_of_the_pixel_polygon(tmp_path: Path) -> None:
    paths = build(tmp_path)
    extract(paths)
    a, b, c, d, e, f = TRANSFORM  # the record chose the supplied georeferencing
    for feature in read(paths)["features"]:
        pixel = feature["properties"]["pixel_polygon"]
        ring = feature["geometry"]["coordinates"][0]
        for (x, y), (easting, northing) in zip(pixel, ring, strict=False):
            assert easting == pytest.approx(a * x + b * y + c, abs=1e-6)
            assert northing == pytest.approx(d * x + e * y + f, abs=1e-6)


def test_a_building_outside_the_map_area_is_not_proposed(tmp_path: Path) -> None:
    left_half = [[10, 10], [WIDTH // 2, 10], [WIDTH // 2, HEIGHT - 10], [10, HEIGHT - 10]]
    paths = build(tmp_path, polygon=left_half)
    extract(paths)
    for feature in read(paths)["features"]:
        assert all(x <= WIDTH // 2 for x, _ in feature["properties"]["pixel_polygon"])
    assert len(read(paths)["features"]) == 2  # the two buildings in the left half


def test_output_is_written_atomically_and_only_where_expected(tmp_path: Path) -> None:
    paths = build(tmp_path)
    extract(paths)
    assert paths.proposals_file(SOURCE).is_file()
    assert not paths.extract_preview(SOURCE).exists()
    assert not list(paths.work.rglob("*.tmp"))
    assert paths.proposals_file(SOURCE).read_text().endswith("\n")


def test_preview_is_a_jpeg_of_the_map_area_window(tmp_path: Path) -> None:
    paths = build(tmp_path)
    result = extract(paths, preview=True)
    assert result.preview == paths.extract_preview(SOURCE)
    image = cv2.imread(str(result.preview), cv2.IMREAD_COLOR)
    assert image is not None
    # The window is the map area's bounding box (here 580 x 500 px), below the 4096 px limit.
    assert image.shape[:2] == (HEIGHT - 20, WIDTH - 20)
    # Proposals are drawn in colour on a grey scan.
    channels_differ = (image[:, :, 0] != image[:, :, 2]).sum()
    assert channels_differ > 0


def test_no_alignment_record_is_refused_and_nothing_is_written(tmp_path: Path) -> None:
    paths = build(tmp_path)
    paths.alignment_record(SOURCE).unlink()
    with pytest.raises(PipelineError, match="no alignment record"):
        extract(paths)
    assert not paths.work.exists()


def test_no_map_area_is_refused_naming_the_file(tmp_path: Path) -> None:
    paths = build(tmp_path)
    paths.map_area_file(SOURCE).unlink()
    with pytest.raises(PipelineError, match=f"data/control/map_area/{SOURCE}.json"):
        extract(paths)
    assert not paths.work.exists()


def test_an_unregistered_source_is_refused(tmp_path: Path) -> None:
    paths = build(tmp_path)
    with pytest.raises(PipelineError):
        extract(paths, source="fip_v3_1911_999")


def test_the_cli_refuses_without_an_alignment_record(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    paths = build(tmp_path)
    paths.alignment_record(SOURCE).unlink()
    assert main(["--root", str(paths.root), "extract", SOURCE]) == 1
    assert "no alignment record" in capsys.readouterr().err


def test_the_cli_accepts_the_preview_flag() -> None:
    from buried_pipeline.cli import build_parser

    args = build_parser().parse_args(["extract", SOURCE, "--preview"])
    assert args.command == "extract" and args.preview is True
    assert build_parser().parse_args(["extract", SOURCE]).preview is False
