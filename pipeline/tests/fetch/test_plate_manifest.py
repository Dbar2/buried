"""`buried manifest`: the committed plate manifest from `data/raw/manifest.json`."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from buried_pipeline.cli import main
from buried_pipeline.errors import PipelineError
from buried_pipeline.fetch.manifest import file_record, read_manifest, write_manifest
from buried_pipeline.fetch.plate_manifest import build_plate_manifest, run_manifest
from buried_pipeline.io.registry import load_registry
from buried_pipeline.paths import Paths
from tests.validate.builders import P1911, P1935, errors_for, minimal_dataset, registry

AERIAL = "aerial_1947_s0000_fl0000_it0000h"


def make_root(tmp_path: Path) -> Paths:
    root = tmp_path / "repo"
    (root / ".kiro").mkdir(parents=True)
    paths = Paths(root)
    paths.data.mkdir()
    paths.sources_json.write_text(json.dumps(registry()), encoding="utf-8")
    entries: dict[str, dict[str, Any]] = {}
    for sid in (P1935, P1911, AERIAL):  # written out of order on purpose
        folder = paths.raw_source_dir(sid)
        folder.mkdir(parents=True)
        zip_path = folder / f"{sid}.zip"
        zip_path.write_bytes(f"zip of {sid}".encode())
        tif = folder / f"{sid}.tif"
        tif.write_bytes(f"raster of {sid}".encode())
        tfw = folder / f"{sid}.tfw"
        tfw.write_bytes(b"1\n0\n0\n-1\n0\n0\n")
        entries[sid] = {
            "source": sid,
            "url": f"https://example.invalid/{sid}.zip",
            "retrieved_at": "2026-11-13T01:00:00Z",
            "zip": file_record(paths.raw, zip_path),
            "files": [file_record(paths.raw, tif), file_record(paths.raw, tfw)],
        }
    write_manifest(paths.manifest, entries)
    return paths


@pytest.fixture
def paths(tmp_path: Path) -> Paths:
    return make_root(tmp_path)


def run(paths: Paths) -> list[str]:
    lines: list[str] = []
    run_manifest(paths, load_registry(paths.sources_json), lines.append)
    return lines


def test_the_manifest_holds_each_registered_plate_and_nothing_else(paths: Paths) -> None:
    lines = run(paths)
    doc = json.loads(paths.plate_manifest.read_text(encoding="utf-8"))
    assert doc["version"] == 1
    assert [e["source"] for e in doc["entries"]] == [P1911, P1935]  # sorted, no aerial
    first = doc["entries"][0]
    assert [f["path"] for f in first["files"]] == [f"{P1911}/{P1911}.tfw", f"{P1911}/{P1911}.tif"]
    assert first["zip"]["path"] == f"{P1911}/{P1911}.zip"
    assert len(first["zip"]["sha256"]) == 64
    assert lines[0].startswith("wrote data/plate_manifest.json: 2 plates")


def test_the_file_is_canonical_and_a_second_run_gives_the_same_bytes(paths: Paths) -> None:
    run(paths)
    first = paths.plate_manifest.read_bytes()
    assert first.decode().endswith("}\n")
    run(paths)
    assert paths.plate_manifest.read_bytes() == first


def test_the_file_is_read_by_the_manifest_reader_and_passes_validate(paths: Paths) -> None:
    run(paths)
    assert set(read_manifest(paths.plate_manifest)) == {P1911, P1935}
    doc = json.loads(paths.plate_manifest.read_text(encoding="utf-8"))
    found = [e for e in errors_for({**minimal_dataset(), "data/plate_manifest.json": doc})
             if e.path == "data/plate_manifest.json"]  # fmt: skip
    assert found == []


def test_a_plate_with_no_raw_entry_is_named_and_nothing_is_written(paths: Paths) -> None:
    entries = read_manifest(paths.manifest)
    del entries[P1935]
    write_manifest(paths.manifest, entries)
    with pytest.raises(PipelineError, match=rf"{P1935}: no entry"):
        run(paths)
    assert not paths.plate_manifest.exists()


def test_a_raw_file_that_changed_since_it_was_recorded_is_refused(paths: Paths) -> None:
    (paths.raw_source_dir(P1911) / f"{P1911}.tif").write_bytes(b"something else")
    with pytest.raises(PipelineError, match="does not match its manifest"):
        run(paths)
    assert not paths.plate_manifest.exists()


def test_an_existing_file_is_left_alone_when_the_run_is_refused(paths: Paths) -> None:
    run(paths)
    before = paths.plate_manifest.read_bytes()
    (paths.raw_source_dir(P1911) / f"{P1911}.tif").write_bytes(b"something else")
    with pytest.raises(PipelineError):
        run(paths)
    assert paths.plate_manifest.read_bytes() == before


def test_a_url_that_is_not_the_registrys_is_refused(paths: Paths) -> None:
    raw = read_manifest(paths.manifest)
    raw[P1911]["url"] = "https://example.invalid/other.zip"
    with pytest.raises(PipelineError, match="not the Registry's"):
        build_plate_manifest(raw, load_registry(paths.sources_json))


def test_the_command_runs_from_the_cli(paths: Paths, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--root", str(paths.root), "manifest"]) == 0
    assert "wrote data/plate_manifest.json" in capsys.readouterr().out
    assert paths.plate_manifest.is_file()
