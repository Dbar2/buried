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
from buried_pipeline.fetch.manifest import read_manifest, sha256_file
from buried_pipeline.inspect.georef import find_raster
from buried_pipeline.io.http import HttpClient, RealHttpClient
from buried_pipeline.io.registry import Registry, load_registry
from buried_pipeline.paths import Paths
from buried_pipeline.service.contract import Contract
from buried_pipeline.service.data_version import data_version_of
from buried_pipeline.service.errors import ServiceError
from buried_pipeline.service.plates import (
    CACHE_MANIFEST,
    FetchRefused,
    PlateFetcher,
    manifest_raster_ref,
)
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
    # raster at startup, and a plate's bytes are read only when a request needs its ref. A plate
    # with no raster on this machine is not remembered, so one fetched later is found.
    _refs: dict[str, str] = field(default_factory=dict, repr=False)
    # Plates fetched on demand (spec 04 task 4.1): the cache directory and the fetcher over it,
    # both None when the Service is not configured to download. `manifest_path` is a manifest of
    # trusted hashes for plates not on this machine yet; the cache's own record is the fallback.
    cache_dir: Path | None = None
    fetcher: PlateFetcher | None = field(default=None, repr=False)
    manifest_path: Path | None = None

    def source_record(self, source_id: str) -> dict[str, Any] | None:
        return next((s for s in self.sources_doc["sources"] if s["id"] == source_id), None)

    def plate_ref_of(self, source_id: str) -> str | None:
        if source_id not in self._refs:
            raster = self.raster_of(source_id)
            if raster is None:
                return None
            self._refs[source_id] = sha256_file(raster)
        return self._refs[source_id]

    def manifest_ref(self, source_id: str) -> str | None:
        """The ref a manifest records for a plate's raster: the supplied manifest, else the
        cache's own record, else `data/raw/manifest.json`. Reads a manifest, never a raster."""
        candidates = [self.manifest_path]
        if self.cache_dir is not None:
            candidates.append(self.cache_dir / CACHE_MANIFEST)
        candidates.append(self.paths.manifest)
        for path in candidates:
            if path is None or not path.is_file():
                continue
            entry = read_manifest(path).get(source_id)
            if entry is not None:
                return manifest_raster_ref(entry)
        return None

    def listed_ref(self, source_id: str) -> str | None:
        """The `plate_ref` the registered-plates listing shows. The held-out plate's raster is
        never read to answer a listing: its ref comes from a manifest or is null. Any other plate
        is hashed when it is on this machine."""
        if not self.registry.get(source_id).held_out:
            ref = self.plate_ref_of(source_id)
            if ref is not None:
                return ref
        return self.manifest_ref(source_id)

    def listed_available(self, source_id: str) -> bool:
        """True when the Service holds the raster or can fetch it. Looks for a file, reads none."""
        return self.raster_of(source_id) is not None or self.fetcher is not None

    def source_of_ref(self, plate_ref: str) -> str | None:
        """The registered plate whose raster has this ref. Plates are tried in registry order and
        the search stops at the first match, so a request for one plate reads no other."""
        for source in self.registry.by_type(PLATE_TYPE):
            if self.plate_ref_of(source.id) == plate_ref:
                return source.id
        return None

    def resolve_plate(self, plate_ref: str, claimed_source_id: str) -> str | None:
        """The registered plate behind a `plate_ref`, fetching it first when it is not on this
        machine and the Service is set up to download.

        A plate already on this machine (in `data/raw/` or the cache) is found by its ref as
        before. Otherwise the request's own source record names the plate to fetch, the download
        is checked against the manifest and then against the ref the request gave, and nothing
        is kept as an answer: the fetch only puts the raster where `raster_of` looks. The call is
        a live request by construction (a person asked for this plate), which is what lets the
        held-out plate be fetched; nothing calls this at startup or from a listing.
        """
        found = self.source_of_ref(plate_ref)
        if found is not None or self.fetcher is None:
            return found
        if not self.registry.has(claimed_source_id):
            return None
        try:
            self.fetcher.ensure(claimed_source_id, live=True)
        except FetchRefused as exc:
            raise ServiceError(
                "not_allowed", f"{claimed_source_id} cannot be fetched: {exc}"
            ) from exc
        except PipelineError as exc:
            raise ServiceError(
                "upstream_failed", f"fetching {claimed_source_id} failed: {exc}"
            ) from exc
        return claimed_source_id if self.plate_ref_of(claimed_source_id) == plate_ref else None

    def raster_of(self, source_id: str) -> Path | None:
        """The plate's raster in `data/raw/` or, failing that, in the fetch cache."""
        folders = [self.paths.raw_source_dir(source_id)]
        if self.cache_dir is not None:
            folders.append(self.cache_dir / source_id)
        for folder in folders:
            try:
                return find_raster(folder)
            except PipelineError:
                continue
        return None


def load_snapshot(
    root: Path,
    cache_dir: Path | None = None,
    manifest_path: Path | None = None,
    http: HttpClient | None = None,
) -> Snapshot:
    paths = Paths(root)
    registry = load_registry(paths.sources_json)
    sources_doc = json.loads(paths.sources_json.read_text(encoding="utf-8"))
    try:
        project = json.loads(paths.project_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PipelineError(f"The Service needs data/project.json: {exc}") from exc
    fetcher = None
    if cache_dir is not None:
        cache_dir.mkdir(parents=True, exist_ok=True)
        fetcher = PlateFetcher(registry, cache_dir, http or RealHttpClient(), manifest_path)
    return Snapshot(
        paths=paths,
        registry=registry,
        sources_doc=sources_doc,
        project=project,
        schema=load_schema(root),
        contract=Contract(root),
        data_version=data_version_of(paths.data),
        cache_dir=cache_dir,
        fetcher=fetcher,
        manifest_path=manifest_path,
    )
