# Design: 02 Pipeline

## Overview

```
data/sources.json ──► fetch ──► data/raw/<id>/ + data/raw/manifest.json
                         │
                         ▼
                      inspect ──► data/work/inspect/<id>.json  (CRS, pixel size, corners, bounds)
                         │
CKAN (City of Toronto) ──┤
                         ▼
                      present ──► data/present/<id>.geojson   (clipped, EPSG:26917)
                         │
data/control/<id>.json ──┤  (points cite present-layer features)
                         ▼
                    align-check ──► data/alignment/<id>.json   (residuals, RMSE, chosen transform)
                         │
            ┌────────────┴─────────────┐
            ▼                          ▼
          tile                      extract ──► data/work/proposals/<id>.geojson
  data/tiles/<id>.jpg + .json          │
                                       ▼   person writes data/work/review/<id>.json
                                    publish ──► data/evidence/<id>.geojson  (passes `buried validate`)
                                       │
                                       ▼   person writes data/work/review/match.json
                                     match ──► observations + same_as in data/evidence/*.geojson
                                               data/work/match/review.json
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
      georef.py             # read transform/CRS via rasterio and sidecar files (I/O)
      choice.py             # pure: which georeferencing wins (tags, PAM, world file + CRS)
      supplied_points.py    # parse U of T's own control points `.txt` (provenance only)
      report.py             # pure: pixel size, corners, bounds, origin proposal, project bounds
    present/
      datasets.py           # pure: per-dataset config (package id, resource, id field, kept fields)
      ckan.py               # package_show call and resource choice through the HTTP client
      clip.py               # pure (shapely + pyproj): bounds filter, reprojection, field filter
      run.py                # I/O: download, read with pyogrio, write data/present/<id>.geojson
    align/
      affine.py             # pure: fit, apply, invert, condition check
      residuals.py          # pure: residuals, RMSE, LOO, outliers, choice, error rule
      supplied.py           # pure given a transform spec: pixel -> CRS -> EPSG:26917
      references.py         # pure: look up and check control point references in a present layer
      hull.py               # pure: convex hull of control point references, share of map area inside
      run.py                # I/O: read control file + raster + present layers, write record
    controlcrops/
      pixels.py             # pure: predicted pixel, crop window, crosshair
      run.py                # I/O: read plate + intersections layer, write PNG crops + index
    tile/
      corners.py            # pure: corners, bilinear check
      run.py                # I/O: downsample, write JPEG + sidecar
    extract/
      params/v1.json        # the one parameter set
      params.py             # load + check params (tuned_on guard)
      maparea.py            # read + check data/control/map_area/<id>.json (shared by tile, extract, publish)
      tone.py               # pure (numpy): grey band, local-contrast normalisation, tone class, hatch measure
      outline.py            # pure (numpy/OpenCV on arrays): outline mask, closing
      regions.py            # pure: labelling, hole fill, area filter
      polygons.py           # pure: contour -> polygon, simplify, validity, pixel -> 26917
      score.py              # pure: quality components and weakness flags
      run.py                # I/O: read raster, write proposals
    publish/
      build.py              # pure: proposals + decisions + record -> features, coverage areas
      run.py                # I/O: read inputs, validate, write
    match/
      rules.py              # pure: MATCH_MIN, COMPETE_MIN, overlap score, per-pair outcome
      links.py              # pure: linked sets (union-find), same-origin check
      apply.py              # pure: strip match_auto results, apply person decisions, write new ones
      run.py                # I/O: read evidence, alignment, tiles, decisions; validate; write
    validate/               # spec 01
  tests/
    fixtures/               # small committed fixtures; never data/raw
    ...
```

"Pure" means no file, network or clock access. OpenCV and numpy calls on in-memory arrays are
allowed in pure modules. Time is passed in as an argument.

Dependencies: `rasterio` (bundles GDAL in its wheels, so no system GDAL), `numpy`,
`opencv-python-headless`, `shapely`, `pyproj`, `pyogrio` (reads GPKG with a bounding-box filter;
also bundles GDAL), `jsonschema`, `httpx`. Dev: `pytest`, `hypothesis`, `ruff`. CLI uses
`argparse` to avoid a dependency for nine subcommands.

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
  the exact shape in spec 01's design and `rights_checked_on: 2026-11-10`. Spec 01 task 2 checks
  it later.

### Aerials

- `--aerial-candidates`: needs inspect reports for the showcase plates. Builds the union bounds in
  EPSG:26917 and sends an ArcGIS REST `query` to the index layer with an envelope geometry,
  `inSR=26917`, `spatialRel=esriSpatialRelIntersects`, `outFields=Name,url,zip_url,thumbnail_url`,
  `returnGeometry=true`, `outSR=26917`, `f=json`.
- Constants in `fetch/aerials.py`:
  `AERIAL_INDEX_URL = "https://services1.arcgis.com/9NvE8jKNWWlDGsUJ/arcgis/rest/services/Toronto_Aerial_Photographs_1947_Index/FeatureServer/0"`,
  `AERIAL_ID_FIELD = "Name"`, `AERIAL_ZIP_FIELD = "zip_url"`. Proposed source id:
  `aerial_1947_` + `Name` lowercased; the command refuses a `Name` that does not lowercase to the
  source id pattern.
- Cap: more than 10 matches is an error. The showcase area is a few blocks, so a larger result
  means the query is wrong.
- A person checks the candidates, lists the chosen ids under "1947 aerial records in use" in
  `sources.md`, and adds them to the Registry. Downloads then happen through the normal `fetch`
  path, using the `zip_url` stored as the source's `url`.
- The plate index layers on the same server (`vol3_19111914`, `vol3_1935`) are recorded in
  `sources.md` but not used by this spec.

## inspect

- Finds the raster in `data/raw/<id>/`: the one `.tif`, `.tiff`, `.jpg` or `.jpeg` file there,
  ignoring `.ovr` overview files and any file whose name contains "thumb". None, or more than
  one, is an error (requirement 14.2).
- Georeferencing (requirement 14), read by `inspect/georef.py` and chosen by the pure
  `inspect/choice.py`, in this order:
  1. **GeoTIFF tags** (TIFF only; GDAL is told to use internal tags and nothing else).
  2. **PAM sidecar** `<raster file name>.aux.xml`: `<SRS>` (WKT) and `<GeoTransform>` (GDAL order:
     x0, dx/col, dx/row, y0, dy/col, dy/row). Parsed with `xml.etree`, not GDAL, so the choice does
     not depend on GDAL's own source order, which does not apply to JPEG.
  3. **World file** (`.tfw`/`.jgw`, then `.<ext>w`, then `.wld`), read as 6 numbers and moved from
     the pixel centre to the pixel corner, with the CRS from `<stem>.prj`, else from the PAM `<SRS>`.
  The first source with both a transform and a CRS wins. A transform is never paired with a CRS
  from anywhere else. The report records `georef_source` and `crs_source`.
- "No georeferencing: <file>. Found: ..." when nothing is complete, naming any transform found
  without a CRS. An identity transform counts as none (requirements 4.3 and 14.4).
- Every other georeferencing the raster holds is compared with the one used at the four corners,
  in EPSG:26917. A gap over one pixel gives one WARNING per source, naming the one used.
- The plate's own `.txt` (same stem) is parsed by `inspect/supplied_points.py`: four numbers per
  line, `source_x source_y map_easting map_northing`. The report keeps them under
  `supplied_control_points` with `independent: false`. They are the points U of T fitted the
  supplied georeferencing to, so measuring that georeferencing against them would be circular. No
  code outside inspect reads them. `source_x` and `source_y` are stored as written because the
  file does not state their units. (A parse failure is a warning, not an error: requirement 14.7.)
- Pure computations in `inspect/report.py`, given the affine transform and a pyproj transformer:
  - corners: pixel `(0,0), (W,0), (W,H), (0,H)` to EPSG:26917;
  - bounds: min and max of the corners plus 16 points per edge (exact for affine-only cases;
    covers curvature when the raster CRS is not EPSG:26917);
  - pixel size: lengths of the images of the unit steps `(1,0)` and `(0,1)` at the raster centre,
    in metres;
  - rotation terms: the transform's `b` and `d` coefficients, reported as-is.
- `--propose-origin`: union bounds of the four showcase plates; origin = each centre coordinate
  rounded down to a multiple of 100 m; bounds = union expanded by 250 m, rounded outward to
  multiples of 100 m (spec 01 requirement 7.6). Printed only.
- `project_bounds(reports)` in `report.py` is the one implementation of the bounds rule. `present`
  calls it when `data/project.json` does not exist yet, and a test checks it gives the same
  rectangle as `--propose-origin`.

## present

### Datasets

Defined once in `present/datasets.py`. The id field and kept fields are confirmed from the first
downloaded file in task 10 and recorded in this table in the same change. Until then the command
stops for that dataset with "dataset fields not confirmed". Confirmed: all four layers (the
intersections in task 10.4, 2026-11-12; the other three in task 10.5, 2026-11-12).

| Source id | CKAN package id | Geometry | Id field | Kept fields |
|---|---|---|---|---|
| `present_toronto_intersections_2026` | `intersection-file-city-of-toronto` | Point (the file stores each as a one-point MultiPoint) | `INTERSECTION_ID` | `INTERSECTION_DESC` (street names, "A St / B Ave"), `CLASSIFICATION`, `CLASSIFICATION_DESC` |
| `present_toronto_building_outlines_2026` | `topographic-mapping-building-outlines` | Polygon / MultiPolygon (stored as MultiPolygon) | `OBJECTID` | `SUBTYPE_CODE`, `SUBTYPE_DESC` (Building Outline, Garage, Miscellaneous Structure) |
| `present_toronto_property_boundaries_2026` | `property-boundaries` | Polygon / MultiPolygon (stored as MultiPolygon) | `PARCELID` | `FEATURE_TYPE` (COMMON, CONDO, RESERVE) |
| `present_toronto_address_points_2026` | `address-points-municipal-toronto-one-address-repository` | Point (stored as one-point MultiPoint) | `ADDRESS_POINT_ID` | `ADDRESS_FULL`, `ADDRESS_NUMBER`, `LINEAR_NAME_FULL`, `MAINT_STAGE` (REGULAR, RESERVED) |

What the first downloads of the other three files showed (2026-11-12). All three packages offer the
same layer in EPSG:4326 and EPSG:2952, and the config names the `... - 2952.gpkg` resource for the
reason given for the intersections. The CKAN `last_refreshed` year is 2026 for each, so `year_from`
is 2026 in the Registry.

| Layer | Rows in file | Rows in bbox | Features written | File size |
|---|---|---|---|---|
| Building outlines | 557694 | 1547 | 1507 | 2.1 MB |
| Property boundaries | 498477 | 1623 | 1591 | 2.1 MB |
| Address points | 525164 | 2208 | 2119 | 0.8 MB |

- **Building outlines.** Fields: `_id`, `SUBTYPE_CODE`, `SUBTYPE_DESC`, `ELEVATION`,
  `DERIVED_HEIGHT` (text), `OBJECTID`, `LAST_GEOMETRY_MAINT`, `LAST_ATTRIBUTE_MAINT`. There is no
  building id. `OBJECTID` is the City's object id and is unique across the rows in the bounds;
  `_id` is the portal's row number. An id from either is stable for this retrieval only, which is
  what a source id promises. `DERIVED_HEIGHT` and `ELEVATION` are left out because which source
  gives present-day heights is not decided (tech.md); adding them later needs a new source id,
  because a committed layer never changes. Subtypes inside the bounds: 1476 Building Outline, 46
  Garage, 25 Miscellaneous Structure.
- **Property boundaries.** Fields: `_id`, `PARCELID`, `FEATURE_TYPE`, `STATEDAREA` (text such as
  "58.65 sq.m"), `OBJECTID`. `PARCELID` is the City's parcel id and is unique across the rows in the
  bounds. Types inside the bounds: 1521 COMMON, 93 CONDO, 9 RESERVE. There is no status field.
  `STATEDAREA` is left out.
- **Address points.** 37 fields. `ADDRESS_POINT_ID` is the City's id, unique across the rows in the
  bounds. Each point is a one-point MultiPoint (requirement 12.12). 374 of the 2208 rows have
  `MAINT_STAGE` RESERVED (reserved numbers), which is why that field is kept: search decides whether
  to offer them. `GENERAL_USE` and `ADDRESS_STATUS` hold a single value, so they say nothing.
- The exact `intersects` filter drops 40, 32 and 89 rows that the bounding box returned (the box is
  larger than the bounds in the layer's CRS).

What the first download of the intersections file showed (46305 rows, CRS EPSG:2952, 20 fields):

- The package has two GPKG resources, the same layer in EPSG:4326 and in EPSG:2952 (NAD83(CSRS) /
  MTM zone 10). The dataset config names `Centreline Intersection - 2952.gpkg`. Reason: pyproj
  goes from EPSG:2952 to EPSG:26917 inside the NAD83 family, while EPSG:4326 to EPSG:26917 goes
  through a ballpark NAD83-to-WGS84 step that pyproj rates at 4.0 m. Control points should not
  start with a coordinate step of that size.
- `INTERSECTION_ID` is the intersection's id. It is not unique in the file: a multi-level
  intersection has one row per elevation (`ELEVATION_ID` is unique, `NUMBER_OF_ELEVATIONS` is 2 or
  3), all at the same point. Inside the project bounds, 33 of 396 rows repeat an id, every pair at
  an identical point. The clip keeps one feature per id when the rows agree on geometry and kept
  fields, and stops when they do not. `_id` and `OBJECTID` are row numbers, not used.
- `CLASSIFICATION` and `CLASSIFICATION_DESC` are kept because a person picking control points
  needs them: `SEUML` ("Pseudo Intersection-Overpass/Underpass") and `SEUSL` ("Pseudo
  Intersection-Single Level") are not street crossings, and `CDSSL` is a cul-de-sac end. Elevation,
  height-restriction, date and transaction fields are not needed by any consumer and are left out.
- Every row has `STATE` 8 and `DATE_EXPIRY` 2999-12-31, so there is nothing to filter out as
  expired.
- The CKAN `last_refreshed` is 2026-11-11, so `year_from` is 2026 in the Registry.
- Result on 2026-11-12: 363 features inside the bounds (631900, 4834400, 633200, 4835600), from
  396 rows, 137 KB.

Fields are kept only when a named consumer needs them. Personal data is not expected in these
layers; if a field looks like it holds any, it is left out and raised for review.

### Steps

1. `package_show?id=<package id>` through the HTTP client. Read the package's last-refresh date
   from its last-refresh field (expected to be `last_refreshed`; confirmed on the first download
   and recorded here). If that field is absent, use the resource's `last_modified`; if both are
   absent, stop.
2. Check the Registry years (requirement 12.4).
3. Pick the GPKG resource. If the package has several GPKG resources (for example one per CRS),
   the dataset config names the one to use by its resource name; until it does, stop and list them.
4. Download to `data/raw/present/<source id>/<resource file name>`, streamed, with SHA-256, and add
   a manifest entry. Same idempotence rules as `fetch`.
5. Read with `pyogrio.read_dataframe`'s lower-level counterpart `pyogrio.raw.read` (no pandas
   dependency), with a `bbox` equal to the project bounds transformed into the layer's CRS and
   densified (16 points per edge). Then filter exactly in EPSG:26917 with shapely `intersects`.
   Features that cross the bounds are kept whole.
6. Reproject with `pyproj.Transformer.from_crs(layer_crs, "EPSG:26917", always_xy=True)`. The
   layer CRS comes from the GPKG; none means stop. A MultiPoint of one point becomes a Point when
   the dataset expects Points; a MultiPoint of several points stops the run.
7. Build the `presentLayer` (spec 01) with feature ids as strings from the id field, kept fields
   only, sorted by id, coordinates written with 3 decimals (millimetres). Check the size limits
   (requirement 12.7). Write atomically.

The intersections layer is all the gate needs: `buried present present_toronto_intersections_2026`
right after `inspect`.

## align-check

### Inputs

`data/control/<id>.json` (spec 01 `controlPoints`), the raster, the Registry, and the present
layers the points cite.

### Reference check

`align/references.py` (pure) takes the control points and the parsed present layers and, for each
point, finds the cited feature and compares coordinates: an `intersection` point's `reference` must
be within 0.001 m of the layer's point; a `building_corner` point's `reference` must be within
0.001 m of exterior-ring vertex `reference_vertex.vertex` of polygon `reference_vertex.polygon`.
Any failure stops the command and names the point (requirement 5.2). The reference table in spec 01
design decides which layer each kind may cite.

On the plate, an intersection point is clicked where the two street centrelines cross, which on a
fire insurance plan is midway between the opposite street lines, not at a curb or lot corner.

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
- Basis B (`error_basis_m`): `supplied.rmse_m` when supplied is chosen (`error_basis:
  supplied_rmse`); `refined.rmse_loo_m` when refined is chosen (`error_basis: refined_loo_rmse`).
  Both are out-of-sample: the supplied georeferencing was not fitted to our points, and LOO measures
  the refined fit at points it did not see.
- `alignment_error_m = ceil_0.1(max(2.0, 2.0 × B))`, with `ceil_0.1` as defined in spec 01 design
  (provenance). The constants are written to `error_rule`. Doubling gives a conservative figure that
  most points fall within; the 2 m floor holds even when a handful of points fit unusually well.
- If B is 0, the command fails: a zero RMSE from real control points means the points were copied
  from the georeferencing, not measured.
- `source_pixel_size_m`: the larger of the two pixel sizes from inspect's unit-step rule, so the
  digitising floor of 2 pixels is never understated.
- Outliers: ids of points with `|r_i| > 3 × median(|r|)` under the chosen transform. Listed, never
  dropped. The person decides whether to fix or remove a point in the control file.

### Output

Spec 01 `alignmentRecord`, written atomically. Printed table:

```
fip_v3_1911_229  points: 6  references: present_toronto_intersections_2026
id   kind           description                  dE (m)   dN (m)   |r| (m)
...
supplied   RMSE 0.00 m   max 0.00 m
refined    RMSE in-sample 0.00 m   leave-one-out 0.00 m   max 0.00 m
chosen: refined   basis (leave-one-out RMSE): 0.00 m
published alignment error: 0.0 m   (max(2.0, 2 x basis), rounded up to 0.1 m)
possible outliers: none
control hull: 0 m2, 0% of the map area's ground footprint inside it
```

(Zeros stand in for real values; no result is assumed here.)

### Control hull (requirement 18)

`align/hull.py` takes the control points' `reference` positions and returns shapely's
`convex_hull`, rounded to 3 decimals, and its area. With a map area file it also reports
`area(hull ∩ map_area_ground) / area(map_area_ground)`, where `map_area_ground` is the map area
through the chosen transform. The record stores the hull; the printed share is not stored, because
it depends on the map area, which can be set later.

### Measured results (for the record)

| Source | Points | Supplied RMSE | Published `alignment_error_m` | Note |
|---|---|---|---|---|
| `fip_v3_1911_229` | 6 City intersections | 2.140 m (max 3.504 m) | 4.3 m | Session 008 |
| `fip_v3_1935_229` | 6 City intersections | 1.504 m | 3.1 m | Reported in session 007 |

On both editions of plate 229 the six points lie in the northern two-thirds of the plate, because
the southern street crossings drawn on the plates no longer exist. The figures are measured there.
Requirement 18 records the hull so the Studio can warn about features in the southern third.

### Inverse

`affine.invert` returns the inverse affine for `|a·e - b·d| > 1e-12`, else raises. Used by the
round-trip property and by later Studio work (map position to plate pixel).

## control-crops

A picking aid, not a measurement (requirement 15). It sits between `present` and `align-check`: a
person needs control points before `align-check` can run, and the supplied georeferencing already
puts each City intersection near the right place on the plate.

- Input: the plate (found and read exactly as `inspect` does), and
  `data/present/present_toronto_intersections_2026.geojson`.
- For each intersection: EPSG:26917 point, to the raster CRS with pyproj, then through
  `invert_affine` of the raster's transform: a float `(col, row)` in the `gdal_corner` convention.
  Kept when `0 <= col < width` and `0 <= row < height`. Pure functions in
  `controlcrops/pixels.py`.
- Crop: `round(60 / pixel_size_x_m)` by `round(60 / pixel_size_y_m)` pixels (the unit-step pixel
  sizes from `inspect`), read at native resolution with a rasterio window, centred on the predicted
  pixel and moved just far enough to stay inside the raster (`moved_to_stay_inside_plate`).
- Crosshair: four one-pixel arms, 3 m long, starting 0.4 m from the predicted pixel (with floors of
  12 px and 3 px on coarse plates), blended 50% with a red (230, 30, 30). The gap leaves the
  crossing visible. One band is repeated to three; the plate is never otherwise recoloured.
- Output: `data/work/control/<source id>/<intersection id>.png` and `index.json`, written
  atomically, the index last. The previous run's PNGs and index are removed first. The directory is
  under `data/work/`, so it is never committed.
- The person reads a crop, finds the crossing of the two street centrelines as drawn, notes its
  pixel in the full plate (`crop_top_left_px` plus the position in the crop), and writes it into
  `data/control/<source id>.json` with `reference_feature_id` set to the intersection id. This
  command writes no control file.

## tile

- Refuses without an alignment record or with `attribution_status: to_be_confirmed`
  (requirement 7.2), and refuses a plate without a map area file (requirement 16.3). The 1947
  aerial attribution line was confirmed on 2026-11-12, so registered aerials can be tiled once they
  have an alignment record. Aerials have no map area file; their tile is the whole photo.
- Map-area tile (requirement 19.2): `crop_px` is the axis-aligned bounding box of the map area's
  pixel polygon, clamped to the raster. The tile is that window, decimated as below. Pixels inside
  the box are not changed, even outside the polygon; the sidecar carries `crop_px` and `map_area`
  (the polygon through the chosen transform) so the Explorer can clip the drape to the polygon.
  Masking in the JPEG would need a fill colour, which would put a colour on the evidence.
- Full image (requirement 19.1): the whole raster, decimated to a long edge of at most 2048 px,
  JPEG quality 85, written as `<source id>_full.jpg` and named in the sidecar's `full_image`. It is
  for the Sources page and is never draped.
- Reads the raster decimated by rasterio with `out_shape` and `Resampling.average`, long edge at
  most 4096 px. Palette rasters are expanded to RGB using their own colour table. No other change
  to pixel values (`design.md`: rasters are evidence).
- JPEG quality 85 via OpenCV. WebP is not produced: Unity's `Texture2D.LoadImage` decodes PNG and
  JPEG only, and one format serves both the shell and Unity. 4096 px is the largest texture size
  that WebGL 2 implementations commonly support.
- Corners (`tile/corners.py`): the chosen transform applied to the full-resolution pixel corners of
  the tiled window: `(x0,y0)` top-left, `(x1,y0)` top-right, `(x1,y1)` bottom-right, `(x0,y1)`
  bottom-left, where the window is `crop_px` for a plate and `(0,0)`–`(W,H)` for an aerial.
  Downsampling does not move corners.
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
  "normalise": { "window_m": 0.0, "clip_limit": 0.0 },
  "outline": { "max_grey": 0.0, "closing_kernel_m": 0.0 },
  "tone": { "light_min": 0.0, "dark_max": 0.0, "hatch_min": 0.0, "mixed_spread": 0.0 },
  "text": { "max_mark_area_m2": 0.0 },
  "regions": { "min_area_m2": 0.0, "hole_fill_m2": 0.0 },
  "simplify_tolerance_m": 0.0,
  "fixture_baseline": { "<fixture id>": { "mean_iou": 0.0, "matched_fraction": 0.0 } }
}
```

Zeros are placeholders. Every value is set during tuning on the tuning fixtures, in metres where it
is a size, so the same set applies to any plate whatever its pixel size. Grey thresholds are on the
normalised 0 to 1 scale after step 2, so the two editions (a scan and a photograph, with different
exposure) share one set. Values are sampled from the tuning fixtures, never from the held-out plate.

The plates are greyscale (session 007). There are no colour classes and no material classes. A grey
tone does not identify a construction material on these copies.

### Steps

All on in-memory arrays at `working_pixel_size_m`, inside the map area only (pixels outside it are
set to "no data" before step 2, so the margin, archive labels and ruler never affect a threshold):

1. **Resample** the plate to the working pixel size (area averaging) and convert to one grey band
   (the 1911 scans are single band; a three-band file is averaged).
2. **Normalise local contrast** with CLAHE over `normalise.window_m` tiles at
   `normalise.clip_limit`, then scale to 0 to 1. This evens out the photograph's exposure and paper
   tone.
3. **Outlines.** Pixels with normalised grey below `outline.max_grey` form the outline mask.
   Morphological closing with a kernel of `closing_kernel_m` bridges small gaps in printed lines.
4. **Regions.** Subtract the outline mask, fill holes smaller than `hole_fill_m2` (labels and
   numbers printed inside buildings), label 4-connected regions, drop regions below `min_area_m2`
   and regions whose centroid is outside the map area. Dilate each region by half the local outline
   width, limited to the outline mask, so adjacent buildings meet on the centre of their shared line
   instead of leaving a gap. Regions with no closed outline (yards, lumber piles drawn as hatching)
   fail `outline_closure` and are not proposed below its floor; a person traces them as land use in
   the Studio.
5. **Polygons.** Trace the outer contour (OpenCV `findContours`, external), simplify with
   Douglas–Peucker at `simplify_tolerance_m`, convert to working pixels then to full-resolution
   pixels, check validity with shapely. An invalid polygon is repaired with `make_valid`; if that
   yields more than one polygon, the proposal keeps the largest and is scored with
   `shape_fidelity` against the original region, so the loss shows in its score.
6. **Georeference.** Apply the chosen transform to every full-resolution pixel vertex.
7. **Tone class** (`tone.py`, requirement 17.2): over the region's interior pixels (eroded by one
   outline width), the median normalised grey `m`, the spread `s` (interquartile range) and a hatch
   measure `h` (share of energy in a narrow band of diagonal orientations from a gradient
   histogram). `hatched` if `h >= tone.hatch_min`; else `mixed` if `s >= tone.mixed_spread`; else
   `light` if `m >= tone.light_min`, `dark` if `m <= tone.dark_max`, otherwise `mid`.
8. **Score** (all in [0, 1], requirement 17.4):
   - `outline_closure`: share of the polygon boundary that lies within one outline width of an
     outline pixel;
   - `fill_uniformity`: `1 - min(1, s / tone.mixed_spread)`, and `min(that, 1 - h)`, so hatching
     and mixed fills score low;
   - `text_clear`: `1 -` the share of the region covered by dark connected marks smaller than
     `text.max_mark_area_m2` (lettering, numbers, an X or skylight mark);
   - `edge_clear`: 0 if the polygon touches the map area boundary (within one outline width) or a
     `fold_lines` polyline from the map area file, else 1;
   - `shape_fidelity`: IoU between the simplified polygon rasterised at working resolution and the
     region mask;
   - `score = min(...)`, so one weak component cannot be hidden by strong ones.
   - `weaknesses`: `open_outline` if `outline_closure < 0.9`, `hatched_fill` if the tone class is
     `hatched`, `text_overlap` if `text_clear < 0.9`, `touches_edge` and `touches_fold` from
     `edge_clear`. The 0.9 cut is a design value for display, not tuned.
9. **Ids.** `proposal_id = "<source id>_p_" + first 12 hex chars of SHA-256 over
   (source id, params id, alignment record SHA-256, full-resolution pixel polygon as integers)`.
   Same inputs, same id. Proposals are sorted by id; JSON is written with sorted keys and fixed
   float formatting (6 decimals for metres) so output is byte-identical (requirement 8.3).

Map area: read from `data/control/map_area/<source id>.json` by `extract/maparea.py`, which also
checks it against the raster's pixel extent (requirement 16.2). `tile`, `extract` and `publish` all
use this one reader. No step detects a neatline. The 1935 photographs carry archive labels and a
ruler outside the plate; only a person can say where the map ends, and says it once.

### Proposal file

GeoJSON FeatureCollection with `crs: "EPSG:26917"`, `source`, `params_id`, `params_sha256`,
`alignment_record_sha256`, `map_area_sha256`, `map_area_px` and `map_area_geometry` (EPSG:26917,
the chosen transform applied to `map_area_px`), and features:

```json
{
  "type": "Feature",
  "id": "fip_v3_1911_229_p_0123456789ab",
  "geometry": { "type": "Polygon", "coordinates": [[[0, 0], "..."]] },
  "properties": {
    "tone_class": "mid",
    "pixel_polygon": [[0, 0], "..."],
    "crop_px": { "x": 0, "y": 0, "width": 1, "height": 1 },
    "area_m2": 0.0,
    "quality": { "score": 0.0, "outline_closure": 0.0, "fill_uniformity": 0.0,
                 "text_clear": 0.0, "edge_clear": 0.0, "shape_fidelity": 0.0 },
    "weaknesses": ["text_overlap"]
  }
}
```

Pipeline-internal; lives in `data/work/`. Spec 04 promotes it to the Service API Schema
(requirement 20.2).

### Tuning fixtures and the held-out guard

- Fixtures: `pipeline/tests/fixtures/extract/<fixture id>/` with `crop.png` (at most 1024×1024 px,
  cut from a tuning plate, inside its map area), `expected.json` (hand-drawn pixel polygons and
  the person's tone class for each) and
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
      "attribute_reads": [
        { "attribute": "storeys", "crop_px": { "x": 0, "y": 0, "width": 1, "height": 1 },
          "read_by": "person" }
      ],
      "confidence": "documented",
      "confidence_reason": "<why>",
      "position_error_m": 0.0
    }
  ],
  "reviewed_areas": [
    { "pixel_polygon": [[0, 0], "..."], "confirmed_by": "<name>",
      "confirmed_at": "2026-11-15T10:30:00-05:00", "covers": ["building"] }
  ]
}
```

`attribute_reads` is optional; each read takes `confirmed_by` and `confirmed_at` from its decision.
`covers` on a reviewed area is optional and means `["building"]` when absent (spec 01
requirement 28).

Only `proposal_id`, `decision`, `confirmed_by` and `confirmed_at` are required. `pixel_polygon`
replaces the proposal's polygon when the reviewer moved vertices. `attributes` holds only what the
reviewer read on the plate. `position_error_m` may only raise the error. A reviewed area is the
reviewer's statement that every building the plate draws inside it has been accepted in this file;
the reviewer leaves out any area where a building has no usable proposal.

### Building features (pure, `publish/build.py`)

For each accepted decision whose proposal id is not already in the file:

- geometry: the decision's `pixel_polygon` through the chosen transform if given, else the
  proposal geometry;
- `kind: building`, id `bld_<source id>_<NNNN>` (requirement 10.6);
- attributes: only the reviewer's attributes. Extraction gives no attribute: `tone_class` goes to
  `provenance.tone_class`, never to `material` (requirement 17.3). A `material` (or any attribute)
  the reviewer read is written with its crop as `provenance.attribute_reads` (requirement 20.3);
  a decision that sets `material` without a read is refused;
- observations: one, `{ source: <source id>, present: true, visibility: clear, method: origin }`;
- confidence: the decision's, else `estimated` with reason
  "Footprint read from <source id>; storeys not recorded";
- `digitising_error_m = max(1.0, 2 × source_pixel_size_m)`;
- `position_error_m = max(ceil_0.1(sqrt(alignment_error_m² + digitising_error_m²)),
  decision.position_error_m)`;
- provenance: origin source, `crop_px` (the proposal's, or the bounding box of the edited polygon),
  `alignment_error_m`, `digitising_error_m`, `confirmed_by`, `confirmed_at`, `proposal_id`,
  `extraction_params_id`;
- `status: published`.

Existing features are copied unchanged. The collection gets `schema_version`, `crs`,
`origin_source`, `mapped_area` (the proposal file's `map_area_geometry` with `method: map_area`,
requirement 10.10), and
`reviewed_areas`: the existing ones unchanged, plus each new one from the decisions file through the
chosen transform with `method: person`. A reviewed area identical to an existing one is skipped.

### Writing

`publish/run.py` validates the full would-be `data/` state (new file in place of the old one) with
spec 01's Validator in-process. On any error it prints them and writes nothing. On success it
writes atomically and prints counts: accepted, published now, already published, rejected,
undecided.

After publishing a plate that overlaps another published plate, run `buried match`. Until then the
new features carry only their origin observation.

## match

### What it compares

- Features: every `published` building in `data/evidence/*.geojson`.
- Other plates: every registered `fire_insurance_plan` with an evidence file. Its `mapped_area`,
  `reviewed_areas` and published buildings are read from that file. Its smallest possible feature
  error is `ceil_0.1(sqrt(alignment_error_m² + max(1.0, 2 × source_pixel_size_m)²))` from its
  alignment record.
- Aerials: every registered `aerial_photograph` with an alignment record and a tile sidecar. Its
  footprint is the sidecar's four corners as a polygon.

All geometry is shapely in EPSG:26917. `shrink(g, d)` is `g.buffer(-d)` and `grow(g, d)` is
`g.buffer(d)`, both with round joins and 16 segments per quadrant. For an inward buffer the chords
of the polygonal arcs make the shrunk shape very slightly larger than the exact one, which errs
toward "something touches the core" and so away from a false absence.

### Pairwise error (requirement 13.15)

Two plates are measured against the same City intersections, so how far one plate's footprint may
sit from another's is smaller than the sum of their absolute errors. `align/pairwise.py` (pure)
holds the rule; `match/run.py` reads the committed control files and alignment records and calls it.

- Shared references: control points of two plates with the same `(reference_source,
  reference_feature_id, reference_vertex)`. Fewer than four: no figure.
- A plate's out-of-sample residual `r` at a point: the supplied residual from its alignment record
  when it chose `supplied`; the leave-one-out residual, recomputed from the control file, when it
  chose `refined` (the in-sample residuals of a refined fit are optimistic).
- Where plate A puts a reference minus where plate B puts it is `r_A − r_B`, because both
  transforms predict the same City position `q` and `T(p) = q + r`. `B_pair` is the RMS of those
  differences (`math.fsum`, so order does not matter). `pairwise_error_m = ceil_0.1(max(1.0, 2 ×
  B_pair))`. The 1.0 m floor is half the alignment error's 2.0 m: the City reference's own error
  cancels in a difference, but the control points were read by eye, the transforms are measured at
  a handful of points inside a hull and extrapolated outside it, and a few points can have a small
  RMS by luck.
- A plate's control file must hash to its alignment record's `control_sha256`; otherwise the plate
  takes no part and `match` says so.
- `e` for F against G on the other plate is `ceil_0.1(sqrt(pairwise² + own(F)² + own(G)²))`, with
  `own(X) = sqrt(position_error_m² − provenance.alignment_error_m²)`. For an absence, `own(G)` is
  replaced by the other plate's smallest digitising term, `max(1.0, 2 × pixel size)`.
- Everything is recomputable from `data/control/<id>.json` and `data/alignment/<id>.json`. Each
  `match` run writes the figures it used, with shared references and differences, to
  `data/work/match/pairwise.json`. Nothing under `data/` changes.

On plate 229 both editions chose their supplied georeferencing, so the figure is built from the
supplied residuals (RMS of the differences 1.66 m, pairwise error 3.4 m), not from the refined
fits, whose residuals agree to about 0.2 m but are not the transforms the published footprints
were drawn under.

### Thresholds

Defined once in `match/rules.py`:

- `MATCH_MIN = 0.5`: at least half of the smaller footprint's certain core lies inside the larger.
- `COMPETE_MIN = 0.1`: any second footprint with a tenth of the core is a competitor, and the case
  goes to a person.

These are design values, not tuned on any plate. Changing one is a reviewed change to this file.

### Per pair: F against another plate P

1. If `F ∩ mapped_area(P)` is empty: `not_covered`.
2. Candidates: published buildings G on P with `distance(F, G) <= e_FG`, where
   `e_FG = F.position_error_m + G.position_error_m`. For each, `r` as in requirement 13.2. If the
   shrunk smaller footprint is empty, the pair goes to review ("too small for its error").
3. Match: exactly one G with `r >= MATCH_MIN`, no other with `r >= COMPETE_MIN`, and
   `grow(F, e_FG)` inside `mapped_area(P)`; and the same holds the other way round (F is G's only
   strong candidate on F's plate, with no competitor), so the outcome does not depend on which
   feature is processed first. Matches found this way are only candidate links until the
   same-origin check below.

   Same-origin check (`match/links.py`): after all plate pairs are scored, build the linked sets
   from person links plus every candidate link. In any set that would contain two features with the
   same origin source, every candidate link in that set goes to review and none of them, nor their
   presences, is written. This is done on the whole graph at once so the result does not depend on
   processing order.
4. Absence: `e_abs = F.position_error_m + min_error(P)`. `shrink(F, e_abs)` is not empty,
   `grow(F, e_abs)` lies inside the union of `reviewed_areas(P)`, and no published building on P
   intersects `shrink(F, e_abs)`: `present: false, clear`.
5. Otherwise: review, with the reason (partial overlap, competing candidates, outside reviewed
   areas, on the plate edge) and every candidate's id and `r`.

Rules 3 and 4 cannot both hold: a match needs a candidate whose overlap with F's core is positive,
and absence needs no building touching F's core.

A clear absence can also mean a different building stands on the spot (`evidence.md`). Code cannot
tell that from the same building redrawn, so a footprint that overlaps F's core but does not match
always goes to review.

### Per pair: F against an aerial A

- If `F ∩ footprint(A)` is empty: `not_covered`, `method: match_auto`.
- Otherwise a pending item: aerial id, the feature to show (the member of F's linked set whose
  origin source has the greatest `year_to`), and the tile to show it on. No observation is written.
  Only a person's `observation` decision can set present or absent, clear or obscured.

### Match decisions file

`data/work/review/match.json`, written by a person now and by the Studio later:

```json
{
  "decisions": [
    { "type": "link", "features": ["bld_fip_v3_1911_229_0001", "bld_fip_v3_1935_229_0004"],
      "confirmed_by": "<name>", "confirmed_at": "2026-11-20T10:00:00-05:00" },
    { "type": "no_link", "features": ["...", "..."],
      "confirmed_by": "<name>", "confirmed_at": "..." },
    { "type": "observation", "feature": "bld_fip_v3_1935_229_0004",
      "source": "aerial_1947_<id>", "present": false, "visibility": "clear",
      "note": "<what the person saw>",
      "confirmed_by": "<name>", "confirmed_at": "..." }
  ]
}
```

- `link` writes `same_as` both ways and a presence on each feature from the other's origin source,
  all `method: person`.
- `no_link` stops `match` from proposing or auto-linking that pair. It writes nothing to evidence.
  Because `data/work/` is gitignored, a lost decisions file means the pair returns to review, which
  is the safe direction.
- `observation` writes one observation, `method: person`. It replaces any `match_auto`
  observation for that feature and source.

### Run order inside `match`

1. Read everything. Remove every `match_auto` observation and `match_auto` link from every feature
   (person ones stay).
2. Apply the decisions file.
3. Score plate pairs, run the same-origin check, then write the surviving matches, absences and
   not-covered results; then aerial pairs. Skip any feature and source that already has an origin
   or person observation, and any pair marked `no_link`.
4. Sort each feature's observations (origin first, then by source id) and links (by feature id).
5. Validate the whole would-be `data/` state. Write all changed evidence files atomically, or
   nothing.
6. Write `data/work/match/review.json` (sorted) and print counts.

Step 1 makes the run idempotent: the output depends only on the published features, the coverage
areas, the alignment records and the decisions file.

`match` never edits geometry, attributes, confidence, provenance, status or ids (spec 01
requirement 17.4).

## Error handling

| Situation | Behaviour |
|---|---|
| Network failure in fetch | Remove the `.part` file, report URL and error, exit 1. Already-complete sources stay. |
| Zip entry escapes the folder | Abort that source before extracting anything, exit 1. |
| No georeferencing | "No georeferencing: <file>. Found: ...", exit 1. Includes a transform with no CRS. |
| Reference source not registered | align-check refuses (requirement 5.2). |
| Fewer than 3 control points | Error, no record. |
| Collinear points | Supplied result only, refined skipped with reason. |
| Bilinear check fails in tile | That source fails; others continue; exit 1 at the end. |
| Params `tuned_on` invalid | extract refuses to start. |
| Plate has no map area file | tile, extract and publish refuse and name the file to write. |
| Map area vertex outside the raster | tile, extract and publish refuse and name the vertex. |
| Decision sets `material` without a read | publish refuses that decision. |
| Stale proposals (alignment changed) | publish refuses, says to rerun extract. |
| Validator errors at publish | Nothing written; errors printed. |
| Control point reference missing or moved | align-check refuses and names the point. |
| CKAN package has no GPKG, or several unnamed | present stops and lists the resources. |
| Registry years differ from CKAN metadata | present stops and says which value to record. |
| Present layer output too large | present stops; nothing written. |
| Present layer content changed on `--recheck` | present stops; existing file kept; a new source id is needed. |
| Same-origin clash in a would-be linked set | match sends every candidate link in that set to review. |
| Validator errors at match | Nothing written; errors printed. |

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
(This is the `tech.md` property, in the reading accepted in session 002b. A single residual can
exceed the RMSE, so "within the reported error" is tested as: the reported numbers are exactly what
the transform does to the points, and the reported error is never below the in-sample RMSE.)

**A6. Order independence.** For every point set, permuting the points leaves the RMSE values, the
choice and `alignment_error_m` unchanged.

**A7. Choice rule.** For every record, `chosen == "refined"` exactly when a refined fit exists and
its LOO RMSE is lower than the supplied RMSE; `error_basis_m` is the supplied RMSE or the refined
LOO RMSE to match; and `alignment_error_m == ceil_0.1(max(2.0, 2.0 × error_basis_m))`.

**A8. The published error is conservative.** For every record: `alignment_error_m >= 2.0`,
`alignment_error_m >= 2 × error_basis_m - 1e-9`,
`alignment_error_m < max(2.0, 2 × error_basis_m) + 0.1`, and `alignment_error_m` is a multiple of
0.1 (checked as `abs(x × 10 - round(x × 10)) < 1e-9`).

**A9. References are checked exactly.** For every generated present layer and control file: if any
point's `reference` differs from its cited feature's coordinate by more than 0.001 m, or cites a
missing feature, `align-check` refuses; otherwise it runs.

**T1. Tile corners are exact.** For every affine chosen transform, raster size and crop window, the
sidecar corners equal the transform at the window's full-resolution pixel corners within 1e-6 m,
independent of the downsample factor, and the bilinear check passes.

**T2. The tile shows the map area and nothing is recoloured.** For every synthetic plate and map
area, `crop_px` is the bounding box of the map area clamped to the raster, every tile pixel equals
the area-averaged source pixel at that place (no tint, no fill), and the full image covers the whole
raster. *(req 7.3, 19.1, 19.2)*

**A10. The control hull is the convex hull.** For every generated control file with 3 or more
non-collinear points, the record's `control_hull` contains every reference position, every hull
vertex is a reference position, and the hull is convex. *(req 18.1)*

**X1. Proposals are valid polygons.** For every synthetic plate, every proposal polygon is valid,
non-empty and has `area_m2 >= min_area_m2`.

**X2. Determinism.** For every synthetic plate, running extract twice gives byte-identical output.

**X3. Geometry follows the chosen transform.** For every proposal, its geometry equals the chosen
transform applied to its pixel polygon within 1e-6 m.

**X4. Scores are bounded.** Every quality component and the score lie in [0, 1], the score equals
the minimum component, and every weakness flag matches its component (for example `open_outline`
exactly when `outline_closure < 0.9`).

**X5. Synthetic recovery.** For every synthetic greyscale plate made of non-overlapping axis-aligned
rectangles filled with one of three grey tones, outlined in black, at least 2 m on a side, on a
light background, with some rectangles carrying a small dark mark inside: each rectangle is matched
by exactly one proposal with IoU >= 0.9 and the tone class it was drawn with, and there are no other
proposals. Hatched rectangles without an outline give no proposal. The tones and marks are
synthetic values, not the tuned ones, so the test says nothing about any real plate.

**X6. Nothing outside the map area, no material from a tone.** For every synthetic plate and map
area, every proposal's centroid lies inside the map area, no proposal or published feature has a
`material` that did not come from a reviewer's read, and moving a map area vertex outside the
raster makes `extract`, `tile` and `publish` refuse. *(req 8.7, 16.2, 16.3, 17.3)*

**U1. Published files validate.** For every generated set of proposals, decisions and alignment
record, `publish` either writes a file that passes the Validator or writes nothing.

**U2. Only accepted proposals are published.** For every decisions file, the new features are
exactly the accepted, not-yet-published proposals with `confirmed_by` and `confirmed_at`.

**U3. Idempotence.** Publishing the same inputs twice gives a byte-identical evidence file.

**U4. Ids are never reused.** For every existing evidence file (including rejected and merged
features) and new decisions: existing features are unchanged, and every new sequence number is
greater than every existing one.

**U5. Error floor.** Every published feature has
`position_error_m >= ceil_0.1(sqrt(alignment_error_m² + digitising_error_m²))`,
`digitising_error_m >= max(1.0, 2 × source_pixel_size_m)`, and `position_error_m` is never below a
value the reviewer entered.

**U6. Coverage is kept.** For every sequence of publish runs, every reviewed area written by an
earlier run is still present and unchanged after a later run, and `mapped_area` is set whenever
`reviewed_areas` is non-empty.

**R1. Present layers are clipped, whole and in metres.** For every generated layer (features in
EPSG:4326 and in another projected CRS, some inside, some outside, some crossing the bounds): every
written feature intersects the project bounds; every feature that intersects the bounds is written;
every written geometry equals the reprojection of its source geometry to EPSG:26917 within 0.001 m
(no cutting); and ids are unique and sorted.

**R2. Present layers never change under an id.** For every existing layer and a `--recheck` that
yields different content, the file on disk is byte-identical afterwards and the command exits
non-zero. With identical content it exits zero.

**M1. A match needs one clear, mutual winner.** For every generated pair of plates with published
buildings: a `match_auto` presence on F from plate P exists only if exactly one building G on P has
`r >= MATCH_MIN`, no other has `r >= COMPETE_MIN`, the same holds from G's side, and F and G are
linked both ways.

**M2. Absence only inside reviewed areas and with an empty core.** For every `match_auto` clear
absence on F from plate P: `grow(F, e_abs)` lies inside P's reviewed areas and no published building
on P intersects `shrink(F, e_abs)`. Removing P's reviewed areas removes every such absence.

**M3. Code never reads a photograph.** For every run, no `match_auto` observation from an
`aerial_photograph` source has visibility other than `not_covered`.

**M4. Person decisions are never overridden.** For every evidence state and decisions file, every
`person` observation and link present before the run is present and unchanged after it, and no
`match_auto` observation exists for a feature and source that has a `person` one.

**M5. Idempotence and order independence.** For every input, running `match` twice gives
byte-identical files, and permuting features within files, or the order of files, gives the same
output.

**M6. Linked sets stay one per origin source.** For every run, no linked set in the output contains
two features with the same origin source, and every candidate link that would have caused one is
in the review list.

**M7. Only observations and links change.** For every run, every feature's id, geometry,
attributes, confidence, provenance and status are unchanged.

**F1. Fetch is idempotent and contained.** For every sequence of fetch runs against a fake HTTP
client serving fixture zips: the second run makes no requests, manifest SHA-256 values match the
bytes on disk, and no file is written outside `data/raw/`. Zips with escaping entries are always
refused.

## Testing strategy

- Unit tests for each pure module, property tests above, and one end-to-end test per command on a
  synthetic GeoTIFF fixture (a few hundred pixels, written by a test helper into a temp dir with a
  known transform in EPSG:26917 and one in EPSG:3857 to exercise reprojection). Plates that are
  JPEGs are tested with a synthetic JPEG plus world file, PAM sidecar and `.prj` written by the
  same helper, in each combination in requirement 14.1.
- `present` is tested with a fake CKAN response and a small synthetic GPKG written by a test helper
  (a few points and polygons in EPSG:4326, some outside the bounds).
- `match` is tested on synthetic evidence files: rectangles on two fake plates with known overlaps,
  a reviewed area, and one fake aerial footprint. No real building is described.
- No test reads `data/raw/` or uses the network.
- The held-out guard and fixture regression tests run in the normal `uv run pytest`.
