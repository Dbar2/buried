from __future__ import annotations

import copy
from typing import Any

import pytest

from buried_pipeline.errors import PipelineError
from buried_pipeline.match.apply import (
    FeatureRef,
    add_link,
    add_observation,
    apply_decisions,
    auto_absence,
    auto_not_covered,
    auto_presence,
    has_origin_or_person,
    parse_decisions,
    sort_props,
    strip_auto,
)
from tests.helpers.synthetic_evidence import (
    P1911,
    P1935,
    building,
    link,
    person_observation,
    presence,
)

BY = {"confirmed_by": "A. Person", "confirmed_at": "2026-11-20T10:00:00-05:00"}
A, B = f"bld_{P1911}_0001", f"bld_{P1935}_0001"
AERIAL = "aerial_1947_s0012_fl1947_it0018h"


def refs() -> dict[str, FeatureRef]:
    fa = building(P1911, 1, 0, 0, 40, 40)
    fb = building(P1935, 1, 0, 0, 40, 40)
    return {
        fa["id"]: FeatureRef(fa["id"], P1911, fa["properties"]),
        fb["id"]: FeatureRef(fb["id"], P1935, fb["properties"]),
    }


def test_no_file_means_no_decisions() -> None:
    assert parse_decisions(None).links == ()


def test_decisions_are_parsed() -> None:
    d = parse_decisions(
        {
            "decisions": [
                {"type": "link", "features": [B, A], **BY},
                {"type": "no_link", "features": ["x", "y"], **BY},
                {
                    "type": "observation", "feature": A, "source": AERIAL, "present": False,
                    "visibility": "clear", "note": "empty lot", **BY,
                },
            ]
        }  # fmt: skip
    )
    assert d.links[0].features == (A, B)
    assert d.no_link_edges == {("x", "y")}
    assert d.observations[0].note == "empty lot"


@pytest.mark.parametrize("missing", ["confirmed_by", "confirmed_at"])
@pytest.mark.parametrize("kind", ["link", "no_link", "observation"])
def test_a_decision_without_who_and_when_is_refused(kind: str, missing: str) -> None:
    raw: dict[str, Any] = {"type": kind, **BY}
    if kind == "observation":
        raw.update(feature=A, source=AERIAL, present=True, visibility="clear")
    else:
        raw["features"] = [A, B]
    del raw[missing]
    with pytest.raises(PipelineError, match=missing):
        parse_decisions({"decisions": [raw]})


@pytest.mark.parametrize(
    "doc",
    [
        [],
        {"decisions": "x"},
        {"decisions": [{"type": "merge", **BY}]},
        {"decisions": [{"type": "link", "features": [A], **BY}]},
        {"decisions": [{"type": "link", "features": [A, A], **BY}]},
        {"decisions": [{"type": "observation", "feature": A, "source": AERIAL, **BY}]},
        {"decisions": [{"type": "observation", "feature": A, "source": AERIAL, "present": True,
                        "visibility": "maybe", **BY}]},
    ],
)  # fmt: skip
def test_malformed_decisions_are_refused(doc: Any) -> None:
    with pytest.raises(PipelineError):
        parse_decisions(doc)


def test_link_and_no_link_for_one_pair_conflict() -> None:
    with pytest.raises(PipelineError, match="both linked and ruled out"):
        parse_decisions(
            {
                "decisions": [
                    {"type": "link", "features": [A, B], **BY},
                    {"type": "no_link", "features": [B, A], **BY},
                ]
            }
        )


def test_strip_auto_removes_only_match_auto() -> None:
    f = building(
        P1911, 1, 0, 0, 40, 40,
        observations=[
            presence(P1935, B),
            person_observation("aerial_1947_s0012_fl1947_it0018h", True, "clear"),
        ],
        same_as=[link(B), link("bld_other", "person")],
    )  # fmt: skip
    strip_auto(f["properties"])
    assert [o["method"] for o in f["properties"]["observations"]] == ["origin", "person"]
    assert f["properties"]["same_as"] == [link("bld_other", "person")]


def test_strip_auto_removes_an_emptied_same_as() -> None:
    f = building(P1911, 1, 0, 0, 40, 40, same_as=[link(B)])
    strip_auto(f["properties"])
    assert "same_as" not in f["properties"]


def test_link_decision_writes_links_and_person_presences_both_ways() -> None:
    features = refs()
    apply_decisions(features, parse_decisions({"decisions": [{"type": "link", "features": [A, B], **BY}]}))
    a, b = features[A].props, features[B].props
    assert a["same_as"] == [{"feature": B, "method": "person", **BY}]
    assert b["same_as"] == [{"feature": A, "method": "person", **BY}]
    assert a["observations"][-1] == {
        "source": P1935, "present": True, "visibility": "clear", "method": "person", **BY
    }
    assert b["observations"][-1]["source"] == P1911


def test_applying_the_same_decisions_twice_changes_nothing() -> None:
    features = refs()
    decisions = parse_decisions({"decisions": [{"type": "link", "features": [A, B], **BY}]})
    apply_decisions(features, decisions)
    once = copy.deepcopy({k: v.props for k, v in features.items()})
    apply_decisions(features, decisions)
    assert {k: v.props for k, v in features.items()} == once


def test_link_between_features_of_one_source_is_refused() -> None:
    features = refs()
    other = building(P1911, 2, 100, 0, 140, 40)
    features[other["id"]] = FeatureRef(other["id"], P1911, other["properties"])
    with pytest.raises(PipelineError, match="a merge, not a link"):
        apply_decisions(
            features,
            parse_decisions({"decisions": [{"type": "link", "features": [A, other["id"]], **BY}]}),
        )


def test_link_to_an_unknown_or_unpublished_feature_is_refused() -> None:
    features = refs()
    with pytest.raises(PipelineError, match="not a feature"):
        apply_decisions(
            features, parse_decisions({"decisions": [{"type": "link", "features": [A, "zz"], **BY}]})
        )
    features[B].props["status"] = "rejected"
    with pytest.raises(PipelineError, match="published"):
        apply_decisions(
            features, parse_decisions({"decisions": [{"type": "link", "features": [A, B], **BY}]})
        )


def obs_decision(**over: Any) -> dict[str, Any]:
    return {
        "type": "observation", "feature": A, "source": AERIAL, "present": False,
        "visibility": "clear", "note": "empty lot", **BY, **over,
    }  # fmt: skip


def test_observation_decision_writes_a_person_observation_with_its_note() -> None:
    features = refs()
    apply_decisions(features, parse_decisions({"decisions": [obs_decision()]}))
    assert features[A].props["observations"][-1] == {
        "source": AERIAL, "present": False, "visibility": "clear", "method": "person",
        "note": "empty lot", **BY,
    }  # fmt: skip


def test_observation_decision_cannot_decide_the_origin_source() -> None:
    with pytest.raises(PipelineError, match="origin source"):
        apply_decisions(refs(), parse_decisions({"decisions": [obs_decision(source=P1911)]}))


def test_a_differing_person_observation_is_never_changed() -> None:
    features = refs()
    features[A].props["observations"].append(person_observation(AERIAL, True, "clear"))
    with pytest.raises(PipelineError, match="never changed"):
        apply_decisions(features, parse_decisions({"decisions": [obs_decision()]}))
    assert features[A].props["observations"][-1]["present"] is True


def test_has_origin_or_person_ignores_auto() -> None:
    f = building(P1911, 1, 0, 0, 40, 40, observations=[auto_absence(P1935)])
    assert has_origin_or_person(f["properties"], P1911)
    assert not has_origin_or_person(f["properties"], P1935)


def test_add_observation_refuses_a_second_from_one_source() -> None:
    f = building(P1911, 1, 0, 0, 40, 40)
    add_observation(f["properties"], auto_not_covered(AERIAL))
    with pytest.raises(PipelineError):
        add_observation(f["properties"], auto_presence(AERIAL, "x"))


def test_add_link_is_idempotent_and_sort_puts_origin_first() -> None:
    f = building(P1911, 1, 0, 0, 40, 40)
    add_link(f["properties"], link("bld_z"))
    add_link(f["properties"], link("bld_z"))
    add_link(f["properties"], link("bld_a"))
    add_observation(f["properties"], auto_not_covered("aerial_1947_s0012_fl1947_it0018h"))
    add_observation(f["properties"], auto_absence("aaa_first_alphabetically"))
    sort_props(f["properties"], P1911)
    assert [x["feature"] for x in f["properties"]["same_as"]] == ["bld_a", "bld_z"]
    assert [o["source"] for o in f["properties"]["observations"]] == [
        P1911, "aaa_first_alphabetically", "aerial_1947_s0012_fl1947_it0018h",
    ]  # fmt: skip
