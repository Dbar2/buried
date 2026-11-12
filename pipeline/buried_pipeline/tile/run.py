"""`buried tile [SOURCE_ID ...]`: write `data/tiles/<id>.jpg`, `<id>_full.jpg` and `<id>.json`.

The only module of the tile package that does file I/O. A plate is tiled to the bounding box of
its map area (spec 02 requirements 16 and 19): the image is that window shrunk by area averaging
(no tint, sharpening, colour correction, masking or other crop). The corners come from the
alignment record's chosen transform, applied to the full-resolution pixel corners of the window.
A second image holds the whole photograph, labels and ruler included, for the Sources page.
"""

from __future__ import annotations

import json
import warnings
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import rasterio
from rasterio.errors import NotGeoreferencedWarning

from buried_pipeline.align.affine import apply_affine
from buried_pipeline.align.supplied import supplied_mapping
from buried_pipeline.errors import PipelineError
from buried_pipeline.extract.maparea import ground_polygon, load_map_area, map_area_relative
from buried_pipeline.inspect.georef import find_raster, read_raster_info
from buried_pipeline.io.atomic import atomic_write_bytes, atomic_write_json
from buried_pipeline.io.registry import Registry, Source
from buried_pipeline.paths import Paths
from buried_pipeline.schema_version import SCHEMA_VERSION
from buried_pipeline.tile.corners import (
    BILINEAR_TOLERANCE_M,
    CORNER_NAMES,
    Mapping,
    bilinear_error_m,
    tile_corners,
    tile_pixel_size_m,
    tile_size,
)
from buried_pipeline.validate.schema import SchemaSet, load_schema

JPEG_QUALITY = 85
MAX_FULL_LONG_EDGE_PX = 2048
PLATE_TYPE = "fire_insurance_plan"


@dataclass(frozen=True)
class TileResult:
    source: str
    image: Path
    sidecar: Path
    width_px: int
    height_px: int
    jpeg_bytes: int
    bilinear_error_m: float
    transform: str
    crop_px: dict[str, int]
    full_image: Path
    full_width_px: int
    full_height_px: int
    full_jpeg_bytes: int


def tiles_dir(paths: Paths) -> Path:
    return paths.data / "tiles"


def read_pixels(path: Path) -> np.ndarray:
    """The raster as uint8, shape (rows, cols) for one band or (rows, cols, 3) in BGR order.

    A palette is expanded to RGB; nothing else is changed. Other band layouts and bit depths are
    refused rather than converted, because converting would alter the colours.
    """
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", NotGeoreferencedWarning)
        with rasterio.open(path) as src:
            if src.count not in (1, 3):
                raise PipelineError(f"{path.name} has {src.count} bands; only 1 or 3 are tiled")
            if any(dt != "uint8" for dt in src.dtypes):
                raise PipelineError(f"{path.name} is {src.dtypes[0]}; only 8-bit images are tiled")
            data = src.read()
            palette: dict[int, tuple[int, ...]] | None = None
            if src.count == 1:
                try:
                    palette = src.colormap(1)
                except ValueError:
                    palette = None
    if palette:
        lut = np.zeros((256, 3), dtype=np.uint8)
        for index, rgba in palette.items():
            lut[index] = rgba[:3]
        rgb = lut[data[0]]
        return np.ascontiguousarray(rgb[:, :, ::-1])
    if data.shape[0] == 1:
        return np.ascontiguousarray(data[0])
    return np.ascontiguousarray(np.transpose(data, (1, 2, 0))[:, :, ::-1])


def window_pixels(pixels: np.ndarray, crop: dict[str, int]) -> np.ndarray:
    """The `crop_px` rectangle of the full-resolution pixels, unchanged. Pixels inside the
    rectangle but outside the map area polygon are kept as they are: masking them would need a
    fill colour, which would put a colour on the evidence."""
    x, y, w, h = crop["x"], crop["y"], crop["width"], crop["height"]
    return pixels[y : y + h, x : x + w]


def downsample(pixels: np.ndarray, tile_w: int, tile_h: int) -> np.ndarray:
    if pixels.shape[1] == tile_w and pixels.shape[0] == tile_h:
        return pixels
    return cv2.resize(pixels, (tile_w, tile_h), interpolation=cv2.INTER_AREA)


def encode_jpeg(pixels: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".jpg", pixels, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if not ok:
        raise PipelineError("JPEG encoding failed")
    return bytes(buf.tobytes())


def load_alignment(paths: Paths, schema: SchemaSet, source_id: str) -> dict[str, Any]:
    path = paths.alignment_record(source_id)
    if not path.is_file():
        raise PipelineError(
            f"{source_id} has no alignment record ({path.relative_to(paths.root)}); run "
            "`buried align-check` first. A plate with no measured alignment error is not tiled."
        )
    record = json.loads(path.read_text(encoding="utf-8"))
    problems = [f"{i.pointer}: {i.message}" for i in schema.issues("alignmentRecord", record)]
    if problems:
        raise PipelineError(
            f"The alignment record for {source_id} does not match the Schema:\n  "
            + "\n  ".join(problems)
        )
    if record["source"] != source_id:
        raise PipelineError(f"{path.name} is the record for {record['source']}, not {source_id}")
    return record


def chosen_mapping(record: dict[str, Any], transform: Any, crs: str) -> Mapping:
    """Pixel -> EPSG:26917 under the alignment record's chosen transform."""
    if record["chosen"] == "refined":
        affine = tuple(record["refined"]["affine"])
        return lambda x, y: apply_affine(affine, x, y)  # type: ignore[arg-type]
    return supplied_mapping(transform, crs).predict


def check_source(source: Source) -> None:
    if source.type != PLATE_TYPE:
        raise PipelineError(
            f"{source.id} is a {source.type}; only fire insurance plates are tiled so far "
            "(aerials wait for spec 02 task 5)"
        )
    if source.attribution_status != "confirmed":
        raise PipelineError(
            f"{source.id} has attribution_status {source.attribution_status}; it is not tiled "
            "until its attribution is confirmed"
        )


def tile_source(
    paths: Paths, registry: Registry, schema: SchemaSet, source_id: str
) -> TileResult:
    source = registry.get(source_id)
    check_source(source)
    record = load_alignment(paths, schema, source_id)

    info = read_raster_info(find_raster(paths.raw_source_dir(source_id)))
    # A plate is tiled to its map area only (requirement 16.3); the refusal names the file.
    map_area = load_map_area(paths, schema, source_id, info.width, info.height)
    crop = map_area.crop_px
    window_w, window_h = crop["width"], crop["height"]
    origin = (float(crop["x"]), float(crop["y"]))

    mapping = chosen_mapping(record, info.transform, info.crs)
    corners = tile_corners(mapping, window_w, window_h, origin)
    error = bilinear_error_m(mapping, corners, window_w, window_h, origin)
    if error > BILINEAR_TOLERANCE_M:
        raise PipelineError(
            f"{source_id}: bilinear interpolation between the four corners differs from the "
            f"chosen transform by {error:.4f} m (limit {BILINEAR_TOLERANCE_M} m), so the tile "
            "cannot be draped on a quad. Nothing was written."
        )

    pixels = read_pixels(info.file)
    if pixels.shape[0] != info.height or pixels.shape[1] != info.width:
        raise PipelineError(f"{source_id}: raster size changed while reading")

    # The tile: the bounding box of the map area, with the pixels inside it unchanged. Masking
    # outside the polygon would need a fill colour, which would put a colour on the evidence; the
    # sidecar's map_area lets the Explorer clip the drape instead.
    window = window_pixels(pixels, crop)
    tile_w, tile_h = tile_size(window_w, window_h)
    jpeg = encode_jpeg(downsample(window, tile_w, tile_h))

    # The whole photograph for the Sources page, labels and ruler included; never draped.
    full_w, full_h = tile_size(info.width, info.height, MAX_FULL_LONG_EDGE_PX)
    full_jpeg = encode_jpeg(downsample(pixels, full_w, full_h))

    sidecar: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "source": source_id,
        "image": f"{source_id}.jpg",
        "width_px": tile_w,
        "height_px": tile_h,
        "corners": {name: [c[0], c[1]] for name, c in zip(CORNER_NAMES, corners, strict=True)},
        "transform": record["chosen"],
        "alignment_error_m": record["alignment_error_m"],
        "source_pixel_size_m": record["source_pixel_size_m"],
        "tile_pixel_size_m": tile_pixel_size_m(
            record["source_pixel_size_m"], window_w, window_h, tile_w, tile_h
        ),
        "attribution_line": source.attribution_line,
        "crop_px": crop,
        "map_area": ground_polygon(mapping, map_area.pixel_polygon),
        "full_image": f"{source_id}_full.jpg",
        "full_width_px": full_w,
        "full_height_px": full_h,
    }
    problems = [f"{i.pointer}: {i.message}" for i in schema.issues("tileSidecar", sidecar)]
    if problems:
        raise PipelineError(
            f"The tile sidecar for {source_id} does not match the Schema; nothing was written:\n  "
            + "\n  ".join(problems)
        )

    image_path = tiles_dir(paths) / sidecar["image"]
    full_path = tiles_dir(paths) / sidecar["full_image"]
    sidecar_path = tiles_dir(paths) / f"{source_id}.json"
    atomic_write_bytes(image_path, jpeg)
    atomic_write_bytes(full_path, full_jpeg)
    atomic_write_json(sidecar_path, sidecar)  # last, so a sidecar always has its images
    return TileResult(
        source=source_id,
        image=image_path,
        sidecar=sidecar_path,
        width_px=tile_w,
        height_px=tile_h,
        jpeg_bytes=len(jpeg),
        bilinear_error_m=error,
        transform=record["chosen"],
        crop_px=crop,
        full_image=full_path,
        full_width_px=full_w,
        full_height_px=full_h,
        full_jpeg_bytes=len(full_jpeg),
    )


def run_tile(
    paths: Paths,
    registry: Registry,
    source_ids: list[str],
    out: Callable[[str], None] = print,
    schema: SchemaSet | None = None,
) -> list[TileResult]:
    """Tile the named plates. With no names, tile every registered plate that has an alignment
    record and a map area, and say which others were skipped."""
    schema = schema or load_schema(paths.root)
    if source_ids:
        targets = source_ids
        for sid in targets:
            registry.get(sid)  # unknown ids fail before anything is written
    else:
        plates = [s.id for s in registry.by_type(PLATE_TYPE)]
        targets = []
        for sid in plates:
            if not paths.alignment_record(sid).is_file():
                out(f"{sid}: skipped, no alignment record")
            elif not paths.map_area_file(sid).is_file():
                out(f"{sid}: skipped, no map area ({map_area_relative(sid)})")
            else:
                targets.append(sid)
        if not targets:
            raise PipelineError(
                "No plate has both an alignment record and a map area yet; run "
                "`buried align-check` and write the map area files."
            )

    results = []
    for sid in targets:
        r = tile_source(paths, registry, schema, sid)
        rel = lambda p: p.relative_to(paths.root).as_posix()  # noqa: E731
        out(
            f"{sid}: wrote {rel(r.image)} ({r.width_px} x {r.height_px} px, {r.jpeg_bytes} bytes) "
            f"for crop_px {r.crop_px}, {rel(r.full_image)} ({r.full_width_px} x "
            f"{r.full_height_px} px, {r.full_jpeg_bytes} bytes) and {rel(r.sidecar)}; "
            f"transform {r.transform}; bilinear check {r.bilinear_error_m:.6f} m "
            f"(limit {BILINEAR_TOLERANCE_M} m)"
        )
        results.append(r)
    return results
