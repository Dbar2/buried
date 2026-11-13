"""`data/plate_manifest.json` under `buried validate`: shape and the rules against the registry."""

from __future__ import annotations

import copy
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from buried_pipeline.validate.errors import ValidationError
from tests.validate.builders import P1911, P1935, errors_for, minimal_dataset, registry, source

KEY = "data/plate_manifest.json"
SHA_A, SHA_B, SHA_C = "a" * 64, "b" * 64, "c" * 64


def entry(sid: str, **over: Any) -> dict[str, Any]:
    e: dict[str, Any] = {
        "source": sid,
        "url": f"https://example.invalid/{sid}.zip",
        "retrieved_at": "2026-11-13T01:00:00Z",
        "zip": {"path": f"{sid}/{sid}.zip", "bytes": 1000, "sha256": SHA_A},
        "files": [
            {"path": f"{sid}/{sid}.tfw", "bytes": 120, "sha256": SHA_B},
            {"path": f"{sid}/{sid}.tif", "bytes": 900, "sha256": SHA_C},
        ],
    }
    e.update(over)
    return e


def manifest(*entries: dict[str, Any]) -> dict[str, Any]:
    return {"version": 1, "entries": list(entries) or [entry(P1911), entry(P1935)]}


def dataset(doc: dict[str, Any]) -> dict[str, Any]:
    return {**minimal_dataset(), KEY: doc}


def problems(doc: dict[str, Any]) -> list[ValidationError]:
    return [e for e in errors_for(dataset(doc)) if e.path == KEY]


def reasons(doc: dict[str, Any]) -> str:
    return " | ".join(e.reason for e in problems(doc))


def test_a_manifest_of_the_registered_plates_is_valid() -> None:
    assert problems(manifest()) == []


def test_a_missing_plate_is_named() -> None:
    assert f"the registered plate {P1935} has no entry" in reasons(manifest(entry(P1911)))


def test_an_entry_for_a_source_that_is_not_a_registered_plate_is_refused() -> None:
    doc = manifest(entry(P1911), entry(P1935), entry("aerial_1947_s0000_fl0000_it0000h"))
    assert "not a registered fire insurance plate" in reasons(doc)
    unknown = manifest(entry(P1911), entry(P1935), entry("fip_v3_1911_999"))
    assert "fip_v3_1911_999 is not a registered" in reasons(unknown)


def test_an_entry_listed_twice_is_refused() -> None:
    assert "more than one entry" in reasons(manifest(entry(P1911), entry(P1911), entry(P1935)))


def test_the_url_must_be_the_registered_one() -> None:
    doc = manifest(entry(P1911, url="https://example.invalid/other.zip"), entry(P1935))
    assert "not the one registered" in reasons(doc)


def test_files_must_lie_under_their_source_once() -> None:
    other = entry(P1911)
    other["files"][0]["path"] = f"{P1935}/{P1911}.tfw"
    assert "is not a file under" in reasons(manifest(other, entry(P1935)))
    dup = entry(P1911)
    dup["files"].append(copy.deepcopy(dup["files"][0]))
    assert "listed twice" in reasons(manifest(dup, entry(P1935)))
    up = entry(P1911)
    up["files"][0]["path"] = f"{P1911}/../{P1935}/x.tfw"
    assert "is not a file under" in reasons(manifest(up, entry(P1935)))


def test_the_zip_must_be_the_file_the_url_names() -> None:
    bad = entry(P1911)
    bad["zip"]["path"] = f"{P1911}/something_else.zip"
    assert "the zip is not the file the URL names" in reasons(manifest(bad, entry(P1935)))


def test_exactly_one_raster_must_be_listed() -> None:
    none = entry(P1911)
    none["files"] = [none["files"][0]]
    assert "exactly one raster" in reasons(manifest(none, entry(P1935)))
    two = entry(P1911)
    two["files"].append({"path": f"{P1911}/second.jpg", "bytes": 5, "sha256": SHA_A})
    assert "exactly one raster" in reasons(manifest(two, entry(P1935)))
    thumb = entry(P1911)
    thumb["files"].append({"path": f"{P1911}/thumb.jpg", "bytes": 5, "sha256": SHA_A})
    assert problems(manifest(thumb, entry(P1935))) == []  # a thumbnail is not the plate


def test_entries_must_be_sorted_by_source() -> None:
    assert "sorted by source id" in reasons(manifest(entry(P1935), entry(P1911)))


@pytest.mark.parametrize(
    "mutate",
    [
        lambda d: d.update(version=2),
        lambda d: d.update(extra=1),
        lambda d: d["entries"].clear(),
        lambda d: d["entries"][0].update(extra=1),
        lambda d: d["entries"][0]["zip"].update(sha256="xyz"),
        lambda d: d["entries"][0]["zip"].update(bytes=0),
        lambda d: d["entries"][0]["files"].clear(),
        lambda d: d["entries"][0].update(retrieved_at="yesterday"),
        lambda d: d["entries"][0].update(url="http://example.invalid/x.zip"),
        lambda d: d["entries"][0]["files"][0].update(path="../x.tif"),
    ],
)
def test_a_manifest_of_the_wrong_shape_is_refused(mutate: Any) -> None:
    doc = manifest()
    mutate(doc)
    assert problems(doc) != []


def test_a_registry_with_another_plate_needs_its_entry() -> None:
    ds = dataset(manifest())
    ds["data/sources.json"] = registry()
    ds["data/sources.json"]["sources"].append(source("fip_v3_1911_232"))
    found = [e for e in errors_for(ds) if e.path == KEY]
    assert any("fip_v3_1911_232 has no entry" in e.reason for e in found)


json_values = st.recursive(
    st.none() | st.booleans() | st.integers() | st.text(max_size=8),
    lambda inner: st.lists(inner, max_size=3) | st.dictionaries(st.text(max_size=6), inner,
                                                                  max_size=4),
    max_leaves=12,
)


@settings(max_examples=60, deadline=None)
@given(doc=json_values)
def test_any_document_gets_an_answer_and_never_a_crash(doc: Any) -> None:
    # A file that is not an object, or is the wrong shape, is reported against its own path.
    found = [e for e in errors_for(dataset(doc)) if e.path == KEY]
    assert found != []
