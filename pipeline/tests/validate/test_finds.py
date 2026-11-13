"""`data/finds.json` (spec 06 requirement 8, task P1, property P1).

Same method as `test_checks.py`: a valid in-memory tree with the fixture file added, one thing
broken at a time, and an error that names the file and the place.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from hypothesis import given
from hypothesis import strategies as st

from tests.validate.builders import P1911, P1935, base_dataset, errors_for, feature
from tests.validate.test_checks_v110 import SQUARE_PX, with_map_area

FIXTURES = Path(__file__).parent.parent / "fixtures" / "finds"
FINDS = "data/finds.json"
EV_1911 = f"data/evidence/{P1911}.geojson"
F1 = f"bld_{P1911}_0001"
F2 = f"bld_{P1911}_0002"
REJECTED = f"bld_{P1911}_0003"
X0, Y0 = SQUARE_PX[0]
X1, Y1 = SQUARE_PX[2]


def fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


def dataset(finds: dict[str, Any] | None) -> dict[str, Any]:
    ds = with_map_area(base_dataset())
    rejected = feature(P1911, 3)
    rejected["properties"]["status"] = "rejected"
    rejected["properties"]["status_reason"] = "synthetic"
    ds[EV_1911]["features"].append(rejected)
    if finds is not None:
        ds[FINDS] = copy.deepcopy(finds)
    return ds


def finds_errors(finds: dict[str, Any]) -> list[Any]:
    return [e for e in errors_for(dataset(finds)) if e.path == FINDS]


def reading(doc: dict[str, Any], find: int = 0, index: int = 0) -> dict[str, Any]:
    return doc["finds"][find]["readings"][index]


def reasons(errors: list[Any], contains: str) -> list[Any]:
    return [e for e in errors if contains in e.reason]


def test_the_valid_fixture_passes_and_the_tree_without_it_does_too() -> None:
    assert errors_for(dataset(None)) == []
    assert finds_errors(fixture("valid")) == []


def test_a_find_with_no_reading_is_rejected() -> None:
    assert finds_errors(fixture("invalid_no_readings"))


def test_a_crop_written_as_an_array_is_rejected() -> None:
    assert finds_errors(fixture("invalid_crop_as_array"))


def test_a_repeated_id_slug_or_order_is_rejected() -> None:
    for key, other in (("id", "find_0001"), ("slug", "first-synthetic-find"), ("order", 1)):
        doc = fixture("valid")
        doc["finds"][1][key] = other
        errors = reasons(finds_errors(doc), f"{key} {other!r} repeats")
        assert [e.pointer for e in errors] == [f"/finds/1/{key}"], key


def test_an_unregistered_source_is_rejected() -> None:
    doc = fixture("valid")
    reading(doc)["source"] = "fip_v3_1999_999"
    assert reasons(finds_errors(doc), "is not in data/sources.json")


def test_a_feature_that_does_not_exist_is_rejected() -> None:
    doc = fixture("valid")
    reading(doc)["feature_id"] = f"bld_{P1911}_0099"
    assert reasons(finds_errors(doc), "is not a feature of")


def test_a_feature_that_is_not_published_is_rejected() -> None:
    doc = fixture("valid")
    reading(doc)["feature_id"] = REJECTED
    assert reasons(finds_errors(doc), "is not published")


def test_a_feature_of_another_source_is_rejected() -> None:
    doc = fixture("valid")
    reading(doc)["feature_id"] = f"bld_{P1935}_0001"
    assert reasons(finds_errors(doc), "is not a feature of") or reasons(
        finds_errors(doc), "does not belong to"
    )


def test_a_building_find_needs_a_building_feature_and_an_area_find_may_use_either() -> None:
    doc = fixture("valid")
    reading(doc)["feature_id"] = f"use_{P1911}_0001"
    assert reasons(finds_errors(doc), "a find of kind building is read from a bld feature")
    doc = fixture("valid")
    assert reasons(finds_errors(doc), "a find of kind") == []  # the area find reads a bld one


def test_a_crop_outside_the_map_area_is_rejected_on_each_side() -> None:
    sides = {
        "left": {"x": X0 - 1, "y": 300, "width": 50, "height": 50},
        "top": {"x": 200, "y": Y0 - 1, "width": 50, "height": 50},
        "right": {"x": X1 - 49, "y": 300, "width": 50, "height": 50},
        "bottom": {"x": 200, "y": Y1 - 49, "width": 50, "height": 50},
    }
    for side, crop in sides.items():
        doc = fixture("valid")
        reading(doc)["crop_px"] = crop
        assert reasons(finds_errors(doc), "not wholly inside the map area"), side


def test_a_crop_touching_the_map_area_edge_from_inside_is_accepted() -> None:
    doc = fixture("valid")
    reading(doc)["crop_px"] = {"x": X0, "y": Y0, "width": X1 - X0, "height": Y1 - Y0}
    assert finds_errors(doc) == []


def test_a_source_with_no_map_area_file_cannot_hold_a_crop() -> None:
    doc = fixture("valid")
    reading(doc)["source"] = P1935
    reading(doc)["feature_id"] = f"bld_{P1935}_0001"
    assert reasons(finds_errors(doc), "has no map area file")


def test_an_unknown_key_is_rejected() -> None:
    doc = fixture("valid")
    doc["finds"][0]["colour"] = "red"
    assert finds_errors(doc)


# --- property P1 ----------------------------------------------------------------------------------

PUBLISHED = {P1911: {F1, F2}, P1935: {f"bld_{P1935}_0001"}}
FEATURE_POOL = [F1, F2, REJECTED, f"bld_{P1911}_0099", f"use_{P1911}_0001", f"bld_{P1935}_0001"]
SOURCE_POOL = [P1911, P1935, "fip_v3_1999_999"]


@st.composite
def readings(draw: st.DrawFn) -> dict[str, Any]:
    return {
        "source": draw(st.sampled_from(SOURCE_POOL)),
        "feature_id": draw(st.sampled_from(FEATURE_POOL)),
        "lettered": ["Placeholder lettering"],
        "crop_px": {
            "x": draw(st.integers(0, 4300)), "y": draw(st.integers(0, 3200)),
            "width": draw(st.integers(1, 700)), "height": draw(st.integers(1, 700)),
        },
        "read_by": "Synthetic Reader",
        "read_on": "2026-11-13",
    }


@st.composite
def finds_docs(draw: st.DrawFn) -> dict[str, Any]:
    n = draw(st.integers(1, 3))
    finds = []
    for _ in range(n):
        finds.append({
            "id": f"find_{draw(st.integers(1, 3)):04d}",
            "slug": draw(st.sampled_from(["a", "b", "c"])),
            "kind": draw(st.sampled_from(["building", "area"])),
            "order": draw(st.integers(1, 3)),
            "tag": "Placeholder", "noun": "thing",
            "readings": draw(st.lists(readings(), min_size=1, max_size=3)),
        })
    return {"schema_version": "1.0.0", "finds": finds}


def resolves(find: dict[str, Any], r: dict[str, Any]) -> bool:
    """The rules of requirement 8.2 for one reading, written out independently of the check."""
    source, fid, c = r["source"], r["feature_id"], r["crop_px"]
    published = fid in PUBLISHED.get(source, set())
    prefix_ok = fid.split("_", 1)[0] in (("bld",) if find["kind"] == "building" else ("use", "bld"))
    # Only plate 1911 has a map area file in this tree; its map area is an axis-aligned square.
    inside = (source == P1911 and c["x"] >= X0 and c["y"] >= Y0
              and c["x"] + c["width"] <= X1 and c["y"] + c["height"] <= Y1)
    return published and prefix_ok and inside


@given(finds_docs())
def test_p1_an_accepted_file_resolves_every_reading_to_a_published_feature_inside_the_map_area(
    doc: dict[str, Any],
) -> None:
    errors = finds_errors(doc)
    unique = all(
        len({f[k] for f in doc["finds"]}) == len(doc["finds"]) for k in ("id", "slug", "order")
    )
    everything_resolves = all(resolves(f, r) for f in doc["finds"] for r in f["readings"])
    # accepted exactly when the independent rules hold: nothing is let through, nothing refused
    assert (errors == []) == (unique and everything_resolves)
    if errors == []:
        for f in doc["finds"]:
            assert f["readings"]
            for r in f["readings"]:
                assert r["feature_id"] in PUBLISHED[r["source"]]
