"""The canon snapshot the Service loads at startup (spec 04 requirement 1.5): the registry, the
project file, the schemas, the data version, and which registered plates have a raster on this
machine. It is read once. The Service treats `data/` as unchanging while it runs; a deployment
that changes `data/` is a new deployment (the data version check catches a site out of step).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from buried_pipeline.errors import PipelineError
from buried_pipeline.fetch.manifest import sha256_file
from buried_pipeline.inspect.georef import find_raster
from buried_pipeline.io.registry import Registry, load_registry
from buried_pipeline.paths import Paths
from buried_pipeline.service.contract import Contract
from buried_pipeline.service.data_version import data_version_of
from buried_pipeline.validate.schema import SchemaSet, load_schema

PLATE_TYPE = "fire_insurance_plan"


@dataclass(frozen=True)
class Snapshot:
    paths: Paths
    registry: Registry
    sources_doc: dict[str, Any]
    project: dict[str, Any]
    schema: SchemaSet
    contract: Contract
    data_version: str
    # Plate refs (SHA-256 of the raster bytes) by source id, filled on first use. Nothing reads a
    # raster at startup, and a plate's bytes are read only when a request needs its ref.
    _refs: dict[str, str | None] = field(default_factory=dict, repr=False)

    def source_record(self, source_id: str) -> dict[str, Any] | None:
        return next((s for s in self.sources_doc["sources"] if s["id"] == source_id), None)

    def plate_ref_of(self, source_id: str) -> str | None:
        if source_id not in self._refs:
            raster = self.raster_of(source_id)
            self._refs[source_id] = sha256_file(raster) if raster else None
        return self._refs[source_id]

    def source_of_ref(self, plate_ref: str) -> str | None:
        """The registered plate whose raster has this ref. Plates are tried in registry order and
        the search stops at the first match, so a request for one plate reads no other."""
        for source in self.registry.by_type(PLATE_TYPE):
            if self.plate_ref_of(source.id) == plate_ref:
                return source.id
        return None

    def raster_of(self, source_id: str) -> Path | None:
        try:
            return find_raster(self.paths.raw_source_dir(source_id))
        except PipelineError:
            return None


def load_snapshot(root: Path) -> Snapshot:
    paths = Paths(root)
    registry = load_registry(paths.sources_json)
    sources_doc = json.loads(paths.sources_json.read_text(encoding="utf-8"))
    try:
        project = json.loads(paths.project_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PipelineError(f"The Service needs data/project.json: {exc}") from exc
    return Snapshot(
        paths=paths,
        registry=registry,
        sources_doc=sources_doc,
        project=project,
        schema=load_schema(root),
        contract=Contract(root),
        data_version=data_version_of(paths.data),
    )
