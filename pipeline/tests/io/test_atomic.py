from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from buried_pipeline.io import atomic
from buried_pipeline.io.atomic import atomic_write_bytes, atomic_write_json, atomic_write_text


def test_writes_and_creates_parents(tmp_path: Path) -> None:
    target = tmp_path / "a" / "b" / "file.json"
    atomic_write_json(target, {"x": 1})
    assert json.loads(target.read_text()) == {"x": 1}
    assert target.read_text().endswith("\n")


def test_replaces_existing_file(tmp_path: Path) -> None:
    target = tmp_path / "f.txt"
    atomic_write_text(target, "old")
    atomic_write_text(target, "new")
    assert target.read_text() == "new"


def test_failure_leaves_original_and_no_temp_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "f.txt"
    atomic_write_text(target, "original")

    def boom(src: object, dst: object) -> None:
        raise OSError("disk on fire")

    monkeypatch.setattr(atomic.os, "replace", boom)
    with pytest.raises(OSError):
        atomic_write_bytes(target, b"partial")
    monkeypatch.undo()
    assert target.read_text() == "original"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["f.txt"]


def test_no_temp_file_left_after_success(tmp_path: Path) -> None:
    atomic_write_text(tmp_path / "f.txt", "x")
    assert os.listdir(tmp_path) == ["f.txt"]
