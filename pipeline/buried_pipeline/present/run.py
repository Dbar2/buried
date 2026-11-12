"""`buried present`: download, clip and write the present-day City of Toronto layers."""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

import pyogrio
import pyogrio.raw
import shapely

from buried_pipeline.errors import PipelineError
from buried_pipeline.fetch.manifest import (
    entry_mismatches,
    file_record,
    read_manifest,
    write_manifest,
)
from buried_pipeline.inspect.report import Bounds, project_bounds
from buried_pipeline.inspect.run import plate_bounds
from buried_pipeline.io.atomic import atomic_write_text, dump_json
from buried_pipeline.io.http import HttpClient
from buried_pipeline.io.registry import Registry, Source
from buried_pipeline.paths import Paths
from buried_pipeline.present.ckan import (
    check_resource_url,
    choose_gpkg_resource,
    last_refreshed,
    package_show,
)
from buried_pipeline.present.clip import (
    RawFeature,
    build_layer,
    check_size,
    clip_features,
    layer_bbox,
    layer_content,
)
from buried_pipeline.present.datasets import DATASETS, PresentDataset, get_dataset
from buried_pipeline.timeutil import rfc3339

PRESENT_TYPE = "present_day_reference"


def read_project_bounds(path: Path) -> Bounds:
    doc = json.loads(path.read_text(encoding="utf-8"))
    try:
        b = doc["bounds"]
        bounds = (float(b["min_e"]), float(b["min_n"]), float(b["max_e"]), float(b["max_n"]))
    except (KeyError, TypeError, ValueError) as exc:
        raise PipelineError(f"{path}: bounds are missing or malformed") from exc
    return bounds


def resolve_bounds(paths: Paths, registry: Registry) -> Bounds:
    """data/project.json when it exists; else the rule applied to the plates' inspect reports."""
    if paths.project_json.exists():
        return read_project_bounds(paths.project_json)
    try:
        return project_bounds(plate_bounds(paths, registry))
    except PipelineError as exc:
        raise PipelineError(
            f"Cannot clip: data/project.json does not exist and the plates are not all "
            f"inspected. Run `buried inspect` on all showcase plates first. ({exc})"
        ) from exc


def select_datasets(registry: Registry, ids: list[str]) -> list[PresentDataset]:
    if ids:
        chosen = [get_dataset(i) for i in ids]
    else:
        registered = {s.id for s in registry.by_type(PRESENT_TYPE)}
        chosen = [d for d in DATASETS if d.source_id in registered]
    for dataset in chosen:
        source = registry.get(dataset.source_id)
        if source.type != PRESENT_TYPE:
            raise PipelineError(f"{source.id} is not a {PRESENT_TYPE} source")
    return chosen


def check_registry_years(source: Source, refreshed_year: int, retrieval_year: int) -> None:
    problems = []
    if source.year_from != refreshed_year:
        have = "null" if source.year_from is None else source.year_from
        problems.append(
            f"year_from should be {refreshed_year} (the CKAN last refresh), "
            f"data/sources.json has {have}"
        )
    if source.year_to != retrieval_year:
        problems.append(
            f"year_to should be {retrieval_year} (the retrieval year), "
            f"data/sources.json has {source.year_to}"
        )
    if problems:
        raise PipelineError(
            f"{source.id}: Registry years do not match. Record the values below in "
            "data/sources.json, then run again. No present layer was written.\n  "
            + "\n  ".join(problems)
        )


def _download(
    paths: Paths,
    source: Source,
    url: str,
    http: HttpClient,
    now: datetime,
    out: Callable[[str], None],
) -> Path:
    """The raw GPKG for a source, downloaded once and then reused while it matches the manifest."""
    target = paths.raw_present_dir(source.id) / f"{source.id}.gpkg"
    manifest = read_manifest(paths.manifest)
    entry = manifest.get(source.id)
    if target.exists():
        if entry is None:
            raise PipelineError(
                f"{source.id}: {target} exists but the manifest has no entry. Nothing was "
                "overwritten. Delete the file by hand to download again."
            )
        bad = entry_mismatches(paths.raw, entry)
        if bad:
            raise PipelineError(
                f"{source.id}: files differ from the manifest: {', '.join(bad)}. Nothing was "
                "overwritten."
            )
        out(f"{source.id}: using the downloaded file already in data/raw/")
        return target
    http.download(url, target)
    manifest[source.id] = {
        "source": source.id,
        "url": url,
        "retrieved_at": rfc3339(now),
        "files": [file_record(paths.raw, target)],
    }
    write_manifest(paths.manifest, manifest)
    return target


def read_layer(
    path: Path, bbox: tuple[float, float, float, float] | None, columns: list[str] | None
) -> tuple[str | None, list[RawFeature]]:
    layers = pyogrio.list_layers(path)
    if len(layers) != 1:
        names = [str(row[0]) for row in layers]
        raise PipelineError(f"{path.name}: expected one layer, found {names}")
    meta, _fids, geometry, field_data = pyogrio.raw.read(
        path, columns=columns, bbox=bbox, force_2d=True
    )
    names = [str(n) for n in meta["fields"]]
    features = []
    for i, wkb in enumerate(geometry):
        geom = shapely.from_wkb(wkb) if wkb is not None else None
        props = {name: field_data[j][i] for j, name in enumerate(names)}
        features.append(RawFeature(geometry=geom, properties=props))
    return meta.get("crs"), features


def describe_file(path: Path) -> str:
    info = pyogrio.read_info(path)
    fields = [str(f) for f in info["fields"]]
    return (
        f"  CRS: {info.get('crs')}\n  geometry type: {info.get('geometry_type')}\n"
        f"  features: {info.get('features')}\n  fields: {fields}"
    )


def _layer_document(
    *,
    source: Source,
    dataset: PresentDataset,
    package: dict[str, Any],
    resource: dict[str, Any],
    resource_url: str,
    gpkg: Path,
    sha256: str,
    bounds: Bounds,
    refreshed: str,
    now: datetime,
) -> dict[str, Any]:
    assert dataset.id_field is not None and dataset.kept_fields is not None
    info = pyogrio.read_info(gpkg)
    layer_crs = info.get("crs")
    if not layer_crs:
        raise PipelineError(f"{gpkg.name} declares no CRS; stopping")
    available = {str(f) for f in info["fields"]}
    wanted = [dataset.id_field, *dataset.kept_fields]
    missing = [f for f in wanted if f not in available]
    if missing:
        raise PipelineError(
            f"{source.id}: fields {missing} are not in the file. Fields present: "
            f"{sorted(available)}"
        )
    columns = list(dict.fromkeys(wanted))
    crs, raw = read_layer(gpkg, layer_bbox(bounds, layer_crs), columns)
    features = clip_features(
        raw, bounds, crs, dataset.id_field, dataset.kept_fields, dataset.geometry
    )
    layer = build_layer(
        source_id=source.id,
        package_id=dataset.package_id,
        resource_id=str(resource.get("id", "")),
        resource_url=resource_url,
        retrieved_at=rfc3339(now),
        last_refreshed=refreshed,
        source_sha256=sha256,
        id_field=dataset.id_field,
        clip_bounds=bounds,
        attribution_line=source.attribution_line,
        features=features,
    )
    check_size(dump_json(layer))
    return layer


def present_one(
    paths: Paths,
    registry: Registry,
    http: HttpClient,
    dataset: PresentDataset,
    recheck: bool,
    now: datetime,
    out: Callable[[str], None],
) -> str:
    source = registry.get(dataset.source_id)
    if source.rights_checked_on is None or source.attribution_status != "confirmed":
        raise PipelineError(f"{source.id}: rights or attribution not confirmed in the Registry")
    layer_path = paths.present_layer(source.id)
    if layer_path.exists() and not recheck:
        out(f"{source.id}: up to date ({layer_path.relative_to(paths.root)})")
        return "up_to_date"

    bounds = resolve_bounds(paths, registry)
    package = package_show(http, dataset.package_id)
    resource = choose_gpkg_resource(package, dataset.package_id, dataset.resource_name)
    resource_url = check_resource_url(resource.get("url"))
    refreshed = last_refreshed(package, resource)
    check_registry_years(source, refreshed.year, now.year)

    if recheck:
        scratch = paths.work / "present_recheck" / source.id / f"{source.id}.gpkg"
        scratch.parent.mkdir(parents=True, exist_ok=True)
        downloaded = http.download(resource_url, scratch)
        gpkg, sha256 = scratch, downloaded.sha256
    else:
        gpkg = _download(paths, source, resource_url, http, now, out)
        sha256 = read_manifest(paths.manifest)[source.id]["files"][0]["sha256"]

    try:
        if not dataset.fields_confirmed:
            raise PipelineError(
                f"{source.id}: dataset fields not confirmed. Choose the id field and kept "
                "fields from this file and record them in present/datasets.py and in spec 02 "
                f"design.md, then run again.\n{describe_file(gpkg)}"
            )
        layer = _layer_document(
            source=source,
            dataset=dataset,
            package=package,
            resource=resource,
            resource_url=resource_url,
            gpkg=gpkg,
            sha256=sha256,
            bounds=bounds,
            refreshed=refreshed.isoformat(),
            now=now,
        )
    finally:
        if recheck:
            gpkg.unlink(missing_ok=True)

    if recheck:
        existing = json.loads(layer_path.read_text(encoding="utf-8"))
        if layer_content(existing) != layer_content(json.loads(dump_json(layer))):
            raise PipelineError(
                f"{source.id}: the layer content changed since it was committed. The file was "
                "kept. A new source id is needed (agree it in sources.md first)."
            )
        out(f"{source.id}: recheck found identical content; file unchanged")
        return "unchanged"

    atomic_write_text(layer_path, dump_json(layer))
    out(
        f"{source.id}: wrote {layer_path.relative_to(paths.root)} "
        f"({len(layer['features'])} features, last refreshed {refreshed.isoformat()})"
    )
    return "written"


def run_present(
    paths: Paths,
    registry: Registry,
    http: HttpClient,
    ids: list[str],
    recheck: bool,
    now: datetime,
    out: Callable[[str], None] = print,
) -> dict[str, str]:
    datasets = select_datasets(registry, ids)
    if not datasets:
        raise PipelineError("No present-day sources in the Registry")
    results: dict[str, str] = {}
    for dataset in datasets:
        results[dataset.source_id] = present_one(paths, registry, http, dataset, recheck, now, out)
    return results
