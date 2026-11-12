"""Conformance over data/schema/fixtures (spec 01 requirement 9.3, task 4.5).

`valid/<def>/*.json` must pass and `invalid/<def>/*.json` must fail for that `$defs` entry. The
TypeScript suite runs the same files. The real contract files under data/ must pass too.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from buried_pipeline.paths import find_repo_root
from buried_pipeline.validate.schema import SchemaSet, def_for_path, load_schema

ROOT = find_repo_root(Path(__file__))
FIXTURES = ROOT / "data" / "schema" / "fixtures"
SCHEMA = load_schema(ROOT)


def fixture_files(kind: str) -> list[tuple[str, Path]]:
    out = []
    for def_dir in sorted((FIXTURES / kind).iterdir()):
        for f in sorted(def_dir.glob("*.json")):
            out.append((def_dir.name, f))
    return out


def ids(items: list[tuple[str, Path]]) -> list[str]:
    return [f"{d}/{f.stem}" for d, f in items]


VALID = fixture_files("valid")
INVALID = fixture_files("invalid")


def test_every_def_has_a_valid_fixture() -> None:
    covered = {d for d, _ in VALID}
    required = {
        "featureCollection", "feature", "observation", "provenance", "sourceRegistry", "source",
        "project", "era", "controlPoints", "alignmentRecord", "tileSidecar", "link",
        "coverageArea", "presentLayer", "presentFeature",
    }  # fmt: skip
    assert required <= covered


def test_fixture_directories_name_real_definitions() -> None:
    for d, _ in VALID + INVALID:
        assert d in SCHEMA.def_names


@pytest.mark.parametrize(("def_name", "path"), VALID, ids=ids(VALID))
def test_valid_fixture_passes(def_name: str, path: Path) -> None:
    doc = json.loads(path.read_text(encoding="utf-8"))
    assert SCHEMA.issues(def_name, doc) == []


@pytest.mark.parametrize(("def_name", "path"), INVALID, ids=ids(INVALID))
def test_invalid_fixture_fails(def_name: str, path: Path) -> None:
    doc = json.loads(path.read_text(encoding="utf-8"))
    assert SCHEMA.issues(def_name, doc) != []


def test_invalid_fixture_names_are_lowercase_reasons() -> None:
    names = [f.stem for _, f in INVALID]
    assert all(n == n.lower() and " " not in n for n in names)


def real_contract_files() -> list[Path]:
    data = ROOT / "data"
    found: list[Path] = []
    for path in sorted(data.rglob("*.json*")):
        rel = path.relative_to(data).parts
        if rel[0] in ("raw", "work", "schema"):
            continue
        if def_for_path(path, data) is not None:
            found.append(path)
    return found


@pytest.mark.parametrize("path", real_contract_files(), ids=lambda p: p.name)
def test_real_contract_file_passes_the_schema(path: Path) -> None:
    def_name = def_for_path(path, ROOT / "data")
    assert def_name is not None
    doc = json.loads(path.read_text(encoding="utf-8"))
    assert SCHEMA.issues(def_name, doc) == []


def test_every_invalid_fixture_targets_a_definition_with_a_valid_fixture() -> None:
    valid_defs = {d for d, _ in VALID}
    for d, _ in INVALID:
        assert d in valid_defs


def test_schema_set_rejects_unknown_definition() -> None:
    from buried_pipeline.errors import PipelineError

    with pytest.raises(PipelineError):
        SchemaSet(SCHEMA.schema).validator("nope")
