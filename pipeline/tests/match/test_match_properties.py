"""Properties M1 to M7 of `buried match` (spec 02 tasks 11.5 to 11.11), on random pairs of plates.

The checks re-derive each rule from the input documents with shapely, independently of the order
in which `compute_match` scores things, and look only at what `compute_match` wrote.
"""

from __future__ import annotations

import copy
from collections.abc import Iterable
from typing import Any

from hypothesis import HealthCheck, assume, given, settings
from shapely.geometry import shape
from shapely.ops import unary_union

from buried_pipeline.match import rules
from buried_pipeline.match.compute import MatchInputs, MatchResult, compute_match
from buried_pipeline.match.links import components
from tests.helpers.synthetic_evidence import P1911, P1935
from tests.match.strategies import AERIAL, MIN_ERROR, chains, worlds

PROFILE = settings(
    max_examples=80,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)


def features(docs: dict[str, dict[str, Any]]) -> dict[str, tuple[str, dict[str, Any]]]:
    return {f["id"]: (origin, f) for origin, d in docs.items() for f in d["features"]}


def building_of(origin: str, f: dict[str, Any]) -> rules.Building:
    return rules.Building(
        f["id"], origin, shape(f["geometry"]), float(f["properties"]["position_error_m"])
    )


def published(docs: dict[str, dict[str, Any]], origin: str) -> list[rules.Building]:
    return [
        building_of(origin, f)
        for f in docs[origin]["features"]
        if f["properties"]["status"] == "published"
    ]


def mapped(doc: dict[str, Any]) -> Any:
    return shape(doc["mapped_area"]["geometry"]) if "mapped_area" in doc else None


def reviewed(doc: dict[str, Any]) -> Any:
    areas = [shape(a["geometry"]) for a in doc.get("reviewed_areas", [])]
    return unary_union(areas) if areas else None


def new_observations(
    before: dict[str, dict[str, Any]], after: dict[str, dict[str, Any]]
) -> Iterable[tuple[str, dict[str, Any], dict[str, Any]]]:
    """(origin, feature after, observation) for every observation not present before."""
    old = features(before)
    for fid, (origin, f) in features(after).items():
        had = old[fid][1]["properties"]["observations"]
        for o in f["properties"]["observations"]:
            if o not in had:
                yield origin, f, o


def r_between(f: rules.Building, g: rules.Building) -> float | None:
    return rules.overlap_score(f.geom, g.geom, f.error_m + g.error_m)


def strong_only(f: rules.Building, plate: list[rules.Building], want: str) -> bool:
    """Exactly `want` is strong for f on `plate`, and no other candidate reaches COMPETE_MIN."""
    for g in plate:
        if f.geom.distance(g.geom) > f.error_m + g.error_m:
            continue
        r = r_between(f, g)
        if r is None:
            return False
        if g.id == want and r < rules.MATCH_MIN:
            return False
        if g.id != want and r >= rules.COMPETE_MIN:
            return False
    return True


# --- M1 ------------------------------------------------------------------------------------------


@PROFILE
@given(worlds())
def test_m1_a_match_needs_one_clear_mutual_winner(inputs: MatchInputs) -> None:
    result = compute_match(inputs)
    feats = features(result.docs)
    links = [
        (fid, link["feature"])
        for fid, (_, f) in feats.items()
        for link in f["properties"].get("same_as", [])
        if link["method"] == "match_auto"
    ]
    for fid, gid in links:
        (fo, ff), (go, gf) = feats[fid], feats[gid]
        assert fo != go
        f, g = building_of(fo, ff), building_of(go, gf)
        e = f.error_m + g.error_m
        assert f.geom.distance(g.geom) <= e
        r = r_between(f, g)
        assert r is not None and r >= rules.MATCH_MIN
        # One winner from each side, with no competitor above COMPETE_MIN.
        assert strong_only(f, published(result.docs, go), gid)
        assert strong_only(g, published(result.docs, fo), fid)
        # F grown by e lies inside the other plate's mapped area (and G inside F's).
        assert mapped(result.docs[go]).contains(rules.grow(f.geom, e))
        assert mapped(result.docs[fo]).contains(rules.grow(g.geom, e))
        # And the link is mirrored, with the presence on both features.
        assert any(
            o["source"] == go and o["present"] and o["visibility"] == "clear"
            and o["method"] == "match_auto" and o["matched_feature"] == gid
            for o in ff["properties"]["observations"]
        )


# --- M2 ------------------------------------------------------------------------------------------


@PROFILE
@given(worlds())
def test_m2_absence_only_inside_reviewed_areas_and_with_an_empty_core(
    inputs: MatchInputs,
) -> None:
    result = compute_match(inputs)
    for origin, f, o in new_observations(inputs.docs, result.docs):
        if o["source"] not in inputs.plate_sources or o["present"]:
            continue
        if o["visibility"] == "clear":
            fb = building_of(origin, f)
            other = o["source"]
            e_abs = fb.error_m + MIN_ERROR[other]
            core = rules.shrink(fb.geom, e_abs)
            assert not core.is_empty
            area = reviewed(result.docs[other])
            assert area is not None and area.contains(rules.grow(fb.geom, e_abs))
            assert mapped(result.docs[other]) is not None
            assert not any(g.geom.intersects(core) for g in published(result.docs, other))
        else:
            # not_covered: the feature misses the other plate's mapped area.
            assert o["visibility"] == "not_covered"
            m = mapped(result.docs[o["source"]])
            assert m is not None and not building_of(origin, f).geom.intersects(m)


# --- M3 ------------------------------------------------------------------------------------------


@PROFILE
@given(worlds())
def test_m3_code_never_reads_a_photograph(inputs: MatchInputs) -> None:
    result = compute_match(inputs)
    footprint = inputs.aerials[AERIAL].footprint
    written = [
        (origin, f, o)
        for origin, f, o in new_observations(inputs.docs, result.docs)
        if o["source"] == AERIAL
    ]
    for _origin, f, o in written:
        assert o["method"] == "match_auto"
        assert (o["present"], o["visibility"]) == (False, "not_covered")
        assert not shape(f["geometry"]).intersects(footprint)
    # Every published building the photo covers is left for a person.
    pending = {r["feature"] for r in result.review if r["type"] == "aerial_pending"}
    for fid, (_, f) in features(result.docs).items():
        if f["properties"]["status"] != "published":
            continue
        if shape(f["geometry"]).intersects(footprint):
            assert fid in pending
            assert all(o["source"] != AERIAL for o in f["properties"]["observations"])
        else:
            assert fid not in pending
    # Nothing but not_covered is written for the aerial anywhere in the output.
    for _, (_, f) in features(result.docs).items():
        for o in f["properties"]["observations"]:
            if o["source"] == AERIAL:
                assert o["visibility"] == "not_covered"


# --- M4 ------------------------------------------------------------------------------------------


@PROFILE
@given(worlds(person=True, decisions=True))
def test_m4_person_decisions_are_never_overridden(inputs: MatchInputs) -> None:
    result = compute_match(inputs)
    before, after = features(inputs.docs), features(result.docs)
    for fid, (_, f) in before.items():
        out = after[fid][1]["properties"]
        for o in f["properties"]["observations"]:
            if o["method"] == "person":
                assert o in out["observations"]
                # Exactly one observation from that source: no match_auto next to the person's.
                assert sum(x["source"] == o["source"] for x in out["observations"]) == 1
        for link in f["properties"].get("same_as", []):
            if link["method"] == "person":
                assert link in out["same_as"]
    # Everything a decision wrote is a person's, with who and when.
    for d in inputs.decisions.observations:
        o = next(
            x for x in after[d.feature][1]["properties"]["observations"] if x["source"] == d.source
        )
        assert o["method"] == "person"
        assert (o["present"], o["visibility"]) == (d.present, d.visibility)
        assert o["confirmed_by"] == d.confirmed_by and o["confirmed_at"] == d.confirmed_at


# --- M5 ------------------------------------------------------------------------------------------


def by_id(docs: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return {fid: f for fid, (_, f) in features(docs).items()}


@PROFILE
@given(worlds(person=True, clashes=True, decisions=True))
def test_m5_idempotent(inputs: MatchInputs) -> None:
    first = compute_match(inputs)
    again = compute_match(
        MatchInputs(
            docs=first.docs,
            plate_sources=inputs.plate_sources,
            min_error_m=inputs.min_error_m,
            aerials=inputs.aerials,
            year_to=inputs.year_to,
            decisions=inputs.decisions,
        )
    )
    assert again.docs == first.docs
    assert again.review == first.review


@PROFILE
@given(worlds(person=True, clashes=True))
def test_m5_independent_of_order(inputs: MatchInputs) -> None:
    straight = compute_match(inputs)
    shuffled_docs: dict[str, dict[str, Any]] = {}
    for origin in reversed(list(inputs.docs)):
        doc = copy.deepcopy(inputs.docs[origin])
        doc["features"].reverse()
        for f in doc["features"]:
            f["properties"]["observations"].reverse()
            if "same_as" in f["properties"]:
                f["properties"]["same_as"].reverse()
        shuffled_docs[origin] = doc
    other = compute_match(
        MatchInputs(
            docs=shuffled_docs,
            plate_sources=inputs.plate_sources,
            min_error_m=inputs.min_error_m,
            aerials=inputs.aerials,
            year_to=inputs.year_to,
            decisions=inputs.decisions,
        )
    )
    assert by_id(other.docs) == by_id(straight.docs)
    assert other.review == straight.review


# --- M6 ------------------------------------------------------------------------------------------


@PROFILE
@given(worlds(person=True, clashes=True))
def test_m6_linked_sets_stay_one_per_origin_source(inputs: MatchInputs) -> None:
    feats = features(inputs.docs)
    person_edges = [
        (fid, link["feature"])
        for fid, (_, f) in feats.items()
        for link in f["properties"].get("same_as", [])
        if link["method"] == "person"
    ]
    origin_of = {fid: origin for fid, (origin, _) in feats.items()}
    # Person work that clashes by itself is not `match`'s to repair.
    person_sets = components(feats, person_edges)
    for members in person_sets.values():
        assume(len({origin_of[m] for m in members}) == len(members))

    result = compute_match(inputs)
    after = features(result.docs)
    edges = [
        (fid, link["feature"])
        for fid, (_, f) in after.items()
        for link in f["properties"].get("same_as", [])
    ]
    for members in components(after, edges).values():
        origins = [origin_of[m] for m in members]
        assert len(origins) == len(set(origins))
    # Every link is mirrored.
    for fid, other in edges:
        assert fid in {
            link["feature"] for link in after[other][1]["properties"].get("same_as", [])
        }


@PROFILE
@given(chains())
def test_m6_a_chain_of_matches_that_would_hold_two_features_from_one_source_is_refused(
    inputs: MatchInputs,
) -> None:
    # Independently of `compute_match`: every neighbouring pair is a mutual candidate.
    buildings = {
        f["id"]: building_of(origin, f)
        for origin, doc in inputs.docs.items()
        for f in doc["features"]
    }
    plates = {
        p: rules.Plate(p, mapped(d), reviewed(d), tuple(published(inputs.docs, p)), MIN_ERROR[p])
        for p, d in inputs.docs.items()
    }
    outcomes = {
        (fid, p): rules.plate_outcome(b, plate)
        for fid, b in buildings.items()
        for p, plate in plates.items()
        if p != b.source
    }
    pairs, _ = rules.mutual_matches(outcomes, {fid: b.source for fid, b in buildings.items()})
    assume(len(pairs) == 3)

    result = compute_match(inputs)
    for _, f in features(result.docs).values():
        assert "same_as" not in f["properties"]
        assert not any(
            o["method"] == "match_auto" and o["present"] for o in f["properties"]["observations"]
        )
    clashes = [r for r in result.review if r["type"] == "link_clash"]
    assert len(clashes) == 3
    assert all(r["sources"] == [P1911] for r in clashes)


# --- M7 ------------------------------------------------------------------------------------------


def without_observations_and_links(doc: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(doc)
    for f in out["features"]:
        f["properties"].pop("observations")
        f["properties"].pop("same_as", None)
    return out


@PROFILE
@given(worlds(person=True, decisions=True))
def test_m7_only_observations_and_links_change(inputs: MatchInputs) -> None:
    result = compute_match(inputs)
    assert set(result.docs) == set(inputs.docs)
    for origin, doc in inputs.docs.items():
        assert without_observations_and_links(result.docs[origin]) == (
            without_observations_and_links(doc)
        )
        # Same features, same order.
        assert [f["id"] for f in result.docs[origin]["features"]] == [
            f["id"] for f in doc["features"]
        ]
        # The origin observation of every feature is untouched.
        for f_before, f_after in zip(doc["features"], result.docs[origin]["features"], strict=True):
            origin_obs = [o for o in f_before["properties"]["observations"] if o["method"] == "origin"]
            assert [
                o for o in f_after["properties"]["observations"] if o["method"] == "origin"
            ] == origin_obs


def test_the_inputs_are_not_modified() -> None:
    from tests.helpers.synthetic_evidence import building, evidence_doc

    docs = {
        P1911: evidence_doc(P1911, [building(P1911, 1, 0, 0, 40, 40)]),
        P1935: evidence_doc(P1935, [building(P1935, 1, 0, 0, 40, 40)]),
    }
    snapshot = copy.deepcopy(docs)
    result: MatchResult = compute_match(
        MatchInputs(
            docs=docs,
            plate_sources=frozenset(docs),
            min_error_m=dict(MIN_ERROR),
            aerials={},
            year_to={P1911: 1914, P1935: 1935},
        )
    )
    assert docs == snapshot
    assert result.docs != snapshot
