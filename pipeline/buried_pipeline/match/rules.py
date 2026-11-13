"""The pure per-pair rules of `buried match` (spec 02 requirement 13, design.md "match").

Geometry only: shapely objects in EPSG:26917 metres, no file, network or clock access. A building
is compared with the other plate's published buildings and coverage; the outcome says what code
may write (a match candidate, a clear absence, `not_covered`) or that a person must look
(`review`, with the reason). Code never guesses: every case the rules do not cover is a review.
"""

from __future__ import annotations

import math
from collections.abc import Collection, Mapping
from dataclasses import dataclass
from typing import Final

from shapely.geometry.base import BaseGeometry

from buried_pipeline.align.residuals import ceil_tenth

# Defined once, here, and not varied by plate (requirement 13.13). Design values, not tuned on any
# plate; changing one is a reviewed change to design.md.
MATCH_MIN: Final = 0.5
COMPETE_MIN: Final = 0.1
QUAD_SEGS: Final = 16

MATCH_CANDIDATE: Final = "match_candidate"
ABSENT: Final = "absent"
NOT_COVERED: Final = "not_covered"
REVIEW: Final = "review"
PENDING: Final = "pending"

# Review reasons (the text a person reads in the review list).
NO_MAPPED_AREA: Final = "no_mapped_area"
TOO_SMALL: Final = "too_small_for_its_error"
COMPETING: Final = "competing_candidates"
PARTIAL_OVERLAP: Final = "partial_overlap"
PLATE_EDGE: Final = "on_the_plate_edge"
OUTSIDE_REVIEWED: Final = "outside_reviewed_areas"
OVERLAPS_CORE: Final = "footprint_overlaps_core_without_a_match"
NOT_MUTUAL: Final = "not_mutual"
LINK_CLASH: Final = "link_would_put_two_features_from_one_source_in_one_set"


def shrink(geom: BaseGeometry, distance_m: float) -> BaseGeometry:
    """Inward buffer, round joins. The chords of the polygonal arcs make the result very slightly
    larger than the exact one, which errs toward "something touches the core"."""
    return geom.buffer(-distance_m, quad_segs=QUAD_SEGS)


def grow(geom: BaseGeometry, distance_m: float) -> BaseGeometry:
    return geom.buffer(distance_m, quad_segs=QUAD_SEGS)


@dataclass(frozen=True)
class Building:
    id: str
    source: str  # the feature's origin source
    geom: BaseGeometry
    error_m: float
    align_error_m: float | None = None  # its source's alignment error, from its provenance


def own_term_m(b: Building) -> float | None:
    """What a feature's position error holds beyond its source's alignment error: the digitising
    term, and any raise by a reviewer. `sqrt(error^2 - alignment^2)`; None when the alignment error
    is not known. The pairwise figure replaces the alignment error, not this part."""
    if b.align_error_m is None:
        return None
    return math.sqrt(max(b.error_m * b.error_m - b.align_error_m * b.align_error_m, 0.0))


def pair_error(f: Building, g: Building, pairwise_m: float | None) -> float:
    """`e` between two footprints from two plates (requirement 13.2). Without a pairwise figure
    it is the sum of the two position errors. With one, it is the pairwise figure and both
    features' own terms combined as a root-sum-square, rounded up to 0.1 m, the same rule that
    builds a feature's position error."""
    fo, go = own_term_m(f), own_term_m(g)
    if pairwise_m is None or fo is None or go is None:
        return f.error_m + g.error_m
    return float(ceil_tenth(math.sqrt(pairwise_m**2 + fo**2 + go**2)))


@dataclass(frozen=True)
class Plate:
    """What `match` knows about another plate: its evidence file's coverage and buildings."""

    source: str
    mapped_area: BaseGeometry | None
    reviewed_area: BaseGeometry | None  # union of the reviewed areas that attest buildings
    buildings: tuple[Building, ...]
    min_error_m: float  # the smallest position error a feature on this plate can have
    min_own_term_m: float | None = None  # its digitising term: at least 1.0 m and 2 pixels


@dataclass(frozen=True)
class Outcome:
    kind: str
    other: str | None = None  # the other building's id, for MATCH_CANDIDATE
    reason: str | None = None  # for REVIEW
    scores: tuple[tuple[str, float | None], ...] = ()  # (candidate id, r); None when too small


def overlap_score(a: BaseGeometry, b: BaseGeometry, e: float) -> float | None:
    """Requirement 13.2: `r = area(shrink(S, e) ∩ L) / area(shrink(S, e))`, S the smaller by area
    (ties: the smaller well-known binary) and L the larger. None when the shrunk smaller footprint
    is empty. It is symmetric in its footprints."""
    small, large = (a, b) if (a.area, a.wkb) <= (b.area, b.wkb) else (b, a)
    core = shrink(small, e)
    if core.is_empty or core.area <= 0.0:
        return None
    return float(core.intersection(large).area / core.area)


def absence_error(f: Building, plate: Plate, pairwise_m: float | None) -> float:
    """`e_abs`: F's error plus the smallest error a feature on the other plate can have, or with a
    pairwise figure, the pairwise figure with F's own term and that plate's smallest own term."""
    fo = own_term_m(f)
    if pairwise_m is None or fo is None or plate.min_own_term_m is None:
        return f.error_m + plate.min_error_m
    return float(ceil_tenth(math.sqrt(pairwise_m**2 + fo**2 + plate.min_own_term_m**2)))


def plate_outcome(
    f: Building,
    plate: Plate,
    no_link: Collection[str] = frozenset(),
    pairwise_m: float | None = None,
) -> Outcome:
    """Building F against another plate P (design.md "Per pair: F against another plate P").

    `no_link` holds ids on P a person ruled out as F's twin: they are not candidates, but they
    still count as buildings on P when judging an absence. `pairwise_m` is the pairwise alignment
    error of F's plate and P (spec 02 requirement 13.15), or None when the two share fewer than
    four control references.
    """
    if plate.mapped_area is None:
        return Outcome(REVIEW, reason=NO_MAPPED_AREA)
    if not f.geom.intersects(plate.mapped_area):
        return Outcome(NOT_COVERED)

    scored: list[tuple[Building, float, float | None]] = []
    for g in plate.buildings:
        if g.id in no_link:
            continue
        e = pair_error(f, g, pairwise_m)
        if f.geom.distance(g.geom) > e:
            continue
        scored.append((g, e, overlap_score(f.geom, g.geom, e)))
    scores = tuple(sorted((g.id, r) for g, _, r in scored))

    if any(r is None for _, _, r in scored):
        return Outcome(REVIEW, reason=TOO_SMALL, scores=scores)

    strong = [(g, e, r) for g, e, r in scored if r is not None and r >= MATCH_MIN]
    if strong:
        competitors = [
            g.id
            for g, _, r in scored
            if r is not None and r >= COMPETE_MIN and g.id != strong[0][0].id
        ]
        if len(strong) > 1 or competitors:
            return Outcome(REVIEW, reason=COMPETING, scores=scores)
        g, e, _ = strong[0]
        if plate.mapped_area.contains(grow(f.geom, e)):
            return Outcome(MATCH_CANDIDATE, other=g.id, scores=scores)
        return Outcome(REVIEW, reason=PLATE_EDGE, scores=scores)
    if any(r is not None and r >= COMPETE_MIN for _, _, r in scored):
        return Outcome(REVIEW, reason=PARTIAL_OVERLAP, scores=scores)

    # No candidate with real overlap: is this a clear absence?
    e_abs = absence_error(f, plate, pairwise_m)
    core = shrink(f.geom, e_abs)
    if core.is_empty:
        return Outcome(REVIEW, reason=TOO_SMALL, scores=scores)
    if plate.reviewed_area is None or not plate.reviewed_area.contains(grow(f.geom, e_abs)):
        return Outcome(REVIEW, reason=OUTSIDE_REVIEWED, scores=scores)
    if any(g.geom.intersects(core) for g in plate.buildings):
        return Outcome(REVIEW, reason=OVERLAPS_CORE, scores=scores)
    return Outcome(ABSENT, scores=scores)


def aerial_outcome(f_geom: BaseGeometry, footprint: BaseGeometry) -> Outcome:
    """Requirement 13.7: `not_covered` when the photo's footprint misses F; otherwise pending for
    a person. Code never says present or absent from a photograph."""
    if not f_geom.intersects(footprint):
        return Outcome(NOT_COVERED)
    return Outcome(PENDING)


def mutual_matches(
    outcomes: Mapping[tuple[str, str], Outcome], source_of: Mapping[str, str]
) -> tuple[set[tuple[str, str]], dict[tuple[str, str], Outcome]]:
    """Keep a candidate only when it holds from both sides (requirement 13.3).

    `outcomes` maps (building id, other plate source) to the plate outcome; `source_of` maps a
    building id to its origin source. Returns the matched pairs (sorted id tuples) and, for each
    one-sided candidate, a review outcome keyed like `outcomes`.
    """
    pairs: set[tuple[str, str]] = set()
    demoted: dict[tuple[str, str], Outcome] = {}
    for (fid, plate_source), outcome in outcomes.items():
        if outcome.kind != MATCH_CANDIDATE or outcome.other is None:
            continue
        gid = outcome.other
        back = outcomes.get((gid, source_of[fid]))
        if back is not None and back.kind == MATCH_CANDIDATE and back.other == fid:
            pairs.add((min(fid, gid), max(fid, gid)))
        else:
            demoted[(fid, plate_source)] = Outcome(REVIEW, reason=NOT_MUTUAL, scores=outcome.scores)
    return pairs, demoted
