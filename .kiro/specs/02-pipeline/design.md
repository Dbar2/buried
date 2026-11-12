# Design: 02 Pipeline

## Overview

```
data/sources.json ──► fetch ──► data/raw/<id>/ + data/raw/manifest.json
                         │
                         ▼
                      inspect ──► data/work/inspect/<id>.json  (CRS, pixel size, corners, bounds)
                         │
data/control/<id>.json ──┤
                         ▼
                    align-check ──► data/alignment/<id>.json   (residuals, RMSE, chosen transform)
                         │
            ┌────────────┴─────────────┐
            ▼                          ▼
          tile                      extract ──► data/work/proposals/<id>.geojson
  data/tiles/<id>.jpg + .json          │
                                       ▼   person writes data/work/review/<id>.json
                                    publish ──► data/evidence/<id>.geojson  (passes `buried validate`)
```

Every step after `align-check` uses the chosen transform from the alignment record, so the draped
tile, the extracted footprints and the published evidence line up by construction. No step applies
its own offset.

## Package layout

```
pipeline/
  pyproject.toml            # name buried-pipeline, requires-python ">=3.12,<3.13",
                            # [project.scripts] buried = "buried_pipeline.cli:main"
  uv.lock
  buried_pipeline/
    __init__.py             # __version__
    cli.py                  # argparse, one subparser per command, no logic
    paths.py                # repo root discovery, standard paths
    io/
      atomic.py             # write-temp-then-rename
      http.py               # HttpClient protocol + real implementation (httpx)
      registry.py           # read data/sources.json
    fetch/
      plates.py             # URL guard, download, unzip, manifest
      aerials.py            # index query, candidates, cap
      manifest.py           # manifest read/write, SHA-256
      zipsafe.py            # safe extraction (pure path checks + extraction)
    inspect/
      georef.py             # read transform/CRS via rasterio (I/O)
      report.py             # pure: pixel size, corners, bounds, origin proposal
    align/
      affine.py             # pure: fit, apply, invert, condition check
      residuals.py          # pure: residuals, RMSE, LOO, outliers, choice
      supplied.py           # pure given a transform spec: pixel -> CRS -> EPSG:26917
      run.py                # I/O: read control file + raster, write record
    tile/
      corners.py            # pure: corners, bilinear check
      run.py                # I/O: downsample, write JPEG + sidecar
    extract/
      params/v1.json        # the one parameter set
      params.py             # load + check params (tuned_on guard)
      colour.py             # pure (numpy): Lab conversion, class assignment
      outline.py            # pure (numpy/OpenCV on arrays): outline mask, closing
      regions.py            # pure: labelling, hole fill, area filter
      polygons.py           # pure: contour -> polygon, simplify, validity, pixel -> 26917
      score.py              # pure: quality components
      run.py                # I/O: read raster, write proposals
    publish/
      build.py              # pure: proposals + decisions + record -> features
      run.py                # I/O: read inputs, validate, write
    validate/               # spec 01
  tests/
    fixtures/               # small committed fixtures; never data/raw
    ...
```

"Pure" means no file, network or clock access. OpenCV and numpy calls on in-memory arrays are
allowed in pure modules. Time is passed in as an argument.

Dependencies: `rasterio` (bundles GDAL in its wheels, so no system GDAL), `numpy`,
`opencv-python-headless`, `shapely`, `pyproj`, `jsonschema`, `httpx`. Dev: `pytest`, `hypothesis`,
`ruff`. CLI uses `argparse` to avoid a dependency for seven subcommands.

Commands (recorded in `tech.md` by the tasks that add them), all from `pipeline/`:
`uv sync`, `uv run pytest`, `uv run ruff check .`, `uv run buried <command>`.

## fetch

### Plates

- Reads the Registry. Selects `fire_insurance_plan` sources (or the ids given).
- URL guard: the URL must match
  `^https://maps\.library\.utoronto\.ca/datapub/FIP/vol3_19111914/v3-1911-\d+\.zip$` or
  `^https://maps\.library\.utoronto\.ca/datapub/FIP/vol3_1935/Georeferenced/v3-1935-\d+\.zip$`,
  and the plate number in the URL must match the source id. This is the "never bulk-download"
  rule in code: only registered ids, only these two patterns.
- Refuses sources with `rights_checked_on: null` (requirement 2.3).
- Download streams to `data/raw/<id>/<zip name>.part`, computes SHA-256 while streaming, then
  renames. Then extracts with `zipsafe`, which rejects absolute paths, `..` components and
  symlink entries before writing anything.
- Manifest entry:

```json
{
  "source": "fip_v3_1911_229",
  "url": "https://...",
  "retrieved_at": "2026-11-12T15:04:05Z",
  "zip": { "path": "fip_v3_1911_229/v3-1911-229.zip", "bytes": 0, "sha256": "..." },
  "files": [ { "path": "fip_v3_1911_229/...", "bytes": 0, "sha256": "..." } ]
}
```

  The manifest lives in `data/raw/` (gitignored) and is a pipeline-internal file, not a contract
  file. Its shape is checked in code.
- Idempotence: if a manifest entry exists and every listed file exists with the same SHA-256, skip
  with "up to date" and make no request. Mismatch: error, no overwrite (requirement 2.7). To
  refetch, the maintainer deletes `data/raw/<id>/` by hand.
- If spec 01 has not created `data/sources.json` yet, task 1 creates it with the four plates, using
  the exact shape in spec 01's design. Spec 01 task 2 checks it later.

### Aerials

- `--aerial-candidates`: needs inspect reports for the showcase plates. Builds the union bounds in
  EPSG:26917 and sends an ArcGIS REST `query` to the index layer with an envelope geometry,
  `inSR=26917`, `spatialRel=esriSpatialRelIntersects`, `returnGeometry=true`, `f=json`.
- The layer URL and the record id field name are constants in `fetch/aerials.py`, `AERIAL_INDEX_URL`
  and `AERIAL_ID_FIELD`. Their values are not in the steering docs yet (see open questions). The
  command fails with a clear message while they are unset.
- Cap: more than 10 matches is an error. The showcase area is a few blocks, so a larger result
  means the query is wrong.
- Downloads happen through the normal `fetch` path only for registered `aerial_1947_<id>`
  sources, using the `zip_url` stored as the source's `url`.

## inspect

- Opens each raster in `data/raw/<id>/` with rasterio. GDAL reads internal GeoTIFF tags and, if
  absent, a `.tfw`/`.wld` world file with `.prj` or `.aux.xml` for the CRS. The report records
  which was found by checking for the sidecar files and the internal tags separately.
- "No georeferencing" when the transform is identity, or the CRS is missing (requirement 4.3).
- Pure computations in `inspect/report.py`, given the affine transform and a pyproj transformer:
  - corners: pixel `(0,0), (W,0), (W,H), (0,H)` to EPSG:26917;
  - bounds: min and max of the corners plus 16 points per edge (exact for affine-only cases;
    covers curvature when the raster CRS is not EPSG:26917);
  - pixel size: lengths of the images of the unit steps `(1,0)` and `(0,1)` at the raster centre,
    in metres;
  - rotation terms: the transform's `b` and `d` coefficients, reported as-is.
- `--propose-origin`: union bounds of the four showcase plates; origin = each centre coordinate
  rounded down to a multiple of 100 m; bounds rounded outward to multiples of 100 m. Printed only.

## align-check

### Inputs

`data/control/<id>.json` (spec 01 `controlPoints`), the raster, the Registry.

### Supplied georeferencing check

`supplied.py` maps pixel `(x, y)` with the raster's affine transform to the raster CRS, then with
`pyproj.Transformer.from_crs(raster_crs, "EPSG:26917", always_xy=True)` to EPSG:26917. The record
stores the CRS and the pyproj operation description so the mapping can be repeated.

For each point i: `r_i = T(p_i) - q_i` (east and north components, metres), `|r_i|` its magnitude.
`RMSE = sqrt(mean(|r_i|^2))`. Maximum residual = `max |r_i|`.

The control points are chosen independently of U of T's two georeferencing points, so these
residuals measure the supplied georeferencing. They are not a fit.

### Refined affine

- With n >= 4 points, solve `[x y 1] · [a b c]ᵀ = E` and `[x y 1] · [d e f]ᵀ = N` by least squares
  (`numpy.linalg.lstsq`). Stored as `[a, b, c, d, e, f]` with `E = a·x + b·y + c`,
  `N = d·x + e·y + f`.
- Stability: centre the pixel coordinates and take the singular values of the n×2 matrix. If
  `s_min / s_max < 0.05`, the points are too close to a line; skip the refined fit and report it.
  0.05 corresponds to a point spread whose narrow axis is less than one twentieth of its long axis.
- In-sample residuals and RMSE come from the full fit.
- Leave-one-out: for each i, fit without point i and take the residual at i. LOO RMSE is the RMS of
  those. In-sample RMSE understates the error of a fitted transform because the fit has absorbed
  the noise at those same points; LOO measures it at points the fit did not see. With 4 points each
  LOO fit has 3, which determine an affine exactly, so LOO is still defined. If any LOO subset is
  unstable by the rule above, skip the refined fit.

### Choice and error

- `chosen = refined` if a refined fit exists and `rmse_loo_m < supplied.rmse_m`; else `supplied`.
- `alignment_error_m` = the chosen transform's error (supplied RMSE or refined LOO RMSE), rounded
  up to the next 0.01 m. If it would be 0, the command fails: a zero error is not a measurement.
- Outliers: ids of points with `|r_i| > 3 × median(|r|)` under the chosen transform. Listed, never
  dropped. The person decides whether to fix or remove a point in the control file.

### Output

Spec 01 `alignmentRecord`, written atomically. Printed table:

```
fip_v3_1911_229  reference: <reference source id>  points: 6
id   description                       dE (m)   dN (m)   |r| (m)
...
supplied   RMSE 0.00 m   max 0.00 m
refined    RMSE in-sample 0.00 m   leave-one-out 0.00 m   max 0.00 m
chosen: refined   alignment_error_m: 0.00
possible outliers: none
```

(Zeros stand in for real values; no result is assumed here.)

### Inverse

`affine.invert` returns the inverse affine for `|a·e - b·d| > 1e-12`, else raises. Used by the
round-trip property and by later Studio work (map position to plate pixel).

## tile

- Refuses without an alignment record or with `attribution_status: to_be_confirmed`
  (requirement 7.2). Aerials stay untiled until their attribution line is confirmed in `sources.md`.
- Reads the raster decimated by rasterio with `out_shape` and `Resampling.average`, long edge at
  most 4096 px. Palette rasters are expanded to RGB using their own colour table. No other change
  to pixel values (`design.md`: rasters are evidence).
- JPEG quality 85 via OpenCV. WebP is not produced: Unity's `Texture2D.LoadImage` decodes PNG and
  JPEG only, and one format serves both the shell and Unity. 4096 px is the largest texture size
  that WebGL 2 implementations commonly support.
- Corners (`tile/corners.py`): the chosen transform applied to full-resolution pixel corners
  `(0,0)` top-left, `(W,0)` top-right, `(W,H)` bottom-right, `(0,H)` bottom-left. Downsampling does
  not move corners.
- Bilinear check: at the nine check points, compare bilinear interpolation of the four corners with
  the chosen transform. Affine transforms pass exactly. A supplied transform in another CRS bends
  slightly after reprojection; over one plate the bend is expected to be far below 0.01 m, and the
  check proves it per source rather than assuming it.
- Sidecar: spec 01 `tileSidecar`, including `alignment_error_m` and `attribution_line` copied from
  the record and the Registry.

## extract

### Parameter set

`extract/params/v1.json`:

```json
{
  "id": "v1",
  "tuned_on": ["fip_v3_1911_229", "fip_v3_1935_229"],
  "working_pixel_size_m": 0.0,
  "classes": [ { "name": "<legend class>", "lab": [0, 0, 0], "delta_e": 0.0 } ],
  "outline": { "max_l": 0.0, "closing_kernel_m": 0.0 },
  "regions": { "min_area_m2": 0.0, "hole_fill_m2": 0.0 },
  "simplify_tolerance_m": 0.0,
  "fixture_baseline": { "<fixture id>": { "mean_iou": 0.0, "matched_fraction": 0.0 } }
}
```

Zeros are placeholders. Every value is set during tuning on the tuning fixtures, in metres where it
is a size, so the same set applies to any plate whatever its pixel size. Class names are the
material classes printed on the Goad legend for Volume 3 (brick, frame, stone and so on, as the
legend words them). Colour centres are sampled from the tuning fixtures, never from the held-out
plate.

### Steps

All on in-memory arrays at `working_pixel_size_m`:

1. **Resample** the plate to the working pixel size (area averaging).
2. **Colour classes.** Convert to CIELAB. Each pixel takes the nearest class centre if within that
   class's ΔE (CIE76) tolerance, else no class.
3. **Outlines.** Pixels with L* below `outline.max_l` form the outline mask. Morphological closing
   with a kernel of `closing_kernel_m` bridges small gaps in printed lines.
4. **Regions.** For each class, subtract the outline mask, fill holes smaller than `hole_fill_m2`
   (labels and numbers printed inside buildings), label 4-connected regions, drop regions below
   `min_area_m2`. Dilate each region by half the local outline width, limited to the outline mask,
   so adjacent buildings meet on the centre of their shared line instead of leaving a gap.
5. **Polygons.** Trace the outer contour (OpenCV `findContours`, external), simplify with
   Douglas–Peucker at `simplify_tolerance_m`, convert to working pixels then to full-resolution
   pixels, check validity with shapely. An invalid polygon is repaired with `make_valid`; if that
   yields more than one polygon, the proposal keeps the largest and is scored with
   `shape_fidelity` against the original region, so the loss shows in its score.
6. **Georeference.** Apply the chosen transform to every full-resolution pixel vertex.
7. **Score** (all in [0, 1]):
   - `class_purity`: share of region pixels within the class tolerance before closing;
   - `outline_closure`: share of the polygon boundary that lies within one outline width of an
     outline pixel;
   - `shape_fidelity`: IoU between the simplified polygon rasterised at working resolution and the
     region mask;
   - `score = min(class_purity, outline_closure, shape_fidelity)`, so one weak component cannot be
     hidden by two strong ones.
8. **Ids.** `proposal_id = "<source id>_p_" + first 12 hex chars of SHA-256 over
   (source id, params id, alignment record SHA-256, full-resolution pixel polygon as integers)`.
   Same inputs, same id. Proposals are sorted by id; JSON is written with sorted keys and fixed
   float formatting (6 decimals for metres) so output is byte-identical (requirement 8.3).

Neatline: plates have margins, titles and a legend outside the mapped area. A region whose centroid
is outside the largest rectangular outline contour on the plate is discarded. If no such contour is
found, all regions are kept and every proposal gets `neatline: "not_found"`, which the reviewer sees.

### Proposal file

GeoJSON FeatureCollection with `crs: "EPSG:26917"`, `source`, `params_id`, `params_sha256`,
`alignment_record_sha256`, and features:

```json
{
  "type": "Feature",
  "id": "fip_v3_1911_229_p_0123456789ab",
  "geometry": { "type": "Polygon", "coordinates": [[[0, 0], "..."]] },
  "properties": {
    "material_class": "<legend class>" ,
    "pixel_polygon": [[0, 0], "..."],
    "crop_px": { "x": 0, "y": 0, "width": 1, "height": 1 },
    "area_m2": 0.0,
    "quality": { "score": 0.0, "class_purity": 0.0, "outline_closure": 0.0, "shape_fidelity": 0.0 },
    "neatline": "found"
  }
}
```

Pipeline-internal; lives in `data/work/`. The Studio spec may promote it to a contract shape.

### Tuning fixtures and the held-out guard

- Fixtures: `pipeline/tests/fixtures/extract/<fixture id>/` with `crop.png` (at most 1024×1024 px,
  cut from a tuning plate), `expected.json` (hand-drawn pixel polygons and classes) and
  `fixture.json` (`source`, `crop_px`, `drawn_by`, `drawn_on`). Small crops of out-of-copyright
  plates; credited in `fixture.json` with the plate's attribution line.
- `TUNING_SOURCES = ("fip_v3_1911_229", "fip_v3_1935_229")` is defined once in
  `extract/params.py`.
- Guard test (`tests/extract/test_held_out.py`) fails if:
  - `TUNING_SOURCES` contains anything else;
  - any params file's `tuned_on` is not a subset of `TUNING_SOURCES`;
  - any fixture lacks `fixture.json`, or its `source` is not in `TUNING_SOURCES`;
  - any path or text file content under `extract/params/` or `tests/fixtures/extract/` contains
    `fip_v3_1935_232`, `1935_232` or `1935-232`.
- `params.py` runs the same `tuned_on` check when loading, so a bad parameter set also fails at
  run time.
- Fixture regression test: each fixture's mean IoU and matched fraction must not fall below its
  `fixture_baseline`. Raising a baseline is fine; lowering one needs a recorded reason in the
  commit.

## publish

### Decisions file

`data/work/review/<source id>.json`, written by a person now and by the Studio later:

```json
{
  "source": "fip_v3_1911_229",
  "decisions": [
    {
      "proposal_id": "fip_v3_1911_229_p_0123456789ab",
      "decision": "accept",
      "confirmed_by": "<name>",
      "confirmed_at": "2026-11-15T10:00:00-05:00",
      "pixel_polygon": [[0, 0], "..."],
      "attributes": { "storeys": 2, "use": "<as printed>" },
      "confidence": "documented",
      "confidence_reason": "<why>",
      "position_error_m": 0.0
    }
  ]
}
```

Only `proposal_id`, `decision`, `confirmed_by` and `confirmed_at` are required. `pixel_polygon`
replaces the proposal's polygon when the reviewer moved vertices. `attributes` holds only what the
reviewer read on the plate. `position_error_m` may only raise the error.

### Building features (pure, `publish/build.py`)

For each accepted decision whose proposal id is not already in the file:

- geometry: the decision's `pixel_polygon` through the chosen transform if given, else the
  proposal geometry;
- `kind: building`, id `bld_<source id>_<NNNN>` (requirement 10.6);
- attributes: `material` = proposal's class unless `unclassified`; plus the reviewer's attributes;
- observations: one, `{ source: <source id>, present: true, visibility: clear }`;
- confidence: the decision's, else `estimated` with reason
  "Footprint read from <source id>; storeys not recorded";
- `position_error_m = max(alignment_error_m, decision.position_error_m)`;
- provenance: origin source, `crop_px` (the proposal's, or the bounding box of the edited polygon),
  `alignment_error_m`, `confirmed_by`, `confirmed_at`, `proposal_id`, `extraction_params_id`;
- `status: published`.

Existing features are copied unchanged. The collection gets `schema_version`, `crs`,
`origin_source`.

### Writing

`publish/run.py` validates the full would-be `data/` state (new file in place of the old one) with
spec 01's Validator in-process. On any error it prints them and writes nothing. On success it
writes atomically and prints counts: accepted, published now, already published, rejected,
undecided.

## Error handling

| Situation | Behaviour |
|---|---|
| Network failure in fetch | Remove the `.part` file, report URL and error, exit 1. Already-complete sources stay. |
| Zip entry escapes the folder | Abort that source before extracting anything, exit 1. |
| No georeferencing | "No georeferencing: <file>", exit 1. |
| Reference source not registered | align-check refuses (requirement 5.2). |
| Fewer than 3 control points | Error, no record. |
| Collinear points | Supplied result only, refined skipped with reason. |
| Bilinear check fails in tile | That source fails; others continue; exit 1 at the end. |
| Params `tuned_on` invalid | extract refuses to start. |
| Stale proposals (alignment changed) | publish refuses, says to rerun extract. |
| Validator errors at publish | Nothing written; errors printed. |

## Correctness properties

Hypothesis, in `pipeline/tests/`. Generated affine transforms have pixel scale 0.02 to 0.2 m/px,
rotation up to 10 degrees, small shear, and translation inside UTM 17N near Toronto. Generated
control points lie inside a 20000×20000 px raster.

**A1. Inverse round-trip.** For every invertible affine A and pixel p:
`|invert(A)(A(p)) - p| < 1e-6 px`; for every q: `|A(invert(A)(q)) - q| < 1e-6 m`.

**A2. Exact recovery.** For every A and every stable set of n >= 4 points with `q_i = A(p_i)`:
the refined fit reproduces every q_i within 1e-6 m and in-sample RMSE < 1e-6 m.

**A3. Bounded noise.** For every A, stable point set and noise vectors with `|n_i| <= δ`, where
`q_i = A(p_i) + n_i`: in-sample RMSE <= δ + 1e-9. (Least squares minimises the sum of squared
residuals, and A itself achieves at most δ at every point.)

**A4. Leave-one-out is never optimistic.** For every stable point set with n >= 4:
`rmse_loo_m >= rmse_in_sample_m - 1e-9`.

**A5. The transform round-trips control points within the reported error.** For every alignment
record produced by `align-check` from generated inputs: re-applying the chosen transform to the
stored control points reproduces every stored residual within 1e-9 m; the RMS of those residuals
equals the chosen in-sample RMSE within 1e-9 m; every point's residual is at most the reported
`max_residual_m`; and `alignment_error_m` is at least the chosen transform's in-sample RMSE.
(This is the `tech.md` property. A single residual can exceed the RMSE, so "within the reported
error" is tested as: the reported numbers are exactly what the transform does to the points, and
the reported error is never below the in-sample RMSE.)

**A6. Order independence.** For every point set, permuting the points leaves the RMSE values, the
choice and `alignment_error_m` unchanged.

**A7. Choice rule.** For every record, `chosen == "refined"` exactly when a refined fit exists and
its LOO RMSE is lower than the supplied RMSE, and `alignment_error_m` is the chosen error rounded up
to 0.01 m.

**T1. Tile corners are exact.** For every affine chosen transform and raster size, the sidecar
corners equal the transform at the full-resolution pixel corners within 1e-6 m, independent of the
downsample factor, and the bilinear check passes.

**X1. Proposals are valid polygons.** For every synthetic plate, every proposal polygon is valid,
non-empty and has `area_m2 >= min_area_m2`.

**X2. Determinism.** For every synthetic plate, running extract twice gives byte-identical output.

**X3. Geometry follows the chosen transform.** For every proposal, its geometry equals the chosen
transform applied to its pixel polygon within 1e-6 m.

**X4. Scores are bounded.** Every quality component and the score lie in [0, 1], and the score
equals the minimum component.

**X5. Synthetic recovery.** For every synthetic plate made of non-overlapping axis-aligned
rectangles filled with class colours, outlined in black, at least 2 m on a side, on a background
colour outside every class tolerance: each rectangle is matched by exactly one proposal of its
class with IoU >= 0.9, and there are no other proposals. Class colours for this test are synthetic
values, not the tuned ones, so it says nothing about any real plate.

**U1. Published files validate.** For every generated set of proposals, decisions and alignment
record, `publish` either writes a file that passes the Validator or writes nothing.

**U2. Only accepted proposals are published.** For every decisions file, the new features are
exactly the accepted, not-yet-published proposals with `confirmed_by` and `confirmed_at`.

**U3. Idempotence.** Publishing the same inputs twice gives a byte-identical evidence file.

**U4. Ids are never reused.** For every existing evidence file (including rejected and merged
features) and new decisions: existing features are unchanged, and every new sequence number is
greater than every existing one.

**U5. Error floor.** Every published feature has `position_error_m >= alignment_error_m`.

**F1. Fetch is idempotent and contained.** For every sequence of fetch runs against a fake HTTP
client serving fixture zips: the second run makes no requests, manifest SHA-256 values match the
bytes on disk, and no file is written outside `data/raw/`. Zips with escaping entries are always
refused.

## Testing strategy

- Unit tests for each pure module, property tests above, and one end-to-end test per command on a
  synthetic GeoTIFF fixture (a few hundred pixels, written by a test helper into a temp dir with a
  known transform in EPSG:26917 and one in EPSG:3857 to exercise reprojection).
- No test reads `data/raw/` or uses the network.
- The held-out guard and fixture regression tests run in the normal `uv run pytest`.
