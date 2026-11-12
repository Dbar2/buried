"""`buried control-crops SOURCE_ID`: PNG crops of a plate around each City intersection.

For every intersection of the clipped City layer whose predicted pixel falls inside the plate, the
supplied georeferencing gives a predicted pixel. A crop of about 60 m, at native resolution, with a
faint crosshair there, is written to `data/work/control/<source>/<intersection_id>.png`, with an
index. A person looks for the true centreline crossing on the crop and records its pixel in a
control file. The crosshair marks where the supplied georeferencing puts the intersection. It is a
prediction, not a measurement, and it can be off by several metres.
"""

from __future__ import annotations

import json
import re
import warnings
from collections.abc import Callable
from pathlib import Path
from typing import Any

import cv2
import rasterio
from pyproj import Transformer
from rasterio.errors import NotGeoreferencedWarning
from rasterio.windows import Window

from buried_pipeline.controlcrops.pixels import (
    CROP_SIDE_M,
    CROSSHAIR_ALPHA,
    CROSSHAIR_RGB,
    CropWindow,
    crop_size_px,
    crop_window,
    crosshair_sizes_px,
    draw_crosshair,
    pixel_in_crop,
    pixel_in_raster,
    predicted_pixel,
    to_rgb,
)
from buried_pipeline.errors import PipelineError
from buried_pipeline.inspect.georef import find_raster, read_raster_info, to_proj_for
from buried_pipeline.inspect.report import build_report
from buried_pipeline.io.atomic import atomic_write_bytes, atomic_write_json
from buried_pipeline.io.registry import Registry
from buried_pipeline.paths import Paths

RASTER_TYPES = ("fire_insurance_plan", "aerial_photograph")
INTERSECTIONS_SOURCE = "present_toronto_intersections_2026"
TARGET_CRS = "EPSG:26917"
SAFE_ID = re.compile(r"^[A-Za-z0-9_-]+$")
INDEX_NAME = "index.json"


def load_intersections(paths: Paths, registry: Registry) -> dict[str, Any]:
    if not registry.has(INTERSECTIONS_SOURCE):
        raise PipelineError(f"{INTERSECTIONS_SOURCE} is not in the Registry (data/sources.json)")
    layer_path = paths.present_layer(INTERSECTIONS_SOURCE)
    if not layer_path.exists():
        raise PipelineError(
            f"No intersections layer at {layer_path.relative_to(paths.root)}. "
            f"Run `buried present {INTERSECTIONS_SOURCE}` first."
        )
    return json.loads(layer_path.read_text(encoding="utf-8"))


def street_names(description: Any) -> list[str]:
    """'A St / B Ave' to ['A St', 'B Ave']. Empty when the layer has no description."""
    if not isinstance(description, str):
        return []
    return [part.strip() for part in description.split(" / ") if part.strip()]


def read_crop(src: Any, window: CropWindow) -> Any:
    bands = src.read(window=Window(window.left, window.top, window.width, window.height))
    try:
        return to_rgb(bands)
    except ValueError as exc:
        raise PipelineError(f"{src.name}: {exc}") from exc


def encode_png(rgb: Any) -> bytes:
    ok, encoded = cv2.imencode(".png", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    if not ok:
        raise PipelineError("Could not encode a crop as PNG")
    return encoded.tobytes()


def clear_previous(out_dir: Path) -> None:
    """Remove the last run's crops and index, so a stopped run cannot leave an old index next to
    new crops. The index is written last: no index means the run did not finish."""
    if not out_dir.is_dir():
        return
    for old in out_dir.glob("*.png"):
        old.unlink()
    (out_dir / INDEX_NAME).unlink(missing_ok=True)


def run_control_crops(
    paths: Paths,
    registry: Registry,
    source_id: str,
    out: Callable[[str], None] = print,
) -> dict[str, Any]:
    source = registry.get(source_id)
    if source.type not in RASTER_TYPES:
        raise PipelineError(f"{source_id} is not a raster source")
    layer = load_intersections(paths, registry)

    info = read_raster_info(find_raster(paths.raw_source_dir(source_id)))
    to_raster = Transformer.from_crs(TARGET_CRS, info.crs, always_xy=True)

    def to_raster_crs(e: float, n: float) -> tuple[float, float]:
        x, y = to_raster.transform(e, n)
        return (float(x), float(y))

    report = build_report(info.transform, info.width, info.height, to_proj_for(info.crs))
    size = crop_size_px(
        CROP_SIDE_M, report.pixel_size_x_m, report.pixel_size_y_m, info.width, info.height
    )
    gap_px, arm_px = crosshair_sizes_px(report.pixel_size_x_m, report.pixel_size_y_m)

    chosen: list[tuple[dict[str, Any], tuple[float, float], CropWindow]] = []
    for feature in layer["features"]:
        feature_id = str(feature["id"])
        if not SAFE_ID.match(feature_id):
            raise PipelineError(f"Intersection id {feature_id!r} is not safe as a file name")
        east, north = feature["geometry"]["coordinates"]
        pixel = predicted_pixel((east, north), to_raster_crs, info.transform)
        if pixel_in_raster(pixel, info.width, info.height):
            chosen.append((feature, pixel, crop_window(pixel, size, info.width, info.height)))
    chosen.sort(key=lambda item: str(item[0]["id"]))

    out_dir = paths.work / "control" / source_id
    clear_previous(out_dir)
    entries: list[dict[str, Any]] = []
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", NotGeoreferencedWarning)
        with rasterio.open(info.file) as src:
            for feature, pixel, window in chosen:
                feature_id = str(feature["id"])
                props = feature.get("properties", {})
                in_crop = pixel_in_crop(pixel, window)
                image = draw_crosshair(read_crop(src, window), in_crop, gap_px, arm_px)
                atomic_write_bytes(out_dir / f"{feature_id}.png", encode_png(image))
                east, north = feature["geometry"]["coordinates"]
                entries.append(
                    {
                        "intersection_id": feature_id,
                        "file": f"{feature_id}.png",
                        "streets": street_names(props.get("INTERSECTION_DESC")),
                        "description": props.get("INTERSECTION_DESC"),
                        "classification": props.get("CLASSIFICATION"),
                        "classification_desc": props.get("CLASSIFICATION_DESC"),
                        "easting": east,
                        "northing": north,
                        "predicted_pixel": [pixel[0], pixel[1]],
                        "crop_top_left_px": [window.left, window.top],
                        "crop_size_px": [window.width, window.height],
                        "predicted_pixel_in_crop": [in_crop[0], in_crop[1]],
                        "moved_to_stay_inside_plate": window.shifted,
                    }
                )

    index = {
        "source": source_id,
        "raster_file": info.file.relative_to(paths.root).as_posix(),
        "reference_source": INTERSECTIONS_SOURCE,
        "crs": TARGET_CRS,
        "pixel_convention": "gdal_corner",
        "georef_source": info.georef_source,
        "predicted_with": (
            "the supplied georeferencing. This is a prediction, not a measurement: the true "
            "crossing on the plate can be several metres away."
        ),
        "crop_side_m": CROP_SIDE_M,
        "crop_size_px": [size[0], size[1]],
        "pixel_size_m": {"x": report.pixel_size_x_m, "y": report.pixel_size_y_m},
        "crosshair": {
            "rgb": list(CROSSHAIR_RGB),
            "alpha": CROSSHAIR_ALPHA,
            "gap_px": gap_px,
            "arm_px": arm_px,
            "note": "one-pixel lines with a gap at the predicted pixel; the rest is the plate",
        },
        "count": len(entries),
        "crops": entries,
    }
    atomic_write_json(out_dir / INDEX_NAME, index)
    out(
        f"{source_id}: {len(entries)} of {len(layer['features'])} intersections fall inside the "
        f"plate; crops of {size[0]}x{size[1]} px (about {CROP_SIDE_M:.0f} m) written to "
        f"{out_dir.relative_to(paths.root)}/ with {INDEX_NAME}"
    )
    shifted = sum(1 for e in entries if e["moved_to_stay_inside_plate"])
    if shifted:
        out(f"{source_id}: {shifted} crops were moved to stay inside the plate (near an edge)")
    return index
