"""`buried inspect`: read what georeferencing each raster arrived with (rasterio, file I/O)."""

from __future__ import annotations

import warnings
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import rasterio
from pyproj import Transformer
from rasterio.crs import CRS
from rasterio.errors import CRSError, NotGeoreferencedWarning
from rasterio.transform import Affine

from buried_pipeline.errors import PipelineError
from buried_pipeline.inspect.report import (
    ToProj,
    Transform6,
    build_report,
    corner_disagreement_m,
)
from buried_pipeline.io.atomic import atomic_write_json
from buried_pipeline.paths import Paths

RASTER_SUFFIXES = (".tif", ".tiff")
TARGET_CRS = "EPSG:26917"


@dataclass(frozen=True)
class RasterInfo:
    file: Path
    width: int
    height: int
    bands: int
    crs: str
    transform: Transform6
    georef_source: str  # "geotiff_tags", "world_file" or "other"
    notes: list[str] = field(default_factory=list)


def find_raster(source_dir: Path) -> Path:
    if not source_dir.is_dir():
        raise PipelineError(f"Not fetched yet: {source_dir}. Run `buried fetch` first.")
    found = sorted(
        p for p in source_dir.rglob("*") if p.is_file() and p.suffix.lower() in RASTER_SUFFIXES
    )
    if not found:
        raise PipelineError(f"No GeoTIFF found in {source_dir}")
    if len(found) > 1:
        names = ", ".join(p.name for p in found)
        raise PipelineError(f"More than one raster in {source_dir}: {names}")
    return found[0]


def _as_tuple(t: Affine) -> Transform6:
    return (t.a, t.b, t.c, t.d, t.e, t.f)


def _is_valid(transform: Affine, crs: Any) -> bool:
    return crs is not None and transform != Affine.identity()


def _crs_from_prj(tif: Path) -> str | None:
    """CRS from a sibling `<name>.prj` file. GDAL does not read it for a plain TIFF with a world
    file, so inspect does."""
    for suffix in (".prj", ".PRJ"):
        prj = tif.with_suffix(suffix)
        if prj.is_file():
            try:
                crs = CRS.from_wkt(prj.read_text(encoding="utf-8", errors="replace"))
            except CRSError:
                return None
            authority = crs.to_authority()
            return f"{authority[0]}:{authority[1]}" if authority else crs.to_wkt()
    return None


def _open_georef(path: Path, sources: str | None) -> tuple[Affine, Any, int, int, int]:
    options = {"GEOREF_SOURCES": sources} if sources else {}
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", NotGeoreferencedWarning)
        with rasterio.open(path, **options) as src:
            return src.transform, src.crs, src.width, src.height, src.count


def to_proj_for(crs: str) -> ToProj:
    transformer = Transformer.from_crs(crs, TARGET_CRS, always_xy=True)

    def convert(x: float, y: float) -> tuple[float, float]:
        east, north = transformer.transform(x, y)
        return (float(east), float(north))

    return convert


def read_raster_info(path: Path) -> RasterInfo:
    """Read size, CRS and the transform GDAL uses. Fails on missing georeferencing (req 4.3)."""
    transform, crs, width, height, bands = _open_georef(path, None)
    crs_text = crs.to_string() if crs is not None else _crs_from_prj(path)
    if crs_text is None or transform == Affine.identity():
        raise PipelineError(f"No georeferencing: {path}")
    used = _as_tuple(transform)

    internal_t, internal_crs, *_ = _open_georef(path, "INTERNAL")
    world_t, world_crs, *_ = _open_georef(path, "WORLDFILE")
    internal_ok = _is_valid(internal_t, internal_crs)
    world_ok = world_t != Affine.identity()

    notes: list[str] = []
    if internal_ok and _as_tuple(internal_t) == used:
        source = "geotiff_tags"
    elif world_ok and _as_tuple(world_t) == used:
        source = "world_file"
    else:
        source = "other"

    if internal_ok and world_ok:
        to_proj = to_proj_for(crs_text)
        used_report = build_report(used, width, height, to_proj)
        pixel_m = max(used_report.pixel_size_x_m, used_report.pixel_size_y_m)
        gap = corner_disagreement_m(
            _as_tuple(internal_t), _as_tuple(world_t), width, height, to_proj
        )
        if gap > pixel_m:
            notes.append(
                f"WARNING: GeoTIFF tags and world file disagree by up to {gap:.3f} m "
                f"(more than one pixel, {pixel_m:.3f} m). GDAL used the "
                f"{'GeoTIFF tags' if source == 'geotiff_tags' else 'world file'}."
            )
    return RasterInfo(
        file=path,
        width=width,
        height=height,
        bands=bands,
        crs=crs_text,
        transform=used,
        georef_source=source,
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
        "notes": info.notes,
    }


def inspect_source(paths: Paths, source_id: str) -> dict[str, Any]:
    info = read_raster_info(find_raster(paths.raw_source_dir(source_id)))
    report = inspect_raster(source_id, info, paths.root)
    atomic_write_json(paths.inspect_report(source_id), report)
    return report
