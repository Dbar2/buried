"""`POST /v1/publish` (spec 04 task 8.1, the publish part): validate the decisions, build the
evidence file with spec 02's publish functions, validate the would-be `data/` state, and return the
file text or the errors. Nothing is written, dry run or not (requirement 1.7): the Studio keeps
what it is given.

Not built yet, and refused by name rather than ignored: workspace sources, files and evidence
(the overlay, spec 04 task 8.1), and merge, split and trace decisions (task 2.1).
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from buried_pipeline.errors import PipelineError
from buried_pipeline.publish.decisions import PublishRefusal
from buried_pipeline.publish.run import prepare_publish
from buried_pipeline.service.errors import ServiceError
from buried_pipeline.service.plates import FetchRefused
from buried_pipeline.service.snapshot import Snapshot

WORKSPACE_KEYS = (
    "sources", "control_files", "alignment_records", "evidence_files", "tile_sidecars",
)  # fmt: skip


def _error(reason: str, review_item_id: str | None = None, path: str = "decisions",
           pointer: str = "/", feature_id: str | None = None) -> dict[str, str]:  # fmt: skip
    out = {"path": path, "pointer": pointer, "reason": reason}
    if review_item_id:
        out["review_item_id"] = review_item_id
    if feature_id:
        out["feature_id"] = feature_id
    return out


def _fetch_for_publish(snap: Snapshot, source_id: str) -> None:
    """Publishing needs the plate's georeferencing, so a Service with no copy fetches it, on this
    request and no other time (a person is publishing it, so the request is live)."""
    assert snap.fetcher is not None
    try:
        snap.fetcher.ensure(source_id, live=True)
    except FetchRefused as exc:
        raise ServiceError("not_allowed", f"{source_id} cannot be fetched: {exc}") from exc
    except PipelineError as exc:
        raise ServiceError("upstream_failed", f"fetching {source_id} failed: {exc}") from exc


def publish(snap: Snapshot, body: dict[str, Any], now: datetime) -> dict[str, Any]:
    if any(body["workspace"][k] for k in WORKSPACE_KEYS):
        raise ServiceError(
            "not_allowed",
            "workspace sources and files are not supported yet: this Service publishes only "
            "registered plates against canon",
        )
    source_id = body["source_id"]
    if not snap.registry.has(source_id):
        raise ServiceError("not_found", f"{source_id} is not in the Registry")
    if snap.raster_of(source_id) is None and snap.fetcher is not None:
        _fetch_for_publish(snap, source_id)
    if snap.raster_of(source_id) is None:
        raise ServiceError("not_found", f"the raster for {source_id} is not available to this "
                           "Service, and publishing needs its georeferencing")
    try:
        proposals = json.loads(body["proposal_file_text"])
    except json.JSONDecodeError as exc:
        raise ServiceError("invalid_request", "proposal_file_text is not valid JSON",
                           [{"pointer": "/proposal_file_text", "reason": str(exc)[:160]}]) from exc
    problems = snap.contract.issues("proposalFile", proposals)
    if problems:
        raise ServiceError(
            "invalid_request", "proposal_file_text does not match proposalFile",
            [{"pointer": f"/proposal_file_text{p['pointer']}", "reason": p["reason"]}
             for p in problems],
        )  # fmt: skip

    try:
        plan = prepare_publish(
            snap.paths, snap.registry, snap.schema, source_id, body["decisions"], now, proposals,
            raster=snap.raster_of(source_id),
        )
    except PublishRefusal as refusal:
        return {"ok": False, "errors": [
            _error(p.message, p.review_item_id) for p in refusal.problems
        ]}  # fmt: skip
    except PipelineError as exc:
        return {"ok": False, "errors": [_error(str(exc))]}

    if plan.errors:
        by_feature = plan.build.review_item_by_feature
        return {"ok": False, "errors": [
            _error(e.reason, by_feature.get(e.feature_id or ""), e.path, e.pointer,
                   e.feature_id or None)
            for e in plan.errors
        ]}  # fmt: skip
    return {
        "ok": True,
        "evidence_file_text": plan.text,
        "counts": plan.build.counts.as_dict(),
        "new_feature_ids": list(plan.build.new_feature_ids),
    }
