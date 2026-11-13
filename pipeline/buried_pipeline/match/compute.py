"""The whole of `buried match` as one pure function over parsed documents (design.md "Run order
inside match", steps 1 to 4). `match/run.py` reads the files, calls this, validates and writes.

Nothing here reads a file, the network or the clock. The result depends only on the published
features, the coverage areas, the plates' smallest feature errors, the aerial footprints and the
decisions, so the same inputs give the same documents (requirement 13.11).
"""

from __future__ import annotations

import copy
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from buried_pipeline.match import rules
from buried_pipeline.match.apply import (
    AUTO,
    PERSON,
    Decisions,
    FeatureRef,
    add_link,
    add_observation,
    apply_decisions,
    auto_absence,
    auto_not_covered,
    auto_presence,
    has_origin_or_person,
    sort_props,
    strip_auto,
)
from buried_pipeline.match.links import Edge, components, edge, split_candidate_links
from buried_pipeline.match.rules import Building, Outcome, Plate


@dataclass(frozen=True)
class AerialInfo:
    source: str
    footprint: BaseGeometry
    tile: str  # file name of the tile image next to its sidecar


@dataclass(frozen=True)
class MatchInputs:
    docs: Mapping[str, dict[str, Any]]  # evidence file by origin source id
    plate_sources: frozenset[str]  # registered plates that have an evidence file
    min_error_m: Mapping[str, float]  # per plate: the smallest possible feature error
    aerials: Mapping[str, AerialInfo]
    year_to: Mapping[str, int]  # per source id
    decisions: Decisions = field(default_factory=Decisions)
    # Per plate: its smallest digitising term, max(1.0, 2 x pixel size). With `pairwise_error_m`
    # it lets the absence test use the pairwise figure.
    min_own_term_m: Mapping[str, float] = field(default_factory=dict)
    # Pairwise alignment errors keyed by the two plates' source ids in sorted order (requirement
    # 13.15). A pair of plates that is absent here is compared with their absolute errors.
    pairwise_error_m: Mapping[tuple[str, str], float] = field(default_factory=dict)


@dataclass
class PairCounts:
    matched: int = 0
    absent: int = 0
    not_covered: int = 0
    review: int = 0
    pending: int = 0


@dataclass(frozen=True)
class MatchResult:
    docs: dict[str, dict[str, Any]]
    review: list[dict[str, Any]]
    counts: dict[tuple[str, str], PairCounts]


def _round(r: float | None) -> float | None:
    return None if r is None else round(r, 4)


def _building(ref: FeatureRef, feature: Mapping[str, Any]) -> Building:
    return Building(
        id=ref.id,
        source=ref.origin,
        geom=shape(feature["geometry"]),
        error_m=float(ref.props["position_error_m"]),
        align_error_m=float(ref.props["provenance"]["alignment_error_m"]),
    )


def _plate(
    source: str,
    doc: Mapping[str, Any],
    buildings: list[Building],
    min_error: float,
    min_own_term: float | None = None,
) -> Plate:
    mapped = doc.get("mapped_area")
    reviewed = [
        shape(a["geometry"])
        for a in doc.get("reviewed_areas", [])
        if "building" in a.get("covers", ["building"])
    ]
    return Plate(
        source=source,
        mapped_area=shape(mapped["geometry"]) if mapped else None,
        reviewed_area=unary_union(reviewed) if reviewed else None,
        buildings=tuple(sorted(buildings, key=lambda b: b.id)),
        min_error_m=min_error,
        min_own_term_m=min_own_term,
    )


def compute_match(inputs: MatchInputs) -> MatchResult:
    docs = copy.deepcopy({k: dict(v) for k, v in inputs.docs.items()})

    # Step 1: index every feature, and remove every match_auto observation and link.
    refs: dict[str, FeatureRef] = {}
    geoms: dict[str, Mapping[str, Any]] = {}
    for origin in sorted(docs):
        for feature in docs[origin]["features"]:
            ref = FeatureRef(feature["id"], origin, feature["properties"])
            refs[ref.id] = ref
            geoms[ref.id] = feature
            strip_auto(ref.props)

    # Step 2: the person's decisions.
    apply_decisions(refs, inputs.decisions)

    buildings: dict[str, Building] = {
        fid: _building(ref, geoms[fid])
        for fid, ref in refs.items()
        if ref.published and ref.props["kind"] == "building"
    }
    plates = {
        p: _plate(
            p,
            docs[p],
            [b for b in buildings.values() if b.source == p],
            inputs.min_error_m[p],
            inputs.min_own_term_m.get(p),
        )
        for p in sorted(inputs.plate_sources)
    }
    no_link = inputs.decisions.no_link_edges

    counts: dict[tuple[str, str], PairCounts] = {}

    def count(origin: str, other: str) -> PairCounts:
        return counts.setdefault((origin, other), PairCounts())

    review: list[dict[str, Any]] = []

    # Step 3a: score every building against every other plate.
    outcomes: dict[tuple[str, str], Outcome] = {}
    for fid in sorted(buildings):
        f = buildings[fid]
        for p in plates.values():
            if p.source == f.source:
                continue
            excluded = {b for a, b in no_link if a == fid} | {a for a, b in no_link if b == fid}
            outcomes[(fid, p.source)] = rules.plate_outcome(
                f,
                p,
                excluded,
                inputs.pairwise_error_m.get(
                    (min(f.source, p.source), max(f.source, p.source))
                ),
            )

    source_of = {fid: b.source for fid, b in buildings.items()}
    pairs, demoted = rules.mutual_matches(outcomes, source_of)

    # A pair is dropped silently when either side already has an origin or person observation
    # from the other's source: a person has spoken (requirement 13.10).
    candidate_edges: list[Edge] = []
    for a, b in sorted(pairs):
        if has_origin_or_person(refs[a].props, source_of[b]) or has_origin_or_person(
            refs[b].props, source_of[a]
        ):
            continue
        candidate_edges.append(edge(a, b))

    # The same-origin check on the whole graph (requirement 13.6).
    person_edges: list[Edge] = sorted(
        {
            edge(fid, link["feature"])
            for fid, ref in refs.items()
            if ref.published
            for link in ref.props.get("same_as", [])
            if link["method"] == PERSON and link["feature"] in buildings
        }
    )
    accepted, rejected = split_candidate_links(
        list(buildings), person_edges, candidate_edges, source_of
    )
    for (a, b), bad in rejected:
        review.append(
            {
                "type": "link_clash",
                "features": [a, b],
                "reason": rules.LINK_CLASH,
                "sources": bad,
            }
        )
    for a, b in accepted:
        for x, y in ((a, b), (b, a)):
            add_observation(refs[x].props, auto_presence(source_of[y], y))
            add_link(refs[x].props, {"feature": y, "method": AUTO})
            count(source_of[x], source_of[y]).matched += 1

    # Step 3b: the other outcomes, for features with no origin or person observation there.
    for (fid, plate_source), outcome in sorted(outcomes.items()):
        f_ref = refs[fid]
        if has_origin_or_person(f_ref.props, plate_source):
            continue
        origin = source_of[fid]
        if outcome.kind == rules.MATCH_CANDIDATE:
            # A mutual candidate was handled above (written, sent to review as a clash, or
            # dropped because a person has spoken). A one-sided one goes to review.
            if (fid, plate_source) not in demoted:
                continue
            outcome = demoted[(fid, plate_source)]
        if outcome.kind == rules.ABSENT:
            add_observation(f_ref.props, auto_absence(plate_source))
            count(origin, plate_source).absent += 1
        elif outcome.kind == rules.NOT_COVERED:
            add_observation(f_ref.props, auto_not_covered(plate_source))
            count(origin, plate_source).not_covered += 1
        else:
            review.append(
                {
                    "type": "plate",
                    "feature": fid,
                    "plate": plate_source,
                    "reason": outcome.reason,
                    "candidates": [{"feature": c, "r": _round(r)} for c, r in outcome.scores],
                }
            )
            count(origin, plate_source).review += 1

    # Step 3c: aerials. Code writes `not_covered` and nothing else (requirements 13.7 and 13.8).
    sets = components(list(buildings), [*person_edges, *accepted])
    for aerial in sorted(inputs.aerials):
        info = inputs.aerials[aerial]
        for fid in sorted(buildings):
            f_ref = refs[fid]
            origin = source_of[fid]
            if origin == aerial or has_origin_or_person(f_ref.props, aerial):
                continue
            outcome = rules.aerial_outcome(buildings[fid].geom, info.footprint)
            if outcome.kind == rules.NOT_COVERED:
                add_observation(f_ref.props, auto_not_covered(aerial))
                count(origin, aerial).not_covered += 1
            else:
                show = min(
                    sets[fid],
                    key=lambda m: (-inputs.year_to[source_of[m]], m),
                )
                review.append(
                    {
                        "type": "aerial_pending",
                        "feature": fid,
                        "aerial": aerial,
                        "show_feature": show,
                        "tile": info.tile,
                    }
                )
                count(origin, aerial).pending += 1

    # Step 4: order.
    for ref in refs.values():
        sort_props(ref.props, ref.origin)
    review.sort(
        key=lambda r: (
            r["type"],
            r.get("feature", ""),
            r.get("plate", r.get("aerial", "")),
            ",".join(r.get("features", [])),
        )
    )
    return MatchResult(docs, review, counts)
