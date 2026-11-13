"""`buried extract <SOURCE_ID> [--preview]`: write `data/work/proposals/<id>.geojson`.

The only module of the extract package that does file I/O. It refuses a plate with no alignment
record (requirement 8.5) or no map area (requirements 8.7 and 16.3), works inside the map area
only, and writes the proposal file with sorted output (requirement 8.3). The held-out plate is
processed by the same code as any other (requirement 9.4); nothing here names a plate.
"""

from __future__ import annotations

import time
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from buried_pipeline.errors import PipelineError
from buried_pipeline.extract.document import build_collection, dumps
from buried_pipeline.extract.maparea import MapArea, Mapping, load_map_area
from buried_pipeline.extract.params import DEFAULT_PARAMS_ID, ExtractParams, load_params
from buried_pipeline.extract.preview import draw_preview, quality_band
from buried_pipeline.extract.propose import ExtractStats, find_candidates
from buried_pipeline.extract.region import drop_touching_border, region_border_sides, window_for
from buried_pipeline.extract.tone import to_grey
from buried_pipeline.fetch.manifest import sha256_file
from buried_pipeline.inspect.georef import find_raster, read_raster_info
from buried_pipeline.io.atomic import atomic_write_bytes, atomic_write_text
from buried_pipeline.io.registry import Registry
from buried_pipeline.paths import Paths
from buried_pipeline.tile.run import check_source, chosen_mapping, load_alignment, read_pixels
from buried_pipeline.validate.schema import SchemaSet, load_schema


@dataclass(frozen=True)
class ExtractResult:
    source: str
    params_id: str
    proposals: Path
    preview: Path | None
    count: int
    scores: tuple[float, ...]
    bands: dict[str, int]
    tone_classes: dict[str, int]
    weaknesses: dict[str, int]
    stats: ExtractStats
    below_minimum_area: int
    seconds: float


def window_grey(pixels: np.ndarray, crop: dict[str, int]) -> np.ndarray:
    """The grey band of the map area's bounding box, at full resolution."""
    x, y, w, h = crop["x"], crop["y"], crop["width"], crop["height"]
    return np.ascontiguousarray(to_grey(pixels[y : y + h, x : x + w]))


@dataclass(frozen=True)
class ExtractDocument:
    doc: dict[str, Any]
    stats: ExtractStats
    below_minimum_area: int
    grey: np.ndarray  # the window that was searched
    window_origin: tuple[int, int]  # its top-left pixel on the full-resolution raster
    dropped_touching_border: int = 0


def extract_document(
    pixels: np.ndarray,
    source_id: str,
    record: dict[str, Any],
    record_sha256: str,
    map_area: MapArea,
    mapping: Mapping,
    params: ExtractParams,
    region_px: dict[str, int] | None = None,
) -> ExtractDocument:
    """Everything `extract` does after the inputs are read: the proposal file as a dict.

    With `region_px` (spec 04 requirement 23.5) only that pixel rectangle, clipped to the map
    area's bounding box, is searched, and every proposal touching a side of the rectangle that is
    the region's own border is dropped. Without it this is the whole map area, exactly as the
    command always did."""
    window = window_for(region_px, map_area.crop_px)
    grey = window_grey(pixels, window)
    candidates, stats = find_candidates(
        grey,
        (window["x"], window["y"]),
        list(map_area.pixel_polygon),
        [list(line) for line in map_area.fold_lines],
        float(record["source_pixel_size_m"]),
        params,
    )
    dropped = 0
    if region_px is not None:
        candidates, dropped = drop_touching_border(
            candidates, window, region_border_sides(region_px, map_area.crop_px)
        )
    doc, below_minimum = build_collection(
        source_id, params, record_sha256, map_area, candidates, mapping
    )
    if region_px is not None:
        doc["region_px"] = dict(region_px)
    return ExtractDocument(doc, stats, below_minimum, grey, (window["x"], window["y"]), dropped)


def extract_source(
    paths: Paths,
    registry: Registry,
    schema: SchemaSet,
    source_id: str,
    params: ExtractParams | None = None,
    preview: bool = False,
    params_id: str = DEFAULT_PARAMS_ID,
) -> ExtractResult:
    started = time.perf_counter()
    source = registry.get(source_id)
    check_source(source)
    record = load_alignment(paths, schema, source_id)

    info = read_raster_info(find_raster(paths.raw_source_dir(source_id)))
    map_area = load_map_area(paths, schema, source_id, info.width, info.height)
    crop = map_area.crop_px
    params = params or load_params(params_id)  # after the inputs are known to be usable

    pixels = read_pixels(info.file)
    if pixels.shape[0] != info.height or pixels.shape[1] != info.width:
        raise PipelineError(f"{source_id}: raster size changed while reading")
    mapping = chosen_mapping(record, info.transform, info.crs)
    result_doc = extract_document(
        pixels, source_id, record, sha256_file(paths.alignment_record(source_id)),
        map_area, mapping, params,
    )  # fmt: skip
    del pixels
    doc, stats, below_minimum, grey = (
        result_doc.doc, result_doc.stats, result_doc.below_minimum_area, result_doc.grey,
    )  # fmt: skip
    out_path = paths.proposals_file(source_id)
    atomic_write_text(out_path, dumps(doc))

    preview_path: Path | None = None
    if preview:
        preview_path = paths.extract_preview(source_id)
        origin = (crop["x"], crop["y"])
        atomic_write_bytes(
            preview_path,
            draw_preview(grey, origin, list(map_area.pixel_polygon), doc["features"]),
        )

    features: list[dict[str, Any]] = doc["features"]
    scores = tuple(f["properties"]["quality"]["score"] for f in features)
    return ExtractResult(
        source=source_id,
        params_id=params.id,
        proposals=out_path,
        preview=preview_path,
        count=len(features),
        scores=scores,
        bands=dict(Counter(quality_band(s) for s in scores)),
        tone_classes=dict(Counter(f["properties"]["tone_class"] for f in features)),
        weaknesses=dict(Counter(w for f in features for w in f["properties"]["weaknesses"])),
        stats=stats,
        below_minimum_area=below_minimum,
        seconds=time.perf_counter() - started,
    )


def _quantiles(scores: tuple[float, ...]) -> str:
    if not scores:
        return "none"
    q = np.percentile(np.array(scores), [0, 25, 50, 75, 100])
    return "min {:.2f}, quartiles {:.2f} / {:.2f} / {:.2f}, max {:.2f}".format(*q)


def run_extract(
    paths: Paths,
    registry: Registry,
    source_id: str,
    preview: bool = False,
    out: Callable[[str], None] = print,
    schema: SchemaSet | None = None,
    params_id: str = DEFAULT_PARAMS_ID,
    params: ExtractParams | None = None,
) -> ExtractResult:
    schema = schema or load_schema(paths.root)
    result = extract_source(paths, registry, schema, source_id, params, preview, params_id)

    def rel(p: Path) -> str:
        return p.relative_to(paths.root).as_posix()

    out(f"{source_id}: {result.count} proposals written to {rel(result.proposals)} "
        f"(parameter set {result.params_id}) in {result.seconds:.1f} s")  # fmt: skip
    out(f"  quality: {_quantiles(result.scores)}; bands {dict(sorted(result.bands.items()))}")
    out(f"  tone classes: {dict(sorted(result.tone_classes.items()))}")
    out(f"  weaknesses: {dict(sorted(result.weaknesses.items()))}")
    dropped = {k: v for k, v in sorted(result.stats.dropped.items()) if v}
    if result.below_minimum_area:
        dropped["below_minimum_area_on_the_ground"] = result.below_minimum_area
    out(f"  regions dropped: {dropped}; polygons repaired: {result.stats.repaired}; "
        f"outline width {result.stats.outline_width_px:.1f} working px")  # fmt: skip
    if result.preview:
        out(f"  preview: {rel(result.preview)}")
    return result
