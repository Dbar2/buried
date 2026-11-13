"""Conformance over data/schema/studio_api_fixtures (spec 04 task 1.3, requirement 2.3).

`valid/<def>/*.json` must pass and `invalid/<def>/*.json` must fail for that `$defs` entry of the
Service API Schema. The web suite runs the same files.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from buried_pipeline.paths import find_repo_root
from buried_pipeline.service.contract import Contract

ROOT = find_repo_root(Path(__file__))
FIXTURES = ROOT / "data" / "schema" / "studio_api_fixtures"
CONTRACT = Contract(ROOT)


def fixture_files(kind: str) -> list[tuple[str, Path]]:
    out = []
    for def_dir in sorted((FIXTURES / kind).iterdir()):
        if def_dir.is_dir():
            out.extend((def_dir.name, f) for f in sorted(def_dir.glob("*.json")))
    return out


def ids(items: list[tuple[str, Path]]) -> list[str]:
    return [f"{d}/{f.stem}" for d, f in items]


VALID = fixture_files("valid")
INVALID = fixture_files("invalid")


def test_the_schema_is_a_valid_draft_2020_12_schema() -> None:
    from jsonschema import Draft202012Validator

    Draft202012Validator.check_schema(CONTRACT.studio)
    assert CONTRACT.studio["$defs"]["apiVersion"] == {
        "description": "The Service API version this schema describes.",
        "const": "1.0.0",
    }


def test_every_endpoint_body_has_a_valid_fixture() -> None:
    covered = {d for d, _ in VALID}
    required = {
        "healthResponse", "registeredPlatesResponse", "platesIndexResponse", "alignRequest",
        "extractRequest", "extractResponse", "labelsRequest", "labelsResponse", "publishRequest",
        "publishResponse", "proposalFile", "decisionsV1", "decisionsV2", "labelRead", "errorBody",
    }  # fmt: skip
    assert required <= covered


def test_fixture_directories_name_real_definitions() -> None:
    for d, _ in VALID + INVALID:
        assert d in CONTRACT.def_names


@pytest.mark.parametrize(("def_name", "path"), VALID, ids=ids(VALID))
def test_valid_fixture_passes(def_name: str, path: Path) -> None:
    assert CONTRACT.issues(def_name, json.loads(path.read_text(encoding="utf-8"))) == []


@pytest.mark.parametrize(("def_name", "path"), INVALID, ids=ids(INVALID))
def test_invalid_fixture_fails(def_name: str, path: Path) -> None:
    assert CONTRACT.issues(def_name, json.loads(path.read_text(encoding="utf-8"))) != []


def test_every_invalid_fixture_targets_a_definition_with_a_valid_fixture() -> None:
    valid_defs = {d for d, _ in VALID}
    assert {d for d, _ in INVALID} <= valid_defs


def test_invalid_fixture_names_are_lowercase_reasons() -> None:
    assert all(f.stem == f.stem.lower() and " " not in f.stem for _, f in INVALID)


def test_the_error_codes_match_the_status_table() -> None:
    from buried_pipeline.service.errors import STATUS

    assert set(CONTRACT.studio["$defs"]["errorCode"]["enum"]) == set(STATUS)
