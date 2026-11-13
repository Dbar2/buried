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


def _source_id(value: Any) -> str:
    if not isinstance(value, str) or not SOURCE_ID_RE.fullmatch(value):
        raise BadRequest("source_id must be a lowercase snake_case source id")
    return value


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

    def find_places(self, query: Any, limit: Any = None) -> dict[str, Any]:
        """Address points whose full address contains every word of `query` (case-insensitive),
        or the lot with that parcel id, each with the lots whose polygon contains the point."""
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
        found_addresses = []
        for text, fid, f in addresses[:n]:
            point = self._geometry(ADDRESS_LAYER, f)
            found_addresses.append(
                {
                    "address_id": fid,
                    "address": text,
                    "easting": _round(point.x),
                    "northing": _round(point.y),
                    "lots_containing_the_point": self._lots_containing(point),
                    "source": ADDRESS_LAYER,
                }
            )
        return {
            "query": query,
            "addresses": found_addresses,
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
        their files say. Sorted by distance, then id. No judgement about "on this lot"."""
        distance = args.get("distance_m", 25.0)
        if isinstance(distance, bool) or not isinstance(distance, int | float) or distance < 0:
            raise BadRequest("distance_m must be a number of metres, 0 or more")
        if distance > MAX_DISTANCE_M:
            raise BadRequest(f"distance_m is at most {MAX_DISTANCE_M:g}")
        n = _clamp_limit(args.get("limit"), 50)
        statuses = args.get("status", ["published"])
        if not isinstance(statuses, list) or not all(isinstance(s, str) for s in statuses):
            raise BadRequest("status must be a list of strings")
        place, place_info = self._place_geometry(args)

        rows: list[tuple[float, str, dict[str, Any]]] = []
        for origin, doc in self._evidence_files().items():
            for f in doc["features"]:
                props = f["properties"]
                if statuses and props.get("status") not in statuses:
                    continue
                d = float(place.distance(shape(f["geometry"])))
                if d <= float(distance):
                    rows.append((d, f["id"], self._feature_facts(f, d, origin)))
        rows.sort(key=lambda t: (t[0], t[1]))
        return {
            "place": place_info,
            "distance_m": distance,
            "distance_note": "Straight-line distance in EPSG:26917 metres from the place to the "
            "feature's drawn footprint. 0 means they touch or overlap as drawn. It is not a "
            "finding: the position errors below say how far the drawing may be off.",
            "total": len(rows),
            "features": [r[2] for r in rows[:n]],
        }

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

    def plate_work(self, source_id: Any) -> dict[str, Any]:
        """What is under `data/work/` for a plate: its proposals and its reviewer decisions, as
        counts and the files' own header fields. Empty, with a note, when there is none."""
        sid = _source_id(source_id)
        out: dict[str, Any] = {"source": sid}
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
            out["proposals"] = {
                "file": proposals.relative_to(self.root).as_posix(),
                "count": len(feats),
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
        return out
