"""Read a decisions file (spec 02 design "Decisions file", and the accept/reject part of the
Studio's decisions file v2) into plain values. Pure: no files, no clock.

What is read here is checked for shape only. Whether a decision may be published (it is confirmed,
the proposal exists, the polygon lies on the plate) is decided in `build.py`.

Merge, split and trace decisions, label reads and street numbers of the v2 file are not built yet
(spec 04 task 2.1). A v2 file that uses them is refused by name; nothing is silently dropped.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from buried_pipeline.errors import PipelineError
from buried_pipeline.timeutil import rfc3339
from buried_pipeline.validate.geometry import pixel_polygon_problem

ATTRIBUTES = ("use", "material", "storeys", "street_number")
CONFIDENCES = ("documented", "estimated", "unknown")
COVERS = ("building", "water", "land_use")
READ_BY = ("person", "label_assist")
V2_UNSUPPORTED_TYPES = ("merge", "split", "trace")


@dataclass(frozen=True)
class Problem:
    message: str
    review_item_id: str | None = None

    def __str__(self) -> str:
        return f"[{self.review_item_id}] {self.message}" if self.review_item_id else self.message


class PublishRefusal(PipelineError):
    """Publish refused the inputs. `problems` names each cause, with the review item when known."""

    def __init__(self, problems: list[Problem]) -> None:
        self.problems = problems
        super().__init__("; ".join(str(p) for p in problems))


@dataclass(frozen=True)
class AttributeRead:
    attribute: str
    crop_px: dict[str, int]
    read_by: str
    provider: str | None = None
    model_id: str | None = None


@dataclass(frozen=True)
class Decision:
    proposal_id: str
    decision: str  # "accept" or "reject"
    confirmed_by: str  # "" when the file gave none
    confirmed_at: str | None  # RFC 3339 UTC text, None when absent or not a time with a zone
    pixel_polygon: tuple[tuple[int, int], ...] | None = None
    attributes: dict[str, Any] = field(default_factory=dict)
    attribute_reads: tuple[AttributeRead, ...] = ()
    confidence: str | None = None
    confidence_reason: str | None = None
    position_error_m: float | None = None

    @property
    def confirmed(self) -> bool:
        return bool(self.confirmed_by) and self.confirmed_at is not None


@dataclass(frozen=True)
class ReviewedAreaDecision:
    pixel_polygon: tuple[tuple[int, int], ...]
    confirmed_by: str
    confirmed_at: str
    covers: tuple[str, ...] | None = None  # None means ["building"]


@dataclass(frozen=True)
class Decisions:
    source: str
    decisions: tuple[Decision, ...]
    reviewed_areas: tuple[ReviewedAreaDecision, ...]


def _is_int(v: Any) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _time(value: Any) -> str | None:
    """RFC 3339 UTC text for a date-time that carries a zone, else None."""
    if not isinstance(value, str) or not value:
        return None
    try:
        moment = datetime.fromisoformat(value)
    except ValueError:
        return None
    if moment.tzinfo is None:
        return None
    return rfc3339(moment)


def _polygon(value: Any, label: str, item: str | None, out: list[Problem]) -> tuple | None:
    if not isinstance(value, list) or len(value) < 3 or not all(
        isinstance(v, list) and len(v) == 2 and _is_int(v[0]) and _is_int(v[1])
        and v[0] >= 0 and v[1] >= 0
        for v in value
    ):
        out.append(Problem(f"{label} must be a list of at least 3 [x, y] integer pixel vertices "
                           "(not negative)", item))
        return None
    problem = pixel_polygon_problem([list(v) for v in value])
    if problem:
        out.append(Problem(f"{label} is not one simple polygon: it {problem}", item))
        return None
    return tuple((int(x), int(y)) for x, y in value)


def _crop(value: Any) -> dict[str, int] | None:
    if (
        isinstance(value, dict)
        and set(value) == {"x", "y", "width", "height"}
        and all(_is_int(v) for v in value.values())
        and value["x"] >= 0 and value["y"] >= 0 and value["width"] >= 1 and value["height"] >= 1
    ):
        return {k: int(value[k]) for k in ("x", "y", "width", "height")}
    return None


def _attributes(value: Any, item: str, out: list[Problem]) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        out.append(Problem("attributes must be an object", item))
        return {}
    attrs: dict[str, Any] = {}
    for key, v in value.items():
        if key not in ATTRIBUTES:
            out.append(Problem(f"attribute {key!r} is not one of {list(ATTRIBUTES)}", item))
        elif key == "storeys":
            if not _is_int(v) or v < 1:
                out.append(Problem("storeys must be a whole number of 1 or more", item))
            else:
                attrs[key] = v
        elif not isinstance(v, str) or not v.strip():
            out.append(Problem(f"{key} must be non-empty text", item))
        else:
            attrs[key] = v
    return attrs


def _reads(value: Any, item: str, out: list[Problem]) -> tuple[AttributeRead, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        out.append(Problem("attribute_reads must be a list", item))
        return ()
    reads: list[AttributeRead] = []
    for r in value:
        if not isinstance(r, dict) or r.get("attribute") not in ATTRIBUTES:
            out.append(Problem(f"attribute_reads entry needs an attribute from {list(ATTRIBUTES)}",
                               item))
            continue
        crop = _crop(r.get("crop_px"))
        by = r.get("read_by")
        if crop is None:
            out.append(Problem(f"the read of {r['attribute']} needs a crop_px rectangle", item))
        elif by not in READ_BY:
            out.append(Problem(f"the read of {r['attribute']} needs read_by {list(READ_BY)}",
                               item))
        elif by == "label_assist" and not (r.get("provider") and r.get("model_id")):
            out.append(Problem(f"a label_assist read of {r['attribute']} needs provider and "
                               "model_id", item))
        else:
            reads.append(AttributeRead(r["attribute"], crop, by, r.get("provider"),
                                       r.get("model_id")))
    return tuple(reads)


def _decision(raw: Any, index: int, v2: bool, out: list[Problem]) -> Decision | None:
    if not isinstance(raw, dict):
        out.append(Problem(f"decision #{index} must be an object"))
        return None
    kind = raw.get("type" if v2 else "decision")
    if v2 and kind in V2_UNSUPPORTED_TYPES:
        ids = raw.get("proposal_ids") or [raw.get("proposal_id")]
        named = next((i for i in ids if isinstance(i, str)), None)
        out.append(Problem(f"decision type {kind!r} is not supported yet (only accept and "
                           "reject are)", named))
        return None
    if not isinstance(raw.get("proposal_id"), str):
        out.append(Problem(f"decision #{index} needs a proposal_id"))
        return None
    pid: str = raw["proposal_id"]
    if kind not in ("accept", "reject"):
        out.append(Problem(f"{'type' if v2 else 'decision'} must be accept or reject", pid))
        return None
    problems_before = len(out)
    polygon = None
    if raw.get("pixel_polygon") is not None:
        polygon = _polygon(raw["pixel_polygon"], "pixel_polygon", pid, out)
    attrs = _attributes(raw.get("attributes"), pid, out)
    reads = _reads(raw.get("attribute_reads"), pid, out)
    confidence, reason = raw.get("confidence"), raw.get("confidence_reason")
    if confidence is not None and confidence not in CONFIDENCES:
        out.append(Problem(f"confidence must be one of {list(CONFIDENCES)}", pid))
    if confidence is not None and not (isinstance(reason, str) and reason.strip()):
        out.append(Problem("a decision that gives a confidence must give its reason", pid))
    err = raw.get("position_error_m")
    if err is not None and (
        isinstance(err, bool) or not isinstance(err, int | float) or not err >= 0
    ):
        out.append(Problem("position_error_m must be a number, 0 or more", pid))
        err = None
    by = raw.get("confirmed_by")
    if len(out) > problems_before:
        return None
    return Decision(
        proposal_id=pid,
        decision=kind,
        confirmed_by=by.strip() if isinstance(by, str) else "",
        confirmed_at=_time(raw.get("confirmed_at")),
        pixel_polygon=polygon,
        attributes=attrs,
        attribute_reads=reads,
        confidence=confidence,
        confidence_reason=reason if confidence is not None else None,
        position_error_m=float(err) if err is not None else None,
    )


def _area(raw: Any, index: int, out: list[Problem]) -> ReviewedAreaDecision | None:
    label = f"reviewed area #{index}"
    if not isinstance(raw, dict):
        out.append(Problem(f"{label} must be an object"))
        return None
    before = len(out)
    polygon = _polygon(raw.get("pixel_polygon"), f"{label} pixel_polygon", None, out)
    by = raw.get("confirmed_by")
    at = _time(raw.get("confirmed_at"))
    if not (isinstance(by, str) and by.strip()):
        out.append(Problem(f"{label} needs confirmed_by"))
    if at is None:
        out.append(Problem(f"{label} needs confirmed_at as a date-time with a time zone"))
    covers = raw.get("covers")
    if covers is not None and not (
        isinstance(covers, list) and covers and len(set(covers)) == len(covers)
        and all(c in COVERS for c in covers)
    ):
        out.append(Problem(f"{label} covers must be a non-empty list from {list(COVERS)}"))
    if len(out) > before or polygon is None or at is None:
        return None
    return ReviewedAreaDecision(
        polygon, by.strip(), at, tuple(sorted(covers)) if covers is not None else None
    )


def parse_decisions(doc: Any, source_id: str) -> Decisions:
    """The decisions file as values, or a `PublishRefusal` naming every shape problem."""
    problems: list[Problem] = []
    if not isinstance(doc, dict):
        raise PublishRefusal([Problem("the decisions file must be a JSON object")])
    if doc.get("source") != source_id:
        problems.append(Problem(f"the decisions file is for {doc.get('source')!r}, not "
                                f"{source_id!r}"))
    version = doc.get("version", 1)
    if version not in (1, 2):
        problems.append(Problem(f"unknown decisions file version {version!r}"))
    v2 = version == 2
    if v2:
        for key in ("label_reads", "street_numbers"):
            if doc.get(key):
                problems.append(Problem(f"{key} are not supported yet"))
    raw_decisions = doc.get("decisions", [])
    raw_areas = doc.get("reviewed_areas", [])
    if not isinstance(raw_decisions, list) or not isinstance(raw_areas, list):
        raise PublishRefusal([*problems, Problem("decisions and reviewed_areas must be lists")])

    decisions = [_decision(r, i, v2, problems) for i, r in enumerate(raw_decisions)]
    areas = [_area(r, i, problems) for i, r in enumerate(raw_areas)]

    seen: set[str] = set()
    for d in decisions:
        if d is None:
            continue
        if d.proposal_id in seen:
            problems.append(Problem("more than one decision for this proposal", d.proposal_id))
        seen.add(d.proposal_id)
    if problems:
        raise PublishRefusal(problems)
    return Decisions(
        source=source_id,
        decisions=tuple(d for d in decisions if d is not None),
        reviewed_areas=tuple(a for a in areas if a is not None),
    )
