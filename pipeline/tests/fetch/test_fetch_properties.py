"""F1. Fetch is idempotent and contained; escaping zip entries are always refused."""

from __future__ import annotations

import tempfile
from datetime import UTC, datetime
from pathlib import Path

from hypothesis import given, settings
from hypothesis import strategies as st

from buried_pipeline.errors import PipelineError
from buried_pipeline.fetch.manifest import read_manifest, sha256_file
from buried_pipeline.fetch.plates import fetch_plates
from buried_pipeline.fetch.zipsafe import entry_problem, extract_safely
from buried_pipeline.io.registry import load_registry
from tests.conftest import SOURCES_DOC, make_root
from tests.fakes import FakeHttp, make_zip

NOW = datetime(2026, 11, 13, 12, 0, 0, tzinfo=UTC)
URL_1911 = SOURCES_DOC["sources"][0]["url"]
URL_1935 = SOURCES_DOC["sources"][1]["url"]

segment = st.text(alphabet="abcdefghijklmnopqrstuvwxyz0123456789_-.", min_size=1, max_size=8).filter(
    lambda s: s not in (".", "..")
)
safe_name = st.lists(segment, min_size=1, max_size=3).map("/".join)
file_map = st.dictionaries(safe_name, st.binary(max_size=64), min_size=1, max_size=4).filter(
    # A file and a folder cannot share a path.
    lambda m: not any(
        a != b and b.startswith(a + "/") for a in m for b in m
    )
)


def tree(root: Path) -> set[Path]:
    return {p for p in root.rglob("*") if p.is_file()}


@settings(max_examples=40, deadline=None)
@given(files_1911=file_map, files_1935=file_map)
def test_fetch_is_idempotent_and_contained(
    files_1911: dict[str, bytes], files_1935: dict[str, bytes]
) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        paths = make_root(Path(tmp))
        registry = load_registry(paths.sources_json)
        served = {URL_1911: make_zip(files_1911), URL_1935: make_zip(files_1935)}

        first = FakeHttp(files=served)
        fetch_plates(paths, registry, first, [], NOW)
        assert len(first.requests) == 2

        second = FakeHttp(files=served)
        fetch_plates(paths, registry, second, [], NOW)
        assert second.requests == []

        # Manifest hashes match the bytes on disk.
        manifest = read_manifest(paths.manifest)
        for entry in manifest.values():
            for rec in [*entry["files"], entry["zip"]]:
                assert sha256_file(paths.raw / rec["path"]) == rec["sha256"]

        # Nothing was written outside data/raw/ (apart from the repo's own scaffolding: the
        # registry and the Schema that make_root puts in place).
        scaffolding = {paths.sources_json, paths.data / "schema" / "evidence.schema.json"}
        outside = [p for p in tree(paths.root) if paths.raw not in p.parents and p not in scaffolding]
        assert outside == []


unsafe_name = st.one_of(
    st.builds(lambda parts: "/".join([*parts, ".."]), st.lists(segment, max_size=2)),
    st.builds(lambda a, b: f"{a}/../{b}", segment, segment),
    st.builds(lambda a: f"../{a}", segment),
    st.builds(lambda a: f"/{a}", segment),
    st.builds(lambda a: f"C:\\{a}", segment),
    st.builds(lambda a, b: f"{a}\\..\\{b}", segment, segment),
)


@settings(max_examples=60, deadline=None)
@given(bad=unsafe_name, good=file_map)
def test_escaping_entries_are_always_refused(bad: str, good: dict[str, bytes]) -> None:
    assert entry_problem(bad) is not None
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        zip_path = base / "evil.zip"
        zip_path.write_bytes(make_zip({**good, bad: b"payload"}))
        dest = base / "dest"
        dest.mkdir()
        try:
            extract_safely(zip_path, dest)
        except PipelineError:
            pass
        else:
            raise AssertionError(f"escaping entry {bad!r} was accepted")
        assert tree(dest) == set()  # refused before anything was written
        assert tree(base) == {zip_path}


@settings(max_examples=60, deadline=None)
@given(good=file_map)
def test_safe_entries_stay_inside_destination(good: dict[str, bytes]) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        zip_path = base / "ok.zip"
        zip_path.write_bytes(make_zip(good))
        dest = base / "dest"
        dest.mkdir()
        written = extract_safely(zip_path, dest)
        assert sorted(written) == sorted(good)
        dest_resolved = dest.resolve()
        for p in tree(dest):
            assert dest_resolved in p.resolve().parents
