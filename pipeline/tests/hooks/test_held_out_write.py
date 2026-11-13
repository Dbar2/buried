"""The held-out write hook (spec 02 task 17.2)."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from buried_pipeline.hooks.held_out_write import BLOCK_EXIT, decide, main
from buried_pipeline.paths import find_repo_root

ROOT = find_repo_root(Path(__file__))
PARAMS = "pipeline/buried_pipeline/extract/params/v2.json"
FIXTURE = "pipeline/tests/fixtures/extract/f1/expected.json"
MAP_AREA = "data/control/map_area/fip_v3_1935_229.json"
PLATE = "fip_v3_1935_232"


def event(**tool_input: str) -> dict[str, object]:
    return {"hook_event_name": "PreToolUse", "tool_name": "write", "tool_input": tool_input}


def test_a_params_write_that_mentions_the_plate_is_blocked() -> None:
    message = decide(event(path=PARAMS, text=f'{{"tuned_on": ["{PLATE}"]}}'), ROOT)
    assert message is not None
    assert message.startswith(f"Blocked: {PARAMS} is an extraction tuning file")
    assert "never used to tune extraction" in message


def test_a_fixture_write_is_blocked_by_its_path_alone() -> None:
    path = "pipeline/tests/fixtures/extract/crop_1935-232/fixture.json"
    assert decide(event(path=path, text="{}"), ROOT) is not None


def test_a_partial_edit_is_blocked_by_new_str() -> None:
    assert decide(event(path=PARAMS, oldStr="x", newStr="tuned on 1935_232"), ROOT) is not None


@pytest.mark.parametrize("key", ["text", "content", "file_text", "newStr", "new_str"])
def test_every_text_field_is_read(key: str) -> None:
    assert decide(event(**{"file_path": FIXTURE, key: "FIP_V3_1935_232"}), ROOT) is not None


def test_the_map_area_folder_is_guarded_too() -> None:
    assert decide(event(path=MAP_AREA, text=f'{{"source": "{PLATE}"}}'), ROOT) is not None
    assert decide(event(path=f"data/control/map_area/{PLATE}.json", text="{}"), ROOT) is not None


def test_a_write_in_those_folders_that_does_not_mention_the_plate_is_allowed() -> None:
    assert decide(event(path=PARAMS, text='{"tuned_on": ["fip_v3_1911_229"]}'), ROOT) is None
    assert decide(event(path=FIXTURE, newStr="1935_229"), ROOT) is None


def test_a_write_elsewhere_that_mentions_the_plate_is_allowed() -> None:
    assert decide(event(path="data/sources.json", text=f'{{"id": "{PLATE}"}}'), ROOT) is None
    assert decide(event(path="pipeline/buried_pipeline/extract/params.py", text=PLATE), ROOT) is None


def test_a_relative_path_is_resolved_against_the_repository_root() -> None:
    # The hook runs with its working directory in pipeline/, but paths are the agent's.
    assert decide(event(path=PARAMS, text=PLATE), ROOT) is not None
    absolute = str(ROOT / PARAMS)
    assert decide(event(path=absolute, text=PLATE), ROOT) is not None
    assert decide(event(path="../" + PARAMS, text=PLATE), ROOT / "pipeline") is None
    outside = str(ROOT.parent / PARAMS)
    assert decide(event(path=outside, text=PLATE), ROOT) is None


def test_the_first_path_key_wins() -> None:
    assert decide(event(path="README.md", file_path=PARAMS, text=PLATE), ROOT) is None


def test_a_flat_event_without_tool_input_is_read() -> None:
    assert decide({"path": PARAMS, "text": PLATE}, ROOT) is not None


def test_main_exits_2_and_writes_the_message(capsys: pytest.CaptureFixture[str]) -> None:
    raw = json.dumps(event(path=PARAMS, text=PLATE))
    assert main(raw, ROOT) == BLOCK_EXIT == 2
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "Blocked:" in captured.err


def test_main_allows_quietly(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(json.dumps(event(path="README.md", text=PLATE)), ROOT) == 0
    captured = capsys.readouterr()
    assert captured.out == "" and captured.err == ""


@pytest.mark.parametrize("raw", ["", "not json", "[1, 2]", "{}", '{"tool_input": {"x": 1}}', "null"])
def test_unreadable_input_warns_once_and_allows(raw: str, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(raw, ROOT) == 0
    captured = capsys.readouterr()
    assert captured.out == ""
    assert len(captured.err.strip().splitlines()) == 1


def test_the_module_runs_as_the_hook_command_runs_it() -> None:
    raw = json.dumps(event(path=PARAMS, text=PLATE))
    done = subprocess.run(
        [sys.executable, "-m", "buried_pipeline.hooks.held_out_write"],
        input=raw, capture_output=True, text=True, cwd=ROOT / "pipeline", check=False,
    )  # fmt: skip
    assert done.returncode == 2
    assert "Blocked:" in done.stderr
