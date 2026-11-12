"""The held-out guard, extended to map area files (spec 02 task 16.2, requirements 9.3 and 16).

`fip_v3_1935_232` is processed live in the demo and is made through the Studio. Nothing about it
may be committed ahead of time: no map area file for it, and no map area file that mentions it.
The guard for parameter sets and tuning fixtures (task 7.2) lives in `test_held_out.py` when that
task lands.
"""

from __future__ import annotations

from pathlib import Path

from buried_pipeline.paths import find_repo_root

HELD_OUT = "fip_v3_1935_232"
FORBIDDEN_TEXT = ("fip_v3_1935_232", "1935_232", "1935-232")


def map_area_problems(map_area_dir: Path) -> list[str]:
    """What is wrong under a `data/control/map_area/` directory with respect to the held-out
    plate. Pure with respect to the directory it is given, so the test can plant bad files."""
    problems: list[str] = []
    if not map_area_dir.is_dir():
        return problems
    for path in sorted(map_area_dir.rglob("*")):
        if not path.is_file():
            continue
        if any(token in path.as_posix() for token in FORBIDDEN_TEXT):
            problems.append(f"{path.name}: the path names the held-out plate")
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for token in FORBIDDEN_TEXT:
            if token in text:
                problems.append(f"{path.name}: the content mentions {token}")
                break
    return problems


def test_no_map_area_for_the_held_out_plate_is_committed() -> None:
    root = find_repo_root(Path(__file__))
    assert map_area_problems(root / "data" / "control" / "map_area") == []


def test_the_guard_notices_a_map_area_file_for_the_held_out_plate(tmp_path: Path) -> None:
    (tmp_path / f"{HELD_OUT}.json").write_text("{}", encoding="utf-8")
    assert map_area_problems(tmp_path) == [
        f"{HELD_OUT}.json: the path names the held-out plate"
    ]


def test_the_guard_notices_a_file_that_mentions_the_held_out_plate(tmp_path: Path) -> None:
    (tmp_path / "fip_v3_1911_229.json").write_text('{"source": "fip_v3_1935_232"}', encoding="utf-8")
    (tmp_path / "other.json").write_text('{"note": "see 1935-232"}', encoding="utf-8")
    problems = map_area_problems(tmp_path)
    assert len(problems) == 2


def test_the_guard_accepts_the_tuning_plates(tmp_path: Path) -> None:
    (tmp_path / "fip_v3_1911_229.json").write_text('{"source": "fip_v3_1911_229"}', encoding="utf-8")
    (tmp_path / "fip_v3_1935_229.json").write_text('{"source": "fip_v3_1935_229"}', encoding="utf-8")
    assert map_area_problems(tmp_path) == []


def test_a_missing_directory_is_fine(tmp_path: Path) -> None:
    assert map_area_problems(tmp_path / "nope") == []
