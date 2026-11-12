"""Load the Schema once and validate a document against one of its `$defs` entries."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path, PurePosixPath
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError as JsonSchemaError

from buried_pipeline.errors import PipelineError

SCHEMA_RELATIVE = Path("data") / "schema" / "evidence.schema.json"

# Requirement 8.2: which $defs entry each kind of file is checked against.
DEF_BY_DIRECTORY = {
    "evidence": "featureCollection",
    "control": "controlPoints",
    "alignment": "alignmentRecord",
    "tiles": "tileSidecar",
    "present": "presentLayer",
}
DEF_BY_FILE_NAME = {"sources.json": "sourceRegistry", "project.json": "project"}


@dataclass(frozen=True)
class SchemaIssue:
    pointer: str
    message: str


def json_pointer(parts: Any) -> str:
    out = ""
    for part in parts:
        out += "/" + str(part).replace("~", "~0").replace("/", "~1")
    return out or "/"


def def_for_path(path: Path, data_dir: Path) -> str | None:
    """The `$defs` entry for a file under `data_dir`, or None if it is not a contract file."""
    try:
        rel = PurePosixPath(path.resolve().relative_to(data_dir.resolve()).as_posix())
    except ValueError:
        return None
    parts = rel.parts
    if len(parts) == 1:
        return DEF_BY_FILE_NAME.get(parts[0])
    if len(parts) == 2 and parts[0] in DEF_BY_DIRECTORY:
        suffix = ".geojson" if parts[0] in ("evidence", "present") else ".json"
        if rel.suffix == suffix:
            return DEF_BY_DIRECTORY[parts[0]]
    return None


class SchemaSet:
    """The Schema plus one validator per `$defs` entry (format checking on)."""

    def __init__(self, schema: dict[str, Any]) -> None:
        self.schema = schema
        self._defs: dict[str, Any] = schema["$defs"]
        self._validators: dict[str, Draft202012Validator] = {}

    @cached_property
    def def_names(self) -> list[str]:
        return sorted(self._defs)

    def validator(self, def_name: str) -> Draft202012Validator:
        if def_name not in self._defs:
            raise PipelineError(f"The Schema has no definition named {def_name}")
        if def_name not in self._validators:
            wrapper = {
                "$schema": self.schema["$schema"],
                "$ref": f"#/$defs/{def_name}",
                "$defs": self._defs,
            }
            Draft202012Validator.check_schema(wrapper)
            self._validators[def_name] = Draft202012Validator(
                wrapper, format_checker=Draft202012Validator.FORMAT_CHECKER
            )
        return self._validators[def_name]

    def issues(self, def_name: str, document: Any) -> list[SchemaIssue]:
        errors: list[JsonSchemaError] = list(self.validator(def_name).iter_errors(document))
        issues = [SchemaIssue(json_pointer(e.absolute_path), e.message) for e in errors]
        return sorted(issues, key=lambda i: (i.pointer, i.message))

    def is_valid(self, def_name: str, document: Any) -> bool:
        return self.validator(def_name).is_valid(document)


def load_schema(root: Path) -> SchemaSet:
    path = root / SCHEMA_RELATIVE
    try:
        schema = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise PipelineError(f"The Schema is missing: {path}") from exc
    except json.JSONDecodeError as exc:
        raise PipelineError(f"The Schema is not valid JSON: {path}: {exc}") from exc
    return SchemaSet(schema)
