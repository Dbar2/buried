"""The parameter set loader (spec 02 task 7.1, requirements 8.4 and 9.1)."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from buried_pipeline.errors import PipelineError
from buried_pipeline.extract.params import (
    PARAMS_DIR,
    TUNING_SOURCES,
    ExtractParams,
    load_params,
    parse_params,
)

GOOD: dict[str, Any] = {
    "id": "t1",
    "tuned_on": ["fip_v3_1911_229"],
    "working_pixel_size_m": 0.12,
    "normalise": {"window_m": 40.0, "clip_limit": 2.0},
    "outline": {"max_grey": 0.3, "closing_kernel_m": 0.2},
    "tone": {
        "light_min": 0.8,
        "dark_max": 0.4,
        "hatch_min": 0.5,
        "hatch_min_density": 0.002,
        "mixed_spread": 0.2,
    },
    "text": {"max_mark_area_m2": 1.0},
    "regions": {
        "min_area_m2": 10.0,
        "max_area_m2": 8000.0,
        "hole_fill_m2": 1.0,
        "min_outline_closure": 0.5,
    },
    "simplify_tolerance_m": 0.3,
    "fixture_baseline": {"f1": {"mean_iou": 0.8, "matched_fraction": 0.9}},
}


def write(directory: Path, doc: dict[str, Any], name: str = "t1") -> None:
    (directory / f"{name}.json").write_text(json.dumps(doc), encoding="utf-8")


def test_a_good_set_loads(tmp_path: Path) -> None:
    write(tmp_path, GOOD)
    params = load_params("t1", tmp_path)
    assert isinstance(params, ExtractParams)
    assert params.id == "t1"
    assert params.tuned_on == ("fip_v3_1911_229",)
    assert params.normalise.clip_limit == 2.0
    assert params.fixture_baseline["f1"]["mean_iou"] == 0.8
    assert len(params.sha256) == 64


def test_the_sha256_follows_the_file_bytes(tmp_path: Path) -> None:
    write(tmp_path, GOOD)
    first = load_params("t1", tmp_path).sha256
    changed = copy.deepcopy(GOOD)
    changed["simplify_tolerance_m"] = 0.31
    write(tmp_path, changed)
    assert load_params("t1", tmp_path).sha256 != first


def test_tuning_sources() -> None:
    assert TUNING_SOURCES == ("fip_v3_1911_229", "fip_v3_1935_229")


@pytest.mark.parametrize("bad", ["fip_v3_1911_232", "fip_v3_1935_232", "aerial_1947_x"])
def test_tuned_on_outside_the_tuning_plates_is_refused(tmp_path: Path, bad: str) -> None:
    doc = copy.deepcopy(GOOD)
    doc["tuned_on"] = ["fip_v3_1911_229", bad]
    write(tmp_path, doc)
    with pytest.raises(PipelineError, match="not a tuning plate"):
        load_params("t1", tmp_path)


def test_tuned_on_must_be_a_list(tmp_path: Path) -> None:
    doc = copy.deepcopy(GOOD)
    doc["tuned_on"] = "fip_v3_1911_229"
    write(tmp_path, doc)
    with pytest.raises(PipelineError, match="list"):
        load_params("t1", tmp_path)


def test_placeholder_zeros_are_refused(tmp_path: Path) -> None:
    doc = copy.deepcopy(GOOD)
    doc["outline"]["max_grey"] = 0.0
    write(tmp_path, doc)
    with pytest.raises(PipelineError, match="placeholder"):
        load_params("t1", tmp_path)


def test_a_missing_section_is_refused(tmp_path: Path) -> None:
    doc = copy.deepcopy(GOOD)
    del doc["text"]
    write(tmp_path, doc)
    with pytest.raises(PipelineError, match="text"):
        load_params("t1", tmp_path)


def test_an_id_that_does_not_match_the_file_is_refused(tmp_path: Path) -> None:
    write(tmp_path, GOOD, name="t2")
    with pytest.raises(PipelineError, match="expected"):
        load_params("t2", tmp_path)


def test_a_missing_file_is_refused(tmp_path: Path) -> None:
    with pytest.raises(PipelineError, match="No parameter set"):
        load_params("nope", tmp_path)


def test_inverted_tone_thresholds_are_refused() -> None:
    doc = copy.deepcopy(GOOD)
    doc["tone"]["dark_max"] = 0.9
    with pytest.raises(PipelineError, match="dark_max"):
        parse_params(doc, "x")


def test_the_committed_v1_names_only_tuning_plates() -> None:
    doc = json.loads((PARAMS_DIR / "v1.json").read_text(encoding="utf-8"))
    assert set(doc["tuned_on"]) <= set(TUNING_SOURCES)
