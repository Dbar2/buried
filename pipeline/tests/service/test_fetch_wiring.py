"""The Service with an empty `data/raw/` (session 026): plates fetched on demand into a cache,
the registered-plates listing that never reads the held-out raster, CORS and the start command.
Fakes only: no network, no real plate."""

from __future__ import annotations

import dataclasses
import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from buried_pipeline.errors import PipelineError
from buried_pipeline.fetch.manifest import sha256_file
from buried_pipeline.paths import Paths, find_repo_root
from buried_pipeline.service.app import create_app
from buried_pipeline.service.config import Config, ConfigError
from buried_pipeline.service.plates import FetchRefused, PlateFiles, manifest_raster_ref
from buried_pipeline.service.snapshot import Snapshot, load_snapshot
from tests.service.helpers import (
    SOURCE,
    ServiceWorld,
    client_for,
    extract_body,
    make_service_world,
    use_synthetic_params,
)
from tests.service.test_app import decisions_for, error_code, proposals_from_service, publish_body

ROOT = find_repo_root(Path(__file__))
HELD_OUT = "fip_v3_1935_232"


class StubFetcher:
    """Stands in for `PlateFetcher`: `ensure` puts a prepared plate folder into the cache."""

    def __init__(self, stash: Path, cache: Path, raises: Exception | None = None) -> None:
        self.stash, self.cache, self.raises = stash, cache, raises
        self.calls: list[tuple[str, bool]] = []

    def ensure(self, source_id: str, *, live: bool = False) -> PlateFiles:
        self.calls.append((source_id, live))
        if self.raises is not None:
            raise self.raises
        target = self.cache / source_id
        shutil.copytree(self.stash / source_id, target, dirs_exist_ok=True)
        return PlateFiles(source_id, target, "downloaded", 0, 1)


def without_raw(sw: ServiceWorld, tmp_path: Path, raises: Exception | None = None):
    """The same world after its raster has been taken away from data/raw/, as a Service with a
    fetch cache and a stub fetcher that can bring it back."""
    stash = tmp_path / "stash"
    stash.mkdir()
    shutil.move(str(sw.world.paths.raw_source_dir(SOURCE)), stash / SOURCE)
    fetcher = StubFetcher(stash, tmp_path / "cache", raises)
    snap = dataclasses.replace(
        sw.snapshot, _refs={}, cache_dir=tmp_path / "cache", fetcher=fetcher  # type: ignore[arg-type]
    )
    return ServiceWorld(sw.world, snap), fetcher


@pytest.fixture
def world(tmp_path: Path) -> ServiceWorld:
    return make_service_world(tmp_path / "world")


@pytest.fixture
def synthetic(monkeypatch: pytest.MonkeyPatch) -> None:
    use_synthetic_params(monkeypatch)


# --- extract and publish with data/raw/ empty ----------------------------------------------------


def test_without_a_fetcher_an_empty_raw_means_not_found(
    world: ServiceWorld, tmp_path: Path, synthetic: None
) -> None:
    body = extract_body(world)
    shutil.rmtree(world.world.paths.raw_source_dir(SOURCE))
    plain = ServiceWorld(world.world, dataclasses.replace(world.snapshot, _refs={}))
    r = client_for(plain).post("/v1/extract", json=body)
    assert r.status_code == 404 and error_code(r) == "not_found"


def test_extract_fetches_the_plate_once_as_a_live_request(
    world: ServiceWorld, tmp_path: Path, synthetic: None
) -> None:
    body = extract_body(world)
    served, fetcher = without_raw(world, tmp_path)
    client = client_for(served)
    first = client.post("/v1/extract", json=body)
    assert first.status_code == 200, first.text
    assert first.json()["proposal_file_text"]
    assert fetcher.calls == [(SOURCE, True)]  # live, because a person's request asked for it
    assert (tmp_path / "cache" / SOURCE).is_dir()
    second = client.post("/v1/extract", json=body)
    assert second.status_code == 200 and second.json() == first.json()
    assert fetcher.calls == [(SOURCE, True)]  # now found in the cache by its ref


def test_a_fetched_plate_that_is_not_the_one_asked_for_is_not_found(
    world: ServiceWorld, tmp_path: Path, synthetic: None
) -> None:
    body = extract_body(world, plate_ref="0" * 64)
    served, fetcher = without_raw(world, tmp_path)
    r = client_for(served).post("/v1/extract", json=body)
    assert r.status_code == 404 and error_code(r) == "not_found"
    assert fetcher.calls == [(SOURCE, True)]


def test_a_refused_fetch_is_an_error_body_not_a_crash(world: ServiceWorld, tmp_path: Path) -> None:
    body = extract_body(world)
    served, _ = without_raw(world, tmp_path, FetchRefused("held_out", "not warmed up"))
    r = client_for(served).post("/v1/extract", json=body)
    assert r.status_code == 403 and error_code(r) == "not_allowed"
    assert "not warmed up" in r.json()["error"]["message"]


def test_a_failed_download_is_a_bad_gateway_not_a_crash(world: ServiceWorld, tmp_path: Path) -> None:
    body = extract_body(world)
    served, _ = without_raw(world, tmp_path, PipelineError("timed out"))
    r = client_for(served).post("/v1/extract", json=body)
    assert r.status_code == 502 and error_code(r) == "upstream_failed"
    assert "timed out" in r.json()["error"]["message"]


def test_publish_fetches_the_plate_when_data_raw_is_empty(
    world: ServiceWorld, tmp_path: Path, synthetic: None
) -> None:
    client = client_for(world)
    text, doc = proposals_from_service(world, client)
    body = publish_body(world, text, decisions_for(doc))
    served, fetcher = without_raw(world, tmp_path)
    r = client_for(served).post("/v1/publish", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True and r.json()["counts"]["published_now"] == 3
    assert fetcher.calls == [(SOURCE, True)]


def test_publish_says_so_when_the_plate_cannot_be_fetched(
    world: ServiceWorld, tmp_path: Path, synthetic: None
) -> None:
    client = client_for(world)
    text, doc = proposals_from_service(world, client)
    body = publish_body(world, text, decisions_for(doc))
    served, _ = without_raw(world, tmp_path, PipelineError("connection reset"))
    r = client_for(served).post("/v1/publish", json=body)
    assert r.status_code == 502 and error_code(r) == "upstream_failed"
    assert "connection reset" in r.json()["error"]["message"]


# --- the registered-plates listing and the held-out plate ----------------------------------------


def real_snapshot_over(tmp_path: Path, **kwargs) -> Snapshot:
    """The committed Registry, Schemas and contract files with a throwaway `data/raw/`."""
    return dataclasses.replace(load_snapshot(ROOT, **kwargs), paths=Paths(tmp_path))


def plate_dirs(tmp_path: Path, ids: list[str]) -> None:
    for sid in ids:
        folder = tmp_path / "data" / "raw" / sid
        folder.mkdir(parents=True)
        (folder / f"{sid}.jpg").write_bytes(f"fake raster of {sid}".encode())


def test_the_listing_never_reads_the_held_out_raster(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    ids = ["fip_v3_1911_229", "fip_v3_1911_232", "fip_v3_1935_229", HELD_OUT]
    plate_dirs(tmp_path, ids)
    snap = real_snapshot_over(tmp_path)
    read: list[str] = []

    def spy(path: Path) -> str:
        read.append(path.parent.name)
        return sha256_file(path)

    monkeypatch.setattr("buried_pipeline.service.snapshot.sha256_file", spy)
    r = TestClient(create_app(config=Config(root=ROOT), snapshot=snap, env={})).get(
        "/v1/plates/registered"
    )
    assert r.status_code == 200, r.text
    plates = {p["source"]["id"]: p for p in r.json()["plates"]}
    assert set(plates) == set(ids)
    assert HELD_OUT not in read and sorted(read) == sorted(set(ids) - {HELD_OUT})
    held = plates[HELD_OUT]
    assert held["raster_available"] is True and held["plate_ref"] is None
    assert all(plates[i]["plate_ref"] for i in set(ids) - {HELD_OUT})


def test_the_held_out_ref_comes_from_a_manifest_when_there_is_one(tmp_path: Path) -> None:
    entry = {
        "source": HELD_OUT, "url": "https://example.invalid/x.zip", "retrieved_at": "2026-11-20T00:00:00Z",
        "files": [
            {"path": f"{HELD_OUT}/v3-1935-232.jpg", "bytes": 5, "sha256": "ab" * 32},
            {"path": f"{HELD_OUT}/v3-1935-232.jpg.ovr", "bytes": 5, "sha256": "cd" * 32},
            {"path": f"{HELD_OUT}/v3-1935-232.jgw", "bytes": 5, "sha256": "ef" * 32},
        ],
    }
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"entries": [entry]}), encoding="utf-8")
    snap = real_snapshot_over(tmp_path / "empty", manifest_path=manifest)
    r = TestClient(create_app(config=Config(root=ROOT), snapshot=snap, env={})).get(
        "/v1/plates/registered"
    )
    held = next(p for p in r.json()["plates"] if p["source"]["id"] == HELD_OUT)
    assert held["plate_ref"] == "ab" * 32 and held["raster_available"] is False
    assert manifest_raster_ref(entry) == "ab" * 32


def test_a_manifest_with_two_rasters_names_none(tmp_path: Path) -> None:
    files = [{"path": f"s/{n}", "bytes": 1, "sha256": "00" * 32} for n in ("a.tif", "b.tif")]
    assert manifest_raster_ref({"files": files}) is None
    thumb = [{"path": "s/a_thumb.jpg", "bytes": 1, "sha256": "11" * 32}, files[0]]
    assert manifest_raster_ref({"files": thumb}) == "00" * 32


def test_with_a_fetcher_every_plate_is_available_without_being_read(tmp_path: Path) -> None:
    snap = real_snapshot_over(tmp_path / "empty", cache_dir=tmp_path / "cache")
    assert snap.fetcher is not None and (tmp_path / "cache").is_dir()
    r = TestClient(create_app(config=Config(root=ROOT), snapshot=snap, env={})).get(
        "/v1/plates/registered"
    )
    plates = r.json()["plates"]
    assert plates and all(p["raster_available"] and p["plate_ref"] is None for p in plates)


# --- configuration, CORS, health, the start command ----------------------------------------------


def test_the_cache_dir_and_manifest_come_from_the_environment(tmp_path: Path) -> None:
    manifest = tmp_path / "m.json"
    manifest.write_text('{"entries": []}', encoding="utf-8")
    c = Config.from_env({
        "BURIED_REPO_ROOT": str(tmp_path), "BURIED_CACHE_DIR": str(tmp_path / "cache"),
        "BURIED_PLATE_MANIFEST": str(manifest),
    })
    assert c.cache_dir == (tmp_path / "cache").resolve() and c.plate_manifest == manifest.resolve()
    plain = Config.from_env({"BURIED_REPO_ROOT": str(tmp_path)})
    assert plain.cache_dir is None and plain.plate_manifest is None
    with pytest.raises(ConfigError, match="BURIED_PLATE_MANIFEST"):
        Config.from_env({"BURIED_REPO_ROOT": str(tmp_path), "BURIED_PLATE_MANIFEST": "/nope.json"})


def test_cors_allows_only_the_configured_origins(world: ServiceWorld) -> None:
    config = Config(root=world.root, allowed_origins=("https://buried.example",))
    client = TestClient(create_app(config=config, snapshot=world.snapshot, env={}))
    ok = client.get("/v1/health", headers={"Origin": "https://buried.example"})
    assert ok.headers.get("access-control-allow-origin") == "https://buried.example"
    other = client.get("/v1/health", headers={"Origin": "https://elsewhere.example"})
    assert "access-control-allow-origin" not in other.headers
    nothing = client_for(world).get("/v1/health", headers={"Origin": "https://buried.example"})
    assert "access-control-allow-origin" not in nothing.headers  # no origins configured: none


def test_health_reports_the_data_version(world: ServiceWorld) -> None:
    body = client_for(world).get("/v1/health").json()
    assert body["data_version"] == world.snapshot.data_version
    assert len(body["data_version"]) == 64


def test_the_image_starts_on_the_port_railway_gives_it() -> None:
    dockerfile = (ROOT / "pipeline" / "Dockerfile").read_text(encoding="utf-8")
    assert "--port ${PORT:-8000}" in dockerfile and "--host 0.0.0.0" in dockerfile
    assert "BURIED_CACHE_DIR" in dockerfile
    config = json.loads((ROOT / "pipeline" / "railway.json").read_text(encoding="utf-8"))
    assert config["build"] == {"builder": "DOCKERFILE", "dockerfilePath": "pipeline/Dockerfile"}
    assert config["deploy"]["healthcheckPath"] == "/v1/health"
    assert "startCommand" not in config["deploy"]  # the image's CMD reads PORT


def test_the_committed_plate_manifest_gives_every_plate_its_ref_on_an_empty_deployment(
    tmp_path: Path,
) -> None:
    """With no raster anywhere and no BURIED_PLATE_MANIFEST, the default manifest is the committed
    `data/plate_manifest.json`, and the listing shows all four plates with a `plate_ref`."""
    config = Config.from_env({"BURIED_REPO_ROOT": str(ROOT)})
    assert config.plate_manifest == ROOT / "data" / "plate_manifest.json"
    snap = real_snapshot_over(tmp_path / "empty", manifest_path=config.plate_manifest)
    r = TestClient(create_app(config=config, snapshot=snap, env={})).get("/v1/plates/registered")
    assert r.status_code == 200, r.text
    plates = r.json()["plates"]
    assert len(plates) == 4
    assert all(p["plate_ref"] and p["raster_available"] is False for p in plates)
    committed = json.loads(config.plate_manifest.read_text(encoding="utf-8"))
    refs = {e["source"]: manifest_raster_ref(e) for e in committed["entries"]}
    assert {p["source"]["id"]: p["plate_ref"] for p in plates} == refs
