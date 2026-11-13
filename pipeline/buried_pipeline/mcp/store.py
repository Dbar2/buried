"""Read-only access to the committed Buried files, for the `buried-evidence` MCP server.

Everything here reads a file and reports what it says. Nothing derives what the Evidence Library
owns: no evidence windows ("Built by", "Gone by"), no "on this lot", no confidence wording. The one
computed number is a plain distance in EPSG:26917 metres between two geometries, and the one
geometric fact is whether an address point lies inside a lot polygon.

The store never writes. Files under `data/work/` are optional: a deployed checkout has none.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

from shapely.geometry import Point, shape
from shapely.geometry.base import BaseGeometry

ADDRESS_LAYER = "present_toronto_address_points_2026"
LOT_LAYER = "present_toronto_property_boundaries_2026"
SOURCE_ID_RE = re.compile(r"^[a-z0-9]+(_[a-z0-9]+)*$")
MAX_LIMIT = 200
MAX_DISTANCE_M = 5000.0
# No tool result is larger than this many bytes of JSON text. Paged lists stop short of it and
# give a cursor for the rest; the server refuses to send anything bigger (see server.py).
MAX_RESULT_BYTES = 20_000
PAGE_SAFETY_BYTES = 300  # room for the paging fields, the row list's brackets and a longer cursor
DEFAULT_PAGE = 100
HOW_TO_GET_THE_REST = (
    "More rows remain. Call the same tool again with the same arguments and cursor set to "
    "next_cursor."
)
COMPACT_COLUMNS = (
    "id", "kind", "confidence", "area_m2", "centroid", "crop_px", "has_storeys", "confirmed_by",
    "same_as",
)  # fmt: skip
COMPACT_FIELDS_NOTE = (
    "Each row follows columns. crop_px is [x, y, width, height] in source pixels; centroid is "
    "[easting, northing] in EPSG:26917 metres; confirmed_by indexes reviewers (null: none "
    "recorded); same_as counts linked features."
)


class NotFound(LookupError):
    """The thing asked for is not in the committed files."""


class BadRequest(ValueError):
    """The arguments are not usable."""


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _round(value: float) -> float:
    return round(value, 3)


def _clamp_limit(limit: Any, default: int = 20) -> int:
    if limit is None:
        return default
    if isinstance(limit, bool) or not isinstance(limit, int) or limit < 1:
        raise BadRequest("limit must be a positive integer")
    return min(limit, MAX_LIMIT)


def _source_id(value: Any, name: str = "source_id") -> str:
    if not isinstance(value, str) or not SOURCE_ID_RE.fullmatch(value):
        raise BadRequest(f"{name} must be a lowercase snake_case source id")
    return value


def _json_size(value: Any) -> int:
    """Bytes of the compact JSON text the server sends for `value` (UTF-8)."""
    return len(json.dumps(value, separators=(",", ":"), sort_keys=True, ensure_ascii=False)
               .encode("utf-8"))  # fmt: skip


def _cursor(value: Any, total: int) -> int:
    if value is None:
        return 0
    if not isinstance(value, str) or not value.isdigit() or int(value) > total:
        raise BadRequest("cursor must be the next_cursor string a previous call returned")
    return int(value)


def _page(
    rows: list[Any], cursor: Any, limit: int, base: dict[str, Any]
) -> tuple[list[Any], dict[str, Any]]:
    """One page of `rows` starting at `cursor`: at most `limit` rows, and few enough that the
    whole result (`base`, which is everything but the rows, plus the rows and the paging fields)
    stays under MAX_RESULT_BYTES. A page always holds at least one row when any remain."""
    start = _cursor(cursor, len(rows))
    room = MAX_RESULT_BYTES - PAGE_SAFETY_BYTES - _json_size(base)
    page: list[Any] = []
    used = 0
    for row in rows[start:]:
        size = _json_size(row) + 1
        if len(page) >= limit or (page and used + size > room):
            break
        page.append(row)
        used += size
    end = start + len(page)
    more = end < len(rows)
    paging: dict[str, Any] = {
        "total": len(rows),
        "start": start,
        "returned": len(page),
        "more": more,
        "next_cursor": str(end) if more else None,
    }
    if more:
        paging["how_to_get_the_rest"] = HOW_TO_GET_THE_REST
    return page, paging


def _compact(f: dict[str, Any], reviewers: dict[str, int]) -> list[Any]:
    """The short form of a feature, one value per COMPACT_COLUMNS name: what an agent needs to
    pick a feature out and check it, not what it needs to cite it. Rows are arrays under a
    shared `columns` list, because repeating key names is most of a row's size."""
    props = f["properties"]
    prov = props.get("provenance", {})
    crop = prov.get("crop_px")
    who = prov.get("confirmed_by")
    geom = shape(f["geometry"])
    c = geom.centroid
    return [
        f["id"],
        props.get("kind"),
        props.get("confidence"),
        round(geom.area, 1),
        [round(c.x, 1), round(c.y, 1)],
        [crop["x"], crop["y"], crop["width"], crop["height"]] if crop else None,
        props.get("attributes", {}).get("storeys") is not None,
        reviewers[who] if who else None,
        len(props.get("same_as", [])),
    ]


def _reviewers_of(features: list[dict[str, Any]]) -> dict[str, int]:
    names = sorted({f["properties"].get("provenance", {}).get("confirmed_by") or ""
                    for f in features} - {""})  # fmt: skip
    return {n: i for i, n in enumerate(names)}


class EvidenceStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.data = root / "data"
        self._cache: dict[str, Any] = {}

    # --- files ---------------------------------------------------------------------------------

    def _cached(self, key: str, path: Path) -> Any:
        if key not in self._cache:
            if not path.is_file():
                raise NotFound(f"{path.relative_to(self.root).as_posix()} does not exist")
            self._cache[key] = _read(path)
        return self._cache[key]

    def _layer(self, source_id: str) -> dict[str, Any]:
        return self._cached(source_id, self.data / "present" / f"{source_id}.geojson")

    def _geometry(self, key: str, feature: dict[str, Any]) -> BaseGeometry:
        cache_key = f"geom:{key}:{feature.get('id')}"
        if cache_key not in self._cache:
            self._cache[cache_key] = shape(feature["geometry"])
        return self._cache[cache_key]

    def _evidence_files(self) -> dict[str, dict[str, Any]]:
        out = {}
        for path in sorted((self.data / "evidence").glob("*.geojson")):
            out[path.stem] = self._cached(f"evidence:{path.stem}", path)
        return out

    # --- places --------------------------------------------------------------------------------

    def find_places(self, query: Any, limit: Any = None, cursor: Any = None) -> dict[str, Any]:
        """Address points whose full address contains every word of `query` (case-insensitive),
        or the lot with that parcel id, each with the lots whose polygon contains the point.
        Paged: `limit` rows at most, fewer when the result would pass MAX_RESULT_BYTES."""
        if not isinstance(query, str) or not query.strip():
            raise BadRequest("query must be a non-empty string")
        n = _clamp_limit(limit)
        words = query.lower().split()
        lots = self._layer(LOT_LAYER)["features"]
        lot_hit = [f for f in lots if str(f["id"]) == query.strip()]
        addresses = []
        for f in self._layer(ADDRESS_LAYER)["features"]:
            text = str(f["properties"].get("ADDRESS_FULL", ""))
            if all(w in text.lower() for w in words):
                addresses.append((text, str(f["id"]), f))
        addresses.sort(key=lambda t: (t[0], t[1]))
        start = _cursor(cursor, len(addresses))
        rows = []
        for text, fid, f in addresses[start : start + MAX_LIMIT]:
            point = self._geometry(ADDRESS_LAYER, f)
            rows.append(
                {
                    "address_id": fid,
                    "address": text,
                    "easting": _round(point.x),
                    "northing": _round(point.y),
                    "lots_containing_the_point": self._lots_containing(point),
                    "source": ADDRESS_LAYER,
                }
            )
        base = {
            "query": query,
            "address_matches": len(addresses),
            "lots": [
                {"lot_id": str(f["id"]), "area_m2": _round(self._geometry(LOT_LAYER, f).area),
                 "source": LOT_LAYER}
                for f in lot_hit
            ],
            "note": "The lots listed for an address are the polygons that contain the address "
            "point. That is a geometric fact about two layers, not a finding about a lot.",
            "coordinate_system": "EPSG:26917",
        }  # fmt: skip
        page, _ = _page(rows, None, n, base)
        end = start + len(page)
        more = end < len(addresses)
        paging = {
            "start": start,
            "returned": len(page),
            "more": more,
            "next_cursor": str(end) if more else None,
            **({"how_to_get_the_rest": HOW_TO_GET_THE_REST} if more else {}),
        }
        return {**base, "addresses": page, **paging}

    def _lots_containing(self, point: Point) -> list[str]:
        out = []
        for f in self._layer(LOT_LAYER)["features"]:
            if self._geometry(LOT_LAYER, f).contains(point):
                out.append(str(f["id"]))
        return sorted(out)

    # --- features near a place -----------------------------------------------------------------

    def _place_geometry(self, args: dict[str, Any]) -> tuple[BaseGeometry, dict[str, Any]]:
        given = [k for k in ("lot_id", "address_id") if args.get(k) is not None]
        has_point = args.get("easting") is not None or args.get("northing") is not None
        if len(given) + (1 if has_point else 0) != 1:
            raise BadRequest("give exactly one of lot_id, address_id, or easting with northing")
        if "lot_id" in given:
            lot_id = str(args["lot_id"])
            for f in self._layer(LOT_LAYER)["features"]:
                if str(f["id"]) == lot_id:
                    return self._geometry(LOT_LAYER, f), {"lot_id": lot_id, "source": LOT_LAYER}
            raise NotFound(f"no lot {lot_id} in {LOT_LAYER}")
        if "address_id" in given:
            address_id = str(args["address_id"])
            for f in self._layer(ADDRESS_LAYER)["features"]:
                if str(f["id"]) == address_id:
                    return self._geometry(ADDRESS_LAYER, f), {
                        "address_id": address_id,
                        "address": f["properties"].get("ADDRESS_FULL"),
                        "source": ADDRESS_LAYER,
                    }
            raise NotFound(f"no address point {address_id} in {ADDRESS_LAYER}")
        easting, northing = args.get("easting"), args.get("northing")
        for name, v in (("easting", easting), ("northing", northing)):
            if isinstance(v, bool) or not isinstance(v, int | float):
                raise BadRequest(f"{name} must be a number (EPSG:26917 metres)")
        return Point(float(easting), float(northing)), {
            "easting": easting,
            "northing": northing,
            "coordinate_system": "EPSG:26917",
        }

    def features_near(self, args: dict[str, Any]) -> dict[str, Any]:
        """Evidence features within `distance_m` of a lot, an address point or a point, with what
        their files say. Sorted by distance, then id. No judgement about "on this lot".

        `source` keeps one evidence file's features. `compact` gives the short form (see
        `_compact`). Paged by `limit` and `cursor`; a page also stops before the result would pass
        MAX_RESULT_BYTES."""
        distance = args.get("distance_m", 25.0)
        if isinstance(distance, bool) or not isinstance(distance, int | float) or distance < 0:
            raise BadRequest("distance_m must be a number of metres, 0 or more")
        if distance > MAX_DISTANCE_M:
            raise BadRequest(f"distance_m is at most {MAX_DISTANCE_M:g}")
        compact = args.get("compact", False)
        if not isinstance(compact, bool):
            raise BadRequest("compact must be true or false")
        n = _clamp_limit(args.get("limit"), DEFAULT_PAGE if compact else 50)
        statuses = args.get("status", ["published"])
        if not isinstance(statuses, list) or not all(isinstance(s, str) for s in statuses):
            raise BadRequest("status must be a list of strings")
        only = _source_id(args["source"], "source") if args.get("source") is not None else None
        place, place_info = self._place_geometry(args)

        found: list[tuple[float, str, dict[str, Any], str]] = []
        for origin, doc in self._evidence_files().items():
            if only is not None and origin != only:
                continue
            for f in doc["features"]:
                props = f["properties"]
                if statuses and props.get("status") not in statuses:
                    continue
                d = float(place.distance(self._geometry(f"evidence:{origin}", f)))
                if d <= float(distance):
                    found.append((d, f["id"], f, origin))
        found.sort(key=lambda t: (t[0], t[1]))
        reviewers = _reviewers_of([t[2] for t in found])
        rows: list[Any] = []
        for d, _, f, origin in found:
            if compact:
                rows.append(_compact(f, reviewers))
            else:
                rows.append(self._feature_facts(f, d, origin))
        base: dict[str, Any] = {
            "place": place_info,
            "distance_m": distance,
            "distance_note": "Straight-line distance in EPSG:26917 metres from the place to the "
            "feature's drawn footprint (0: they touch or overlap as drawn). Not a finding.",
        }
        if compact:
            base["columns"] = list(COMPACT_COLUMNS)
            base["reviewers"] = list(reviewers)
            base["compact_fields"] = COMPACT_FIELDS_NOTE
        page, paging = _page(rows, args.get("cursor"), n, base)
        return {**base, **paging, ("rows" if compact else "features"): page}

    @staticmethod
    def _feature_facts(f: dict[str, Any], distance_m: float, origin: str) -> dict[str, Any]:
        props = f["properties"]
        prov = props.get("provenance", {})
        sources = sorted({o["source"] for o in props.get("observations", [])} | {origin})
        return {
            "id": f["id"],
            "kind": props.get("kind"),
            "status": props.get("status"),
            "distance_m": _round(distance_m),
            "position_error_m": props.get("position_error_m"),
            "confidence": props.get("confidence"),
            "confidence_reason": props.get("confidence_reason"),
            "attributes": props.get("attributes", {}),
            "observations": props.get("observations", []),
            "same_as": props.get("same_as", []),
            "provenance": prov,
            "source_ids": sources,
            "origin_source": origin,
        }

    # --- sources -------------------------------------------------------------------------------

    def list_sources(self, source_id: Any = None, source_type: Any = None) -> dict[str, Any]:
        registry = self._cached("sources", self.data / "sources.json")
        rows = registry["sources"]
        if source_id is not None:
            rows = [s for s in rows if s["id"] == _source_id(source_id)]
            if not rows:
                raise NotFound(f"{source_id} is not in data/sources.json")
        if source_type is not None:
            rows = [s for s in rows if s["type"] == source_type]
        keep = (
            "id", "type", "title", "year_from", "year_to", "years_label", "holding", "url",
            "licence_note", "attribution_line", "attribution_status", "rights_checked_on",
            "held_out",
        )  # fmt: skip
        return {
            "sources": [{k: s[k] for k in keep if k in s} for s in rows],
            "note": "Rights and attribution as recorded in data/sources.json, which has a row in "
            ".kiro/steering/sources.md for each source.",
        }

    # --- alignment -----------------------------------------------------------------------------

    def alignment(self, source_id: Any) -> dict[str, Any]:
        sid = _source_id(source_id)
        record = self._cached(f"alignment:{sid}", self.data / "alignment" / f"{sid}.json")
        out: dict[str, Any] = {"source": sid, "record": record}
        control = self.data / "control" / f"{sid}.json"
        if control.is_file():
            doc = self._cached(f"control:{sid}", control)
            out["control_points"] = [
                {k: p[k] for k in ("id", "description", "pixel", "reference", "reference_source",
                                   "reference_kind", "reference_feature_id") if k in p}
                for p in doc["points"]
            ]  # fmt: skip
        out["control_hull"] = record.get("control_hull")
        out["control_hull_area_m2"] = record.get("control_hull_area_m2")
        out["note"] = (
            "alignment_error_m is the figure measured inside control_hull. Outside the hull it "
            "is an extrapolation."
        )
        return out

    # --- work in progress ----------------------------------------------------------------------

    def plate_work(self, source_id: Any, limit: Any = None, cursor: Any = None) -> dict[str, Any]:
        """What is under `data/work/` for a plate: its proposals and its reviewer decisions, as
        counts and the files' own header fields, and the flagged proposals one by one (id, flags,
        score, area, crop), paged. Empty, with a note, when there is none."""
        sid = _source_id(source_id)
        n = _clamp_limit(limit, DEFAULT_PAGE)
        out: dict[str, Any] = {"source": sid}
        flagged_rows: list[dict[str, Any]] = []
        proposals = self.data / "work" / "proposals" / f"{sid}.geojson"
        if proposals.is_file():
            doc = _read(proposals)
            feats = doc.get("features", [])
            scores = sorted(
                f["properties"]["quality"]["score"]
                for f in feats
                if isinstance(f.get("properties", {}).get("quality"), dict)
            )
            tone_classes = Counter(str(f["properties"].get("tone_class")) for f in feats)
            weaknesses = Counter(
                w for f in feats for w in f["properties"].get("weaknesses", [])
            )
            for f in feats:
                p = f["properties"]
                if not p.get("weaknesses"):
                    continue
                crop = p.get("crop_px")
                quality = p.get("quality")
                flagged_rows.append(
                    {
                        "id": f.get("id"),
                        "flags": list(p["weaknesses"]),
                        "score": quality.get("score") if isinstance(quality, dict) else None,
                        "area_m2": p.get("area_m2"),
                        "crop_px": [crop["x"], crop["y"], crop["width"], crop["height"]]
                        if isinstance(crop, dict) else None,
                    }
                )  # fmt: skip
            flagged_rows.sort(key=lambda r: (str(r["id"]),))
            out["proposals"] = {
                "file": proposals.relative_to(self.root).as_posix(),
                "count": len(feats),
                "flagged_count": len(flagged_rows),
                "header": {
                    k: v
                    for k, v in doc.items()
                    if k not in ("features", "type") and not isinstance(v, dict | list)
                },
                "tone_classes": dict(sorted(tone_classes.items())),
                "weaknesses": dict(sorted(weaknesses.items())),
                "quality_score_quartiles": (
                    [scores[int(q * (len(scores) - 1))] for q in (0.0, 0.25, 0.5, 0.75, 1.0)]
                    if scores
                    else []
                ),
            }
        else:
            out["proposals"] = None
        decisions = self.data / "work" / "review" / f"{sid}.json"
        if decisions.is_file():
            doc = _read(decisions)
            items = doc.get("decisions", []) if isinstance(doc, dict) else []
            kinds = Counter(str(d.get("type", d.get("decision"))) for d in items)
            out["decisions"] = {
                "file": decisions.relative_to(self.root).as_posix(),
                "count": len(items),
                "by_kind": dict(sorted(kinds.items())),
                "reviewed_areas": len(doc.get("reviewed_areas", [])) if isinstance(doc, dict)
                else 0,
                "confirmed_by": sorted(
                    {str(d["confirmed_by"]) for d in items if d.get("confirmed_by")}
                ),
            }
        else:
            out["decisions"] = None
        if out["proposals"] is None and out["decisions"] is None:
            out["note"] = (
                "Nothing under data/work/ for this plate. That folder is gitignored, so a "
                "checkout that did not run extract and review has none."
            )
        if out["proposals"] is not None:
            page, paging = _page(flagged_rows, cursor, n, out)
            out["flagged"] = page
            out["flagged_note"] = (
                "Proposals with at least one weakness flag, sorted by id. crop_px is "
                "[x, y, width, height] in source pixels."
            )
            out.update(paging)
        return out

    def plate_features(
        self, source_id: Any, limit: Any = None, cursor: Any = None, status: Any = None
    ) -> dict[str, Any]:
        """Every feature of one evidence file in the short form (see `_compact`), each with
        whether its centroid lies inside the plate's control hull. The hull is the alignment
        record's own polygon; the test is a plain point-in-polygon in EPSG:26917. Paged."""
        sid = _source_id(source_id)
        n = _clamp_limit(limit, DEFAULT_PAGE)
        statuses = ["published"] if status is None else status
        if not isinstance(statuses, list) or not all(isinstance(s, str) for s in statuses):
            raise BadRequest("status must be a list of strings")
        path = self.data / "evidence" / f"{sid}.geojson"
        doc = self._cached(f"evidence:{sid}", path)
        hull = self._hull(sid)
        feats = [
            f for f in doc["features"]
            if not statuses or f["properties"].get("status") in statuses
        ]  # fmt: skip
        feats.sort(key=lambda f: f["id"])
        reviewers = _reviewers_of(feats)
        rows: list[Any] = []
        inside = outside = 0
        for f in feats:
            row = _compact(f, reviewers)
            if hull is None:
                row.append(None)
            else:
                centroid = self._geometry(f"evidence:{sid}", f).centroid
                is_inside = bool(hull.covers(centroid))
                row.append(is_inside)
                inside += is_inside
                outside += not is_inside
            rows.append(row)
        base: dict[str, Any] = {
            "source": sid,
            "statuses": statuses,
            "columns": [*COMPACT_COLUMNS, "inside_control_hull"],
            "reviewers": list(reviewers),
            "compact_fields": COMPACT_FIELDS_NOTE,
            "control_hull_note": (
                "inside_control_hull is whether the feature's centroid lies inside the convex hull "
                "of the plate's control points (data/alignment). The alignment error is measured "
                "inside the hull; outside it the figure is an extrapolation."
                if hull is not None
                else "No usable control hull for this source, so inside_control_hull is null."
            ),
            "inside_control_hull_count": inside,
            "outside_control_hull_count": outside,
        }
        page, paging = _page(rows, cursor, n, base)
        return {**base, **paging, "rows": page}

    def _hull(self, sid: str) -> BaseGeometry | None:
        """The control hull polygon of a plate's alignment record, None when it has none that
        encloses an area."""
        path = self.data / "alignment" / f"{sid}.json"
        if not path.is_file():
            return None
        raw = self._cached(f"alignment:{sid}", path).get("control_hull")
        if not isinstance(raw, dict) or not raw.get("coordinates"):
            return None
        try:
            hull = shape(raw)
        except (ValueError, TypeError, KeyError, IndexError):
            return None
        return hull if not hull.is_empty and hull.area > 0 else None
