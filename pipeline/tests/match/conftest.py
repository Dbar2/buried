"""A throwaway repository root for `buried match` tests: the committed Schema, Registry, project
file, alignment records and control files (small, read-only copies), and no evidence."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

import pytest

from buried_pipeline.paths import Paths
from buried_pipeline.publish.build import canonical_text

REPO_DATA = Path(__file__).resolve().parents[3] / "data"


def write_evidence(paths: Paths, doc: dict[str, Any]) -> Path:
    target = paths.evidence_file(doc["origin_source"])
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(canonical_text(doc), encoding="utf-8")
    return target


@pytest.fixture
def match_root(tmp_path: Path) -> Paths:
    root = tmp_path / "repo"
    (root / ".kiro").mkdir(parents=True)
    data = root / "data"
    shutil.copytree(REPO_DATA / "schema", data / "schema")
    shutil.copy(REPO_DATA / "project.json", data / "project.json")
    # The Registry as committed, minus nothing: the aerials are registered but have no alignment
    # record or tile sidecar in this root, so `match` skips them and says so.
    shutil.copy(REPO_DATA / "sources.json", data / "sources.json")
    for name in ("fip_v3_1911_229", "fip_v3_1935_229"):
        for folder in ("alignment", "control"):
            (data / folder).mkdir(exist_ok=True)
            shutil.copy(REPO_DATA / folder / f"{name}.json", data / folder / f"{name}.json")
    return Paths(root)


def read_json_file(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))
