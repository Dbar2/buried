"""Fetching a registered plate on demand (spec 04 task 4.1, the fetch part). Fake HTTP only."""

from __future__ import annotations

import hashlib
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from buried_pipeline.fetch.manifest import read_manifest, write_manifest
from buried_pipeline.io.registry import Registry, load_registry
from buried_pipeline.service.plates import (
    ALLOWED_HOSTS,
    FetchRefused,
    PlateFetcher,
    check_host,
    check_request,
)
from tests.fakes import FakeHttp, make_zip

REPO_DATA = Path(__file__).resolve().parents[3] / "data"
NOW = datetime(2026, 11, 20, 12, 0, 0, tzinfo=UTC)
PLATE = "fip_v3_1911_229"
HELD_OUT = "fip_v3_1935_232"
ZIP_FILES = {"v3-1911-229.tif": b"II*\x00fake raster", "v3-1911-229.tfw": b"0.05\n"}


@pytest.fixture(scope="module")
def registry() -> Registry:
    return load_registry(REPO_DATA / "sources.json")


def url_of(registry: Registry, source_id: str) -> str:
    return registry.get(source_id).url


def fetcher(
    registry: Registry, tmp_path: Path, http: FakeHttp, manifest: Path | None = None
) -> PlateFetcher:
    return PlateFetcher(registry, tmp_path / "cache", http, manifest, clock=lambda: NOW)


def zip_http(registry: Registry, source_id: str = PLATE, files: dict | None = None) -> FakeHttp:
    return FakeHttp(files={url_of(registry, source_id): make_zip(files or ZIP_FILES)})


def manifest_for(registry: Registry, tmp_path: Path, source_id: str = PLATE) -> Path:
    """What a manifest from a trusted fetch looks like: made by fetching once, elsewhere."""
    other = tmp_path / "trusted"
    PlateFetcher(registry, other, zip_http(registry, source_id), clock=lambda: NOW).ensure(
        source_id, live=True
    )
    return other / "manifest.json"


# --- the happy path ------------------------------------------------------------------------------


def test_a_registered_plate_is_downloaded_once_and_then_served_from_the_cache(
    registry: Registry, tmp_path: Path
) -> None:
    http = zip_http(registry)
    f = fetcher(registry, tmp_path, http)
    first = f.ensure(PLATE)
    assert first.status == "downloaded"
    assert first.directory == tmp_path / "cache" / PLATE
    assert (first.directory / "v3-1911-229.tif").read_bytes() == ZIP_FILES["v3-1911-229.tif"]
    assert first.files == 2
    second = f.ensure(PLATE)
    assert second.status == "cached"
    assert [r[0] for r in http.requests] == ["download"]
    entry = read_manifest(tmp_path / "cache" / "manifest.json")[PLATE]
    assert entry["url"] == url_of(registry, PLATE)
    assert entry["retrieved_at"] == "2026-11-20T12:00:00Z"
    assert {r["path"] for r in entry["files"]} == {f"{PLATE}/{n}" for n in ZIP_FILES}


def test_nothing_is_left_beside_the_plate(registry: Registry, tmp_path: Path) -> None:
    fetcher(registry, tmp_path, zip_http(registry)).ensure(PLATE)
    assert sorted(p.name for p in (tmp_path / "cache").iterdir()) == [PLATE, "manifest.json"]


# --- the manifest --------------------------------------------------------------------------------


def test_a_download_that_matches_the_manifest_is_kept(registry: Registry, tmp_path: Path) -> None:
    manifest = manifest_for(registry, tmp_path)
    f = fetcher(registry, tmp_path, zip_http(registry), manifest)
    assert f.ensure(PLATE).status == "downloaded"


@pytest.mark.parametrize(
    ("changed", "code"),
    [
        ({"v3-1911-229.tif": b"II*\x00fake raster", "v3-1911-229.tfw": b"0.05555555\n"}, "size_mismatch"),
        ({"v3-1911-229.tif": b"II*\x00fake rastex", "v3-1911-229.tfw": b"0.05\n"}, "hash_mismatch"),
        ({"v3-1911-229.tif": b"II*\x00fake raster"}, "size_mismatch"),
    ],
)
def test_a_download_that_differs_from_the_manifest_is_refused_and_not_kept(
    registry: Registry, tmp_path: Path, changed: dict, code: str
) -> None:
    manifest = manifest_for(registry, tmp_path)
    f = fetcher(registry, tmp_path, zip_http(registry, files=changed), manifest)
    with pytest.raises(FetchRefused) as info:
        f.ensure(PLATE)
    assert info.value.code == code
    assert list((tmp_path / "cache").iterdir()) == []


def test_extracted_files_are_checked_even_when_the_zip_hash_is_unlisted(
    registry: Registry, tmp_path: Path
) -> None:
    manifest = manifest_for(registry, tmp_path)
    entries = read_manifest(manifest)
    del entries[PLATE]["zip"]
    entries[PLATE]["files"][0]["sha256"] = hashlib.sha256(b"other").hexdigest()
    write_manifest(manifest, entries)
    with pytest.raises(FetchRefused) as info:
        fetcher(registry, tmp_path, zip_http(registry), manifest).ensure(PLATE)
    assert info.value.code == "hash_mismatch"
    assert not (tmp_path / "cache" / PLATE).exists()


def test_a_changed_cache_is_discarded_and_fetched_again(registry: Registry, tmp_path: Path) -> None:
    http = zip_http(registry)
    f = fetcher(registry, tmp_path, http)
    f.ensure(PLATE)
    (tmp_path / "cache" / PLATE / "v3-1911-229.tfw").write_bytes(b"tampered")
    again = f.ensure(PLATE)
    assert again.status == "downloaded"
    assert len(http.requests) == 2
    assert (tmp_path / "cache" / PLATE / "v3-1911-229.tfw").read_bytes() == ZIP_FILES["v3-1911-229.tfw"]


def test_files_with_no_record_are_not_trusted(registry: Registry, tmp_path: Path) -> None:
    (tmp_path / "cache" / PLATE).mkdir(parents=True)
    (tmp_path / "cache" / PLATE / "v3-1911-229.tif").write_bytes(b"planted")
    http = zip_http(registry)
    assert fetcher(registry, tmp_path, http).ensure(PLATE).status == "downloaded"
    assert (tmp_path / "cache" / PLATE / "v3-1911-229.tif").read_bytes() == ZIP_FILES["v3-1911-229.tif"]


def test_an_unsafe_zip_is_refused_and_leaves_nothing(registry: Registry, tmp_path: Path) -> None:
    http = zip_http(registry, files={"../escape.txt": b"x"})
    with pytest.raises(Exception, match="Refusing zip entry"):
        fetcher(registry, tmp_path, http).ensure(PLATE)
    assert list((tmp_path / "cache").iterdir()) == []
    assert not (tmp_path / "escape.txt").exists()


# --- hosts and ids -------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "https://maps.library.utoronto.ca/datapub/FIP/x.zip",
        "https://services1.arcgis.com/9NvE8jKNWWlDGsUJ/arcgis/rest/services/x",
        "https://maps.library.utoronto.ca:443/x",
    ],
)
def test_allowlisted_hosts_pass(url: str) -> None:
    check_host(url)


@pytest.mark.parametrize(
    "url",
    [
        "http://maps.library.utoronto.ca/x.zip",
        "https://evil.example/maps.library.utoronto.ca/x.zip",
        "https://maps.library.utoronto.ca.evil.example/x.zip",
        "https://user:pw@maps.library.utoronto.ca/x.zip",
        "https://maps.library.utoronto.ca@evil.example/x.zip",
        "https://maps.library.utoronto.ca:8443/x.zip",
        "https://maps.library.utoronto.ca:bad/x.zip",
        "ftp://maps.library.utoronto.ca/x.zip",
        "//maps.library.utoronto.ca/x.zip",
        "",
        "maps.library.utoronto.ca/x.zip",
    ],
)
def test_other_hosts_and_shapes_are_refused(url: str) -> None:
    with pytest.raises(FetchRefused) as info:
        check_host(url)
    assert info.value.code == "host_not_allowed"


def test_a_registry_url_on_another_host_is_refused_before_any_request(
    registry: Registry, tmp_path: Path
) -> None:
    sources = []
    for s in registry.sources:
        if s.id == PLATE:
            s = type(s)(**{**s.__dict__, "url": "https://evil.example/v3-1911-229.zip"})
        sources.append(s)
    http = FakeHttp()
    with pytest.raises(FetchRefused) as info:
        fetcher(Registry(tuple(sources)), tmp_path, http).ensure(PLATE)
    assert info.value.code == "url_not_allowed"
    assert http.requests == []


@pytest.mark.parametrize(
    ("source_id", "code"),
    [
        ("fip_v3_1911_999", "not_registered"),
        ("aerial_1947_s0012_fl1947_it0018h", "not_a_plate"),
        ("present_toronto_intersections_2026", "not_a_plate"),
        ("../../etc/passwd", "not_a_plate"),
        ("https://evil.example/x.zip", "not_a_plate"),
        ("", "not_a_plate"),
    ],
)
def test_only_registered_plates_are_fetched(
    registry: Registry, tmp_path: Path, source_id: str, code: str
) -> None:
    http = FakeHttp()
    with pytest.raises(FetchRefused) as info:
        fetcher(registry, tmp_path, http).ensure(source_id)
    assert info.value.code == code
    assert http.requests == []
    assert not (tmp_path / "cache").exists()


def test_a_plate_whose_rights_are_unchecked_is_refused(registry: Registry, tmp_path: Path) -> None:
    sources = tuple(
        type(s)(**{**s.__dict__, "rights_checked_on": None}) if s.id == PLATE else s
        for s in registry.sources
    )
    with pytest.raises(FetchRefused) as info:
        check_request(Registry(sources), PLATE, live=False)
    assert info.value.code == "rights_unchecked"


# --- the held-out plate --------------------------------------------------------------------------


def test_the_held_out_plate_needs_a_live_request(registry: Registry, tmp_path: Path) -> None:
    assert registry.get(HELD_OUT).held_out is True
    http = zip_http(registry, HELD_OUT, {"v3-1935-232.jpg": b"jpeg", "v3-1935-232.jgw": b"1\n"})
    f = fetcher(registry, tmp_path, http)
    with pytest.raises(FetchRefused) as info:
        f.ensure(HELD_OUT)
    assert info.value.code == "held_out"
    assert http.requests == []
    assert not (tmp_path / "cache").exists()
    live = f.ensure(HELD_OUT, live=True)
    assert live.status == "downloaded"
    assert [r[1] for r in http.requests] == [url_of(registry, HELD_OUT)]


def test_a_cached_copy_of_the_held_out_plate_is_not_served_without_a_live_request(
    registry: Registry, tmp_path: Path
) -> None:
    http = zip_http(registry, HELD_OUT, {"v3-1935-232.jpg": b"jpeg"})
    f = fetcher(registry, tmp_path, http)
    f.ensure(HELD_OUT, live=True)
    with pytest.raises(FetchRefused) as info:
        f.ensure(HELD_OUT)
    assert info.value.code == "held_out"
    assert len(http.requests) == 1


def test_nothing_in_the_service_fetches_a_plate_on_its_own() -> None:
    """No warm-up, no precompute: only plates.py names the fetcher until an endpoint is wired
    to a request, and that endpoint passes `live` from the request alone."""
    service = Path(__file__).resolve().parents[2] / "buried_pipeline" / "service"
    for path in sorted(service.glob("*.py")):
        if path.name == "plates.py":
            continue
        text = path.read_text(encoding="utf-8")
        assert "PlateFetcher" not in text and ".ensure(" not in text, path.name


# --- S9: only allowlisted downloads --------------------------------------------------------------

valid_ids = st.sampled_from(
    ["fip_v3_1911_229", "fip_v3_1911_232", "fip_v3_1935_229", "fip_v3_1935_232"]
)
any_id = st.one_of(valid_ids, st.text(max_size=40), st.from_regex(r"fip_v3_(1911|1935)_\w{0,6}"))


@given(source_id=any_id, live=st.booleans())
@settings(max_examples=150, deadline=None)
def test_a_request_either_is_refused_or_asks_for_the_registry_url_on_an_allowed_host(
    registry: Registry, source_id: str, live: bool
) -> None:
    files = {s.url: make_zip(ZIP_FILES) for s in registry.sources if s.url.endswith(".zip")}
    http = FakeHttp(files=files)
    with tempfile.TemporaryDirectory() as tmp:
        f = PlateFetcher(registry, Path(tmp) / "cache", http, clock=lambda: NOW)
        try:
            f.ensure(source_id, live=live)
        except FetchRefused:
            assert http.requests == []
            return
        except Exception:  # an unsafe or odd zip is also a refusal, and still one request at most
            pass
    assert len(http.requests) <= 1
    for _kind, url, _params in http.requests:
        assert url == registry.get(source_id).url
        assert urlsplit(url).hostname in ALLOWED_HOSTS
        if registry.get(source_id).held_out:
            assert live
