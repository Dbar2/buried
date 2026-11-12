from __future__ import annotations

import copy
import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from shapely.geometry import Point

from buried_pipeline.cli import main
from buried_pipeline.errors import PipelineError
from buried_pipeline.io.registry import load_registry, parse_registry
from buried_pipeline.paths import Paths
from buried_pipeline.present.ckan import PACKAGE_SHOW_URL
from buried_pipeline.present.datasets import PresentDataset
from buried_pipeline.present.run import present_one, resolve_bounds
from tests.conftest import SOURCES_DOC, make_root
from tests.fakes import FakeHttp
from tests.helpers.rasters import NORTH_UP_26917, write_geotiff
from tests.helpers.vectors import to_lonlat, write_gpkg

NOW = datetime(2026, 11, 13, 12, 0, 0, tzinfo=UTC)
SOURCE_ID = "present_toronto_intersections_2026"
RESOURCE_URL = (
    "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/pkg/resource/res-gpkg/download/x.gpkg"
)
CONFIRMED = PresentDataset(
    source_id=SOURCE_ID,
    package_id="pkg",
    geometry=("Point",),
    id_field="ID",
    kept_fields=("NAME",),
)
UNCONFIRMED = PresentDataset(source_id=SOURCE_ID, package_id="pkg", geometry=("Point",))
BOUNDS = {"min_e": 629700.0, "min_n": 4833700.0, "max_e": 631300.0, "max_n": 4835300.0}

CKAN_DOC = {
    "success": True,
    "result": {
        "name": "pkg",
        "last_refreshed": "2025-11-21T05:30:19",
        "resources": [
            {"id": "res-gpkg", "name": "x", "format": "GPKG", "url": RESOURCE_URL},
        ],
    },
}


def lonlat(e: float, n: float) -> Point:
    return Point(*to_lonlat(e, n))


def gpkg_bytes(tmp_path: Path, rows) -> bytes:
    return write_gpkg(tmp_path / "scratch.gpkg", rows).read_bytes()


def setup(tmp_path: Path, rows=None, year_from: int | None = 2025) -> tuple[Paths, FakeHttp]:
    doc = copy.deepcopy(SOURCES_DOC)
    doc["sources"][2]["year_from"] = year_from
    paths = make_root(tmp_path / "repo_root", doc)
    paths.project_json.write_text(json.dumps({"bounds": BOUNDS}), encoding="utf-8")
    rows = rows if rows is not None else [
        (lonlat(630000, 4834000), 11, "Main & Side"),
        (lonlat(631200, 4835200), 7, "Edge"),
        (lonlat(640000, 4834000), 99, "Far away"),
    ]  # fmt: skip
    http = FakeHttp(
        files={RESOURCE_URL: gpkg_bytes(tmp_path, rows)},
        documents={(PACKAGE_SHOW_URL, (("id", "pkg"),)): CKAN_DOC},
    )
    return paths, http


def run_one(paths: Paths, http: FakeHttp, dataset=CONFIRMED, recheck=False, now=NOW) -> str:
    return present_one(
        paths, load_registry(paths.sources_json), http, dataset, recheck, now, lambda _m: None
    )


def test_writes_clipped_layer_with_metadata(tmp_path: Path) -> None:
    paths, http = setup(tmp_path)
    assert run_one(paths, http) == "written"
    layer = json.loads(paths.present_layer(SOURCE_ID).read_text())
    assert [f["id"] for f in layer["features"]] == ["11", "7"]  # sorted as strings
    assert layer["crs"] == "EPSG:26917"
    assert layer["source"] == SOURCE_ID
    assert layer["ckan_package_id"] == "pkg" and layer["ckan_resource_id"] == "res-gpkg"
    assert layer["resource_url"] == RESOURCE_URL
    assert layer["last_refreshed"] == "2025-11-21"
    assert layer["retrieved_at"] == "2026-11-13T12:00:00Z"
    assert layer["id_field"] == "ID"
    assert layer["clip_bounds"] == BOUNDS
    assert layer["attribution_line"].startswith("Contains information licensed")
    assert len(layer["source_sha256"]) == 64
    feature = next(f for f in layer["features"] if f["id"] == "11")
    assert feature["properties"] == {"NAME": "Main & Side"}
    assert feature["geometry"]["coordinates"] == pytest.approx([630000, 4834000], abs=1e-3)
    manifest = json.loads(paths.manifest.read_text())["entries"][0]
    assert manifest["source"] == SOURCE_ID and manifest["files"][0]["sha256"] == layer["source_sha256"]


def test_existing_layer_is_up_to_date_with_no_request(tmp_path: Path) -> None:
    paths, http = setup(tmp_path)
    run_one(paths, http)
    before = paths.present_layer(SOURCE_ID).read_bytes()
    http2 = FakeHttp()
    assert run_one(paths, http2) == "up_to_date"
    assert http2.requests == []
    assert paths.present_layer(SOURCE_ID).read_bytes() == before


def test_registry_year_from_mismatch_stops_and_says_what_to_record(tmp_path: Path) -> None:
    paths, http = setup(tmp_path, year_from=None)
    with pytest.raises(PipelineError) as err:
        run_one(paths, http)
    text = str(err.value)
    assert "year_from should be 2025" in text and "has null" in text
    assert not paths.present_layer(SOURCE_ID).exists()
    assert not [r for r in http.requests if r[0] == "download"]  # stopped before downloading


def test_registry_year_to_mismatch_stops(tmp_path: Path) -> None:
    paths, http = setup(tmp_path)
    with pytest.raises(PipelineError, match="year_to should be 2027"):
        run_one(paths, http, now=datetime(2027, 1, 5, tzinfo=UTC))
    assert not paths.present_layer(SOURCE_ID).exists()


def test_unconfirmed_fields_download_list_fields_and_stop(tmp_path: Path) -> None:
    paths, http = setup(tmp_path)
    with pytest.raises(PipelineError) as err:
        run_one(paths, http, dataset=UNCONFIRMED)
    text = str(err.value)
    assert "dataset fields not confirmed" in text
    assert "'ID'" in text and "'NAME'" in text and "EPSG:4326" in text
    assert not paths.present_layer(SOURCE_ID).exists()
    assert (paths.raw / "present" / SOURCE_ID / f"{SOURCE_ID}.gpkg").exists()


def test_second_run_after_confirming_fields_reuses_the_download(tmp_path: Path) -> None:
    paths, http = setup(tmp_path)
    with pytest.raises(PipelineError):
        run_one(paths, http, dataset=UNCONFIRMED)
    downloads = len([r for r in http.requests if r[0] == "download"])
    assert run_one(paths, http) == "written"
    assert len([r for r in http.requests if r[0] == "download"]) == downloads


def test_missing_declared_field_stops(tmp_path: Path) -> None:
    paths, http = setup(tmp_path)
    bad = PresentDataset(SOURCE_ID, "pkg", ("Point",), id_field="ID", kept_fields=("NOPE",))
    with pytest.raises(PipelineError, match=r"fields \['NOPE'\] are not in the file"):
        run_one(paths, http, dataset=bad)


def test_modified_download_stops(tmp_path: Path) -> None:
    paths, http = setup(tmp_path)
    with pytest.raises(PipelineError):
        run_one(paths, http, dataset=UNCONFIRMED)
    (paths.raw / "present" / SOURCE_ID / f"{SOURCE_ID}.gpkg").write_bytes(b"tampered")
    with pytest.raises(PipelineError, match="differ from the manifest"):
        run_one(paths, http)


def test_resource_outside_ckan_host_refused(tmp_path: Path) -> None:
    paths, http = setup(tmp_path)
    doc = copy.deepcopy(CKAN_DOC)
    doc["result"]["resources"][0]["url"] = "https://evil.example.com/x.gpkg"
    http.documents[(PACKAGE_SHOW_URL, (("id", "pkg"),))] = doc
    with pytest.raises(PipelineError, match="Refusing resource URL"):
        run_one(paths, http)
    assert not [r for r in http.requests if r[0] == "download"]


def test_too_many_features_writes_nothing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from buried_pipeline.present import clip

    monkeypatch.setattr(clip, "MAX_FEATURES", 1)
    paths, http = setup(tmp_path)
    with pytest.raises(PipelineError, match="More than 1 features"):
        run_one(paths, http)
    assert not paths.present_layer(SOURCE_ID).exists()


def test_recheck_identical_content_exits_cleanly_and_keeps_file(tmp_path: Path) -> None:
    paths, http = setup(tmp_path)
    run_one(paths, http)
    before = paths.present_layer(SOURCE_ID).read_bytes()
    later = datetime(2026, 12, 1, tzinfo=UTC)
    assert run_one(paths, http, recheck=True, now=later) == "unchanged"
    assert paths.present_layer(SOURCE_ID).read_bytes() == before


def test_recheck_changed_content_stops_and_keeps_file(tmp_path: Path) -> None:
    paths, http = setup(tmp_path)
    run_one(paths, http)
    before = paths.present_layer(SOURCE_ID).read_bytes()
    changed = gpkg_bytes(tmp_path, [(lonlat(630000, 4834000), 11, "Renamed")])
    http.files[RESOURCE_URL] = changed
    with pytest.raises(PipelineError, match="new source id is needed"):
        run_one(paths, http, recheck=True)
    assert paths.present_layer(SOURCE_ID).read_bytes() == before


def test_bounds_from_project_json_else_from_inspect_reports(tmp_path: Path) -> None:
    paths, _ = setup(tmp_path)
    registry = load_registry(paths.sources_json)
    assert resolve_bounds(paths, registry) == (629700.0, 4833700.0, 631300.0, 4835300.0)

    paths.project_json.unlink()
    with pytest.raises(PipelineError, match="plates are not all inspected"):
        resolve_bounds(paths, registry)

    # Two plates 1 km apart, both inspected: bounds = union + 250 m, rounded outward to 100 m.
    from buried_pipeline.inspect.georef import inspect_source

    write_geotiff(paths.raw / "fip_v3_1911_229" / "a.tif", NORTH_UP_26917)
    write_geotiff(
        paths.raw / "fip_v3_1935_229" / "b.tif", (0.1, 0.0, 631000.0, 0.0, -0.1, 4835000.0)
    )
    inspect_source(paths, "fip_v3_1911_229")
    inspect_source(paths, "fip_v3_1935_229")
    assert resolve_bounds(paths, registry) == (629700.0, 4833700.0, 631300.0, 4835300.0)


def test_cli_present_with_unconfirmed_fields_exits_1(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # The building outlines fields are not confirmed yet (task 10.5), so the command downloads
    # and stops. (The intersections fields were confirmed in task 10.4.)
    outlines = "present_toronto_building_outlines_2026"
    paths, http = setup(tmp_path)
    pkg_url = (PACKAGE_SHOW_URL, (("id", "topographic-mapping-building-outlines"),))
    http.documents[pkg_url] = CKAN_DOC
    code = main(
        ["--root", str(paths.root), "present", outlines], http_factory=lambda: http, now=lambda: NOW
    )
    assert code == 1
    assert "dataset fields not confirmed" in capsys.readouterr().err


def test_registry_without_present_source_refuses(tmp_path: Path) -> None:
    doc = copy.deepcopy(SOURCES_DOC)
    doc["sources"] = doc["sources"][:2]
    registry = parse_registry(doc)
    paths = make_root(tmp_path / "r2", doc)
    from buried_pipeline.present.run import run_present

    with pytest.raises(PipelineError, match="No present-day sources"):
        run_present(paths, registry, FakeHttp(), [], False, NOW)
