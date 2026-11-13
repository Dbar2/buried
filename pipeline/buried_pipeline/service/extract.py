"""`POST /v1/extract` (spec 04 task 6.1): spec 02's extraction on a region of a registered plate.

Nothing is stored. The same inputs are read and the same pure functions run on every call; there
is no path by which an earlier result, for any plate, could be returned (requirements 1.5, 17.1).
The held-out plate goes through exactly this code and no other.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from buried_pipeline.errors import PipelineError
from buried_pipeline.extract.maparea import load_map_area
from buried_pipeline.extract.params import load_params
from buried_pipeline.extract.region import RegionTooLarge, check_region
from buried_pipeline.extract.run import extract_document
from buried_pipeline.inspect.georef import read_raster_info
from buried_pipeline.publish.build import canonical_text
from buried_pipeline.service.errors import ServiceError
from buried_pipeline.service.snapshot import Snapshot
from buried_pipeline.tile.run import check_source, chosen_mapping, read_pixels
from buried_pipeline.validate.geometry import position_outside


def alignment_record_for(
    snap: Snapshot, source_id: str, text: str | None
) -> tuple[dict[str, Any], str]:
    """The alignment record the request names, or canon's, and the SHA-256 of its bytes. A plate
    with neither is refused (requirement 8.4)."""
    if text is None:
        path = snap.paths.alignment_record(source_id)
        if not path.is_file():
            raise ServiceError(
                "not_allowed",
                f"{source_id} has no alignment record in the request or in canon; align the "
                "plate first",
            )
        raw = path.read_bytes()
    else:
        raw = text.encode("utf-8")
    try:
        record = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ServiceError(
            "invalid_request", "alignment_record_text is not valid JSON",
            [{"pointer": "/alignment_record_text", "reason": str(exc)[:160]}],
        ) from exc  # fmt: skip
    problems = snap.schema.issues("alignmentRecord", record)
    if problems:
        raise ServiceError(
            "invalid_request", "the alignment record does not match the Schema",
            [{"pointer": f"/alignment_record_text{i.pointer}", "reason": i.message}
             for i in problems],
        )  # fmt: skip
    if record["source"] != source_id:
        raise ServiceError("invalid_request", f"the alignment record is for {record['source']}, "
                           f"not {source_id}")
    if record["status"] != "measured":
        raise ServiceError("not_allowed", f"the alignment record for {source_id} is not measured")
    return record, hashlib.sha256(raw).hexdigest()


def extract_region(snap: Snapshot, body: dict[str, Any]) -> dict[str, Any]:
    source_id = snap.resolve_plate(body["plate_ref"], body["source"]["id"])
    if source_id is None:
        raise ServiceError("not_found", "no plate with this plate_ref is available to the Service")
    if body["source"] != snap.source_record(source_id):
        raise ServiceError(
            "not_allowed",
            f"the source record differs from the canon record for {source_id}; only registered "
            "plates can be extracted in this version of the Service",
        )
    try:
        check_source(snap.registry.get(source_id))
    except PipelineError as exc:
        raise ServiceError("not_allowed", str(exc)) from exc

    record, record_sha = alignment_record_for(snap, source_id, body.get("alignment_record_text"))
    raster = snap.raster_of(source_id)
    if raster is None:  # the snapshot found it at startup; it has been removed since
        raise ServiceError("not_found", f"the raster for {source_id} is no longer available")
    info = read_raster_info(raster)
    try:
        map_area = load_map_area(snap.paths, snap.schema, source_id, info.width, info.height)
        region = body["region_px"]
        check_region(region, (info.width, info.height), float(record["source_pixel_size_m"]))
        params = load_params()
    except RegionTooLarge as exc:
        raise ServiceError("too_large", str(exc)) from exc
    except PipelineError as exc:
        raise ServiceError("not_allowed" if "map area" in str(exc) else "invalid_request",
                           str(exc)) from exc  # fmt: skip

    pixels = read_pixels(raster)
    mapping = chosen_mapping(record, info.transform, info.crs)
    result = extract_document(pixels, source_id, record, record_sha, map_area, mapping, params,
                              region)  # fmt: skip
    del pixels

    doc = result.doc
    bounds = snap.project["bounds"]
    kept = [f for f in doc["features"]
            if position_outside(f["geometry"]["coordinates"], bounds) is None]  # fmt: skip
    outside = len(doc["features"]) - len(kept)
    doc["features"] = kept
    return {
        "proposal_file_text": canonical_text(doc),
        "dropped": {
            "touching_region_border": result.dropped_touching_border,
            "outside_project_bounds": outside,
        },
    }
