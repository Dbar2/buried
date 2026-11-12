from __future__ import annotations

import io
import stat
import zipfile
from pathlib import Path

import pytest

from buried_pipeline.errors import PipelineError
from buried_pipeline.fetch.zipsafe import entry_problem, extract_safely
from tests.fakes import make_zip


@pytest.mark.parametrize(
    "name",
    ["a.tif", "dir/a.tif", "dir/", "a..b/c.txt", "..a/b", "a/..b", "a/b..", "v3-1911-229.tfw"],
)
def test_safe_names(name: str) -> None:
    assert entry_problem(name) is None


@pytest.mark.parametrize(
    "name",
    [
        "../x", "a/../../x", "a/..", "..", "/etc/passwd", "\\evil", "C:\\x", "C:/x", "a\\..\\x",
        "", "a\x00b", "//server/share/x",
    ],
)  # fmt: skip
def test_unsafe_names(name: str) -> None:
    assert entry_problem(name) is not None


def test_extracts_files_and_directories(tmp_path: Path) -> None:
    zip_path = tmp_path / "in.zip"
    zip_path.write_bytes(make_zip({"a.txt": b"A", "sub/b.txt": b"BB"}))
    dest = tmp_path / "out"
    dest.mkdir()
    assert extract_safely(zip_path, dest) == ["a.txt", "sub/b.txt"]
    assert (dest / "sub" / "b.txt").read_bytes() == b"BB"


def test_escaping_entry_refuses_before_writing_anything(tmp_path: Path) -> None:
    zip_path = tmp_path / "evil.zip"
    zip_path.write_bytes(make_zip({"good.txt": b"ok", "../escape.txt": b"bad"}))
    dest = tmp_path / "out"
    dest.mkdir()
    with pytest.raises(PipelineError, match="escape|'\\.\\.'"):
        extract_safely(zip_path, dest)
    assert list(dest.iterdir()) == []
    assert not (tmp_path / "escape.txt").exists()


def test_symlink_entry_refused(tmp_path: Path) -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        info = zipfile.ZipInfo("link")
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        zf.writestr(info, "/etc/passwd")
    zip_path = tmp_path / "link.zip"
    zip_path.write_bytes(buffer.getvalue())
    dest = tmp_path / "out"
    dest.mkdir()
    with pytest.raises(PipelineError, match="symbolic link"):
        extract_safely(zip_path, dest)


def test_duplicate_entries_refused(tmp_path: Path) -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        zf.writestr("a.txt", "1")
        with pytest.warns(UserWarning):
            zf.writestr("a.txt", "2")
    zip_path = tmp_path / "dup.zip"
    zip_path.write_bytes(buffer.getvalue())
    dest = tmp_path / "out"
    dest.mkdir()
    with pytest.raises(PipelineError, match="duplicate"):
        extract_safely(zip_path, dest)


def test_not_a_zip(tmp_path: Path) -> None:
    bad = tmp_path / "bad.zip"
    bad.write_bytes(b"not a zip")
    with pytest.raises(PipelineError, match="Not a valid zip"):
        extract_safely(bad, tmp_path)
