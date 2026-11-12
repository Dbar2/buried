# Kiro session 006: make the pipeline work on the real plates

Agent: builder (claude-sonnet-5.5).

The maintainer ran `buried fetch` (all four plates downloaded and extracted) and `buried inspect`.
Findings from the real data:

- The two 1911 plates are GeoTIFFs with tags. `inspect` works: about 0.058 m per pixel, rotated.
- The two 1935 plates are **JPEG**, not GeoTIFF: `v3-1935-229.jpg` with a world file
  (`v3-1935-229.jgw`), an ESRI PAM sidecar (`v3-1935-229.jpg.aux.xml`, which holds the SRS as
  NAD_1983_UTM_Zone_17N and a GeoTransform) and an overview file (`.jpg.ovr`).
  `buried inspect` fails on them with "No GeoTIFF found".
- Every plate zip also has a `.txt` of U of T's own ground control points, one per line:
  `source_x  source_y  map_easting  map_northing` (6 points for 1911 plate 229, 4 for 1935 plate
  229). These are the points the supplied georeferencing was fitted to, so they are **not**
  independent check points. Keep them as provenance only.

## Tasks

1. **Raster discovery and georeferencing for JPEG plates.** Make `inspect` (and every later
   command that opens a plate) accept a JPEG or TIFF, taking georeferencing from, in order:
   GeoTIFF tags, a PAM `.aux.xml` sidecar, a world file plus a `.prj` or the PAM SRS. Record which
   one was used. Fail loudly when a raster has a transform but no CRS. Ignore `.ovr` and thumbnail
   files when choosing the raster. Add tests with synthetic JPEG + world file + PAM fixtures written
   by the test helper. Update spec 02 (`requirements.md`, `design.md`, `tasks.md`) with a new
   requirement and task for this, numbered at the end.
2. **Record the supplied control points.** Parse the `.txt` into the plate's inspect report as
   `supplied_control_points` (count and coordinates), marked as not independent. Test it.
3. **Run `buried inspect --propose-origin` on all four real plates** and report the table and the
   proposed origin.
4. **Run `buried present present_toronto_intersections_2026` for real**, following your own
   three-step procedure: record `year_from` from the CKAN metadata in `data/sources.json`, confirm
   `id_field` and `kept_fields` from the downloaded file (keep the intersection id, the
   intersection description or street names, and the classification), update spec 02 `design.md`,
   and write the clipped layer to `data/present/`. Report how many intersections fall inside the
   bounds.
5. **Control-point picking aid.** Add `buried control-crops SOURCE_ID`: for each City intersection
   inside the plate, compute its predicted pixel from the supplied georeferencing and write a PNG
   crop of the plate (about 60 m square, at native resolution, with a faint crosshair at the
   predicted pixel) to `data/work/control/<source>/<intersection_id>.png`, plus an index JSON giving,
   per crop, the intersection id, its street names, its EPSG:26917 coordinate, the predicted pixel
   and the crop's top-left pixel. This lets a person mark the true centreline crossing. Pure
   functions for the pixel maths, with tests. Add it to spec 02 as a new requirement and task.
   Run it on `fip_v3_1911_229` and `fip_v3_1935_229`.

## Done looks like

`uv run pytest` and `uv run ruff check .` pass; the four real plates inspect cleanly; intersections
are in `data/present/`; crops exist for both editions of plate 229. Do not create control-point
files for real plates. You may make local commits per task. End with files changed, commands run
and results, and anything unfinished.
