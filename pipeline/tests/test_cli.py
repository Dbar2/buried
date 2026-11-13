from __future__ import annotations

from pathlib import Path

import pytest

from buried_pipeline.cli import build_parser, main
from buried_pipeline.errors import PipelineError
from buried_pipeline.paths import find_repo_root
from tests.conftest import make_root


def test_all_subcommands_are_registered() -> None:
    parser = build_parser()
    sub_action = next(a for a in parser._actions if a.dest == "command")
    assert set(sub_action.choices) == {
        "fetch", "inspect", "present", "align-check", "control-crops", "tile", "extract",
        "publish", "match", "validate",
    }  # fmt: skip


def test_match_without_evidence_exits_1(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    paths = make_root(tmp_path)
    assert main(["--root", str(paths.root), "match"]) == 1
    assert "No evidence files" in capsys.readouterr().err


def test_aerial_candidates_need_inspect_reports(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    paths = make_root(tmp_path)
    assert main(["--root", str(paths.root), "fetch", "--aerial-candidates"]) == 1
    assert "No inspect report" in capsys.readouterr().err


def test_find_repo_root_walks_up(tmp_path: Path) -> None:
    (tmp_path / ".kiro").mkdir()
    deep = tmp_path / "a" / "b"
    deep.mkdir(parents=True)
    assert find_repo_root(deep) == tmp_path.resolve()


def test_find_repo_root_fails_without_kiro(tmp_path: Path) -> None:
    with pytest.raises(PipelineError):
        find_repo_root(tmp_path)


def test_root_flag_accepted_before_and_after_command(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    paths = make_root(tmp_path)
    # `inspect` with nothing fetched fails with exit 1 (a PipelineError), proving the root worked.
    assert main(["--root", str(paths.root), "inspect"]) == 1
    assert main(["inspect", "--root", str(paths.root)]) == 1
    assert "Nothing to inspect" in capsys.readouterr().err


def test_pipeline_error_exits_1_with_message(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    paths = make_root(tmp_path)
    assert main(["--root", str(paths.root), "align-check", "fip_v3_1911_229"]) == 1
    assert "No control file" in capsys.readouterr().err
