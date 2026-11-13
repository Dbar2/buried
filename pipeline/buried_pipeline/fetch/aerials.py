"""`buried fetch --aerial-candidates`: list the 1947 aerial records over the showcase plates.

Queries the U of T index layer with an envelope, writes `data/work/aerial_candidates.json` and
downloads no imagery (spec 02 requirement 3). A person checks the list, records the chosen ids in
`sources.md`, and adds them to the Registry; the normal `fetch` path then downloads them.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from typing import Any

from buried_pipeline.errors import PipelineError
from buried_pipeline.inspect.report import Bounds
from buried_pipeline.inspect.run import plate_bounds
from buried_pipeline.io.atomic import atomic_write_json
from buried_pipeline.io.http import HttpClient
from buried_pipeline.io.registry import SOURCE_ID_RE, Registry
from buried_pipeline.paths import Paths

AERIAL_INDEX_URL = (
    "https://services1.arcgis.com/9NvE8jKNWWlDGsUJ/arcgis/rest/services/"
    "Toronto_Aerial_Photographs_1947_Index/FeatureServer/0"
)
AERIAL_ID_FIELD = "Name"
AERIAL_ZIP_FIELD = "zip_url"
AERIAL_JPEG_FIELD = "url"
AERIAL_THUMB_FIELD = "thumbnail_url"
MAX_CANDIDATES = 10
SOURCE_PREFIX = "aerial_1947_"
EPSG_UTM17N = 26917
# The index stores paths with spaces ("Black and White"); the host and folder are pinned, and the
# file name must be the record's own name (checked by `check_aerial_url`).
ZIP_URL_RE = re.compile(
    r"^https://maps\.library\.utoronto\.ca/datapub/toronto/air_photos_1947/"
    r"(?:[A-Za-z]|%20| )+/(?P<name>[a-z0-9_]+)\.zip$"
)


def union_bounds(bounds: list[Bounds]) -> Bounds:
    if not bounds:
        raise PipelineError("No plate bounds to query with")
    return (
        min(b[0] for b in bounds),
        min(b[1] for b in bounds),
        max(b[2] for b in bounds),
        max(b[3] for b in bounds),
    )


def query_params(bounds: Bounds) -> dict[str, str]:
    min_e, min_n, max_e, max_n = bounds
    return {
        "where": "1=1",
        "geometry": f"{min_e},{min_n},{max_e},{max_n}",
        "geometryType": "esriGeometryEnvelope",
        "inSR": str(EPSG_UTM17N),
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": ",".join(
            [AERIAL_ID_FIELD, AERIAL_JPEG_FIELD, AERIAL_ZIP_FIELD, AERIAL_THUMB_FIELD]
        ),
        "returnGeometry": "true",
        "outSR": str(EPSG_UTM17N),
        "f": "json",
    }


def proposed_source_id(name: str) -> str:
    source_id = SOURCE_PREFIX + name.lower()
    if not SOURCE_ID_RE.match(source_id):
        raise PipelineError(
            f"Aerial record name {name!r} does not lowercase to a source id "
            f"({SOURCE_ID_RE.pattern}); nothing was written"
        )
    return source_id


def check_aerial_url(source_id: str, url: str) -> None:
    """The URL guard for aerials: U of T's 1947 folder only, and the file is the record's own."""
    match = ZIP_URL_RE.match(url)
    if not match:
        raise PipelineError(f"{source_id}: URL does not match the 1947 aerial pattern: {url}")
    if SOURCE_PREFIX + match.group("name") != source_id:
        raise PipelineError(f"{source_id}: URL names {match.group('name')}, not this record")


def _rings_bounds(rings: list[list[list[float]]]) -> dict[str, float]:
    xs = [p[0] for ring in rings for p in ring]
    ys = [p[1] for ring in rings for p in ring]
    return {"min_e": min(xs), "min_n": min(ys), "max_e": max(xs), "max_n": max(ys)}


def parse_candidates(response: Any) -> list[dict[str, Any]]:
    """Candidates from an ArcGIS query response, sorted by record name."""
    if not isinstance(response, Mapping):
        raise PipelineError("The aerial index returned something that is not a JSON object")
    if "error" in response:
        raise PipelineError(f"The aerial index query failed: {response['error']}")
    if response.get("exceededTransferLimit"):
        raise PipelineError(
            f"The aerial index query hit the server's transfer limit, which is more than "
            f"{MAX_CANDIDATES} records. The query is wrong for a few blocks; no file was written."
        )
    features = response.get("features")
    if not isinstance(features, list):
        raise PipelineError("The aerial index response has no feature list")
    if len(features) > MAX_CANDIDATES:
        raise PipelineError(
            f"The aerial index returned {len(features)} records (limit {MAX_CANDIDATES}). The "
            "showcase area is a few blocks, so the query is wrong; no file was written."
        )
    out: list[dict[str, Any]] = []
    for feature in features:
        attrs = feature.get("attributes") or {}
        rings = (feature.get("geometry") or {}).get("rings")
        name = attrs.get(AERIAL_ID_FIELD)
        if not isinstance(name, str) or not name:
            raise PipelineError(f"An aerial record has no {AERIAL_ID_FIELD}: {attrs}")
        if not rings:
            raise PipelineError(f"Aerial record {name} has no footprint geometry")
        zip_url = attrs.get(AERIAL_ZIP_FIELD)
        if not isinstance(zip_url, str):
            raise PipelineError(f"Aerial record {name} has no {AERIAL_ZIP_FIELD}")
        check_aerial_url(proposed_source_id(name), zip_url)
        out.append(
            {
                "Name": name,
                "source_id": proposed_source_id(name),
                "zip_url": zip_url,
                "url": attrs.get(AERIAL_JPEG_FIELD),
                "thumbnail_url": attrs.get(AERIAL_THUMB_FIELD),
                "footprint_bounds": _rings_bounds(rings),
                "footprint_rings": rings,
            }
        )
    ids = [c["source_id"] for c in out]
    if len(set(ids)) != len(ids):
        raise PipelineError("The aerial index returned the same record name twice")
    return sorted(out, key=lambda c: c["source_id"])


def run_aerial_candidates(
    paths: Paths,
    registry: Registry,
    http: HttpClient,
    out: Callable[[str], None] = print,
) -> list[dict[str, Any]]:
    bounds = union_bounds(plate_bounds(paths, registry))
    response = http.get_json(AERIAL_INDEX_URL + "/query", query_params(bounds))
    candidates = parse_candidates(response)
    doc = {
        "query_bounds_26917": dict(zip(("min_e", "min_n", "max_e", "max_n"), bounds, strict=True)),
        "index": AERIAL_INDEX_URL,
        "candidates": candidates,
    }
    path = paths.work / "aerial_candidates.json"
    atomic_write_json(path, doc)
    out(
        f"{len(candidates)} aerial records intersect the plates; "
        f"wrote {path.relative_to(paths.root)}"
    )
    for c in candidates:
        b = c["footprint_bounds"]
        out(
            f"  {c['source_id']}: footprint E {b['min_e']:.0f} to {b['max_e']:.0f}, "
            f"N {b['min_n']:.0f} to {b['max_n']:.0f}"
        )
    return candidates
