"""Schema 1.2.0: `provenance.review` (spec 06 requirement 9.1).

Same method as `test_checks.py`: start from the valid in-memory tree, break one thing, expect an
error that names the file and the feature.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from hypothesis import given
from hypothesis import strategies as st

from tests.validate.builders import FUTURE, P1911, base_dataset, errors_for, feature_of

EV_1911 = f"data/evidence/{P1911}.geojson"
F1911 = f"bld_{P1911}_0001"


def provenance(ds: dict[str, Any]) -> dict[str, Any]:
    return feature_of(ds, P1911)["properties"]["provenance"]


def about_this_feature(ds: dict[str, Any]) -> list[Any]:
    return [e for e in errors_for(ds) if e.path == EV_1911 and e.feature_id == F1911]


def test_the_valid_tree_has_a_draft_with_no_person() -> None:
    ds = base_dataset()
    assert provenance(ds)["review"] == {"state": "draft_rule"}
    assert errors_for(ds) == []


def test_review_is_required() -> None:
    ds = base_dataset()
    del provenance(ds)["review"]
    assert any("'review' is a required property" in e.reason for e in about_this_feature(ds))


def test_reviewed_names_a_person_and_a_day() -> None:
    ds = base_dataset()
    provenance(ds)["review"] = {"state": "reviewed", "by": "A. Reviewer", "on": "2026-11-13"}
    assert errors_for(ds) == []


def test_reviewed_without_by_or_on_is_rejected() -> None:
    for missing in ("by", "on"):
        ds = base_dataset()
        review = {"state": "reviewed", "by": "A. Reviewer", "on": "2026-11-13"}
        del review[missing]
        provenance(ds)["review"] = review
        assert any(f"'{missing}' is a required property" in e.reason
                   for e in about_this_feature(ds)), missing


def test_reviewed_on_a_future_day_is_rejected() -> None:
    ds = base_dataset()
    provenance(ds)["review"] = {"state": "reviewed", "by": "A. Reviewer", "on": FUTURE[:10]}
    assert any(e.reason == "is in the future" for e in about_this_feature(ds))


def test_an_unknown_state_is_rejected() -> None:
    ds = base_dataset()
    provenance(ds)["review"] = {"state": "confirmed"}
    assert about_this_feature(ds)


def test_an_evidence_file_older_than_1_2_0_is_rejected() -> None:
    ds = base_dataset()
    ds[EV_1911]["schema_version"] = "1.1.0"
    assert any("provenance.review" in e.reason for e in errors_for(ds) if e.path == EV_1911)


@given(
    state=st.sampled_from(["draft_rule", "draft_hand"]),
    extra=st.sampled_from([{"by": "A. Reviewer"}, {"on": "2026-11-13"},
                           {"by": "A. Reviewer", "on": "2026-11-13"}]),
)
def test_a_draft_never_carries_a_person_or_a_day(state: str, extra: dict[str, str]) -> None:
    ds = base_dataset()
    provenance(ds)["review"] = {"state": state}
    assert errors_for(ds) == []
    provenance(ds)["review"] = {"state": state, **extra}
    assert about_this_feature(ds)


@given(
    by=st.text(min_size=1, max_size=20).filter(lambda s: s.strip()),
    day=st.dates(min_value=date(2026, 1, 1), max_value=date(2026, 11, 12)),
)
def test_reviewed_with_a_person_and_a_past_day_is_always_accepted(by: str, day: Any) -> None:
    ds = base_dataset()
    provenance(ds)["review"] = {"state": "reviewed", "by": by, "on": day.isoformat()}
    assert about_this_feature(ds) == []
