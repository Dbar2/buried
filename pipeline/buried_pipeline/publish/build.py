"""Proposals plus decisions plus an alignment record become an evidence file (spec 02 design
"Building features"). Pure: no files, no clock, no network.

Nothing is guessed. A feature is built only from an accepted decision that names its reviewer and
time; the position error is the root-sum-square rule, raised (never lowered) by the reviewer; the
origin observation is `method: origin`; `material` is refused without a recorded read; ids continue
after the highest sequence ever used in the file, in any status, and existing features are copied
unchanged.
"""

from __future__ import annotations

import copy
import json
import math
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from shapely.geometry import Point, Polygon

from buried_pipeline.align.residuals import ceil_tenth
from buried_pipeline.extract.maparea import Mapping, bounding_box, vertices_outside_raster
from buried_pipeline.extract.polygons import georeference
from buried_pipeline.publish.decisions import (
    AttributeRead,
    Decision,
    Decisions,
    Problem,
    PublishRefusal,
    ReviewedAreaDecision,
    TraceDecision,
)
from buried_pipeline.schema_version import SCHEMA_VERSION

CRS = "EPSG:26917"
MIN_DIGITISING_M = 1.0
MAX_SEQUENCE = 9999
MAP_AREA_SLACK_PX = 1.0  # a reviewed area may touch the map area's edge, to the pixel


@dataclass(frozen=True)
class BuildInputs:
    source_id: str
    proposals: dict[str, Any]  # the proposal file (spec 02 design "Proposal file")
    decisions: Decisions
    existing: dict[str, Any] | None  # the current evidence file, if any
    alignment_error_m: float
    source_pixel_size_m: float
    alignment_record_sha256: str  # of the alignment record now on disk
    mapping: Mapping
    raster_size: tuple[int, int]  # full-resolution width, height in pixels


@dataclass(frozen=True)
class Counts:
    accepted: int = 0  # confirmed accept decisions that name a proposal
    published_now: int = 0
    already_published: int = 0
    rejected: int = 0
    undecided: int = 0  # no decision, or an accept with no reviewer or time
    unconfirmed: int = 0  # accepts with no reviewer or time (a subset of undecided)

    def as_dict(self) -> dict[str, int]:
        return {
            "accepted": self.accepted,
            "published_now": self.published_now,
            "already_published": self.already_published,
            "rejected": self.rejected,
            "undecided": self.undecided,
            "unconfirmed": self.unconfirmed,
        }


@dataclass(frozen=True)
class BuildResult:
    doc: dict[str, Any]
    counts: Counts
    new_feature_ids: tuple[str, ...] = ()
    review_item_by_feature: dict[str, str] = field(default_factory=dict)


# --- small pure rules -----------------------------------------------------------------------------


def digitising_error_m(source_pixel_size_m: float) -> float:
    """`max(1.0, 2 x source pixel size)` metres (requirement 10.4)."""
    return max(MIN_DIGITISING_M, 2.0 * source_pixel_size_m)


def feature_position_error_m(
    alignment_error_m: float, source_pixel_size_m: float, reviewer_m: float | None
) -> float:
    """The root-sum-square of the alignment error and the digitising term, rounded up to 0.1 m,
    or the reviewer's larger value. Never smaller than the rule (requirement 10.4)."""
    rule = ceil_tenth(math.hypot(alignment_error_m, digitising_error_m(source_pixel_size_m)))
    return max(rule, reviewer_m) if reviewer_m is not None else rule


def canonical_text(doc: Any) -> str:
    """The canonical serialisation of spec 04 "Conventions": the same document, the same bytes."""
    return json.dumps(doc, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


def _sequence_of(feature_id: str, source_id: str) -> int | None:
    m = re.fullmatch(rf"(?:bld|wtr|use)_{re.escape(source_id)}_(\d{{4}})", feature_id)
    return int(m.group(1)) if m else None


def next_sequence(existing_features: Sequence[dict[str, Any]], source_id: str) -> int:
    """One more than the highest sequence in the file in any status (requirement 10.6)."""
    seqs = [s for f in existing_features if (s := _sequence_of(f.get("id", ""), source_id))]
    return max(seqs, default=0) + 1


def _published_proposal_ids(existing: dict[str, Any] | None) -> set[str]:
    if not existing:
        return set()
    return {
        f["properties"]["provenance"]["proposal_id"]
        for f in existing.get("features", [])
        if "proposal_id" in f.get("properties", {}).get("provenance", {})
    }


def _closed(ground: list[tuple[float, float]]) -> list[list[float]]:
    return [[e, n] for e, n in [*ground, ground[0]]]


def _normalised_covers(covers: Sequence[str] | None) -> tuple[str, ...]:
    return tuple(sorted(covers)) if covers else ("building",)


# --- checks that name the cause -------------------------------------------------------------------


def _check_reads(
    attributes: dict[str, Any], reads: Sequence[AttributeRead], item: str, out: list[Problem]
) -> None:
    """The rules for attribute reads that every feature kind shares (spec 01 requirement 25)."""
    if "material" in attributes and not any(r.attribute == "material" for r in reads):
        out.append(Problem("material was set without a read: a material comes only from the "
                           "plate's lettering or legend, with the crop it was read from", item))
    for r in reads:
        if r.attribute not in attributes:
            out.append(Problem(f"a read is recorded for {r.attribute}, but the decision sets no "
                               f"{r.attribute}", item))
    names = [r.attribute for r in reads]
    if len(set(names)) != len(names):
        out.append(Problem("more than one read for the same attribute", item))


def _check_decision(
    d: Decision, i: BuildInputs, proposal: dict[str, Any], out: list[Problem]
) -> None:
    pid = d.proposal_id
    if d.pixel_polygon is not None:
        outside = vertices_outside_raster(d.pixel_polygon, *i.raster_size)
        if outside:
            out.append(Problem(f"pixel_polygon has vertices outside the plate "
                               f"({i.raster_size[0]} x {i.raster_size[1]} px): {outside[:3]}", pid))
    _check_reads(d.attributes, d.attribute_reads, pid, out)
    if d.confidence == "documented" and "storeys" not in d.attributes:
        out.append(Problem("documented needs storeys read from the plate; give storeys or use "
                           "estimated", pid))


def _check_trace(t: TraceDecision, i: BuildInputs, out: list[Problem]) -> None:
    """A land-use area lies wholly inside the plate's map area (requirement 24, and the map area
    rule: nothing outside it is published), and the crop its use was read from lies on the plate.
    That it has a use and a read for it is checked where the file is read."""
    item = t.review_item_id
    width, height = i.raster_size
    outside = vertices_outside_raster(t.pixel_polygon, width, height)
    if outside:
        out.append(Problem(f"the traced area has vertices outside the plate ({width} x "
                           f"{height} px): {outside[:3]}", item))
    elif not Polygon(i.proposals["map_area_px"]).covers(Polygon(t.pixel_polygon)):
        out.append(Problem("the traced area is not wholly inside the plate's map area", item))
    for r in t.attribute_reads:
        c = r.crop_px
        if c["x"] + c["width"] > width or c["y"] + c["height"] > height:
            out.append(Problem(f"the crop the {r.attribute} was read from is outside the plate "
                               f"({width} x {height} px)", item))
    _check_reads(t.attributes, t.attribute_reads, item, out)


def _check_area(a: ReviewedAreaDecision, index: int, i: BuildInputs, out: list[Problem]) -> None:
    outside = vertices_outside_raster(a.pixel_polygon, *i.raster_size)
    if outside:
        out.append(Problem(f"reviewed area #{index} has vertices outside the plate: "
                           f"{outside[:3]}"))
        return
    map_area = Polygon(i.proposals["map_area_px"])
    if not map_area.buffer(MAP_AREA_SLACK_PX).contains(Polygon(a.pixel_polygon)):
        out.append(Problem(f"reviewed area #{index} is not inside the plate's map area"))


def _undecided_in_areas(
    proposals: Sequence[dict[str, Any]],
    decided: set[str],
    areas: Sequence[ReviewedAreaDecision],
) -> list[str]:
    """Proposals with no usable decision whose pixel centroid lies in a reviewed area that
    attests buildings (requirement 23.7)."""
    shapes = [
        Polygon(a.pixel_polygon) for a in areas if "building" in _normalised_covers(a.covers)
    ]
    names: list[str] = []
    for p in proposals:
        if p["id"] in decided:
            continue
        centroid = Point(Polygon(p["properties"]["pixel_polygon"]).centroid)
        if any(s.covers(centroid) for s in shapes):
            names.append(p["id"])
    return names


# --- building -------------------------------------------------------------------------------------


def _feature(
    d: Decision,
    proposal: dict[str, Any],
    seq: int,
    i: BuildInputs,
) -> dict[str, Any]:
    props = proposal["properties"]
    if d.pixel_polygon is None:
        geometry = copy.deepcopy(proposal["geometry"])
        crop = dict(props["crop_px"])
    else:
        ring, ground = georeference(d.pixel_polygon, i.mapping)
        geometry = {"type": "Polygon", "coordinates": [_closed(ground)]}
        crop = bounding_box(ring)

    digitising = digitising_error_m(i.source_pixel_size_m)
    if d.confidence is not None:
        confidence, reason = d.confidence, d.confidence_reason
    else:
        confidence = "estimated"
        reason = (
            f"Footprint read from {i.source_id}; storeys not recorded"
            if "storeys" not in d.attributes
            else f"Footprint read from {i.source_id}; the reviewer did not state a confidence"
        )
    assert d.confirmed_at is not None  # only confirmed decisions reach here
    provenance: dict[str, Any] = {
        "origin_source": i.source_id,
        "crop_px": crop,
        "alignment_error_m": i.alignment_error_m,
        "digitising_error_m": digitising,
        "confirmed_by": d.confirmed_by,
        "confirmed_at": d.confirmed_at,
        "proposal_id": d.proposal_id,
        "extraction_params_id": i.proposals["params_id"],
        "tone_class": props["tone_class"],
    }
    if d.attribute_reads:
        provenance["attribute_reads"] = _read_records(d.attribute_reads, d.confirmed_by,
                                                      d.confirmed_at)
    return {
        "type": "Feature",
        "id": f"bld_{i.source_id}_{seq:04d}",
        "geometry": geometry,
        "properties": {
            "kind": "building",
            "position_error_m": feature_position_error_m(
                i.alignment_error_m, i.source_pixel_size_m, d.position_error_m
            ),
            "attributes": dict(d.attributes),
            "observations": [
                {"source": i.source_id, "present": True, "visibility": "clear",
                 "method": "origin"}
            ],
            "confidence": confidence,
            "confidence_reason": reason,
            "provenance": provenance,
            "status": "published",
        },
    }


def _read_records(
    reads: Sequence[AttributeRead], confirmed_by: str, confirmed_at: str
) -> list[dict[str, Any]]:
    return [
        {
            "attribute": r.attribute,
            "crop_px": dict(r.crop_px),
            "read_by": r.read_by,
            **({"provider": r.provider, "model_id": r.model_id} if r.provider else {}),
            "confirmed_by": confirmed_by,
            "confirmed_at": confirmed_at,
        }
        for r in reads
    ]


def _land_use_feature(t: TraceDecision, seq: int, i: BuildInputs) -> dict[str, Any]:
    """A land-use area from a person's trace: the traced pixel polygon through the chosen
    transform, the use as lettered with the crop it was read from, and the same position error and
    provenance rules as a building. It has no proposal, so no `extraction_params_id` and no
    `tone_class`; `proposal_id` holds its review item id."""
    ring, ground = georeference(t.pixel_polygon, i.mapping)
    if t.confidence is not None:
        confidence, reason = t.confidence, t.confidence_reason
    else:
        confidence = "documented"
        reason = f"Area and use traced by a person from {i.source_id}"
    provenance: dict[str, Any] = {
        "origin_source": i.source_id,
        "crop_px": bounding_box(ring),
        "alignment_error_m": i.alignment_error_m,
        "digitising_error_m": digitising_error_m(i.source_pixel_size_m),
        "confirmed_by": t.confirmed_by,
        "confirmed_at": t.confirmed_at,
        "proposal_id": t.review_item_id,
        "attribute_reads": _read_records(t.attribute_reads, t.confirmed_by, t.confirmed_at),
    }
    return {
        "type": "Feature",
        "id": f"use_{i.source_id}_{seq:04d}",
        "geometry": {"type": "Polygon", "coordinates": [_closed(ground)]},
        "properties": {
            "kind": "land_use",
            "position_error_m": feature_position_error_m(
                i.alignment_error_m, i.source_pixel_size_m, t.position_error_m
            ),
            "attributes": dict(t.attributes),
            "observations": [
                {"source": i.source_id, "present": True, "visibility": "clear",
                 "method": "origin"}
            ],
            "confidence": confidence,
            "confidence_reason": reason,
            "provenance": provenance,
            "status": "published",
        },
    }


def _reviewed_area(a: ReviewedAreaDecision, mapping: Mapping) -> dict[str, Any]:
    ring, ground = georeference(a.pixel_polygon, mapping)
    area: dict[str, Any] = {
        "geometry": {"type": "Polygon", "coordinates": [_closed(ground)]},
        "method": "person",
        "pixel_polygon": [[x, y] for x, y in ring],
        "confirmed_by": a.confirmed_by,
        "confirmed_at": a.confirmed_at,
    }
    if a.covers is not None:
        area["covers"] = list(a.covers)
    return area


def _same_area(new: dict[str, Any], old: dict[str, Any]) -> bool:
    return (
        new["geometry"] == old.get("geometry")
        and _normalised_covers(new.get("covers")) == _normalised_covers(old.get("covers"))
    )


def build_evidence(i: BuildInputs) -> BuildResult:
    """The would-be evidence file. Raises `PublishRefusal` naming every cause."""
    problems: list[Problem] = []
    if i.proposals.get("source") != i.source_id:
        raise PublishRefusal([Problem(f"the proposal file is for {i.proposals.get('source')!r}, "
                                      f"not {i.source_id!r}")])
    if i.proposals.get("alignment_record_sha256") != i.alignment_record_sha256:
        raise PublishRefusal([Problem(
            "the alignment record has changed since these proposals were made; run "
            f"`buried extract {i.source_id}` again and review the new proposals"
        )])
    if not i.decisions.reviewed_areas:
        problems.append(Problem("publishing needs at least one reviewed area: the reviewer's "
                                "statement that every building the plate draws inside it has "
                                "been accepted or rejected"))
    for k, area in enumerate(i.decisions.reviewed_areas):
        _check_area(area, k, i, problems)

    proposals: list[dict[str, Any]] = i.proposals["features"]
    by_id = {p["id"]: p for p in proposals}
    existing_features: list[dict[str, Any]] = (i.existing or {}).get("features", [])
    published = _published_proposal_ids(i.existing)

    for d in i.decisions.decisions:
        if d.proposal_id not in by_id and d.proposal_id not in published:
            problems.append(Problem("this proposal is not in the proposal file", d.proposal_id))
        elif d.decision == "accept" and d.confirmed and d.proposal_id not in published:
            _check_decision(d, i, by_id[d.proposal_id], problems)

    for t in i.decisions.traces:
        if t.review_item_id not in published:
            _check_trace(t, i, problems)

    decision_of = {d.proposal_id: d for d in i.decisions.decisions}
    decided = {
        pid for pid in by_id
        if pid in published
        or (pid in decision_of
            and (decision_of[pid].decision == "reject" or decision_of[pid].confirmed))
    }
    unnamed = _undecided_in_areas(proposals, decided, i.decisions.reviewed_areas)
    for pid in unnamed:
        problems.append(Problem("this proposal lies inside a reviewed area but has no accepted "
                                "or rejected decision from a named reviewer", pid))
    if problems:
        raise PublishRefusal(problems)

    seq = next_sequence(existing_features, i.source_id)
    new_features: list[dict[str, Any]] = []
    review_item_by_feature: dict[str, str] = {}
    published_now = already = rejected = undecided = unconfirmed = accepted = 0
    for p in proposals:  # the proposal file is sorted by id, so ids are assigned in a fixed order
        pid = p["id"]
        d = decision_of.get(pid)
        if pid in published:
            already += 1
            accepted += int(d is not None and d.decision == "accept" and d.confirmed)
        elif d is None:
            undecided += 1
        elif d.decision == "reject":
            rejected += 1
        elif not d.confirmed:
            undecided += 1
            unconfirmed += 1
        else:
            accepted += 1
            if seq > MAX_SEQUENCE:
                raise PublishRefusal([Problem(f"{i.source_id} has no feature numbers left")])
            feature = _feature(d, p, seq, i)
            new_features.append(feature)
            review_item_by_feature[feature["id"]] = pid
            published_now += 1
            seq += 1
    for t in i.decisions.traces:  # sorted by review item id: the same file gives the same ids
        accepted += 1
        if t.review_item_id in published:
            already += 1
            continue
        if seq > MAX_SEQUENCE:
            raise PublishRefusal([Problem(f"{i.source_id} has no feature numbers left")])
        feature = _land_use_feature(t, seq, i)
        new_features.append(feature)
        review_item_by_feature[feature["id"]] = t.review_item_id
        published_now += 1
        seq += 1

    reviewed = copy.deepcopy((i.existing or {}).get("reviewed_areas", []))
    for a in i.decisions.reviewed_areas:
        new_area = _reviewed_area(a, i.mapping)
        if not any(_same_area(new_area, old) for old in reviewed):
            reviewed.append(new_area)

    doc: dict[str, Any] = {
        "type": "FeatureCollection",
        "schema_version": SCHEMA_VERSION,
        "crs": CRS,
        "origin_source": i.source_id,
        "mapped_area": {
            "geometry": copy.deepcopy(i.proposals["map_area_geometry"]),
            "method": "map_area",
        },
    }
    if reviewed:
        doc["reviewed_areas"] = reviewed
    doc["features"] = [*copy.deepcopy(existing_features), *new_features]
    return BuildResult(
        doc=doc,
        counts=Counts(accepted, published_now, already, rejected, undecided, unconfirmed),
        new_feature_ids=tuple(f["id"] for f in new_features),
        review_item_by_feature=review_item_by_feature,
    )
