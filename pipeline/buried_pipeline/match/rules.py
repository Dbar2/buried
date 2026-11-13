"""The pure per-pair rules of `buried match` (spec 02 requirement 13, design.md "match").

Geometry only: shapely objects in EPSG:26917 metres, no file, network or clock access. A building
is compared with the other plate's published buildings and coverage; the outcome says what code
may write (a match candidate, a clear absence, `not_covered`) or that a person must look
(`review`, with the reason). Code never guesses: every case the rules do not cover is a review.

The overlap score of two footprints F and G with error `e` is the largest intersection over union
of `F + t` and `G` over shifts `t` with `|t| <= e`, on a lattice of 0.25 m. The lattice does not
depend on `e`, so the set of shifts only grows as `e` grows and the score never decreases.
"""

from __future__ import annotations

import math
from collections.abc import Collection, Mapping
from dataclasses import dataclass
from functools import lru_cache
from typing import Final

import numpy as np
import shapely
from shapely.affinity import translate
from shapely.geometry import Polygon
from shapely.geometry.base import BaseGeometry

from buried_pipeline.align.affine import LocalAffine
from buried_pipeline.align.residuals import ceil_tenth

# Defined once, here, and not varied by plate (requirement 13.13). Design values, not tuned on any
# plate; changing one is a reviewed change to design.md.
MATCH_MIN: Final = 0.5  # the best candidate scores at least this
COMPETE_MIN: Final = 0.3  # and the second-best scores under this
ABSENCE_COVER_MAX: Final = 0.10  # an absence needs every footprint to cover less than this of F
SHIFT_STEP_M: Final = 0.25  # the lattice of shifts; no coarser than 0.25 m

MATCH_CANDIDATE: Final = "match_candidate"
ABSENT: Final = "absent"
NOT_COVERED: Final = "not_covered"
REVIEW: Final = "review"
PENDING: Final = "pending"

# Review reasons (the text a person reads in the review list).
NO_MAPPED_AREA: Final = "no_mapped_area"
TOO_SMALL: Final = "footprint_has_no_area"
COMPETING: Final = "competing_candidates"
PARTIAL_OVERLAP: Final = "partial_overlap"
OVERLAPS_RULED_OUT: Final = "overlaps_a_footprint_a_person_ruled_out"
OUTSIDE_REVIEWED: Final = "outside_reviewed_areas"
NOT_MUTUAL: Final = "not_mutual"
LINK_CLASH: Final = "link_would_put_two_features_from_one_source_in_one_set"


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
    """`e` between two footprints from two plates. Without a pairwise figure it is the sum of the
    two position errors. With one, it is the pairwise figure and both features' own terms combined
    as a root-sum-square, rounded up to 0.1 m, the same rule that builds a feature's position
    error."""
    fo, go = own_term_m(f), own_term_m(g)
    if pairwise_m is None or fo is None or go is None:
        return f.error_m + g.error_m
    return float(ceil_tenth(math.sqrt(pairwise_m**2 + fo**2 + go**2)))


@dataclass(frozen=True)
class Plate:
    """What `match` knows about another plate: its evidence file's coverage and buildings."""

    source: str
    mapped_area: BaseGeometry | None
    reviewed_areas: tuple[BaseGeometry, ...]  # the areas that attest buildings, one by one
    buildings: tuple[Building, ...]
    # Not used by the plate-to-plate rule; kept as part of what `match` knows about a plate.
    min_error_m: float = 0.0


@dataclass(frozen=True)
class PairRegistration:
    """How to bring two plates into one frame for comparison: the registration `T_BA` of plate
    `source_b` onto plate `source_a` and the pairwise error it came with. The two are the plates'
    source ids in sorted order, so one registration serves both directions and both sides of a
    pair score the same numbers."""

    source_a: str
    source_b: str
    pairwise_m: float
    b_to_a: LocalAffine


def transform_geometry(geom: BaseGeometry, t: LocalAffine) -> BaseGeometry:
    """`geom` under a locally held affine; the origins are subtracted first so no small number is
    added to a coordinate near 4.8e6."""

    def apply(coords: np.ndarray) -> np.ndarray:
        d = coords - np.array(t.p0)
        out = np.empty_like(d)
        out[:, 0] = t.a * d[:, 0] + t.b * d[:, 1] + t.q0[0]
        out[:, 1] = t.d * d[:, 0] + t.e * d[:, 1] + t.q0[1]
        return out

    return shapely.transform(geom, apply)


def _in_frame(
    registration: PairRegistration | None, source: str, geom: BaseGeometry
) -> BaseGeometry:
    """`geom`, which belongs to `source`, in plate A's frame. Identity without a registration."""
    if registration is None or source != registration.source_b:
        return geom
    return transform_geometry(geom, registration.b_to_a)


@dataclass(frozen=True)
class Outcome:
    kind: str
    other: str | None = None  # the other building's id, for MATCH_CANDIDATE
    reason: str | None = None  # for REVIEW
    # The unique best-scoring eligible candidate (score above zero), whatever the outcome.
    best: str | None = None
    # (candidate id, best overlap score, most of F's area any shift puts inside the candidate)
    scores: tuple[tuple[str, float, float], ...] = ()


@dataclass(frozen=True)
class Overlap:
    iou: float  # the largest intersection over union over the shifts
    covered: float  # the largest share of the first footprint's area inside the second


@lru_cache(maxsize=512)
def shift_offsets(e: float) -> np.ndarray:
    """Every lattice shift `t` (0.25 m steps, zero included) with `|t| <= e`."""
    k = int(math.floor(e / SHIFT_STEP_M + 1e-9))
    axis = np.arange(-k, k + 1)
    ii, jj = np.meshgrid(axis, axis)
    keep = (ii * ii + jj * jj) * SHIFT_STEP_M**2 <= e * e + 1e-9
    out = np.stack([ii[keep], jj[keep]], axis=1).astype(float) * SHIFT_STEP_M
    out.setflags(write=False)
    return out


def _shifted(geom: BaseGeometry, offsets: np.ndarray) -> np.ndarray:
    if isinstance(geom, Polygon) and not geom.interiors:
        ring = np.asarray(geom.exterior.coords)
        return shapely.polygons(ring[None, :, :] + offsets[:, None, :])
    return np.array([translate(geom, float(dx), float(dy)) for dx, dy in offsets], dtype=object)


def overlap(f_geom: BaseGeometry, g_geom: BaseGeometry, e: float) -> Overlap | None:
    """Shift F by every lattice `t` with `|t| <= e` and compare it with G. None when either
    footprint has no area."""
    if f_geom.area <= 0.0 or g_geom.area <= 0.0:
        return None
    minx, miny, maxx, maxy = f_geom.bounds
    ox, oy = (minx + maxx) / 2.0, (miny + maxy) / 2.0
    f0 = translate(f_geom, -ox, -oy)  # compute near the origin, not near 4.8e6
    g0 = translate(g_geom, -ox, -oy)
    af, ag = f0.area, g0.area
    inter = shapely.area(shapely.intersection(_shifted(f0, shift_offsets(e)), g0))
    iou = inter / (af + ag - inter)
    return Overlap(float(min(iou.max(), 1.0)), float(min((inter / af).max(), 1.0)))


def overlap_score(a: BaseGeometry, b: BaseGeometry, e: float) -> float | None:
    """The largest intersection over union of `a + t` and `b` over `|t| <= e`. Symmetric in its
    footprints (the same one is shifted whichever way round they are given). None when either has
    no area. Never decreases as `e` grows."""
    first, second = (a, b) if (a.area, a.wkb) <= (b.area, b.wkb) else (b, a)
    result = overlap(first, second, e)
    return None if result is None else result.iou


def plate_outcome(
    f: Building,
    plate: Plate,
    no_link: Collection[str] = frozenset(),
    registration: PairRegistration | None = None,
) -> Outcome:
    """Building F against another plate P (design.md "Per pair: F against another plate P").

    `no_link` holds ids on P a person ruled out as F's twin: they are not match candidates, but
    they still count as buildings on P when judging an absence. `registration` brings the two
    plates into one frame and gives the pairwise error (spec 02 requirement 13.15); without one the
    plates are compared as drawn, with the sum of the two position errors as `e`.
    """
    if plate.mapped_area is None:
        return Outcome(REVIEW, reason=NO_MAPPED_AREA)
    fg = _in_frame(registration, f.source, f.geom)
    if not fg.intersects(_in_frame(registration, plate.source, plate.mapped_area)):
        return Outcome(NOT_COVERED)
    if fg.area <= 0.0:
        return Outcome(REVIEW, reason=TOO_SMALL)

    pairwise_m = registration.pairwise_m if registration is not None else None
    rows: list[tuple[Building, Overlap]] = []
    for g in plate.buildings:
        e = pair_error(f, g, pairwise_m)
        gg = _in_frame(registration, g.source, g.geom)
        if fg.distance(gg) > e:
            continue
        ov = overlap(fg, gg, e)
        if ov is not None:
            rows.append((g, ov))
    scores = tuple(sorted((g.id, ov.iou, ov.covered) for g, ov in rows))

    ranked = sorted(
        ((ov.iou, g.id) for g, ov in rows if g.id not in no_link), key=lambda t: (-t[0], t[1])
    )
    best = None
    if ranked and ranked[0][0] > 0.0 and (len(ranked) == 1 or ranked[0][0] > ranked[1][0]):
        best = ranked[0][1]

    if ranked and ranked[0][0] >= MATCH_MIN:
        second = ranked[1][0] if len(ranked) > 1 else 0.0
        if second < COMPETE_MIN:
            return Outcome(MATCH_CANDIDATE, other=ranked[0][1], best=best, scores=scores)
        return Outcome(REVIEW, reason=COMPETING, best=best, scores=scores)

    covering = [g for g, ov in rows if ov.covered >= ABSENCE_COVER_MAX]
    if covering:
        eligible_cover = any(g.id not in no_link for g in covering)
        reason = PARTIAL_OVERLAP if eligible_cover else OVERLAPS_RULED_OUT
        return Outcome(REVIEW, reason=reason, best=best, scores=scores)

    # No footprint covers a tenth of F under any allowed shift: a clear absence if a person has
    # reviewed that spot.
    reviewed = (_in_frame(registration, plate.source, a) for a in plate.reviewed_areas)
    if not any(a.contains(fg) for a in reviewed):
        return Outcome(REVIEW, reason=OUTSIDE_REVIEWED, best=best, scores=scores)
    return Outcome(ABSENT, best=best, scores=scores)


def aerial_outcome(f_geom: BaseGeometry, footprint: BaseGeometry) -> Outcome:
    """Requirement 13.7: `not_covered` when the photo's footprint misses F; otherwise pending for
    a person. Code never says present or absent from a photograph."""
    if not f_geom.intersects(footprint):
        return Outcome(NOT_COVERED)
    return Outcome(PENDING)


def mutual_matches(
    outcomes: Mapping[tuple[str, str], Outcome], source_of: Mapping[str, str]
) -> tuple[set[tuple[str, str]], dict[tuple[str, str], Outcome]]:
    """Keep a candidate only when F is also G's best candidate (requirement 13.3).

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
        if back is not None and back.best == fid:
            pairs.add((min(fid, gid), max(fid, gid)))
        else:
            demoted[(fid, plate_source)] = Outcome(
                REVIEW, reason=NOT_MUTUAL, best=outcome.best, scores=outcome.scores
            )
    return pairs, demoted
