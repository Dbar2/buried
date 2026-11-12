"""Reader for the source registry, `data/sources.json` (shape from spec 01 "sourceRegistry").

Shape is checked in code until spec 01's Schema exists. One deliberate gap: a
`present_day_reference` source may carry `year_from: null` until `buried present` has read the
CKAN metadata and told the maintainer which year to record (spec 01 task 2.1, spec 02 task 10.4).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from buried_pipeline.errors import PipelineError

SOURCE_ID_RE = re.compile(r"^[a-z0-9]+(_[a-z0-9]+)*$")
SOURCE_TYPES = (
    "fire_insurance_plan",
    "aerial_photograph",
    "present_day_reference",
    "historical_map",
)
ATTRIBUTION_STATUSES = ("confirmed", "to_be_confirmed")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@dataclass(frozen=True)
class Source:
    id: str
    type: str
    title: str
    year_from: int | None
    year_to: int
    url: str
    licence_note: str
    attribution_line: str
    attribution_status: str
    rights_checked_on: str | None
    held_out: bool
    years_label: str | None = None
    holding: str | None = None


@dataclass(frozen=True)
class Registry:
    sources: tuple[Source, ...]

    def get(self, source_id: str) -> Source:
        for source in self.sources:
            if source.id == source_id:
                return source
        raise PipelineError(f"Source is not in the Registry (data/sources.json): {source_id}")

    def has(self, source_id: str) -> bool:
        return any(s.id == source_id for s in self.sources)

    def by_type(self, source_type: str) -> tuple[Source, ...]:
        return tuple(s for s in self.sources if s.type == source_type)


def _fail(index: int, source_id: str, message: str) -> PipelineError:
    return PipelineError(f"data/sources.json: source #{index} ({source_id}): {message}")


def _parse_source(index: int, raw: Any) -> Source:
    if not isinstance(raw, dict):
        raise PipelineError(f"data/sources.json: source #{index} is not an object")
    source_id = raw.get("id", "?")
    expected = {
        "id", "type", "title", "year_from", "year_to", "url", "licence_note",
        "attribution_line", "attribution_status", "rights_checked_on", "held_out",
    }  # fmt: skip
    optional = {"years_label", "holding"}
    missing = sorted(expected - raw.keys())
    extra = sorted(raw.keys() - expected - optional)
    if missing:
        raise _fail(index, source_id, f"missing fields {missing}")
    if extra:
        raise _fail(index, source_id, f"unknown fields {extra}")
    if not isinstance(source_id, str) or not SOURCE_ID_RE.match(source_id):
        raise _fail(index, str(source_id), "id is not lowercase snake_case")
    if raw["type"] not in SOURCE_TYPES:
        raise _fail(index, source_id, f"unknown type {raw['type']!r}")
    for key in ("title", "url", "licence_note", "attribution_line"):
        if not isinstance(raw[key], str) or not raw[key]:
            raise _fail(index, source_id, f"{key} must be a non-empty string")
    year_from, year_to = raw["year_from"], raw["year_to"]
    if year_from is None:
        if raw["type"] != "present_day_reference":
            raise _fail(index, source_id, "year_from may be null only for present_day_reference")
    elif not isinstance(year_from, int) or isinstance(year_from, bool):
        raise _fail(index, source_id, "year_from must be an integer")
    if not isinstance(year_to, int) or isinstance(year_to, bool):
        raise _fail(index, source_id, "year_to must be an integer")
    if year_from is not None and year_from > year_to:
        raise _fail(index, source_id, "year_from is after year_to")
    if raw["attribution_status"] not in ATTRIBUTION_STATUSES:
        raise _fail(index, source_id, f"bad attribution_status {raw['attribution_status']!r}")
    checked = raw["rights_checked_on"]
    if checked is not None and not (isinstance(checked, str) and DATE_RE.match(checked)):
        raise _fail(index, source_id, "rights_checked_on must be an ISO date or null")
    if not isinstance(raw["held_out"], bool):
        raise _fail(index, source_id, "held_out must be true or false")
    for key in sorted(optional & raw.keys()):
        if not isinstance(raw[key], str) or not raw[key]:
            raise _fail(index, source_id, f"{key} must be a non-empty string when present")
    return Source(
        id=source_id,
        type=raw["type"],
        title=raw["title"],
        year_from=year_from,
        year_to=year_to,
        url=raw["url"],
        licence_note=raw["licence_note"],
        attribution_line=raw["attribution_line"],
        attribution_status=raw["attribution_status"],
        rights_checked_on=checked,
        held_out=raw["held_out"],
        years_label=raw.get("years_label"),
        holding=raw.get("holding"),
    )


def parse_registry(doc: Any) -> Registry:
    if not isinstance(doc, dict) or set(doc.keys()) != {"schema_version", "sources"}:
        raise PipelineError("data/sources.json: expected an object with schema_version and sources")
    if not isinstance(doc["schema_version"], str) or not re.match(
        r"^\d+\.\d+\.\d+$", doc["schema_version"]
    ):
        raise PipelineError("data/sources.json: schema_version must look like 1.0.0")
    if not isinstance(doc["sources"], list):
        raise PipelineError("data/sources.json: sources must be a list")
    sources = tuple(_parse_source(i, raw) for i, raw in enumerate(doc["sources"]))
    seen: set[str] = set()
    for source in sources:
        if source.id in seen:
            raise PipelineError(f"data/sources.json: duplicate source id {source.id}")
        seen.add(source.id)
    return Registry(sources=sources)


def load_registry(path: Path) -> Registry:
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise PipelineError(f"Registry not found: {path}") from exc
    try:
        doc = json.loads(text)
    except json.JSONDecodeError as exc:
        raise PipelineError(f"Registry is not valid JSON: {path}: {exc}") from exc
    return parse_registry(doc)
