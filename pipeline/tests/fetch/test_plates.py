from __future__ import annotations

import copy
import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from buried_pipeline.cli import main
from buried_pipeline.errors import PipelineError
from buried_pipeline.fetch.manifest import read_manifest, sha256_file
from buried_pipeline.fetch.plates import check_plate_url, fetch_plates
from buried_pipeline.io.registry import load_registry, parse_registry
from buried_pipeline.paths import Paths
from tests.conftest import SOURCES_DOC, make_root
from tests.fakes import FakeHttp, make_zip

NOW = datetime(2026, 11, 13, 12, 0, 0, tzinfo=UTC)
URL_1911 = SOURCES_DOC["sources"][0]["url"]
URL_1935 = SOURCES_DOC["sources"][1]["url"]
ZIP_1911 = make_zip({"v3-1911-229.tif": b"TIFFDATA", "v3-1911-229.tfw": b"world"})
ZIP_1935 = make_zip({"v3-1935-229.tif": b"OTHER"})


def fake() -> FakeHttp:
    return FakeHttp(files={URL_1911: ZIP_1911, URL_1935: ZIP_1935})


def test_downloads_extracts_and_writes_manifest(paths: Paths) -> None:
    http = fake()
    results = fetch_plates(paths, load_registry(paths.sources_json), http, [], NOW)
    assert [(r.source, r.status) for r in results] == [
        ("fip_v3_1911_229", "downloaded"),
        ("fip_v3_1935_229", "downloaded"),
    ]
    folder = paths.raw / "fip_v3_1911_229"
    assert (folder / "v3-1911-229.tif").read_bytes() == b"TIFFDATA"
    entry = read_manifest(paths.manifest)["fip_v3_1911_229"]
    assert entry["url"] == URL_1911
    assert entry["retrieved_at"] == "2026-11-13T12:00:00Z"
    assert entry["zip"]["sha256"] == sha256_file(folder / "v3-1911-229.zip")
    assert entry["zip"]["bytes"] == len(ZIP_1911)
    assert sorted(f["path"] for f in entry["files"]) == [
        "fip_v3_1911_229/v3-1911-229.tfw",
        "fip_v3_1911_229/v3-1911-229.tif",
    ]
    assert not list(paths.raw.glob("*.partial"))


def test_only_named_ids_are_fetched(paths: Paths) -> None:
    http = fake()
    fetch_plates(paths, load_registry(paths.sources_json), http, ["fip_v3_1935_229"], NOW)
    assert [url for _, url, _ in http.requests] == [URL_1935]
    assert not (paths.raw / "fip_v3_1911_229").exists()


def test_second_run_makes_no_requests(paths: Paths) -> None:
    registry = load_registry(paths.sources_json)
    fetch_plates(paths, registry, fake(), [], NOW)
    http = fake()
    results = fetch_plates(paths, registry, http, [], NOW)
    assert http.requests == []
    assert {r.status for r in results} == {"up_to_date"}


def test_modified_file_stops_without_overwriting(paths: Paths) -> None:
    registry = load_registry(paths.sources_json)
    fetch_plates(paths, registry, fake(), ["fip_v3_1911_229"], NOW)
    tif = paths.raw / "fip_v3_1911_229" / "v3-1911-229.tif"
    tif.write_bytes(b"edited by hand")
    http = fake()
    with pytest.raises(PipelineError, match="v3-1911-229.tif"):
        fetch_plates(paths, registry, http, ["fip_v3_1911_229"], NOW)
    assert http.requests == []
    assert tif.read_bytes() == b"edited by hand"


def test_existing_folder_without_manifest_entry_stops(paths: Paths) -> None:
    folder = paths.raw / "fip_v3_1911_229"
    folder.mkdir(parents=True)
    (folder / "stray.tif").write_bytes(b"x")
    http = fake()
    with pytest.raises(PipelineError, match="manifest has no entry"):
        fetch_plates(paths, load_registry(paths.sources_json), http, ["fip_v3_1911_229"], NOW)
    assert http.requests == []


def test_null_rights_date_refused_before_any_request(paths: Paths) -> None:
    doc = copy.deepcopy(SOURCES_DOC)
    doc["sources"][1]["rights_checked_on"] = None
    registry = parse_registry(doc)
    http = fake()
    with pytest.raises(PipelineError, match="rights_checked_on"):
        fetch_plates(paths, registry, http, [], NOW)
    assert http.requests == []  # the first plate was not fetched either


def test_unregistered_id_refused(paths: Paths) -> None:
    with pytest.raises(PipelineError, match="not in the Registry"):
        fetch_plates(paths, load_registry(paths.sources_json), fake(), ["fip_v3_1911_999"], NOW)


def test_non_plate_source_refused(paths: Paths) -> None:
    with pytest.raises(PipelineError, match="cannot be fetched"):
        fetch_plates(
            paths,
            load_registry(paths.sources_json),
            fake(),
            ["present_toronto_intersections_2026"],
            NOW,
        )


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/datapub/FIP/vol3_19111914/v3-1911-229.zip",
        "http://maps.library.utoronto.ca/datapub/FIP/vol3_19111914/v3-1911-229.zip",
        "https://maps.library.utoronto.ca/datapub/FIP/vol3_19111914/v3-1911-229.zip?x=1",
        "https://maps.library.utoronto.ca/datapub/FIP/vol3_19111914/../v3-1911-229.zip",
        "https://maps.library.utoronto.ca/datapub/FIP/vol3_1935/Georeferenced/v3-1935-229.zip",
        "https://maps.library.utoronto.ca/datapub/FIP/vol3_19111914/v3-1911-230.zip",
    ],
)
def test_url_guard(url: str) -> None:
    doc = copy.deepcopy(SOURCES_DOC)
    doc["sources"][0]["url"] = url
    source = parse_registry(doc).get("fip_v3_1911_229")
    with pytest.raises(PipelineError):
        check_plate_url(source)


def test_registered_urls_pass_guard(paths: Paths) -> None:
    for source in load_registry(paths.sources_json).by_type("fire_insurance_plan"):
        check_plate_url(source)


def test_escaping_zip_leaves_nothing_behind(paths: Paths) -> None:
    evil = make_zip({"v3-1911-229.tif": b"ok", "../../outside.txt": b"bad"})
    http = FakeHttp(files={URL_1911: evil})
    with pytest.raises(PipelineError):
        fetch_plates(paths, load_registry(paths.sources_json), http, ["fip_v3_1911_229"], NOW)
    assert not (paths.raw / "fip_v3_1911_229").exists()
    assert not list(paths.raw.glob("*.partial"))
    assert not paths.manifest.exists()
    assert not (paths.root / "outside.txt").exists()


def test_cli_fetch_with_fake_http(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    paths = make_root(tmp_path)
    http = fake()
    code = main(
        ["--root", str(paths.root), "fetch", "fip_v3_1911_229"],
        http_factory=lambda: http,
        now=lambda: NOW,
    )
    assert code == 0
    assert "downloaded" in capsys.readouterr().out
    assert json.loads(paths.manifest.read_text())["entries"][0]["source"] == "fip_v3_1911_229"
