"""Linked sets for `buried match` (pure): union-find over person links plus candidate links, and
the same-origin check (spec 02 requirement 13.6, design.md "Same-origin check").

This is graph bookkeeping, not date logic. The check is made on the whole graph at once, so the
result does not depend on the order in which pairs were scored.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping

Edge = tuple[str, str]


def edge(a: str, b: str) -> Edge:
    return (a, b) if a <= b else (b, a)


def components(nodes: Iterable[str], edges: Iterable[Edge]) -> dict[str, frozenset[str]]:
    """Each node's connected set under the edges (a node with no edge is a set of one)."""
    parent: dict[str, str] = {n: n for n in nodes}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b in edges:
        parent.setdefault(a, a)
        parent.setdefault(b, b)
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)  # the smallest id is the root, whatever the order

    groups: dict[str, set[str]] = {}
    for n in parent:
        groups.setdefault(find(n), set()).add(n)
    return {n: frozenset(groups[find(n)]) for n in parent}


def clashes(members: Iterable[str], origin_of: Mapping[str, str]) -> list[str]:
    """Origin sources that appear on more than one member, sorted."""
    seen: dict[str, int] = {}
    for m in members:
        seen[origin_of[m]] = seen.get(origin_of[m], 0) + 1
    return sorted(o for o, n in seen.items() if n > 1)


def split_candidate_links(
    nodes: Iterable[str],
    person_edges: Iterable[Edge],
    candidate_edges: Iterable[Edge],
    origin_of: Mapping[str, str],
) -> tuple[list[Edge], list[tuple[Edge, list[str]]]]:
    """Split the candidate links into those that may be written and those that go to review.

    In any set (person links plus candidate links) holding two features from one origin source,
    every candidate link in that set is rejected, with the clashing sources. Person links are
    never touched.
    """
    person = sorted(set(person_edges))
    candidates = sorted(set(candidate_edges) - set(person))
    nodes = list(nodes)
    sets = components(nodes, [*person, *candidates])
    accepted: list[Edge] = []
    rejected: list[tuple[Edge, list[str]]] = []
    for c in candidates:
        bad = clashes(sets[c[0]], origin_of)
        if bad:
            rejected.append((c, bad))
        else:
            accepted.append(c)
    return accepted, rejected
