"""CKAN client for the City of Toronto Open Data portal (through the HTTP client interface)."""

from __future__ import annotations

import re
from datetime import date
from typing import Any
from urllib.parse import urlparse

from buried_pipeline.errors import PipelineError
from buried_pipeline.io.http import HttpClient
from buried_pipeline.present.datasets import CKAN_BASE, CKAN_HOST

PACKAGE_SHOW_URL = f"{CKAN_BASE}/api/3/action/package_show"
_DATE_PREFIX = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")


def package_show(http: HttpClient, package_id: str) -> dict[str, Any]:
    doc = http.get_json(PACKAGE_SHOW_URL, {"id": package_id})
    if not isinstance(doc, dict) or doc.get("success") is not True:
        raise PipelineError(f"CKAN package_show failed for {package_id}: {doc!r}"[:300])
    result = doc.get("result")
    if not isinstance(result, dict) or not isinstance(result.get("resources"), list):
        raise PipelineError(f"CKAN package_show for {package_id} has no resources list")
    return result


def is_gpkg(resource: dict[str, Any]) -> bool:
    return str(resource.get("format", "")).strip().upper() == "GPKG"


def choose_gpkg_resource(
    package: dict[str, Any], package_id: str, resource_name: str | None
) -> dict[str, Any]:
    """The one GPKG resource to use. Stops and lists them when the choice is not clear."""
    gpkg = [r for r in package["resources"] if isinstance(r, dict) and is_gpkg(r)]
    if resource_name is not None:
        named = [r for r in gpkg if r.get("name") == resource_name]
        if len(named) == 1:
            return named[0]
        listing = _listing(gpkg)
        raise PipelineError(
            f"{package_id}: expected exactly one GPKG resource named {resource_name!r}, "
            f"found {len(named)}. GPKG resources:\n{listing}"
        )
    if len(gpkg) == 1:
        return gpkg[0]
    if not gpkg:
        all_resources = [r for r in package["resources"] if isinstance(r, dict)]
        raise PipelineError(
            f"{package_id}: no GPKG resource. Resources:\n{_listing(all_resources)}"
        )
    raise PipelineError(
        f"{package_id}: {len(gpkg)} GPKG resources and datasets.py does not name which to use. "
        f"Set resource_name for this dataset. GPKG resources:\n{_listing(gpkg)}"
    )


def _listing(resources: list[dict[str, Any]]) -> str:
    if not resources:
        return "  (none)"
    return "\n".join(
        f"  - name={r.get('name')!r} format={r.get('format')!r} id={r.get('id')!r} "
        f"url={r.get('url')!r}"
        for r in resources
    )


def _parse_date(value: Any) -> date | None:
    if not isinstance(value, str):
        return None
    match = _DATE_PREFIX.match(value)
    if not match:
        return None
    try:
        return date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    except ValueError:
        return None


def last_refreshed(package: dict[str, Any], resource: dict[str, Any]) -> date:
    """The package's `last_refreshed` date; else the resource's `last_modified`; else stop."""
    parsed = _parse_date(package.get("last_refreshed"))
    if parsed is not None:
        return parsed
    parsed = _parse_date(resource.get("last_modified"))
    if parsed is not None:
        return parsed
    raise PipelineError(
        f"{package.get('name', '?')}: CKAN metadata has neither last_refreshed nor a resource "
        "last_modified date. Cannot check the Registry years."
    )


def check_resource_url(url: Any) -> str:
    """Resource URLs are data from the network. Only https URLs on the City's CKAN host pass."""
    if not isinstance(url, str):
        raise PipelineError(f"CKAN resource has no URL: {url!r}")
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != CKAN_HOST:
        raise PipelineError(f"Refusing resource URL outside https://{CKAN_HOST}/: {url}")
    return url
