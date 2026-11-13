"""The Service API Schema in use: request checks and the version rules (spec 04 requirements 2.2,
2.5, 2.6). Loads `studio_api.schema.json` and `evidence.schema.json` together so `$ref`s between
them resolve.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from buried_pipeline.errors import PipelineError
from buried_pipeline.service import API_VERSION
from buried_pipeline.service.errors import ServiceError
from buried_pipeline.validate.schema import json_pointer

STUDIO_SCHEMA = Path("data") / "schema" / "studio_api.schema.json"
EVIDENCE_SCHEMA = Path("data") / "schema" / "evidence.schema.json"


def _message(error: Any) -> str:
    text = str(error.message)
    return text if len(text) <= 160 else text[:157] + "..."


class Contract:
    def __init__(self, root: Path) -> None:
        studio = self._read(root / STUDIO_SCHEMA)
        evidence = self._read(root / EVIDENCE_SCHEMA)
        self.studio = studio
        self._registry: Registry = Registry().with_resources([
            (studio["$id"], Resource.from_contents(studio)),
            (evidence["$id"], Resource.from_contents(evidence)),
        ])  # fmt: skip
        self._validators: dict[str, Draft202012Validator] = {}

    @staticmethod
    def _read(path: Path) -> dict[str, Any]:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise PipelineError(f"The Service API Schema cannot be read: {path}: {exc}") from exc

    @property
    def def_names(self) -> list[str]:
        return sorted(self.studio["$defs"])

    def validator(self, def_name: str) -> Draft202012Validator:
        if def_name not in self.studio["$defs"]:
            raise PipelineError(f"The Service API Schema has no definition named {def_name}")
        if def_name not in self._validators:
            wrapper = {
                "$schema": self.studio["$schema"],
                "$ref": f"{self.studio['$id']}#/$defs/{def_name}",
            }
            self._validators[def_name] = Draft202012Validator(
                wrapper, registry=self._registry,
                format_checker=Draft202012Validator.FORMAT_CHECKER,
            )  # fmt: skip
        return self._validators[def_name]

    def issues(self, def_name: str, document: Any) -> list[dict[str, str]]:
        errors = sorted(
            self.validator(def_name).iter_errors(document),
            key=lambda e: (json_pointer(e.absolute_path), str(e.message)),
        )
        return [{"pointer": json_pointer(e.absolute_path), "reason": _message(e)} for e in errors]

    def request(self, def_name: str, raw: bytes, data_version: str | None = None) -> dict[str, Any]:
        """A request body, checked in the order the contract says: it is a JSON object (422), its
        `api_version` is this one (409), it matches its definition (422), and if it depends on
        canon its `data_version` is the Service's (409)."""
        try:
            body = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ServiceError("invalid_request", "the request body is not valid JSON",
                               [{"pointer": "/", "reason": str(exc)[:160]}]) from exc
        if not isinstance(body, dict):
            raise ServiceError("invalid_request", "the request body must be a JSON object",
                               [{"pointer": "/", "reason": "not an object"}])
        if "api_version" in body and body["api_version"] != API_VERSION:
            raise ServiceError(
                "version_mismatch",
                f"the Studio speaks api_version {body['api_version']!r}; this Service speaks "
                f"{API_VERSION!r}. Reload the Studio.",
                [{"studio": body["api_version"], "service": API_VERSION}],
            )
        problems = self.issues(def_name, body)
        if problems:
            raise ServiceError("invalid_request", f"the request does not match {def_name}",
                               problems)
        if data_version is not None and body.get("data_version") != data_version:
            raise ServiceError(
                "data_version_mismatch",
                "the site and the Studio service are out of step: they serve different data",
                [{"studio": body.get("data_version"), "service": data_version}],
            )
        return body

    def check_response(self, def_name: str, body: Any) -> None:
        """Used by tests and by the Service on its own output: a body that does not match its
        definition is a bug here, not a request problem."""
        problems = self.issues(def_name, body)
        if problems:
            raise AssertionError(f"{def_name} response does not match the contract: {problems[:3]}")
