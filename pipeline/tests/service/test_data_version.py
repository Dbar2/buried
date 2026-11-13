"""The data version rule (spec 04 task 1.2, requirement 2.6): Python half.

The shared fixture tree and its expected value are for the TypeScript half to check as well.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from hypothesis import given
from hypothesis import strategies as st

from buried_pipeline.paths import find_repo_root
from buried_pipeline.service.data_version import canon_files, data_version, data_version_of

FIXTURE = find_repo_root(Path(__file__)) / "data" / "schema" / "studio_api_fixtures" / "data_version"


def test_the_fixture_tree_gives_the_expected_value() -> None:
    expected = (FIXTURE / "expected.txt").read_text(encoding="utf-8").strip()
    assert data_version_of(FIXTURE / "tree") == expected


def test_the_rule_is_what_the_design_says_written_out_by_hand() -> None:
    def digest(rel: str) -> str:
        return hashlib.sha256((FIXTURE / "tree" / rel).read_bytes()).hexdigest()

    order = [
        "alignment/a_plate.json", "control/a_plate.json", "evidence/a_plate.geojson",
        "evidence/b_plate.geojson", "present/p_layer.geojson", "project.json", "sources.json",
        "tiles/a_plate.json",
    ]  # fmt: skip
    text = "".join(f"{rel}\t{digest(rel)}\n" for rel in order)
    assert hashlib.sha256(text.encode()).hexdigest() == data_version_of(FIXTURE / "tree")


def test_only_the_listed_files_are_counted() -> None:
    names = {p for p, _ in canon_files(FIXTURE / "tree")}
    assert "tiles/a_plate.jpg" not in names
    assert "control/map_area/a_plate.json" not in names
    assert "work/ignored.json" not in names
    assert len(names) == 8


@given(st.dictionaries(st.from_regex(r"[a-z]+/[a-z]+\.json", fullmatch=True), st.binary(), max_size=6))
def test_the_order_files_are_given_in_does_not_matter(files: dict[str, bytes]) -> None:
    items = list(files.items())
    assert data_version(items) == data_version(list(reversed(items)))


@given(st.binary(min_size=1), st.binary(min_size=1))
def test_a_changed_file_changes_the_version(a: bytes, b: bytes) -> None:
    same = data_version([("project.json", a)]) == data_version([("project.json", b)])
    assert same == (a == b)
