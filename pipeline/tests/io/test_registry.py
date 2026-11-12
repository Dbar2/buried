from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from buried_pipeline.errors import PipelineError
from buried_pipeline.io.registry import load_registry, parse_registry
from buried_pipeline.paths import find_repo_root
from buried_pipeline.schema_version import SCHEMA_VERSION
from tests.conftest import SOURCES_DOC


def doc() -> dict:
    return copy.deepcopy(SOURCES_DOC)


def test_parses_fixture_registry() -> None:
    registry = parse_registry(doc())
    assert registry.get("fip_v3_1911_229").year_to == 1914
    assert [s.id for s in registry.by_type("fire_insurance_plan")] == [
        "fip_v3_1911_229",
        "fip_v3_1935_229",
    ]


def test_unknown_source_is_an_error() -> None:
    with pytest.raises(PipelineError, match="not in the Registry"):
        parse_registry(doc()).get("fip_v3_1911_999")


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda d: d["sources"].append(copy.deepcopy(d["sources"][0])), "duplicate"),
        (lambda d: d["sources"][0].update(type="map"), "unknown type"),
        (lambda d: d["sources"][0].update(id="Bad-Id"), "snake_case"),
        (lambda d: d["sources"][0].update(year_from=1999), "after year_to"),
        (lambda d: d["sources"][0].update(year_from=None), "only for present_day_reference"),
        (lambda d: d["sources"][0].update(rights_checked_on="10/11/2026"), "ISO date"),
        (lambda d: d["sources"][0].update(attribution_status="maybe"), "attribution_status"),
        (lambda d: d["sources"][0].update(extra=1), "unknown fields"),
        (lambda d: d["sources"][0].pop("title"), "missing fields"),
        (lambda d: d["sources"][0].update(held_out="no"), "held_out"),
    ],
)
def test_rejects_bad_sources(mutate, message: str) -> None:
    d = doc()
    mutate(d)
    with pytest.raises(PipelineError, match=message):
        parse_registry(d)


def test_present_source_may_have_null_year_from() -> None:
    d = doc()
    d["sources"][2]["year_from"] = None
    assert parse_registry(d).get("present_toronto_intersections_2026").year_from is None


def test_missing_and_invalid_files(tmp_path: Path) -> None:
    with pytest.raises(PipelineError, match="not found"):
        load_registry(tmp_path / "nope.json")
    bad = tmp_path / "bad.json"
    bad.write_text("{", encoding="utf-8")
    with pytest.raises(PipelineError, match="not valid JSON"):
        load_registry(bad)


def test_committed_registry_is_valid_and_consistent() -> None:
    root = find_repo_root(Path(__file__).parent)
    registry = load_registry(root / "data" / "sources.json")
    plates = registry.by_type("fire_insurance_plan")
    assert len(plates) == 4
    assert sum(p.held_out for p in plates) == 1
    assert all(p.rights_checked_on == "2026-11-10" for p in plates)
    present = registry.by_type("present_day_reference")
    assert len(present) == 4
    assert all(p.rights_checked_on == "2026-11-12" for p in present)
    assert all(p.year_to == 2026 for p in present)
    raw = json.loads((root / "data" / "sources.json").read_text(encoding="utf-8"))
    assert raw["schema_version"] == SCHEMA_VERSION
