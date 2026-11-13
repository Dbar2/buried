"""The proposal file (design.md "Proposal file", requirement 8.2): ids, georeferencing, sorting and
byte-stable serialisation. Pure; the file I/O is in `run.py`.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Sequence
from typing import Any

from shapely.geometry import Polygon

from buried_pipeline.extract.maparea import MapArea, Mapping, bounding_box, ground_polygon
from buried_pipeline.extract.params import ExtractParams
from buried_pipeline.extract.polygons import PixelRing, georeference
from buried_pipeline.extract.propose import Candidate

CRS = "EPSG:26917"
DECIMALS = 6


def proposal_id(
    source_id: str, params_id: str, alignment_record_sha256: str, ring: PixelRing
) -> str:
    """`<source id>_p_` plus 12 hex characters of SHA-256 over the source id, the parameter set id,
    the alignment record's SHA-256 and the full-resolution integer pixel polygon."""
    payload = json.dumps(
        [source_id, params_id, alignment_record_sha256, [list(p) for p in ring]],
        separators=(",", ":"),
    )
    return f"{source_id}_p_{hashlib.sha256(payload.encode('utf-8')).hexdigest()[:12]}"


def _round_coords(value: Any) -> Any:
    if isinstance(value, float):
        return round(value, DECIMALS)
    if isinstance(value, list | tuple):
        return [_round_coords(v) for v in value]
    return value


def build_collection(
    source_id: str,
    params: ExtractParams,
    alignment_record_sha256: str,
    map_area: MapArea,
    candidates: Sequence[Candidate],
    mapping: Mapping,
) -> tuple[dict[str, Any], int]:
    """The proposal file as a dict, and how many candidates were dropped for being below
    `regions.min_area_m2` once georeferenced (their ground area, not their pixel count, decides).

    Each geometry is the chosen transform applied to the proposal's own pixel polygon, vertex for
    vertex (the ring is closed by repeating the first vertex)."""
    features: list[dict[str, Any]] = []
    below_minimum = 0
    for cand in candidates:
        ring, ground = georeference(cand.pixel_polygon, mapping)
        area = Polygon(ground).area
        if round(area, DECIMALS) < params.regions.min_area_m2:
            below_minimum += 1
            continue
        pid = proposal_id(source_id, params.id, alignment_record_sha256, ring)
        q = cand.quality
        features.append(
            {
                "type": "Feature",
                "id": pid,
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[e, n] for e, n in [*ground, ground[0]]]],
                },
                "properties": {
                    "tone_class": cand.tone_class,
                    "pixel_polygon": [[x, y] for x, y in ring],
                    "crop_px": bounding_box(ring),
                    "area_m2": round(area, DECIMALS),
                    "quality": {
                        "score": round(q.score, DECIMALS),
                        "outline_closure": round(q.outline_closure, DECIMALS),
                        "fill_uniformity": round(q.fill_uniformity, DECIMALS),
                        "text_clear": round(q.text_clear, DECIMALS),
                        "edge_clear": round(q.edge_clear, DECIMALS),
                        "shape_fidelity": round(q.shape_fidelity, DECIMALS),
                    },
                    "weaknesses": list(cand.weaknesses),
                },
            }
        )
    features.sort(key=lambda f: f["id"])
    ids = [f["id"] for f in features]
    if len(set(ids)) != len(ids):  # pragma: no cover - two regions cannot share a pixel polygon
        raise ValueError("duplicate proposal ids")

    doc: dict[str, Any] = {
        "type": "FeatureCollection",
        "crs": CRS,
        "source": source_id,
        "params_id": params.id,
        "params_sha256": params.sha256,
        "alignment_record_sha256": alignment_record_sha256,
        "map_area_sha256": map_area.sha256,
        "map_area_px": [[x, y] for x, y in map_area.pixel_polygon],
        "map_area_geometry": _round_coords(ground_polygon(mapping, map_area.pixel_polygon)),
        "features": features,
    }
    return doc, below_minimum


def dumps(doc: dict[str, Any]) -> str:
    """Sorted keys, fixed separators, trailing newline: the same document gives the same bytes."""
    return json.dumps(doc, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n"
