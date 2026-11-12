from __future__ import annotations

import hashlib
import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

import pytest

from buried_pipeline.align.residuals import choose_transform, published_error
from buried_pipeline.align.run import run_align_check
from buried_pipeline.cli import main
from buried_pipeline.errors import PipelineError
from buried_pipeline.io.registry import load_registry
from buried_pipeline.paths import Paths
from tests.conftest import make_root
from tests.helpers.rasters import write_geotiff

FIXTURES = Path(__file__).parent.parent / "fixtures" / "align"
NOW = datetime(2026, 11, 13, 12, 0, 0, tzinfo=UTC)
SOURCE = "fip_v3_1911_229"
# 0.2 m pixels, 1000 x 750 px = 200 x 150 m.
TRANSFORM = (0.2, 0.0, 630000.0, 0.0, -0.2, 4834000.0)


def build(tmp_path: Path, control: str = "control_ok.json") -> Paths:
    paths = make_root(tmp_path)
    write_geotiff(paths.raw / SOURCE / "plate.tif", TRANSFORM, width=1000, height=750)
    paths.present_dir.mkdir(parents=True)
    shutil.copy(FIXTURES / "layer_intersections.json",
                paths.present_layer("present_toronto_intersections_2026"))  # fmt: skip
    shutil.copy(FIXTURES / "layer_buildings.json",
                paths.present_layer("present_toronto_building_outlines_2026"))  # fmt: skip
    paths.control_dir.mkdir(parents=True)
    shutil.copy(FIXTURES / control, paths.control_file(SOURCE))
    return paths


def run(paths: Paths):
    lines: list[str] = []
    result = run_align_check(paths, load_registry(paths.sources_json), SOURCE, NOW, lines.append)
    return result, "\n".join(lines)


def test_end_to_end_numbers(tmp_path: Path) -> None:
    paths = build(tmp_path)
    result, text = run(paths)

    # Pixel offsets in the fixture are whole pixels of 0.2 m, so residuals are exact multiples.
    # Squares: p1 .08, p2 .32, p3 .32, p4 .08, p5 .20, p6 0 -> mean 1.0/6.
    assert result.supplied.rmse_m == pytest.approx((1.0 / 6.0) ** 0.5, abs=1e-6)
    by_id = {r.id: r for r in result.supplied.residuals}
    assert (by_id["p1"].dx_m, by_id["p1"].dy_m) == pytest.approx((0.2, 0.2), abs=1e-6)
    assert (by_id["p2"].dx_m, by_id["p2"].dy_m) == pytest.approx((-0.4, -0.4), abs=1e-6)
    assert by_id["p6"].r_m == pytest.approx(0.0, abs=1e-6)
    assert result.refined is not None
    assert result.chosen == choose_transform(result.supplied.rmse_m, result.refined.rmse_loo_m)
    assert result.alignment_error_m == published_error(result.error_basis_m)
    assert result.alignment_error_m >= 2.0

    # Printed summary: residual table, raw RMSEs and the published error on separate lines.
    assert "p1" in text and "dE (m)" in text
    assert "supplied   RMSE" in text
    assert "refined    RMSE in-sample" in text and "leave-one-out" in text
    assert "published alignment_error_m:" in text and "this is not an RMSE" in text
    assert "possible outliers:" in text


def test_record_is_written_with_everything_needed_to_recompute(tmp_path: Path) -> None:
    paths = build(tmp_path)
    result, _ = run(paths)
    record = json.loads(paths.alignment_record(SOURCE).read_text())
    control_bytes = paths.control_file(SOURCE).read_bytes()
    assert record["control_sha256"] == hashlib.sha256(control_bytes).hexdigest()
    assert record["control_file"] == f"data/control/{SOURCE}.json"
    assert record["measured_at"] == "2026-11-13T12:00:00Z"
    assert record["tool_version"] == "0.1.0"
    assert record["status"] == "measured"
    assert record["source"] == SOURCE
    assert record["reference_sources"] == [
        "present_toronto_building_outlines_2026",
        "present_toronto_intersections_2026",
    ]
    assert record["source_pixel_size_m"] == pytest.approx(0.2)
    assert record["supplied"]["crs"] == "EPSG:26917"
    assert record["alignment_error_m"] == result.alignment_error_m
    assert record["error_rule"] == {"multiplier": 2.0, "floor_m": 2.0, "round_up_to_m": 0.1}
    recomputed = published_error(record["error_basis_m"])
    assert record["alignment_error_m"] == recomputed
    assert not list(paths.alignment_dir.glob("*.tmp"))


def test_unchanged_control_file_gives_same_record_apart_from_time(tmp_path: Path) -> None:
    paths = build(tmp_path)
    run(paths)
    first = json.loads(paths.alignment_record(SOURCE).read_text())
    run(paths)
    second = json.loads(paths.alignment_record(SOURCE).read_text())
    assert first == second


def test_moved_reference_refuses_and_writes_nothing(tmp_path: Path) -> None:
    paths = build(tmp_path)
    doc = json.loads(paths.control_file(SOURCE).read_text())
    doc["points"][2]["reference"][0] += 0.5
    paths.control_file(SOURCE).write_text(json.dumps(doc))
    with pytest.raises(PipelineError, match="control point p3"):
        run(paths)
    assert not paths.alignment_record(SOURCE).exists()


def test_unregistered_reference_source_refused(tmp_path: Path) -> None:
    paths = build(tmp_path)
    doc = json.loads(paths.control_file(SOURCE).read_text())
    doc["points"][0]["reference_source"] = "present_toronto_unlisted_2026"
    paths.control_file(SOURCE).write_text(json.dumps(doc))
    with pytest.raises(PipelineError, match="control point p1"):
        run(paths)


def test_missing_present_layer_refused(tmp_path: Path) -> None:
    paths = build(tmp_path)
    paths.present_layer("present_toronto_intersections_2026").unlink()
    with pytest.raises(PipelineError, match="no present layer"):
        run(paths)
    assert not paths.alignment_record(SOURCE).exists()


def test_fewer_than_three_points_refused_and_nothing_written(tmp_path: Path) -> None:
    paths = build(tmp_path)
    doc = json.loads(paths.control_file(SOURCE).read_text())
    doc["points"] = doc["points"][:2]
    paths.control_file(SOURCE).write_text(json.dumps(doc))
    with pytest.raises(PipelineError, match="at least 3"):
        run(paths)
    assert not paths.alignment_record(SOURCE).exists()


def test_exactly_three_points_gives_supplied_only(tmp_path: Path) -> None:
    paths = build(tmp_path)
    doc = json.loads(paths.control_file(SOURCE).read_text())
    doc["points"] = doc["points"][:3]
    paths.control_file(SOURCE).write_text(json.dumps(doc))
    result, text = run(paths)
    assert result.refined is None and result.chosen == "supplied"
    assert "refined    not computed" in text
    assert "refined" not in json.loads(paths.alignment_record(SOURCE).read_text())


def test_missing_control_file(tmp_path: Path) -> None:
    paths = build(tmp_path)
    paths.control_file(SOURCE).unlink()
    with pytest.raises(PipelineError, match="No control file"):
        run(paths)


def test_unregistered_source_refused(tmp_path: Path) -> None:
    paths = build(tmp_path)
    with pytest.raises(PipelineError, match="not in the Registry"):
        run_align_check(paths, load_registry(paths.sources_json), "fip_v3_1911_999", NOW, print)


def test_bias_in_supplied_georeferencing_is_measured(tmp_path: Path) -> None:
    # Shift the raster 3 m east: the points' references stay put, so supplied RMSE is about 3 m
    # and the published error cannot be the 2 m floor.
    paths = build(tmp_path)
    write_geotiff(
        paths.raw / SOURCE / "plate.tif",
        (0.2, 0.0, 630003.0, 0.0, -0.2, 4834000.0),
        width=1000,
        height=750,
    )
    result, _ = run(paths)
    assert result.supplied.rmse_m > 2.9
    assert result.refined is not None and result.chosen == "refined"
    assert result.error_basis_m == result.refined.rmse_loo_m
    assert result.alignment_error_m >= 2.0


def test_cli_align_check(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    paths = build(tmp_path)
    assert main(["--root", str(paths.root), "align-check", SOURCE], now=lambda: NOW) == 0
    out = capsys.readouterr().out
    assert "published alignment_error_m" in out
    assert paths.alignment_record(SOURCE).exists()
