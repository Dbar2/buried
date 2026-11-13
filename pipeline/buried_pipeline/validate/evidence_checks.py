"""Cross-file checks for evidence files (`data/evidence/*.geojson`).

Pure functions over parsed, schema-valid data. The clock is passed in through the Context. Linked
sets are found with a union-find over `same_as`: graph bookkeeping, not date logic (8.7).
"""

from __future__ import annotations

import math
import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

from buried_pipeline.align.residuals import ceil_tenth
from buried_pipeline.validate.context import Context, Doc
from buried_pipeline.validate.errors import ValidationError, err
from buried_pipeline.validate.geometry import geometry_problems, position_outside, to_shape

TOLERANCE = 1e-9
COVERAGE_SLACK_M = 0.01
ID_RE = re.compile(r"^(bld|wtr|use)_(.+)_(\d{4})$")
KIND_BY_PREFIX = {"bld": "building", "wtr": "water", "use": "land_use"}
REVIEW_STATE_SCHEMA = (1, 2, 0)  # the first schema whose features carry provenance.review


def parse_time(value: str) -> datetime:
    t = datetime.fromisoformat(value)
    return t if t.tzinfo else t.replace(tzinfo=UTC)


@dataclass(frozen=True)
class FeatureRef:
    doc: Doc
    index: int
    feature: dict[str, Any]

    @property
    def id(self) -> str:
        return self.feature["id"]

    @property
    def props(self) -> dict[str, Any]:
        return self.feature["properties"]

    @property
    def origin(self) -> str:
        return self.doc.doc["origin_source"]

    @property
    def pointer(self) -> str:
        return f"/features/{self.index}"

    @property
    def published(self) -> bool:
        return self.props["status"] == "published"


def index_features(docs: Sequence[Doc]) -> tuple[dict[str, FeatureRef], list[ValidationError]]:
    """All features by id, plus an error for each id that appears more than once (8.4)."""
    by_id: dict[str, FeatureRef] = {}
    errors: list[ValidationError] = []
    for d in docs:
        for i, f in enumerate(d.doc["features"]):
            ref = FeatureRef(d, i, f)
            if ref.id in by_id:
                first = by_id[ref.id]
                errors.append(
                    err(d.path, f"{ref.pointer}/id",
                        f"duplicate feature id (also in {first.doc.path} at {first.pointer})",
                        ref.id)
                )
            else:
                by_id[ref.id] = ref
    return by_id, errors


# --- per-file checks ----------------------------------------------------------------------------


def _check_file(d: Doc, ctx: Context) -> list[ValidationError]:
    out: list[ValidationError] = []
    version = tuple(int(n) for n in d.doc["schema_version"].split("."))
    if version < REVIEW_STATE_SCHEMA:
        out.append(err(d.path, "/schema_version", "an evidence file carries provenance.review "
                       f"from schema {'.'.join(map(str, REVIEW_STATE_SCHEMA))}; run "
                       "the review-state migration or write the file again"))
    origin = d.doc["origin_source"]
    if origin != d.name:
        out.append(err(d.path, "/origin_source", f"origin_source {origin} does not match the "
                       f"file name {d.name}"))
    s = ctx.sources.get(origin)
    if s is None:
        out.append(err(d.path, "/origin_source", f"source {origin} is not in data/sources.json"))
    elif s["attribution_status"] != "confirmed":
        out.append(err(d.path, "/origin_source", f"source {origin} has attribution_status "
                       f"{s['attribution_status']}"))

    mapped = d.doc.get("mapped_area")
    reviewed = d.doc.get("reviewed_areas", [])
    has_map_area_file = origin in ctx.map_areas
    if has_map_area_file and mapped is not None and mapped["method"] != "map_area":
        out.append(err(d.path, "/mapped_area/method", f"{origin} has a map area file, so "
                       "mapped_area must have method map_area"))
    if mapped is not None and mapped["method"] == "map_area" and not has_map_area_file:
        out.append(err(d.path, "/mapped_area/method", "method map_area needs "
                       f"data/control/map_area/{origin}.json, which does not exist"))
    if mapped is not None:
        for suffix, reason in geometry_problems(mapped["geometry"]):
            out.append(err(d.path, f"/mapped_area/geometry{suffix}", reason))
        if ctx.bounds and position_outside(mapped["geometry"]["coordinates"], ctx.bounds):
            out.append(err(d.path, "/mapped_area/geometry", "outside the project bounds"))
    if reviewed and mapped is None:
        out.append(err(d.path, "/reviewed_areas", "reviewed areas need a mapped_area"))
    for i, area in enumerate(reviewed):
        problems = geometry_problems(area["geometry"])
        for suffix, reason in problems:
            out.append(err(d.path, f"/reviewed_areas/{i}/geometry{suffix}", reason))
        if ctx.bounds and position_outside(area["geometry"]["coordinates"], ctx.bounds):
            out.append(err(d.path, f"/reviewed_areas/{i}/geometry", "outside the project bounds"))
        if mapped is not None and not problems and not geometry_problems(mapped["geometry"]):
            if not to_shape(mapped["geometry"]).buffer(COVERAGE_SLACK_M).contains(
                to_shape(area["geometry"])
            ):
                out.append(err(d.path, f"/reviewed_areas/{i}/geometry",
                               "reviewed area is not inside the mapped_area"))
        if "confirmed_at" in area and parse_time(area["confirmed_at"]) > ctx.now:
            out.append(err(d.path, f"/reviewed_areas/{i}/confirmed_at", "is in the future"))
    return out


# --- per-feature checks -------------------------------------------------------------------------


def _check_identity(ref: FeatureRef) -> list[ValidationError]:
    out: list[ValidationError] = []
    p = ref.doc.path
    m = ID_RE.match(ref.id)
    if m is None or m.group(2) != ref.origin:
        out.append(err(p, f"{ref.pointer}/id", f"id does not contain the file's origin source "
                       f"{ref.origin}", ref.id))
    elif KIND_BY_PREFIX[m.group(1)] != ref.props["kind"]:
        out.append(err(p, f"{ref.pointer}/id", "id prefix does not match kind", ref.id))
    if ref.props["provenance"]["origin_source"] != ref.origin:
        out.append(err(p, f"{ref.pointer}/properties/provenance/origin_source",
                       f"differs from the file's origin_source {ref.origin}", ref.id))
    return out


def _check_geometry(ref: FeatureRef, ctx: Context) -> list[ValidationError]:
    out = [
        err(ref.doc.path, f"{ref.pointer}/geometry{suffix}", reason, ref.id)
        for suffix, reason in geometry_problems(ref.feature["geometry"])
    ]
    if ctx.bounds and position_outside(ref.feature["geometry"]["coordinates"], ctx.bounds):
        out.append(err(ref.doc.path, f"{ref.pointer}/geometry", "a position is outside the "
                       "project bounds", ref.id))
    return out


def _is_traced_aerial_origin(o: dict[str, Any], ref: FeatureRef) -> bool:
    """Requirement 27.1: the origin observation of a feature a person traced from this aerial.
    It is a clear presence from the feature's own origin source; the person who traced it is
    named in the feature's provenance (confirmed_by is required there)."""
    return (
        o["method"] == "origin"
        and o["source"] == ref.origin
        and o["present"]
        and o["visibility"] == "clear"
    )


def _check_attribute_reads(ref: FeatureRef, ctx: Context) -> list[ValidationError]:
    """Requirements 25.2 and 25.3: a material has a read, one read per attribute, no orphan."""
    out: list[ValidationError] = []
    p = ref.doc.path
    attributes = ref.props["attributes"]
    prov = ref.props["provenance"]
    reads = prov.get("attribute_reads", [])
    base = f"{ref.pointer}/properties/provenance/attribute_reads"
    seen: dict[str, int] = {}
    for k, r in enumerate(reads):
        name = r["attribute"]
        if name in seen:
            out.append(err(p, f"{base}/{k}/attribute", f"second read for {name} (first at index "
                           f"{seen[name]})", ref.id))
        seen.setdefault(name, k)
        if name not in attributes:
            out.append(err(p, f"{base}/{k}/attribute", f"read for {name}, but the feature has no "
                           f"{name} attribute", ref.id))
        if parse_time(r["confirmed_at"]) > ctx.now:
            out.append(err(p, f"{base}/{k}/confirmed_at", "is in the future", ref.id))
    if "material" in attributes and "material" not in seen:
        out.append(err(p, f"{ref.pointer}/properties/attributes/material", "a material needs a "
                       "provenance.attribute_reads entry for material: it comes only from "
                       "lettering or the legend, never from a grey tone", ref.id))
    return out


def _check_observations(
    ref: FeatureRef, ctx: Context, all_features: dict[str, FeatureRef]
) -> list[ValidationError]:
    out: list[ValidationError] = []
    p = ref.doc.path
    obs_list = ref.props["observations"]
    same_as = {link["feature"] for link in ref.props.get("same_as", [])}
    seen: dict[str, int] = {}
    for j, o in enumerate(obs_list):
        ptr = f"{ref.pointer}/properties/observations/{j}"
        src = ctx.sources.get(o["source"])
        if src is None:
            out.append(err(p, f"{ptr}/source", f"source {o['source']} is not in "
                           "data/sources.json", ref.id))
        else:
            if src["attribution_status"] != "confirmed":
                out.append(err(p, f"{ptr}/source", f"source {o['source']} has attribution_status "
                               f"{src['attribution_status']}", ref.id))
            if src["year_from"] is None:
                out.append(err(p, f"{ptr}/source", f"source {o['source']} has no year_from yet",
                               ref.id))
            if (
                src["type"] == "aerial_photograph"
                and o["visibility"] in ("clear", "obscured")
                and o["method"] != "person"
                and not _is_traced_aerial_origin(o, ref)
            ):
                out.append(err(p, f"{ptr}/method", "a clear or obscured aerial observation must "
                               "be set by a person; code never reads a photograph", ref.id))
        if o["source"] in seen:
            out.append(err(p, f"{ptr}/source", f"second observation from {o['source']} (first at "
                           f"index {seen[o['source']]})", ref.id))
        seen.setdefault(o["source"], j)
        if o["method"] == "origin" and o["source"] != ref.origin:
            out.append(err(p, f"{ptr}/method", "method origin is only for the origin source",
                           ref.id))
        if o["source"] == ref.origin and o["method"] != "origin":
            out.append(err(p, f"{ptr}/method", "the origin source's observation must have "
                           "method origin", ref.id))
        if "confirmed_at" in o and parse_time(o["confirmed_at"]) > ctx.now:
            out.append(err(p, f"{ptr}/confirmed_at", "is in the future", ref.id))
        if o["method"] == "match_auto" and o["present"]:
            target = all_features.get(o["matched_feature"])
            if target is None:
                out.append(err(p, f"{ptr}/matched_feature", f"{o['matched_feature']} does not "
                               "exist", ref.id))
            else:
                if not target.published:
                    out.append(err(p, f"{ptr}/matched_feature", f"{target.id} is not published",
                                   ref.id))
                if target.id not in same_as:
                    out.append(err(p, f"{ptr}/matched_feature", f"{target.id} is not in this "
                                   "feature's same_as", ref.id))
                if target.origin != o["source"]:
                    out.append(err(p, f"{ptr}/matched_feature", f"{target.id} comes from "
                                   f"{target.origin}, not from {o['source']}", ref.id))
    origin_obs = [o for o in obs_list if o["source"] == ref.origin]
    if not origin_obs:
        out.append(err(p, f"{ref.pointer}/properties/observations", "no observation from the "
                       f"origin source {ref.origin}", ref.id))
    elif not any(o["present"] and o["visibility"] == "clear" for o in origin_obs):
        out.append(err(p, f"{ref.pointer}/properties/observations", "no clear presence from the "
                       f"origin source {ref.origin}", ref.id))
    return out


def _check_error_budget(ref: FeatureRef, ctx: Context) -> list[ValidationError]:
    out: list[ValidationError] = []
    p = ref.doc.path
    prov = ref.props["provenance"]
    record = ctx.alignment.get(ref.origin)
    if record is None or record.get("status") != "measured":
        out.append(err(p, f"{ref.pointer}/properties/provenance", f"{ref.origin} has no measured "
                       f"alignment record at data/alignment/{ref.origin}.json", ref.id))
    else:
        a = record["alignment_error_m"]
        if prov["alignment_error_m"] != a:
            out.append(err(p, f"{ref.pointer}/properties/provenance/alignment_error_m",
                           f"{prov['alignment_error_m']!r} differs from the alignment record's "
                           f"{a!r}", ref.id))
        d = prov["digitising_error_m"]
        floor = 2.0 * record["source_pixel_size_m"]
        if d < floor - TOLERANCE:
            out.append(err(p, f"{ref.pointer}/properties/provenance/digitising_error_m",
                           f"{d!r} m is less than 2 source pixels ({floor!r} m)", ref.id))
        required = ceil_tenth(math.hypot(a, d))
        if ref.props["position_error_m"] < required - TOLERANCE:
            out.append(err(p, f"{ref.pointer}/properties/position_error_m",
                           f"{ref.props['position_error_m']!r} m is less than the root-sum-square "
                           f"of the alignment error ({a!r} m) and the digitising error ({d!r} m), "
                           f"rounded up to 0.1 m ({required!r} m)", ref.id))
    if parse_time(prov["confirmed_at"]) > ctx.now:
        out.append(err(p, f"{ref.pointer}/properties/provenance/confirmed_at", "is in the future",
                       ref.id))
    return out


def _check_status_links(
    ref: FeatureRef, all_features: dict[str, FeatureRef]
) -> list[ValidationError]:
    out: list[ValidationError] = []
    p = ref.doc.path
    target_id = ref.props.get("merged_into")
    if target_id is not None:
        if target_id == ref.id:
            out.append(err(p, f"{ref.pointer}/properties/merged_into", "a feature cannot be "
                           "merged into itself", ref.id))
        elif target_id not in all_features:
            out.append(err(p, f"{ref.pointer}/properties/merged_into", f"{target_id} does not "
                           "exist", ref.id))
    for k, link in enumerate(ref.props.get("same_as", [])):
        ptr = f"{ref.pointer}/properties/same_as/{k}"
        target = all_features.get(link["feature"])
        if link["feature"] == ref.id:
            out.append(err(p, f"{ptr}/feature", "a feature cannot link to itself", ref.id))
            continue
        if target is None:
            out.append(err(p, f"{ptr}/feature", f"{link['feature']} does not exist", ref.id))
            continue
        if target.props["kind"] != ref.props["kind"]:
            out.append(err(p, f"{ptr}/feature", f"{target.id} is a {target.props['kind']}, not a "
                           f"{ref.props['kind']}", ref.id))
        if not target.published:
            out.append(err(p, f"{ptr}/feature", f"{target.id} is not published", ref.id))
        back = [b for b in target.props.get("same_as", []) if b["feature"] == ref.id]
        if not back:
            out.append(err(p, f"{ptr}/feature", f"not mirrored: {target.id} has no link back",
                           ref.id))
        elif back[0]["method"] != link["method"]:
            out.append(err(p, f"{ptr}/method", f"{target.id} links back with method "
                           f"{back[0]['method']}, not {link['method']}", ref.id))
    return out


def _check_link_times(ref: FeatureRef, ctx: Context) -> list[ValidationError]:
    out: list[ValidationError] = []
    for k, link in enumerate(ref.props.get("same_as", [])):
        if "confirmed_at" in link and parse_time(link["confirmed_at"]) > ctx.now:
            out.append(err(ref.doc.path, f"{ref.pointer}/properties/same_as/{k}/confirmed_at",
                           "is in the future", ref.id))
    return out


def _linked_set_errors(all_features: dict[str, FeatureRef]) -> list[ValidationError]:
    """Requirement 17.3: no two members of a linked set share an origin source."""
    parent: dict[str, str] = {fid: fid for fid, r in all_features.items() if r.published}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for fid, ref in all_features.items():
        if not ref.published:
            continue
        for link in ref.props.get("same_as", []):
            other = link["feature"]
            if other in parent and other != fid:
                parent[find(fid)] = find(other)

    groups: dict[str, list[str]] = {}
    for fid in parent:
        groups.setdefault(find(fid), []).append(fid)

    out: list[ValidationError] = []
    for members in groups.values():
        by_origin: dict[str, list[str]] = {}
        for fid in sorted(members):
            by_origin.setdefault(all_features[fid].origin, []).append(fid)
        for origin, ids in by_origin.items():
            if len(ids) > 1:
                for fid in ids:
                    ref = all_features[fid]
                    others = ", ".join(i for i in ids if i != fid)
                    out.append(err(ref.doc.path, f"{ref.pointer}/properties/same_as",
                                   f"linked set holds two features from {origin} ({others}); two "
                                   "features on one source are a merge, not a link", fid))
    return out


def _check_review(ref: FeatureRef, ctx: Context) -> list[ValidationError]:
    """`reviewed` names a person and a day that is not in the future. The Schema checks the
    shape (by and on for reviewed, neither for a draft)."""
    review = ref.props["provenance"]["review"]
    if review["state"] == "reviewed" and date.fromisoformat(review["on"]) > ctx.now.date():
        return [err(ref.doc.path, f"{ref.pointer}/properties/provenance/review/on",
                    "is in the future", ref.id)]
    return []


def check_evidence(docs: Sequence[Doc], ctx: Context) -> list[ValidationError]:
    all_features, out = index_features(docs)
    for d in docs:
        out.extend(_check_file(d, ctx))
        if ctx.project is None and d.doc["features"]:
            out.append(err(d.path, "/features", "data/project.json is missing, so bounds cannot "
                           "be checked"))
    for ref in all_features.values():
        out.extend(_check_identity(ref))
        out.extend(_check_review(ref, ctx))
        out.extend(_check_geometry(ref, ctx))
        out.extend(_check_observations(ref, ctx, all_features))
        out.extend(_check_attribute_reads(ref, ctx))
        out.extend(_check_error_budget(ref, ctx))
        out.extend(_check_status_links(ref, all_features))
        out.extend(_check_link_times(ref, ctx))
    out.extend(_linked_set_errors(all_features))
    return sorted(set(out))
