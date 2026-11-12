# Requirements: 02 Pipeline

## Introduction

The pipeline is a Python 3.12 package, `buried_pipeline`, in `pipeline/`, managed with `uv`, with
one CLI entry point, `buried`. It fetches the showcase plates and 1947 aerials, reads their
georeferencing, measures their real alignment error against present-day control points, writes
web- and Unity-ready rasters, proposes building footprints by deterministic image processing, and
publishes footprints a person has accepted as evidence files that pass spec 01's Validator.

Commands run in this order: `fetch`, `inspect`, `align-check`, `tile`, `extract`, `publish`.
The first three are the Nov 14 go/no-go gate: align one plate and report its error in metres.

Rules come from `.kiro/steering/` (`tech.md`, `structure.md`, `sources.md`, `evidence.md`,
`product.md`). Contract file shapes are defined in spec 01.

## Glossary

- **Pipeline**: the `buried_pipeline` package and its `buried` CLI.
- **Showcase plates**: `fip_v3_1911_229`, `fip_v3_1911_232`, `fip_v3_1935_229`, `fip_v3_1935_232`.
- **Held-out plate**: `fip_v3_1935_232`.
- **Tuning plates**: `fip_v3_1911_229` and `fip_v3_1935_229`, the only plates extraction may be
  tuned on.
- **Registry**: `data/sources.json` (spec 01).
- **Supplied georeferencing**: the transform and CRS that come with a raster (GeoTIFF tags or a
  world file plus projection file). It is not a measurement of error.
- **Control file**: `data/control/<source id>.json`, pixel positions on a raster paired with
  present-day EPSG:26917 coordinates of the same physical points.
- **Reference source**: the registered source the present-day coordinates in a control file were
  read from.
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

1.2 THE Pipeline SHALL provide the subcommands `fetch`, `inspect`, `align-check`, `tile`,
`extract`, `publish` and (from spec 01) `validate`.

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

## Requirement 4: Inspect georeferencing

**User story:** As the maintainer, I want to see exactly what georeferencing each raster arrived
with, and to be stopped if there is none.

### Acceptance criteria

4.1 WHEN `buried inspect [SOURCE_ID ...]` runs, THE Pipeline SHALL report for each raster: file,
width and height in pixels, band count, CRS, where the georeferencing came from (GeoTIFF tags or
world file), pixel size in metres, rotation terms, the four corner coordinates and the bounds in
EPSG:26917.

4.2 THE Pipeline SHALL compute pixel size in metres by transforming unit pixel steps at the raster
centre into EPSG:26917, not by reading the transform's units.

4.3 IF a raster has no transform, an identity transform, or no CRS, THEN THE Pipeline SHALL exit
with a non-zero status and the message "No georeferencing: <file>".

4.4 IF a raster has both GeoTIFF tags and a world file and their corner positions differ by more
than one pixel, THEN THE Pipeline SHALL warn and state which one GDAL used.

4.5 THE Pipeline SHALL write each report to `data/work/inspect/<source id>.json` and print a
summary table.

4.6 WHEN `--propose-origin` is given, THE Pipeline SHALL print the project origin derived by the
rule in spec 01 requirement 7.2 and the bounds rule in spec 01's design, and SHALL NOT write
`data/project.json`.

## Requirement 5: Control points

**User story:** As the maintainer, I want to record matching points on a plate and on today's
ground once, so that alignment can be measured and remeasured.

### Acceptance criteria

5.1 THE control file SHALL follow spec 01's `controlPoints` definition: source id, reference source
id, the `gdal_corner` pixel convention, and points each with id, description, pixel `[x, y]` and
reference `[easting, northing]` in EPSG:26917.

5.2 IF the control file's reference source is not in the Registry, THEN `align-check` SHALL refuse
to run, because the coordinates in the file are data from that source.

5.3 THE control file SHALL describe each point by the physical feature it marks (for example a
street-line intersection), not by what stood nearby.

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

6.6 THE Pipeline SHALL set `alignment_error_m` to the supplied RMSE or the refined leave-one-out
RMSE, matching the chosen transform, rounded up to the next 0.01 m.

6.7 THE Pipeline SHALL flag as possible outliers any point whose residual is more than 3 times the
median residual, and SHALL NOT drop any point by itself.

6.8 THE Pipeline SHALL write the alignment record to `data/alignment/<source id>.json` with the
SHA-256 of the control file, the measurement time and the package version, so the result can be
recomputed.

6.9 THE transform fitting, application, inversion and residual functions SHALL be pure functions.

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

10.4 THE Pipeline SHALL set each feature's `position_error_m` to the alignment record's
`alignment_error_m`, or to a larger value the reviewer entered, never smaller.

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

## Requirement 11: The Nov 14 alignment gate

**User story:** As the maintainer, I want to know by Nov 14 whether a plate can be aligned well
enough to inspect real features.

### Acceptance criteria

11.1 Tasks 1, 2 and 3 in `tasks.md` SHALL be enough, with no other task, to fetch one plate,
inspect its georeferencing, and run `align-check` on it with a control file of at least 4 points.

11.2 WHEN the gate is run, THE Pipeline SHALL print the per-point residuals, the supplied RMSE, the
refined leave-one-out RMSE, the chosen transform and `alignment_error_m`, all in metres, and SHALL
write the alignment record.

11.3 Tasks 1, 2 and 3 SHALL NOT depend on any task in spec 01.
