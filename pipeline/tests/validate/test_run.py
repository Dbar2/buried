"""`buried validate` end to end on a throwaway repository (spec 01 task 4.3)."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

import pytest

from buried_pipeline.cli import main
from buried_pipeline.paths import find_repo_root
from tests.validate.builders import P1911, P1935, base_dataset, feature_of

REAL_SCHEMA = find_repo_root(Path(__file__)) / "data" / "schema" / "evidence.schema.json"


def write_tree(root: Path, ds: dict[str, Any]) -> None:
    (root / ".kiro").mkdir(parents=True, exist_ok=True)
    schema_dir = root / "data" / "schema"
    schema_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy(REAL_SCHEMA, schema_dir / "evidence.schema.json")
    for rel, doc in ds.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(doc), encoding="utf-8")


def run(root: Path, *args: str) -> int:
    return main(["--root", str(root), "validate", *args])


def test_a_valid_tree_passes(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    write_tree(tmp_path, base_dataset())
    assert run(tmp_path) == 0
    assert "OK: 10 files, 3 features checked" in capsys.readouterr().out


def test_each_error_is_one_line_with_path_feature_pointer_and_reason(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    ds = base_dataset()
    feature_of(ds, P1911, 2)["properties"]["position_error_m"] = 1.0
    write_tree(tmp_path, ds)
    assert run(tmp_path) == 1
    out = capsys.readouterr().out.splitlines()
    line = next(x for x in out if "root-sum-square" in x)
    assert line.startswith(f"data/evidence/{P1911}.geojson [bld_{P1911}_0002] ")
    assert "/features/1/properties/position_error_m:" in line
    assert out[-1].startswith("FAILED: 1 errors in 1 files")


def test_explicit_paths_check_only_those_files(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    ds = base_dataset()
    feature_of(ds, P1911, 2)["properties"]["position_error_m"] = 1.0
    write_tree(tmp_path, ds)
    good = tmp_path / "data" / "evidence" / f"{P1935}.geojson"
    assert run(tmp_path, str(good)) == 0
    assert "OK: 1 files, 1 features checked" in capsys.readouterr().out
    bad = tmp_path / "data" / "evidence" / f"{P1911}.geojson"
    assert run(tmp_path, str(bad)) == 1


def test_a_single_file_is_judged_against_the_whole_tree(tmp_path: Path) -> None:
    ds = base_dataset()
    del ds[f"data/alignment/{P1935}.json"]
    write_tree(tmp_path, ds)
    # The 1935 evidence file alone still needs its alignment record, which lives elsewhere.
    assert run(tmp_path, str(tmp_path / "data" / "evidence" / f"{P1935}.geojson")) == 1


def test_invalid_json_is_reported(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    write_tree(tmp_path, base_dataset())
    (tmp_path / "data" / "control" / "broken.json").write_text("{not json", encoding="utf-8")
    assert run(tmp_path) == 1
    assert "not valid JSON" in capsys.readouterr().out


def test_a_path_outside_the_contract_is_reported(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    write_tree(tmp_path, base_dataset())
    stray = tmp_path / "data" / "notes.json"
    stray.write_text("{}", encoding="utf-8")
    assert run(tmp_path, str(stray)) == 1
    assert "not a contract file" in capsys.readouterr().out


def test_raw_work_and_schema_fixtures_are_never_read(tmp_path: Path) -> None:
    write_tree(tmp_path, base_dataset())
    for rel in ("data/raw/x/bad.json", "data/work/bad.json", "data/schema/fixtures/invalid/bad.json"):
        p = tmp_path / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("{not json", encoding="utf-8")
    assert run(tmp_path) == 0


def test_a_missing_file_is_a_pipeline_error(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    write_tree(tmp_path, base_dataset())
    assert run(tmp_path, str(tmp_path / "data" / "nope.json")) == 1
    assert "No such file" in capsys.readouterr().err


def test_a_missing_schema_is_a_pipeline_error(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    write_tree(tmp_path, base_dataset())
    (tmp_path / "data" / "schema" / "evidence.schema.json").unlink()
    assert run(tmp_path) == 1
    assert "The Schema is missing" in capsys.readouterr().err
