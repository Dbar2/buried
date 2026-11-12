"""The committed `data/project.json` (spec 01 task 10, requirements 7.1 to 7.4 and 7.6)."""

from __future__ import annotations

import json
from pathlib import Path

from buried_pipeline.paths import find_repo_root
from buried_pipeline.validate.schema import load_schema

ROOT = find_repo_root(Path(__file__))
PROJECT = json.loads((ROOT / "data" / "project.json").read_text(encoding="utf-8"))


def test_project_file_satisfies_the_schema() -> None:
    assert load_schema(ROOT).issues("project", PROJECT) == []


def test_origin_is_a_multiple_of_100_m_inside_the_bounds() -> None:
    o, b = PROJECT["origin"], PROJECT["bounds"]
    assert o["easting"] % 100 == 0 and o["northing"] % 100 == 0
    assert b["min_e"] <= o["easting"] <= b["max_e"]
    assert b["min_n"] <= o["northing"] <= b["max_n"]


def test_bounds_are_rounded_outward_to_100_m() -> None:
    assert all(v % 100 == 0 for v in PROJECT["bounds"].values())


def test_eras_are_the_four_at_submission() -> None:
    eras = {e["id"]: (e["year_from"], e["year_to"]) for e in PROJECT["eras"]}
    assert eras == {"1911": (1911, 1914), "1935": (1935, 1935), "1947": (1947, 1947),
                    "today": (2026, 2026)}
    assert next(e for e in PROJECT["eras"] if e["id"] == "1911")["label"] == (
        "1911 (revised to 1914)"
    )


def test_present_layer_clip_bounds_are_the_project_bounds() -> None:
    layer = json.loads(
        (ROOT / "data" / "present" / "present_toronto_intersections_2026.geojson").read_text()
    )
    assert layer["clip_bounds"] == PROJECT["bounds"]


def test_the_origin_note_states_the_derivation() -> None:
    note = PROJECT["origin_note"]
    assert "buried inspect --propose-origin" in note and "rounded down" in note
