"""The review-state migration (spec 06 task P2): hand traces become draft_hand, the rest
draft_rule, none reviewed, and a second run changes nothing."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from hypothesis import given
from hypothesis import strategies as st

from buried_pipeline.migrate.review_state import migrate_document, migrate_files, review_for
from buried_pipeline.publish.build import canonical_text

HAND = "Buried maintainers (draft tracing by hand, not yet reviewed)"
GATE = "Buried maintainers (gate draft, unreviewed)"


def feature(n: int, confirmed_by: str, status: str = "published") -> dict[str, Any]:
    return {
        "type": "Feature",
        "id": f"bld_fip_v3_1911_229_{n:04d}",
        "properties": {
            "status": status,
            "provenance": {"confirmed_by": confirmed_by, "confirmed_at": "2026-11-12T21:32:22Z"},
        },
    }


def doc(*features: dict[str, Any], version: str = "1.1.0") -> dict[str, Any]:
    return {"type": "FeatureCollection", "schema_version": version, "features": list(features)}


def states(d: dict[str, Any]) -> list[str]:
    return [f["properties"]["provenance"]["review"]["state"] for f in d["features"]]


def test_hand_traces_and_the_gate_draft_are_draft_hand_and_the_rest_draft_rule() -> None:
    new, added = migrate_document(doc(
        feature(1, GATE), feature(2, HAND), feature(3, "Reviewer A"),
        feature(4, "Reviewer A", status="merged"),
    ))
    assert states(new) == ["draft_hand", "draft_hand", "draft_rule", "draft_rule"]
    assert added == 4


def test_no_feature_becomes_reviewed_and_no_person_is_written() -> None:
    new, _ = migrate_document(doc(feature(1, "Anyone"), feature(2, HAND)))
    for f in new["features"]:
        assert set(f["properties"]["provenance"]["review"]) == {"state"}


def test_the_publishing_record_is_untouched() -> None:
    old = doc(feature(1, HAND))
    new, _ = migrate_document(old)
    prov = new["features"][0]["properties"]["provenance"]
    assert prov["confirmed_by"] == HAND
    assert prov["confirmed_at"] == "2026-11-12T21:32:22Z"


def test_the_schema_version_rises_to_1_2_0_and_never_falls() -> None:
    assert migrate_document(doc(feature(1, "A"), version="1.1.0"))[0]["schema_version"] == "1.2.0"
    assert migrate_document(doc(feature(1, "A"), version="1.3.0"))[0]["schema_version"] == "1.3.0"


def test_the_input_is_not_changed() -> None:
    old = doc(feature(1, HAND))
    before = copy.deepcopy(old)
    migrate_document(old)
    assert old == before


def test_an_existing_review_is_kept() -> None:
    f = feature(1, HAND)
    f["properties"]["provenance"]["review"] = {
        "state": "reviewed", "by": "A. Reviewer", "on": "2026-11-13"
    }
    new, added = migrate_document(doc(f))
    assert added == 0
    assert new["features"][0]["properties"]["provenance"]["review"]["by"] == "A. Reviewer"


@given(st.lists(st.sampled_from([HAND, GATE, "Reviewer A", "Reviewer B"]), max_size=12))
def test_running_twice_changes_nothing(names: list[str]) -> None:
    once, _ = migrate_document(doc(*[feature(i + 1, n) for i, n in enumerate(names)]))
    twice, added = migrate_document(once)
    assert twice == once
    assert added == 0


@given(st.text(max_size=40))
def test_the_rule_depends_only_on_the_publishing_record(by: str) -> None:
    expected = "draft_hand" if ("tracing by hand" in by.lower() or "gate draft" in by.lower()) \
        else "draft_rule"
    assert review_for({"confirmed_by": by}) == {"state": expected}


def test_files_are_rewritten_once_in_the_canonical_form(tmp_path: Path) -> None:
    path = tmp_path / "fip_v3_1911_229.geojson"
    path.write_text(json.dumps(doc(feature(1, HAND), feature(2, "A"))), encoding="utf-8")
    assert migrate_files([path]) == {path: 2}
    first = path.read_text(encoding="utf-8")
    assert first == canonical_text(json.loads(first))
    assert migrate_files([path]) == {path: 0}
    assert path.read_text(encoding="utf-8") == first


def test_a_dry_run_writes_nothing(tmp_path: Path) -> None:
    path = tmp_path / "fip_v3_1911_229.geojson"
    text = json.dumps(doc(feature(1, HAND)))
    path.write_text(text, encoding="utf-8")
    assert migrate_files([path], dry_run=True) == {path: 1}
    assert path.read_text(encoding="utf-8") == text
