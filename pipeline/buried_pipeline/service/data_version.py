"""The data version rule (spec 04 design "Data version"). Pure over `(path, bytes)` pairs.

    data_version = lowercase hex SHA-256 of the UTF-8 text made of one line per file:
        "<path relative to data/>\\t<lowercase hex SHA-256 of the file's bytes>\\n"
    for every file in project.json, sources.json, evidence/*.geojson, present/*.geojson,
    control/*.json, alignment/*.json, tiles/*.json, sorted by path (byte order).
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterable
from pathlib import Path

# Directory (relative to data/) and the suffix of the files counted in it.
DIRECTORIES = (
    ("evidence", ".geojson"),
    ("present", ".geojson"),
    ("control", ".json"),
    ("alignment", ".json"),
    ("tiles", ".json"),
)
TOP_LEVEL = ("project.json", "sources.json")


def data_version(files: Iterable[tuple[str, bytes]]) -> str:
    ordered = sorted(files, key=lambda item: item[0].encode("utf-8"))
    text = "".join(f"{path}\t{hashlib.sha256(content).hexdigest()}\n" for path, content in ordered)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def canon_files(data_dir: Path) -> list[tuple[str, bytes]]:
    """The files the rule counts, as `(path relative to data/, bytes)`."""
    found: list[tuple[str, bytes]] = []
    for name in TOP_LEVEL:
        p = data_dir / name
        if p.is_file():
            found.append((name, p.read_bytes()))
    for directory, suffix in DIRECTORIES:
        d = data_dir / directory
        if d.is_dir():
            found.extend(
                (f"{directory}/{p.name}", p.read_bytes())
                for p in sorted(d.iterdir())
                if p.is_file() and p.suffix == suffix
            )
    return found


def data_version_of(data_dir: Path) -> str:
    return data_version(canon_files(data_dir))
