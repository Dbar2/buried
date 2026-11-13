"""A synthetic repository root and a Service over it, for the Service tests."""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from buried_pipeline.paths import find_repo_root
from buried_pipeline.service.app import create_app
from buried_pipeline.service.config import Config
from buried_pipeline.service.limits import Limiter
from buried_pipeline.service.snapshot import Snapshot, load_snapshot
from tests.extract.test_run import HEIGHT, MAP_AREA, WIDTH
from tests.helpers.synthetic_plate import synthetic_params
from tests.publish.strategies import SOURCE, World, make_world
from tests.validate.builders import NOW

REAL_STUDIO_SCHEMA = (
    find_repo_root(Path(__file__)) / "data" / "schema" / "studio_api.schema.json"
)
FULL_PLATE = {"x": 0, "y": 0, "width": WIDTH, "height": HEIGHT}


@dataclass
class ServiceWorld:
    world: World
    snapshot: Snapshot

    @property
    def root(self) -> Path:
        return self.world.paths.root

    @property
    def plate_ref(self) -> str:
        ref = self.snapshot.plate_ref_of(SOURCE)
        assert ref is not None
        return ref


def make_service_world(tmp_path: Path) -> ServiceWorld:
    world = make_world(tmp_path)
    shutil.copy(REAL_STUDIO_SCHEMA, world.paths.data / "schema" / "studio_api.schema.json")
    return ServiceWorld(world, load_snapshot(world.paths.root))


def client_for(
    sw: ServiceWorld,
    limiter: Limiter | None = None,
    max_body_bytes: int | None = None,
    env: dict[str, str] | None = None,
) -> TestClient:
    config = Config(root=sw.root, **({"max_body_bytes": max_body_bytes} if max_body_bytes else {}))
    app = create_app(config=config, snapshot=sw.snapshot, limiter=limiter, now=lambda: NOW,
                     env=env or {})  # fmt: skip
    return TestClient(app, raise_server_exceptions=False)


def extract_body(sw: ServiceWorld, **over: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "api_version": "1.0.0",
        "data_version": sw.snapshot.data_version,
        "plate_ref": sw.plate_ref,
        "source": sw.snapshot.source_record(SOURCE),
        "region_px": dict(FULL_PLATE),
    }
    body.update(over)
    return body


def use_synthetic_params(monkeypatch: pytest.MonkeyPatch) -> None:
    """The synthetic plate is drawn for `synthetic_params`; the committed parameter set is tuned
    for the real plates (spec 02 task 7.10)."""
    monkeypatch.setattr("buried_pipeline.service.extract.load_params", synthetic_params)


def snapshot_of_files(root: Path) -> dict[str, tuple[int, int]]:
    """Every file under data/ with its size and modification time, for 'nothing was written'."""
    return {
        p.relative_to(root).as_posix(): (p.stat().st_size, p.stat().st_mtime_ns)
        for p in sorted((root / "data").rglob("*"))
        if p.is_file()
    }


__all__ = ["FULL_PLATE", "MAP_AREA", "SOURCE", "ServiceWorld", "client_for", "extract_body",
           "make_service_world", "snapshot_of_files", "use_synthetic_params"]  # fmt: skip
