"""The held-out guard for extraction (spec 02 task 7.2, requirements 9.1 to 9.3).

The held-out plate is processed live in the demo. No parameter set and no tuning fixture may be
derived from it, name it, or sit under a path that names it. The guard is a pure function over two
directories so the tests can plant bad files in a temp dir; the real test runs it on the committed
`extract/params/` and `tests/fixtures/extract/` and passes when the fixture directory is empty or
missing.
"""

from __future__ import annotations

import json
from pathlib import Path

from buried_pipeline.extract import params as params_module
from buried_pipeline.extract.params import HELD_OUT_PATTERNS, PARAMS_DIR, TUNING_SOURCES

HELD_OUT = "fip_v3_1935_232"
FORBIDDEN_TEXT = HELD_OUT_PATTERNS
FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "extract"


def guard_problems(
    params_dir: Path,
    fixtures_dir: Path,
    tuning_sources: tuple[str, ...] = TUNING_SOURCES,
) -> list[str]:
    problems: list[str] = []

    if set(tuning_sources) != {"fip_v3_1911_229", "fip_v3_1935_229"}:
        problems.append(f"TUNING_SOURCES is {tuning_sources!r}, not the two plate 229 editions")

    if params_dir.is_dir():
        for path in sorted(params_dir.glob("*.json")):
            try:
                doc = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                problems.append(f"{path.name}: not valid JSON")
                continue
            tuned_on = doc.get("tuned_on") if isinstance(doc, dict) else None
            if not isinstance(tuned_on, list) or not set(tuned_on) <= set(tuning_sources):
                problems.append(f"{path.name}: tuned_on {tuned_on!r} is not a subset of the tuning plates")

    if fixtures_dir.is_dir():
        for fixture in sorted(p for p in fixtures_dir.iterdir() if p.is_dir()):
            meta = fixture / "fixture.json"
            if not meta.is_file():
                problems.append(f"{fixture.name}: no fixture.json")
                continue
            try:
                source = json.loads(meta.read_text(encoding="utf-8")).get("source")
            except (json.JSONDecodeError, AttributeError):
                problems.append(f"{fixture.name}: fixture.json is not a JSON object")
                continue
            if source not in tuning_sources:
                problems.append(f"{fixture.name}: source {source!r} is not a tuning plate")

    for directory in (params_dir, fixtures_dir):
        if not directory.is_dir():
            continue
        for path in sorted(p for p in directory.rglob("*") if p.is_file()):
            rel = path.relative_to(directory).as_posix()
            if any(token in rel for token in FORBIDDEN_TEXT):
                problems.append(f"{directory.name}/{rel}: the path names the held-out plate")
                continue
            data = path.read_bytes()
            for token in FORBIDDEN_TEXT:
                if token.encode() in data:
                    problems.append(f"{directory.name}/{rel}: the content mentions {token}")
                    break
    return problems


# --- the real guard -------------------------------------------------------------------------------


def test_the_committed_parameter_sets_and_fixtures_pass_the_guard() -> None:
    assert guard_problems(PARAMS_DIR, FIXTURES_DIR) == []


def test_the_held_out_patterns_are_defined_once() -> None:
    assert HELD_OUT_PATTERNS == ("fip_v3_1935_232", "1935_232", "1935-232")
    package = Path(params_module.__file__).parent.parent
    for path in package.rglob("*.py"):
        if path.name == "params.py":
            continue
        assert "HELD_OUT_PATTERNS =" not in path.read_text(encoding="utf-8"), path.name


def test_tuning_sources_are_the_two_plate_229_editions() -> None:
    assert TUNING_SOURCES == ("fip_v3_1911_229", "fip_v3_1935_229")


def test_tuning_sources_are_defined_once() -> None:
    # The guard imports the constant; a second definition elsewhere in the package would drift.
    package = Path(params_module.__file__).parent
    for path in package.rglob("*.py"):
        if path.name == "params.py":
            continue
        assert "TUNING_SOURCES =" not in path.read_text(encoding="utf-8"), path.name


# --- the guard notices planted problems -----------------------------------------------------------


def test_an_empty_or_missing_fixture_directory_passes(tmp_path: Path) -> None:
    (tmp_path / "params").mkdir()
    (tmp_path / "fixtures").mkdir()
    assert guard_problems(tmp_path / "params", tmp_path / "fixtures") == []
    assert guard_problems(tmp_path / "params", tmp_path / "nope") == []


def test_wrong_tuning_sources_fail(tmp_path: Path) -> None:
    problems = guard_problems(tmp_path, tmp_path, ("fip_v3_1911_229", HELD_OUT))
    assert any("TUNING_SOURCES" in p for p in problems)


def test_a_parameter_set_tuned_on_another_plate_fails(tmp_path: Path) -> None:
    (tmp_path / "bad.json").write_text(
        json.dumps({"id": "bad", "tuned_on": ["fip_v3_1911_232"]}), encoding="utf-8"
    )
    (tmp_path / "missing.json").write_text(json.dumps({"id": "missing"}), encoding="utf-8")
    problems = guard_problems(tmp_path, tmp_path / "nope")
    assert len(problems) == 2
    assert all("tuned_on" in p for p in problems)


def test_a_parameter_set_naming_the_held_out_plate_fails(tmp_path: Path) -> None:
    (tmp_path / "v9.json").write_text(
        json.dumps({"id": "v9", "tuned_on": ["fip_v3_1911_229"], "note": "from 1935-232"}),
        encoding="utf-8",
    )
    problems = guard_problems(tmp_path, tmp_path / "nope")
    assert problems == [f"{tmp_path.name}/v9.json: the content mentions 1935-232"]


def test_a_fixture_without_metadata_fails(tmp_path: Path) -> None:
    (tmp_path / "f1").mkdir()
    (tmp_path / "f1" / "crop.png").write_bytes(b"png")
    assert guard_problems(tmp_path / "nope", tmp_path) == ["f1: no fixture.json"]


def test_a_fixture_from_another_plate_fails(tmp_path: Path) -> None:
    (tmp_path / "f1").mkdir()
    (tmp_path / "f1" / "fixture.json").write_text(
        json.dumps({"source": "fip_v3_1911_232"}), encoding="utf-8"
    )
    problems = guard_problems(tmp_path / "nope", tmp_path)
    assert len(problems) == 1
    assert "not a tuning plate" in problems[0]


def test_a_fixture_naming_the_held_out_plate_fails(tmp_path: Path) -> None:
    (tmp_path / "f1").mkdir()
    (tmp_path / "f1" / "fixture.json").write_text(
        json.dumps({"source": HELD_OUT}), encoding="utf-8"
    )
    problems = guard_problems(tmp_path / "nope", tmp_path)
    assert any("not a tuning plate" in p for p in problems)
    assert any("content mentions" in p for p in problems)


def test_a_path_or_binary_file_naming_the_held_out_plate_fails(tmp_path: Path) -> None:
    (tmp_path / "f1").mkdir()
    (tmp_path / "f1" / "fixture.json").write_text(
        json.dumps({"source": "fip_v3_1911_229"}), encoding="utf-8"
    )
    (tmp_path / "f1" / "crop_1935_232.png").write_bytes(b"x")
    (tmp_path / "f1" / "expected.bin").write_bytes(b"\x00\x01v3-1935-232\x02")
    problems = guard_problems(tmp_path / "nope", tmp_path)
    assert sorted(problems) == [
        f"{tmp_path.name}/f1/crop_1935_232.png: the path names the held-out plate",
        f"{tmp_path.name}/f1/expected.bin: the content mentions 1935-232",
    ]


def test_good_fixtures_and_parameter_sets_pass(tmp_path: Path) -> None:
    (tmp_path / "params").mkdir()
    (tmp_path / "params" / "v1.json").write_text(
        json.dumps({"id": "v1", "tuned_on": ["fip_v3_1911_229", "fip_v3_1935_229"]}),
        encoding="utf-8",
    )
    (tmp_path / "fixtures" / "a").mkdir(parents=True)
    (tmp_path / "fixtures" / "a" / "fixture.json").write_text(
        json.dumps({"source": "fip_v3_1935_229"}), encoding="utf-8"
    )
    assert guard_problems(tmp_path / "params", tmp_path / "fixtures") == []
