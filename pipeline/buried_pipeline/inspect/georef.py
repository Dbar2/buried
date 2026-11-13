"""`buried inspect`: read what georeferencing each raster arrived with (rasterio, file I/O).

A plate is a TIFF or a JPEG. Georeferencing comes from, in order: GeoTIFF tags, a PAM `.aux.xml`
sidecar, a world file plus a CRS (from a `.prj` file or the PAM sidecar's SRS). The choice itself
is the pure function in `inspect/choice.py`; this module only reads the files.
"""

from __future__ import annotations

import math
import warnings
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import rasterio
from pyproj import Transformer
from rasterio.crs import CRS
from rasterio.errors import CRSError, NotGeoreferencedWarning
from rasterio.transform import Affine

from buried_pipeline.errors import PipelineError
from buried_pipeline.inspect.choice import (
    GEOTIFF_TAGS,
    LABELS,
    PAM_AUX_XML,
    WORLD_FILE,
    Found,
    choose_georef,
    usable_transform,
)
from buried_pipeline.inspect.report import (
    ToProj,
    Transform6,
    build_report,
    corners,
)
from buried_pipeline.inspect.supplied_points import supplied_points_block
from buried_pipeline.io.atomic import atomic_write_json
from buried_pipeline.paths import Paths

TIFF_SUFFIXES = (".tif", ".tiff")
JPEG_SUFFIXES = (".jpg", ".jpeg")
RASTER_SUFFIXES = TIFF_SUFFIXES + JPEG_SUFFIXES
# Files whose name contains one of these are previews, never the plate. (`.ovr` overview files
# are skipped already because `.ovr` is not a raster suffix.)
IGNORED_NAME_PARTS = ("thumb",)
TARGET_CRS = "EPSG:26917"


@dataclass(frozen=True)
class RasterInfo:
    file: Path
    width: int
    height: int
    bands: int
    crs: str
    transform: Transform6
    georef_source: str  # "geotiff_tags", "pam_aux_xml" or "world_file"
    crs_source: str  # "geotiff_tags", "pam_aux_xml", "prj_file" or "pam_srs"
    notes: list[str] = field(default_factory=list)


def _is_ignored(path: Path) -> bool:
    name = path.name.lower()
    return any(part in name for part in IGNORED_NAME_PARTS)


def find_raster(source_dir: Path) -> Path:
    if not source_dir.is_dir():
        raise PipelineError(f"Not fetched yet: {source_dir}. Run `buried fetch` first.")
    found = sorted(
        p
        for p in source_dir.rglob("*")
        if p.is_file() and p.suffix.lower() in RASTER_SUFFIXES and not _is_ignored(p)
    )
    if not found:
        raise PipelineError(f"No TIFF or JPEG raster found in {source_dir}")
    if len(found) > 1:
        names = ", ".join(p.name for p in found)
        raise PipelineError(f"More than one raster in {source_dir}: {names}")
    return found[0]


def _as_tuple(t: Affine) -> Transform6:
    return (t.a, t.b, t.c, t.d, t.e, t.f)


def _crs_text(crs: CRS) -> str:
    authority = crs.to_authority()
    return f"{authority[0]}:{authority[1]}" if authority else crs.to_wkt()


def _siblings(raster: Path, suffixes: tuple[str, ...]) -> list[Path]:
    """Files next to `raster` named `<stem><suffix>` for each suffix, case-insensitive, in the
    order of `suffixes`."""
    wanted = {s.lower(): i for i, s in enumerate(suffixes)}
    found: dict[int, Path] = {}
    for candidate in raster.parent.iterdir():
        if not candidate.is_file() or candidate.stem.lower() != raster.stem.lower():
            continue
        index = wanted.get(candidate.suffix.lower())
        if index is not None:
            found[index] = candidate
    return [found[i] for i in sorted(found)]


def _crs_from_prj(raster: Path) -> str | None:
    """CRS from a sibling `<stem>.prj`. GDAL does not pair it with a world file, so inspect does."""
    for prj in _siblings(raster, (".prj",)):
        try:
            crs = CRS.from_wkt(prj.read_text(encoding="utf-8", errors="replace"))
        except CRSError:
            return None
        return _crs_text(crs)
    return None


def _world_file_suffixes(raster: Path) -> tuple[str, ...]:
    """GDAL's world file names: first and last letter + 'w', extension + 'w', then `.wld`."""
    ext = raster.suffix.lower().lstrip(".")
    return (f".{ext[0]}{ext[-1]}w", f".{ext}w", ".wld")


def _read_world_file(raster: Path) -> Transform6 | None:
    """The transform in a world file, as a pixel-corner affine. World files hold the centre of
    the first pixel, so half a pixel is taken back off."""
    for path in _siblings(raster, _world_file_suffixes(raster)):
        try:
            values = [float(line) for line in path.read_text(encoding="utf-8").split()]
        except ValueError as exc:
            raise PipelineError(f"World file {path.name} holds a non-numeric value") from exc
        if len(values) != 6:
            raise PipelineError(
                f"World file {path.name} should hold 6 numbers, found {len(values)}"
            )
        a, d, b, e, cx, cy = values  # file order: A, D, B, E, C, F
        return usable_transform((a, b, cx - a * 0.5 - b * 0.5, d, e, cy - d * 0.5 - e * 0.5))
    return None


def _read_pam(raster: Path) -> Found | None:
    """The SRS and GeoTransform in `<raster file name>.aux.xml`; None when there is no sidecar."""
    sidecar = raster.with_name(raster.name + ".aux.xml")
    if not sidecar.is_file():
        return None
    try:
        root = ET.parse(sidecar).getroot()
    except ET.ParseError as exc:
        raise PipelineError(f"PAM sidecar {sidecar.name} is not valid XML: {exc}") from exc

    transform: Transform6 | None = None
    gt_text = root.findtext("GeoTransform")
    if gt_text and gt_text.strip():
        try:
            gt = [float(v) for v in gt_text.split(",")]
        except ValueError as exc:
            raise PipelineError(f"PAM sidecar {sidecar.name}: GeoTransform is not numeric") from exc
        if len(gt) != 6:
            raise PipelineError(
                f"PAM sidecar {sidecar.name}: GeoTransform should hold 6 numbers, found {len(gt)}"
            )
        # GDAL order: x0, dx/col, dx/row, y0, dy/col, dy/row
        transform = usable_transform((gt[1], gt[2], gt[0], gt[4], gt[5], gt[3]))

    crs: str | None = None
    crs_label = "pam_srs"
    srs_text = root.findtext("SRS")
    if srs_text and srs_text.strip():
        try:
            crs = _crs_text(CRS.from_user_input(srs_text.strip()))
        except CRSError as exc:
            raise PipelineError(
                f"PAM sidecar {sidecar.name}: the SRS cannot be read: {exc}"
            ) from exc
    else:
        crs = _esri_xform_crs(root, sidecar.name)
        if crs:
            crs_label = "pam_esri_xform"
    return Found(transform, crs, crs_label)


def _esri_xform_crs(root: ET.Element, sidecar_name: str) -> str | None:
    """The CRS ESRI stored in `<GeodataXform><SpatialReference>` of a sidecar that has no `<SRS>`
    (the U of T 1947 aerials). Its authority code (`WKID`) is used when present; otherwise its
    WKT. This is the publisher's statement about this same raster, not a guess."""
    for spatial in root.iter("SpatialReference"):
        wkid = (spatial.findtext("LatestWKID") or spatial.findtext("WKID") or "").strip()
        wkt = (spatial.findtext("WKT") or "").strip()
        try:
            if wkid.isdigit():
                return _crs_text(CRS.from_epsg(int(wkid)))
            if wkt:
                return _crs_text(CRS.from_wkt(wkt))
        except CRSError as exc:
            raise PipelineError(
                f"PAM sidecar {sidecar_name}: the ESRI spatial reference cannot be read: {exc}"
            ) from exc
    return None


def _read_dimensions(path: Path) -> tuple[int, int, int]:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", NotGeoreferencedWarning)
        with rasterio.open(path) as src:
            return src.width, src.height, src.count


def _read_tags(path: Path) -> Found | None:
    """GeoTIFF tags only (GDAL told to use nothing else). A JPEG has none."""
    if path.suffix.lower() not in TIFF_SUFFIXES:
        return None
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", NotGeoreferencedWarning)
        with rasterio.open(path, GEOREF_SOURCES="INTERNAL") as src:
            transform = usable_transform(_as_tuple(src.transform))
            crs = src.crs.to_string() if src.crs is not None else None
    return Found(transform, crs)


def to_proj_for(crs: str) -> ToProj:
    transformer = Transformer.from_crs(crs, TARGET_CRS, always_xy=True)

    def convert(x: float, y: float) -> tuple[float, float]:
        east, north = transformer.transform(x, y)
        return (float(east), float(north))

    return convert


def _disagreement_notes(
    used_label: str,
    used: Transform6,
    used_crs: str,
    others: list[tuple[str, Transform6, str | None]],
    width: int,
    height: int,
) -> list[str]:
    """One WARNING per other georeferencing whose corners differ by more than one pixel."""
    used_proj = to_proj_for(used_crs)
    used_report = build_report(used, width, height, used_proj)
    pixel_m = max(used_report.pixel_size_x_m, used_report.pixel_size_y_m)
    notes = []
    for label, transform, crs in others:
        other_proj = to_proj_for(crs) if crs else used_proj
        other_corners = corners(transform, width, height, other_proj)
        gap = max(
            math.dist(p, q) for p, q in zip(used_report.corners, other_corners, strict=True)
        )
        if gap > pixel_m:
            notes.append(
                f"WARNING: {used_label} and {label} disagree by up to {gap:.3f} m "
                f"(more than one pixel, {pixel_m:.3f} m). Used the {used_label}."
            )
    return notes


def read_raster_info(path: Path) -> RasterInfo:
    """Size, CRS and the georeferencing chosen by `choose_georef`. Fails loudly when there is
    none, or a transform with no CRS (spec 02 requirements 4.3 and 14.4)."""
    width, height, bands = _read_dimensions(path)
    tags = _read_tags(path)
    pam = _read_pam(path)
    world = _read_world_file(path)
    choice = choose_georef(tags, pam, world, _crs_from_prj(path), str(path))

    candidates: list[tuple[str, Transform6 | None, str | None]] = [
        (GEOTIFF_TAGS, tags.transform if tags else None, tags.crs if tags else None),
        (PAM_AUX_XML, pam.transform if pam else None, pam.crs if pam else None),
        (WORLD_FILE, world, None),
    ]
    others = [
        (LABELS[name], transform, crs)
        for name, transform, crs in candidates
        if name != choice.georef_source and transform is not None
    ]
    notes = _disagreement_notes(
        LABELS[choice.georef_source], choice.transform, choice.crs, others, width, height
    )
    return RasterInfo(
        file=path,
        width=width,
        height=height,
        bands=bands,
        crs=choice.crs,
        transform=choice.transform,
        georef_source=choice.georef_source,
        crs_source=choice.crs_source,
        notes=notes,
    )


def inspect_raster(source_id: str, info: RasterInfo, root: Path) -> dict[str, Any]:
    """The JSON report written to data/work/inspect/<source id>.json."""
    report = build_report(info.transform, info.width, info.height, to_proj_for(info.crs))
    try:
        file_text = info.file.relative_to(root).as_posix()
    except ValueError:
        file_text = info.file.as_posix()
    return {
        "source": source_id,
        "file": file_text,
        "width_px": report.width,
        "height_px": report.height,
        "bands": info.bands,
        "crs": info.crs,
        "georef_source": info.georef_source,
        "crs_source": info.crs_source,
        "transform": list(report.transform),
        "pixel_size_m": {"x": report.pixel_size_x_m, "y": report.pixel_size_y_m},
        "pixel_size_max_m": max(report.pixel_size_x_m, report.pixel_size_y_m),
        "rotation_terms": {"b": report.rotation_b, "d": report.rotation_d},
        "corners_26917": {
            "top_left": list(report.corners[0]),
            "top_right": list(report.corners[1]),
            "bottom_right": list(report.corners[2]),
            "bottom_left": list(report.corners[3]),
        },
        "bounds_26917": {
            "min_e": report.bounds[0],
            "min_n": report.bounds[1],
            "max_e": report.bounds[2],
            "max_n": report.bounds[3],
        },
        "notes": list(info.notes),
        "supplied_control_points": None,
    }


def inspect_source(paths: Paths, source_id: str) -> dict[str, Any]:
    info = read_raster_info(find_raster(paths.raw_source_dir(source_id)))
    report = inspect_raster(source_id, info, paths.root)
    report["supplied_control_points"] = supplied_points_block(
        info.file, info.crs, paths.root, report["notes"]
    )
    atomic_write_json(paths.inspect_report(source_id), report)
    return report
