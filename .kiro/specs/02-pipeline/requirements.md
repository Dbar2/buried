# Requirements: 02 Pipeline

## Introduction

The pipeline is a Python 3.12 package, `buried_pipeline`, in `pipeline/`, managed with `uv`, with
one CLI entry point, `buried`. It fetches the showcase plates and 1947 aerials, reads their
georeferencing, clips the present-day City of Toronto layers to the showcase area, measures the
rasters' real alignment error against present-day control points, writes web- and Unity-ready
rasters, proposes building footprints by deterministic image processing, publishes footprints a
person has accepted as evidence files that pass spec 01's Validator, and matches published
buildings across sources.

Commands run in this order: `fetch`, `inspect`, `present`, `align-check`, `tile`, `extract`,
`publish`, `match`. `fetch`, `inspect`, `present` (intersections layer only) and `align-check` are
the Nov 14 go/no-go gate: align one plate and report its error in metres.

Rules come from `.kiro/steering/` (`tech.md`, `structure.md`, `sources.md`, `evidence.md`,
`product.md`). Contract file shapes are defined in spec 01.

## Glossary

- **Pipeline**: the `buried_pipeline` package and its `buried` CLI.
- **Showcase plates**: `fip_v3_1911_229`, `fip_v3_1911_232`, `fip_v3_1935_229`, `fip_v3_1935_232`.
- **Held-out plate**: `fip_v3_1935_232`.
- **Tuning plates**: `fip_v3_1911_229` and `fip_v3_1935_229`, the only plates extraction may be
  tuned on.
- **Registry**: `data/sources.json` (spec 01).
- **Supplied georeferencing**: the transform and CRS that come with a raster (GeoTIFF tags, a PAM
  `.aux.xml` sidecar, or a world file plus a CRS; requirement 14). It is not a measurement of error.
- **Control file**: `data/control/<source id>.json`, pixel positions on a raster paired with
  present-day EPSG:26917 coordinates of the same physical points, each citing the present-day
  feature it came from.
- **Reference source**: the registered present layer a control point's coordinate was read from:
  `present_toronto_intersections_2026` (street centreline intersections) or
  `present_toronto_building_outlines_2026` (corners of buildings that still stand).
- **Present layer**: `data/present/<source id>.geojson`, a City of Toronto layer clipped to the
  project bounds and reprojected to EPSG:26917 (spec 01 `presentLayer`).
- **Project bounds**: the rectangle in spec 01 requirement 7.6, read from `data/project.json`, or
  computed from the inspect reports by the same rule when that file does not exist yet.
- **Out-of-sample RMSE (B)**: the chosen transform's RMSE at points it was not fitted to: the
  supplied RMSE when the supplied georeferencing is chosen, the leave-one-out RMSE when the refined
  affine is chosen.
- **Mapped area, reviewed area**: spec 01 requirement 19.
- **Linked set**: spec 01 glossary.
- **Match review list**: `data/work/match/review.json`, the cases `match` would not decide.
- **Match decisions file**: `data/work/review/match.json`, a person's decisions on those cases.
- **Alignment record**: `data/alignment/<source id>.json`, the output of `align-check`.
- **Chosen transform**: the transform an alignment record selects (`supplied` or `refined`). Tile,
  extract and publish all use it.
- **Proposal**: a candidate footprint written by `extract` to `data/work/proposals/`.
- **Decisions file**: `data/work/review/<source id>.json`, a person's accept or reject for each
  proposal, with name and time.

## Requirement 1: Package and CLI

**User story:** As the maintainer, I want one installable package with one CLI, so that every
pipeline step runs the same way from the terminal and from Kiro CLI.

### Acceptance criteria

1.1 THE Pipeline SHALL target Python 3.12, be defined by `pipeline/pyproject.toml` with a committed
`pipeline/uv.lock`, live in `pipeline/buried_pipeline/`, and expose the console script `buried`.

1.2 THE Pipeline SHALL provide the subcommands `fetch`, `inspect`, `present`, `align-check`,
`tile`, `extract`, `publish`, `match` and (from spec 01) `validate`.

1.3 THE Pipeline SHALL find the repository root as the nearest ancestor directory of the working
directory that contains `.kiro/`, and SHALL accept `--root PATH` to override it.

1.4 THE Pipeline SHALL keep transform, residual, polygon and scoring maths in modules that perform
no file or network I/O.

1.5 THE Pipeline SHALL NOT call any language or vision model, and SHALL compute all geometry,
coordinates and dates in code.

1.6 WHEN a command fails, THE Pipeline SHALL print what failed and why, exit with a non-zero
status, and leave no partly written output file (writes go to a temporary file in the same
directory and are renamed into place).

1.7 THE Pipeline's tests SHALL NOT use the network; network access SHALL go through one HTTP client
interface that tests replace with a fake.

1.8 WHEN a task adds a command, THE same change SHALL record it under "Commands" in
`.kiro/steering/tech.md` (environment setup, CLI, tests).

## Requirement 2: Fetch the showcase plates

**User story:** As the maintainer, I want the four showcase plates downloaded once, with proof of
what was downloaded and when.

### Acceptance criteria

2.1 WHEN `buried fetch` runs with no arguments, THE Pipeline SHALL download every registered
source of type `fire_insurance_plan` and every registered `aerial_photograph` source; WHEN given
source ids, it SHALL download only those.

2.2 THE Pipeline SHALL download only sources present in the Registry, and SHALL refuse a fire
insurance plan URL that does not match one of the two download patterns in `sources.md`.

2.3 IF a source's `rights_checked_on` is null, THEN THE Pipeline SHALL refuse to download it and
SHALL tell the user to check the item's rights statement and record the date in the Registry.

2.4 THE Pipeline SHALL save each download under `data/raw/<source id>/`, extract the zip there,
and refuse any zip entry with an absolute path or a `..` component.

2.5 THE Pipeline SHALL record, per source, the URL, retrieval time (RFC 3339), size in bytes and
SHA-256 of the zip, and the path, size and SHA-256 of each extracted file, in
`data/raw/manifest.json`.

2.6 WHEN a source's files already exist and match the manifest's SHA-256 values, THE Pipeline SHALL
skip it without any network request.

2.7 IF a source's files exist but do not match the manifest, THEN THE Pipeline SHALL stop with an
error naming the files and SHALL NOT overwrite them.

2.8 THE Pipeline SHALL make one request at a time and SHALL send a User-Agent that names Buried.

## Requirement 3: Find and fetch the 1947 aerials that cover the plates

**User story:** As the maintainer, I want only the aerial photos that cover the showcase plates,
so that no collection is mirrored.

### Acceptance criteria

3.1 WHEN `buried fetch --aerial-candidates` runs, THE Pipeline SHALL query the
`Toronto_Aerial_Photographs_1947_Index` service for records whose footprints intersect the union of
the showcase plates' EPSG:26917 bounds (from `inspect`), and SHALL write the matches to
`data/work/aerial_candidates.json` with record id, proposed source id `aerial_1947_<id lowercased>`,
`zip_url` and footprint bounds. It SHALL download no imagery in this step.

3.2 IF the query returns more than 10 records, THEN THE Pipeline SHALL stop with an error and write
no candidates file.

3.3 THE Pipeline SHALL download an aerial only after its source id is in the Registry, which
requires a row in `sources.md` first.

3.4 THE Pipeline SHALL query the feature layer
`https://services1.arcgis.com/9NvE8jKNWWlDGsUJ/arcgis/rest/services/Toronto_Aerial_Photographs_1947_Index/FeatureServer/0`,
take the record id from the `Name` field and the download from `zip_url`, and SHALL also store
`url` and `thumbnail_url` in the candidates file.

## Requirement 4: Inspect georeferencing

**User story:** As the maintainer, I want to see exactly what georeferencing each raster arrived
with, and to be stopped if there is none.

### Acceptance criteria

4.1 WHEN `buried inspect [SOURCE_ID ...]` runs, THE Pipeline SHALL report for each raster: file,
width and height in pixels, band count, CRS, where the georeferencing came from (requirement 14),
pixel size in metres, rotation terms, the four corner coordinates and the bounds in EPSG:26917.

4.2 THE Pipeline SHALL compute pixel size in metres by transforming unit pixel steps at the raster
centre into EPSG:26917, not by reading the transform's units.

4.3 IF a raster has no transform, an identity transform, or no CRS, THEN THE Pipeline SHALL exit
with a non-zero status and the message "No georeferencing: <file>".

4.4 IF a raster holds more than one georeferencing (requirement 14.1) and their corner positions
differ by more than one pixel, THEN THE Pipeline SHALL warn and state which one it used.

4.5 THE Pipeline SHALL write each report to `data/work/inspect/<source id>.json` and print a
summary table.

4.6 WHEN `--propose-origin` is given, THE Pipeline SHALL print the project origin derived by the
rule in spec 01 requirement 7.2 and the bounds rule in spec 01's design, and SHALL NOT write
`data/project.json`.

## Requirement 5: Control points

**User story:** As the maintainer, I want to record matching points on a plate and on today's
ground once, so that alignment can be measured and remeasured.

### Acceptance criteria

5.1 THE control file SHALL follow spec 01's `controlPoints` definition: source id, the
`gdal_corner` pixel convention, and points each with id, description, pixel `[x, y]`, reference
`[easting, northing]` in EPSG:26917, `reference_source`, `reference_kind`,
`reference_feature_id` and, for building corners, `reference_vertex`.

5.2 IF a control point's reference source is not in the Registry or has no present layer, or its
`reference_feature_id` is not in that layer, or its `reference` is more than 0.001 m from the
cited intersection point or building vertex, THEN `align-check` SHALL refuse to run and name the
point.

5.3 THE control file SHALL describe each point by the physical feature it marks (for example a
street-line intersection), not by what stood nearby.

5.4 A control point SHALL be either the crossing of two street centrelines as drawn on the plate,
paired with that intersection in the intersections layer, or a corner of a building that still
stands, paired with a vertex of that building in the building outlines layer. For a building
corner, the description SHALL say why the person judges it to be the same building.

## Requirement 6: Align-check

**User story:** As the maintainer, I want the real alignment error of a plate in metres, so that
every feature from it carries an honest position error.

### Acceptance criteria

6.1 WHEN `buried align-check <SOURCE_ID>` runs, THE Pipeline SHALL map each control point's pixel
position through the supplied georeferencing into EPSG:26917 and report, per point, the residual
east, north and magnitude in metres, and the RMSE and maximum residual in metres.

6.2 IF the control file has fewer than 3 points, THEN THE Pipeline SHALL exit with an error and
write no alignment record.

6.3 WHEN the control file has 4 or more points, THE Pipeline SHALL also fit a refined affine
transform from pixel to EPSG:26917 by least squares, and report its in-sample residuals, in-sample
RMSE, leave-one-out RMSE and maximum residual.

6.4 IF the control points are too close to collinear for a stable affine fit (as defined in the
design), THEN THE Pipeline SHALL skip the refined fit and say why.

6.5 THE Pipeline SHALL choose the refined transform only when its leave-one-out RMSE is lower than
the supplied RMSE; otherwise it SHALL choose the supplied georeferencing.

6.6 THE Pipeline SHALL set `alignment_error_m` to `max(2.0, 2 × B)` metres, rounded up to the next
0.1 m, where B is the chosen transform's out-of-sample RMSE: the supplied RMSE when the supplied
georeferencing is chosen, or the refined leave-one-out RMSE when the refined affine is chosen.

6.7 THE Pipeline SHALL flag as possible outliers any point whose residual is more than 3 times the
median residual, and SHALL NOT drop any point by itself.

6.8 THE Pipeline SHALL write the alignment record to `data/alignment/<source id>.json` with the
SHA-256 of the control file, the measurement time and the package version, so the result can be
recomputed.

6.9 THE transform fitting, application, inversion and residual functions SHALL be pure functions.

6.10 THE alignment record SHALL store the supplied RMSE, the refined in-sample and leave-one-out
RMSE (when a refined fit exists), the basis used (`error_basis`, `error_basis_m`), the rule
constants (`error_rule`) and the source pixel size in metres, so `alignment_error_m` can be
recomputed from the record alone.

6.11 THE printed summary SHALL show the raw RMSE values and the published `alignment_error_m`
on separate lines, labelled so that the published figure is not mistaken for an RMSE.

## Requirement 7: Tile

**User story:** As the shell and Unity, I want each plate and aerial as a light image with exact
corner coordinates.

### Acceptance criteria

7.1 WHEN `buried tile [SOURCE_ID ...]` runs, THE Pipeline SHALL write `data/tiles/<source id>.jpg`
and `data/tiles/<source id>.json` (spec 01 `tileSidecar`) for each source.

7.2 IF a source has no alignment record, or its `attribution_status` is `to_be_confirmed`, THEN THE
Pipeline SHALL refuse to tile it.

7.3 THE Pipeline SHALL downsample with area averaging so the long edge is at most 4096 pixels, write
JPEG at quality 85, and SHALL NOT tint, sharpen, colour-correct or crop the image.

7.4 THE Pipeline SHALL compute the four corners by applying the chosen transform to the
full-resolution raster's pixel corners.

7.5 IF bilinear interpolation between the four corners differs from the chosen transform by more
than 0.01 m at any of nine check points (corners, edge midpoints, centre), THEN THE Pipeline SHALL
fail for that source.

7.6 THE Pipeline SHALL tile only registered showcase sources.

## Requirement 8: Extract footprint proposals

**User story:** As a reviewer, I want candidate footprints proposed from a plate by repeatable image
processing, so that I only have to confirm or fix them.

### Acceptance criteria

8.1 WHEN `buried extract <SOURCE_ID>` runs, THE Pipeline SHALL propose building footprints using
deterministic image processing only: colour classification against the material classes of the
plate legend, black outline detection and closing, region labelling, contour tracing and polygon
simplification.

8.2 THE Pipeline SHALL write proposals to `data/work/proposals/<source id>.geojson` in EPSG:26917,
each with a proposal id, material class (or `unclassified`), pixel polygon, pixel crop rectangle,
area in square metres, quality score with its components, parameter set id, and the SHA-256 of the
alignment record used.

8.3 THE Pipeline SHALL produce byte-identical output for the same raster, parameter set and
alignment record.

8.4 THE Pipeline SHALL read all thresholds from one versioned parameter set file and SHALL NOT
contain plate-specific thresholds.

8.5 IF the source has no alignment record, THEN THE Pipeline SHALL refuse to extract.

8.6 THE Pipeline SHALL NOT read labels, storey counts, uses or addresses in this step.

8.7 THE Pipeline SHALL write the plate's neatline to the proposal file header as a pixel polygon
and as an EPSG:26917 polygon through the chosen transform, or `neatline: "not_found"`.

## Requirement 9: Held-out plate

**User story:** As a judge watching the demo, I want the live plate to be one the extractor was
never tuned on.

### Acceptance criteria

9.1 THE parameter set SHALL list the plates it was tuned on in `tuned_on`, and that list SHALL be a
subset of the tuning plates (`fip_v3_1911_229`, `fip_v3_1935_229`).

9.2 Every extraction tuning fixture SHALL carry a metadata file naming its source, and that source
SHALL be a tuning plate.

9.3 A test SHALL fail if any parameter set or extraction tuning fixture names `fip_v3_1935_232`,
contains the strings `1935_232` or `1935-232` in its path or content, or names a source outside the
tuning plates.

9.4 THE Pipeline SHALL allow `extract` and `publish` to run on the held-out plate, since it is
processed live in the demo.

## Requirement 10: Publish

**User story:** As a reviewer, I want the footprints I accepted written as evidence with full
provenance, and nothing I did not accept.

### Acceptance criteria

10.1 WHEN `buried publish <SOURCE_ID>` runs, THE Pipeline SHALL read the proposals file, the
decisions file, the Registry and the alignment record, and SHALL write
`data/evidence/<source id>.geojson`.

10.2 THE Pipeline SHALL publish only proposals with an `accept` decision that has a non-empty
`confirmed_by` and a `confirmed_at` time, and SHALL never publish a rejected or undecided proposal.

10.3 IF the alignment record's SHA-256 differs from the one stored on a proposal, THEN THE Pipeline
SHALL refuse to publish that source and tell the user to run `extract` again.

10.4 THE Pipeline SHALL set each feature's `provenance.digitising_error_m` to
`max(1.0, 2 × source pixel size)` metres, and its `position_error_m` to the root-sum-square of the
alignment record's `alignment_error_m` and that digitising term, rounded up to the next 0.1 m, or to
a larger value the reviewer entered, never smaller.

10.5 THE Pipeline SHALL set confidence to `estimated` with a stated reason unless the decision
gives a confidence and reason; IF a decision asks for `documented` without storeys, THEN THE
Pipeline SHALL refuse it.

10.6 THE Pipeline SHALL give each new feature the id `bld_<source id>_<NNNN>` where NNNN is one more
than the highest sequence already in the file in any status, and SHALL NOT change or renumber
existing features.

10.7 WHEN a proposal id is already recorded in the evidence file's provenance, THE Pipeline SHALL
skip it, so running publish twice gives the same file.

10.8 THE Pipeline SHALL run spec 01's Validator on the result before writing it, and IF validation
fails, THEN THE Pipeline SHALL write nothing and print the errors.

10.9 IF the source is not registered or its `attribution_status` is `to_be_confirmed`, THEN THE
Pipeline SHALL refuse to publish.

10.10 THE Pipeline SHALL write the evidence file's `mapped_area` from the proposal file's neatline,
or from the raster footprint under the chosen transform when the neatline was not found, and SHALL
add each reviewed area in the decisions file (pixel polygon, `confirmed_by`, `confirmed_at`)
through the chosen transform. It SHALL never remove or change an existing reviewed area.

10.11 THE Pipeline SHALL write every new feature's origin observation with `method: origin`.

## Requirement 11: The Nov 14 alignment gate

**User story:** As the maintainer, I want to know by Nov 14 whether a plate can be aligned well
enough to inspect real features.

### Acceptance criteria

11.1 Tasks 1, 2, 10.1 to 10.4 and 3 in `tasks.md`, run in that order, SHALL be enough, with no
other task, to fetch and inspect the four showcase plates, clip the intersections layer, and run
`align-check` on one tuning plate with a control file of at least 4 points.

11.2 WHEN the gate is run, THE Pipeline SHALL print the per-point residuals, the supplied RMSE, the
refined leave-one-out RMSE, the chosen transform and `alignment_error_m`, all in metres, and SHALL
write the alignment record.

11.3 Tasks 1, 2, 10.1 to 10.4 and 3 SHALL NOT depend on any task in spec 01.

## Requirement 12: Present-day layers

**User story:** As the maintainer, I want small, reproducible copies of the City of Toronto layers
for the showcase area, so that control points, lots, search and today's buildings all use the same
coordinates and nothing citywide is committed.

### Acceptance criteria

12.1 WHEN `buried present [SOURCE_ID ...]` runs, THE Pipeline SHALL process every registered
`present_day_reference` source, or only those given, by calling the CKAN `package_show` action on
`https://ckan0.cf.opendata.inter.prod-toronto.ca` for the package id named in the design.

12.2 THE Pipeline SHALL select the package's GPKG resource; IF the package has none, or more than
one and the design does not name which, THEN THE Pipeline SHALL stop and list the resources.

12.3 THE Pipeline SHALL download the resource to `data/raw/present/<source id>/` and record its URL,
retrieval time, size and SHA-256 in `data/raw/manifest.json`, with the same streaming, temporary
file and one-request-at-a-time rules as `fetch`.

12.4 IF the Registry's `year_from` for the source is not the year of the package's last refresh as
the CKAN metadata states it, or its `year_to` is not the retrieval year, THEN THE Pipeline SHALL
stop and say which value to record, and SHALL write no present layer.

12.5 THE Pipeline SHALL keep every feature whose geometry intersects the project bounds, SHALL NOT
cut any geometry, and SHALL reproject kept features to EPSG:26917 with pyproj from the CRS the file
declares; IF the file declares no CRS, THEN THE Pipeline SHALL stop.

12.6 THE Pipeline SHALL write `data/present/<source id>.geojson` (spec 01 `presentLayer`) keeping
only the dataset's id field and the fields listed for that dataset in the design, with the CKAN
package and resource ids, resource URL, retrieval time, last refresh date, SHA-256 of the
download, clip bounds and attribution line.

12.7 IF the output would hold more than 20000 features or exceed 5 MB, THEN THE Pipeline SHALL
stop and write nothing.

12.8 WHEN `data/present/<source id>.geojson` already exists, THE Pipeline SHALL report it as up to
date and make no request; WHEN `--recheck` is given, it SHALL download again and compare, and IF the
new output differs, THEN it SHALL stop without overwriting and say that a new source id is needed.

12.9 THE Pipeline SHALL use the project bounds from `data/project.json` when it exists, and
otherwise compute them from the showcase plates' inspect reports by the same rule, so the
intersections layer can be clipped before `data/project.json` exists.

12.10 THE Pipeline SHALL refuse to clip if any showcase plate has no inspect report and
`data/project.json` does not exist.

## Requirement 13: Match published buildings across sources

**User story:** As a viewer, I want a building that the 1911 plate shows to learn from the 1935
plate and the 1947 aerial whether it was still there, without code ever guessing.

### Acceptance criteria

13.1 WHEN `buried match` runs, THE Pipeline SHALL consider every published building in every
evidence file against every other registered fire insurance plan that has an evidence file, and
every registered 1947 aerial that has an alignment record.

13.2 THE Pipeline SHALL compare a building F with a published building G on another plate using
`e = F.position_error_m + G.position_error_m` and the overlap score
`r = area(shrink(S, e) ∩ L) / area(shrink(S, e))`, where S is the smaller of F and G by area, L is
the larger, and `shrink` is an inward buffer. G is a candidate when it lies within `e` of F.

13.3 WHEN exactly one candidate G has `r ≥ MATCH_MIN` and no other candidate has
`r ≥ COMPETE_MIN`, the same holds from G's side (F is G's only strong candidate on F's plate), and
F grown by `e` lies inside the other plate's mapped area, THE Pipeline SHALL write on F an
observation from G's origin source with `present: true`, `visibility: clear`,
`method: match_auto` and `matched_feature: G`, write the mirror observation on G, and link F and G
with `same_as` (`method: match_auto`) on both.

13.4 WHEN F grown by `e_abs` lies inside a reviewed area of the other plate, F shrunk inward by
`e_abs` is not empty, and no published building on that plate intersects F shrunk inward by
`e_abs`, THE Pipeline SHALL write on F an observation from that plate with `present: false`,
`visibility: clear`, `method: match_auto`. Here `e_abs` is F's position error plus the smallest
position error a feature on the other plate can have (the root-sum-square of its alignment error
and its digitising term, rounded up to 0.1 m).

13.5 WHEN F does not intersect the other plate's mapped area, THE Pipeline SHALL write an
observation with `present: false`, `visibility: not_covered`, `method: match_auto`.

13.6 IN every other case (partial overlap, competing candidates, an empty shrunk footprint, a spot
on the plate outside its reviewed areas, or a link that would put two features with the same
origin source in one linked set), THE Pipeline SHALL write no observation and no link for that
pair, and SHALL add the case with its reason and scores to the match review list.

13.7 FOR a 1947 aerial, WHEN F does not intersect the photo's footprint under its chosen transform,
THE Pipeline SHALL write `not_covered` with `method: match_auto`; otherwise it SHALL write nothing
and add a pending item to the match review list naming the feature to show the reviewer: the
member of F's linked set whose origin source has the greatest `year_to`.

13.8 THE Pipeline SHALL NOT write an aerial observation with visibility `clear` or `obscured`
except from a person's decision.

13.9 WHEN the match decisions file exists, THE Pipeline SHALL apply each decision: `link` (add
`same_as` on both features and presences on both, `method: person`), `no_link` (stop proposing that
pair), and `observation` (set present and visibility for one feature and one source,
`method: person`). Each decision SHALL carry `confirmed_by` and `confirmed_at`, or be refused.

13.10 THE Pipeline SHALL NOT change or remove any `person` observation or link, and SHALL NOT write
a `match_auto` result for a feature and source that already has a `person` observation.

13.11 WHEN `buried match` runs again, THE Pipeline SHALL remove every `match_auto` observation and
link and recompute them, so that the same inputs give byte-identical evidence files.

13.12 THE Pipeline SHALL validate the whole would-be `data/` state with spec 01's Validator before
writing, and IF validation fails, THEN it SHALL write nothing and print the errors.

13.13 THE thresholds `MATCH_MIN` and `COMPETE_MIN` SHALL be defined once, in the design, and SHALL
NOT vary by plate.

13.14 THE Pipeline SHALL print counts per source pair: matched, absent, not covered, sent to review,
pending aerial checks; and SHALL write the match review list.

## Requirement 14: Plates as TIFF or JPEG, and the control points they ship with

**User story:** As the maintainer, I want every command that opens a plate to accept the formats
U of T actually publishes, so that the 1935 JPEG plates work as well as the 1911 GeoTIFFs.

The real plates (fetched 2026-11-13) are two kinds. The 1911 plates are GeoTIFFs with tags and a
`.tfw`. The 1935 plates are JPEGs with a world file (`.jgw`), an ESRI PAM sidecar
(`<name>.jpg.aux.xml`, holding the SRS and a GeoTransform) and an overview file (`.jpg.ovr`). Every
zip also holds a `.txt` of U of T's own ground control points.

### Acceptance criteria

14.1 THE Pipeline SHALL take a raster's georeferencing from the first of these that holds both a
transform and a CRS: (1) GeoTIFF tags; (2) a PAM `.aux.xml` sidecar named after the raster file;
(3) a world file, with its CRS from a `.prj` file named after the raster or, failing that, from the
PAM sidecar's SRS. It SHALL NOT pair a transform with a CRS from any other place.

14.2 THE Pipeline SHALL accept a TIFF (`.tif`, `.tiff`) or a JPEG (`.jpg`, `.jpeg`) as the raster of
a source, and SHALL ignore overview (`.ovr`) and thumbnail files when choosing it. A JPEG has no
GeoTIFF tags, so for a JPEG the order starts at the PAM sidecar.

14.3 THE Pipeline SHALL record in each inspect report which source gave the transform
(`georef_source`: `geotiff_tags`, `pam_aux_xml` or `world_file`) and which gave the CRS
(`crs_source`: `geotiff_tags`, `pam_aux_xml`, `prj_file` or `pam_srs`).

14.4 IF a raster has a transform but no CRS in any of those places, THEN THE Pipeline SHALL exit
with a non-zero status and a message that starts "No georeferencing: <file>" and says which
transform was found and that the CRS is missing. An identity transform counts as no transform.

14.5 IF the georeferencings a raster holds disagree at the pixel corners by more than one pixel,
THEN THE Pipeline SHALL warn once per disagreeing source and state which one it used.

14.6 WHEN a `.txt` named after the raster is present, THE Pipeline SHALL record its lines in the
inspect report as `supplied_control_points`: file, count, the four columns
(`source_x`, `source_y`, `map_easting`, `map_northing`), the points as written, `map_crs`, and
`independent: false` with a note that they are the points the supplied georeferencing was fitted
to. THE Pipeline SHALL NOT use them for `align-check` or for any error figure.

14.7 IF that `.txt` cannot be parsed, THEN THE Pipeline SHALL name the file and line in a warning
in the report's notes, set `supplied_control_points` to null, and carry on, since the file is
provenance only.

14.8 `align-check`, `control-crops` and every later command that opens a plate SHALL find and read
the raster through the same functions as `inspect`.
