from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from buried_pipeline.errors import PipelineError
from buried_pipeline.present.ckan import (
    PACKAGE_SHOW_URL,
    check_resource_url,
    choose_gpkg_resource,
    last_refreshed,
    package_show,
)
from tests.fakes import FakeHttp

FIXTURES = Path(__file__).parent.parent / "fixtures" / "present"


def load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def http_for(package_id: str, doc: dict) -> FakeHttp:
    return FakeHttp(documents={(PACKAGE_SHOW_URL, (("id", package_id),)): doc})


def test_package_show_returns_result() -> None:
    http = http_for("p", load("ckan_intersections.json"))
    result = package_show(http, "p")
    assert result["name"] == "intersection-file-city-of-toronto"
    assert http.requests == [("json", PACKAGE_SHOW_URL, {"id": "p"})]


def test_package_show_failure() -> None:
    with pytest.raises(PipelineError, match="package_show failed"):
        package_show(http_for("p", {"success": False, "error": {"message": "Not found"}}), "p")


def test_single_gpkg_is_chosen() -> None:
    pkg = load("ckan_intersections.json")["result"]
    assert choose_gpkg_resource(pkg, "p", None)["id"] == "res-gpkg"


def test_several_unnamed_gpkg_stops_and_lists() -> None:
    pkg = load("ckan_two_gpkg.json")["result"]
    with pytest.raises(PipelineError) as err:
        choose_gpkg_resource(pkg, "p", None)
    assert "res-a" in str(err.value) and "res-b" in str(err.value)
    assert "resource_name" in str(err.value)


def test_named_resource_picks_one() -> None:
    pkg = load("ckan_two_gpkg.json")["result"]
    assert choose_gpkg_resource(pkg, "p", "Layer - 2952")["id"] == "res-b"
    with pytest.raises(PipelineError, match="exactly one GPKG resource named"):
        choose_gpkg_resource(pkg, "p", "Nope")


def test_no_gpkg_stops_and_lists_resources() -> None:
    pkg = load("ckan_no_gpkg.json")["result"]
    with pytest.raises(PipelineError, match="no GPKG resource") as err:
        choose_gpkg_resource(pkg, "p", None)
    assert "res-shp" in str(err.value)


def test_last_refreshed_prefers_package_then_resource() -> None:
    pkg = load("ckan_intersections.json")["result"]
    gpkg = choose_gpkg_resource(pkg, "p", None)
    assert last_refreshed(pkg, gpkg) == date(2025, 11, 21)
    del pkg["last_refreshed"]
    assert last_refreshed(pkg, gpkg) == date(2025, 10, 30)
    del gpkg["last_modified"]
    with pytest.raises(PipelineError, match="neither last_refreshed"):
        last_refreshed(pkg, gpkg)


def test_last_refreshed_ignores_garbage_dates() -> None:
    pkg = {"last_refreshed": "yesterday", "resources": []}
    with pytest.raises(PipelineError):
        last_refreshed(pkg, {"last_modified": "2025-13-45T00:00:00"})


@pytest.mark.parametrize(
    "url",
    [
        "http://ckan0.cf.opendata.inter.prod-toronto.ca/x.gpkg",
        "https://evil.example.com/x.gpkg",
        "https://ckan0.cf.opendata.inter.prod-toronto.ca.evil.com/x.gpkg",
        "file:///etc/passwd",
        None,
    ],
)
def test_resource_url_guard(url: object) -> None:
    with pytest.raises(PipelineError):
        check_resource_url(url)


def test_resource_url_guard_accepts_ckan_host() -> None:
    url = "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/a/resource/b/download/c.gpkg"
    assert check_resource_url(url) == url
