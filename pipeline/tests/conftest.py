"""Shared fixtures: a throwaway repository root with the real Registry shape."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from buried_pipeline.paths import Paths

# The real Schema, so tests of commands that validate against it use the contract itself.
REAL_SCHEMA = Path(__file__).resolve().parents[2] / "data" / "schema" / "evidence.schema.json"

SOURCES_DOC = {
    "schema_version": "1.0.0",
    "sources": [
        {
            "id": "fip_v3_1911_229",
            "type": "fire_insurance_plan",
            "title": "test plate 1911/229",
            "year_from": 1911,
            "year_to": 1914,
            "url": "https://maps.library.utoronto.ca/datapub/FIP/vol3_19111914/v3-1911-229.zip",
            "licence_note": "test",
            "attribution_line": "test attribution",
            "attribution_status": "confirmed",
            "rights_checked_on": "2026-11-10",
            "held_out": False,
        },
        {
            "id": "fip_v3_1935_229",
            "type": "fire_insurance_plan",
            "title": "test plate 1935/229",
            "year_from": 1935,
            "year_to": 1935,
            "url": "https://maps.library.utoronto.ca/datapub/FIP/vol3_1935/Georeferenced/v3-1935-229.zip",
            "licence_note": "test",
            "attribution_line": "test attribution",
            "attribution_status": "confirmed",
            "rights_checked_on": "2026-11-10",
            "held_out": False,
        },
        {
            "id": "present_toronto_intersections_2026",
            "type": "present_day_reference",
            "title": "test intersections",
            "year_from": 2025,
            "year_to": 2026,
            "url": "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=intersection-file-city-of-toronto",
            "licence_note": "Open Government Licence - Toronto",
            "attribution_line": "Contains information licensed under the Open Government Licence - Toronto.",
            "attribution_status": "confirmed",
            "rights_checked_on": "2026-11-12",
            "held_out": False,
        },
        {
            "id": "present_toronto_building_outlines_2026",
            "type": "present_day_reference",
            "title": "test building outlines",
            "year_from": 2025,
            "year_to": 2026,
            "url": "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=topographic-mapping-building-outlines",
            "licence_note": "Open Government Licence - Toronto",
            "attribution_line": "Contains information licensed under the Open Government Licence - Toronto.",
            "attribution_status": "confirmed",
            "rights_checked_on": "2026-11-12",
            "held_out": False,
        },
    ],
}


def make_root(tmp_path: Path, sources_doc: dict | None = None) -> Paths:
    root = tmp_path / "repo"
    (root / ".kiro").mkdir(parents=True)
    (root / "data").mkdir()
    (root / "data" / "sources.json").write_text(
        json.dumps(sources_doc or SOURCES_DOC), encoding="utf-8"
    )
    (root / "data" / "schema").mkdir()
    shutil.copy(REAL_SCHEMA, root / "data" / "schema" / "evidence.schema.json")
    return Paths(root)


@pytest.fixture
def paths(tmp_path: Path) -> Paths:
    return make_root(tmp_path)
