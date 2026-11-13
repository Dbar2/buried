"""Pure choice of a raster's georeferencing from what its files hold (no file access).

Order (spec 02 requirement 14.1): GeoTIFF tags, then a PAM `.aux.xml` sidecar, then a world file
together with a CRS from a `.prj` file or, failing that, from the PAM sidecar's SRS. A transform
is never paired with a CRS from anywhere else.
"""

from __future__ import annotations

from dataclasses import dataclass

from buried_pipeline.errors import PipelineError
from buried_pipeline.inspect.report import Transform6

GEOTIFF_TAGS = "geotiff_tags"
PAM_AUX_XML = "pam_aux_xml"
WORLD_FILE = "world_file"

LABELS = {
    GEOTIFF_TAGS: "GeoTIFF tags",
    PAM_AUX_XML: "PAM sidecar (.aux.xml)",
    WORLD_FILE: "world file",
}

IDENTITY: Transform6 = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0)


@dataclass(frozen=True)
class Found:
    """What one place holds. `transform` is None when absent or the identity (GDAL's 'none').

    `crs_label` says where in the sidecar the CRS was read (`pam_srs` for the `<SRS>` element,
    `pam_esri_xform` for the spatial reference ESRI wrote inside its GeodataXform block).
    """

    transform: Transform6 | None
    crs: str | None
    crs_label: str = "pam_srs"


@dataclass(frozen=True)
class Choice:
    transform: Transform6
    crs: str
    georef_source: str  # GEOTIFF_TAGS, PAM_AUX_XML or WORLD_FILE
    crs_source: str  # GEOTIFF_TAGS, PAM_AUX_XML, "prj_file" or "pam_srs"


def usable_transform(transform: Transform6 | None) -> Transform6 | None:
    """None for a missing or identity transform."""
    if transform is None or tuple(transform) == IDENTITY:
        return None
    return transform


def choose_georef(
    tags: Found | None,
    pam: Found | None,
    world_transform: Transform6 | None,
    prj_crs: str | None,
    file_text: str,
) -> Choice:
    """The first complete georeferencing, or a PipelineError that says what was found."""
    if tags and tags.transform and tags.crs:
        return Choice(tags.transform, tags.crs, GEOTIFF_TAGS, GEOTIFF_TAGS)
    if pam and pam.transform and pam.crs:
        return Choice(pam.transform, pam.crs, PAM_AUX_XML, PAM_AUX_XML)
    if world_transform:
        if prj_crs:
            return Choice(world_transform, prj_crs, WORLD_FILE, "prj_file")
        if pam and pam.crs:
            return Choice(world_transform, pam.crs, WORLD_FILE, pam.crs_label)

    problems: list[str] = []
    if tags and tags.transform and not tags.crs:
        problems.append("the GeoTIFF tags have a transform but no CRS")
    if pam and pam.transform and not pam.crs:
        problems.append("the PAM sidecar has a transform but no SRS")
    if world_transform:
        problems.append(
            "the world file has a transform but no CRS (no .prj file and no SRS in a PAM sidecar)"
        )
    if not problems:
        problems.append("no GeoTIFF tags, PAM sidecar or world file with a transform")
    raise PipelineError(f"No georeferencing: {file_text}. Found: {'; '.join(problems)}.")
