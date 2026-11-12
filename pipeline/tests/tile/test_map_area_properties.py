"""Property T2: the tile shows the map area and nothing is recoloured (spec 02 task 14.3,
requirements 7.3, 19.1 and 19.2).

For random plates and random map area polygons, the tile file is exactly the JPEG encoding of the
source pixels in the polygon's bounding box, and the full image is exactly the encoding of the
area-averaged whole raster. Equality of bytes with an encoding made here from the source array
means no pixel was masked, shifted, tinted or sharpened.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import numpy as np
import rasterio
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rasterio.transform import Affine

from buried_pipeline.io.registry import load_registry
from buried_pipeline.tile.corners import tile_size
from buried_pipeline.tile.run import downsample, encode_jpeg, run_tile
from tests.align.strategies import affines
from tests.conftest import make_root
from tests.tile.test_run import SOURCE, write_map_area
from tests.validate.builders import alignment


@st.composite
def plate_cases(draw: st.DrawFn):
    width = draw(st.integers(24, 320))
    height = draw(st.integers(24, 320))
    seed = draw(st.integers(0, 2**32 - 1))
    # Four distinct vertices in a convex position, so the polygon is simple and has area:
    # the corners of a rectangle with one corner pushed in or out along a side.
    x0 = draw(st.integers(0, width - 12))
    y0 = draw(st.integers(0, height - 12))
    x1 = draw(st.integers(x0 + 8, width))
    y1 = draw(st.integers(y0 + 8, height))
    shape = draw(st.sampled_from(["rectangle", "trapezoid", "kite"]))
    mid_x = (x0 + x1) // 2
    if shape == "rectangle":
        polygon = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    elif shape == "trapezoid":
        inset = draw(st.integers(1, max(1, (x1 - x0) // 4)))
        polygon = [[x0 + inset, y0], [x1 - inset, y0], [x1, y1], [x0, y1]]
    else:
        polygon = [[mid_x, y0], [x1, (y0 + y1) // 2], [mid_x, y1], [x0, (y0 + y1) // 2]]
    return width, height, seed, polygon


@settings(
    max_examples=40,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.function_scoped_fixture],
)
@given(case=plate_cases(), t=affines())
def test_t2_the_tile_shows_the_map_area_and_nothing_is_recoloured(case, t) -> None:
    width, height, seed, polygon = case
    data = np.random.default_rng(seed).integers(0, 256, size=(height, width), dtype=np.uint8)
    with tempfile.TemporaryDirectory() as tmp:
        paths = make_root(Path(tmp))
        raster = paths.raw / SOURCE / "plate.tif"
        raster.parent.mkdir(parents=True)
        with rasterio.open(raster, "w", driver="GTiff", width=width, height=height, count=1,
                           dtype="uint8", crs="EPSG:26917", transform=Affine(*t)) as dst:
            dst.write(data, 1)
        paths.alignment_dir.mkdir(parents=True)
        paths.alignment_record(SOURCE).write_text(json.dumps(alignment(SOURCE)), encoding="utf-8")
        write_map_area(paths, polygon)

        (result,) = run_tile(paths, load_registry(paths.sources_json), [SOURCE], lambda _m: None)

        xs = [p[0] for p in polygon]
        ys = [p[1] for p in polygon]
        x, y, w, h = min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)
        assert result.crop_px == {"x": x, "y": y, "width": w, "height": h}

        window = data[y : y + h, x : x + w]
        tile_w, tile_h = tile_size(w, h)
        assert result.image.read_bytes() == encode_jpeg(downsample(window, tile_w, tile_h))

        full_w, full_h = tile_size(width, height, 2048)
        assert result.full_image.read_bytes() == encode_jpeg(downsample(data, full_w, full_h))
        assert (result.full_width_px, result.full_height_px) == (full_w, full_h)
