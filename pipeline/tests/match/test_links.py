from __future__ import annotations

import pytest

from buried_pipeline.match.links import clashes, components, edge, split_candidate_links

ORIGIN = {"a1": "p1", "a2": "p1", "b1": "p2", "b2": "p2", "c1": "p3"}


def test_components_group_connected_nodes() -> None:
    sets = components(["a", "b", "c", "d"], [("a", "b"), ("b", "c")])
    assert sets["a"] == sets["b"] == sets["c"] == frozenset("abc")
    assert sets["d"] == frozenset("d")


def test_components_do_not_depend_on_edge_order() -> None:
    edges = [("a", "b"), ("c", "d"), ("b", "c")]
    forward = components("abcde", edges)
    backward = components("edcba", list(reversed(edges)))
    assert forward == backward


def test_edge_is_ordered() -> None:
    assert edge("b", "a") == edge("a", "b") == ("a", "b")


def test_clashes_names_sources_with_two_members() -> None:
    assert clashes(["a1", "a2", "b1"], ORIGIN) == ["p1"]
    assert clashes(["a1", "b1", "c1"], ORIGIN) == []


def test_clean_candidates_are_accepted() -> None:
    accepted, rejected = split_candidate_links(ORIGIN, [], [("a1", "b1"), ("a2", "b2")], ORIGIN)
    assert accepted == [("a1", "b1"), ("a2", "b2")] and rejected == []


def test_a_person_link_that_makes_a_clash_sends_the_candidate_to_review() -> None:
    # a1-b1 is a candidate; a2-b1 is a person link: the set {a1, a2, b1} has two p1 features.
    accepted, rejected = split_candidate_links(
        ORIGIN, [("a2", "b1")], [("a1", "b1")], ORIGIN
    )
    assert accepted == []
    assert rejected == [(("a1", "b1"), ["p1"])]


def test_every_candidate_in_a_clashing_set_is_rejected() -> None:
    # a1-b1 and a2-b1 are both candidates: the set holds two p1 features, so neither is written.
    accepted, rejected = split_candidate_links(
        ORIGIN, [], [("a1", "b1"), ("a2", "b1"), ("a1", "c1")], ORIGIN
    )
    assert accepted == []
    assert {e for e, _ in rejected} == {("a1", "b1"), ("a2", "b1"), ("a1", "c1")}


def test_an_unrelated_candidate_is_kept() -> None:
    origin = {**ORIGIN, "c2": "p3", "d1": "p4"}
    accepted, rejected = split_candidate_links(
        origin, [], [("a1", "b1"), ("a2", "b1"), ("c1", "d1")], origin
    )
    assert accepted == [("c1", "d1")]
    assert len(rejected) == 2


def test_a_candidate_that_repeats_a_person_link_is_not_a_candidate() -> None:
    accepted, rejected = split_candidate_links(ORIGIN, [("a1", "b1")], [("a1", "b1")], ORIGIN)
    assert accepted == [] and rejected == []


@pytest.mark.parametrize("order", [0, 1])
def test_result_is_the_same_for_either_candidate_order(order: int) -> None:
    candidates = [("a1", "b1"), ("a2", "b1")]
    if order:
        candidates.reverse()
    accepted, rejected = split_candidate_links(ORIGIN, [], candidates, ORIGIN)
    assert accepted == [] and sorted(e for e, _ in rejected) == [("a1", "b1"), ("a2", "b1")]
