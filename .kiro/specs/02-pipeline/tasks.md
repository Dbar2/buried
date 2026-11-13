# Tasks: 02 Pipeline

Property-based test tasks are marked **[PBT]** and name the correctness property from `design.md`.
A task is done only when its tests pass. Do not weaken a property to make it pass.

**Gate (due Nov 14): tasks 1, 2, 10.1 to 10.4 and 3, in that order, fetch one plate, inspect it,
clip the intersections layer, and report the plate's alignment error in metres.** They do not
depend on spec 01. Use `fip_v3_1911_229` or `fip_v3_1935_229` for the gate, not the held-out plate.

Task numbers are stable, so the run order is not numeric:
1, 2, 10.1 to 10.4 (present layers, intersections first), 3, 4, 5, 10.5, 6, 15, 14 (needs spec 01
task 16), 7, 8, 16, 11, 9.

- [x] 1. Create the package and fetch the showcase plates
  - [x] 1.1 Create the uv project: Python 3.12, package `buried_pipeline`, console script `buried`,
    dependencies and dev dependencies from design.md, `argparse` CLI with the nine subcommands
    registered (unimplemented ones exit 2 with "not implemented yet"), repo root discovery and
    `--root`.
    Files: `pipeline/pyproject.toml`, `pipeline/uv.lock`, `pipeline/.python-version`,
    `pipeline/buried_pipeline/__init__.py`, `pipeline/buried_pipeline/cli.py`,
    `pipeline/buried_pipeline/paths.py`, `pipeline/tests/test_cli.py`.
    Requirements: 1.1, 1.2, 1.3.
  - [x] 1.2 Add `.gitignore` entries for `data/raw/` and `data/work/` if missing, and the atomic
    write helper.
    Files: `.gitignore`, `pipeline/buried_pipeline/io/atomic.py`, `pipeline/tests/io/test_atomic.py`.
    Requirements: 1.6.
  - [x] 1.3 If `data/sources.json` does not exist, create it with the four showcase plates exactly
    as in spec 01 design "source and sourceRegistry", with `rights_checked_on: 2026-11-10` (checked
    in the Nov 10 research session). Add the Registry reader.
    Files: `data/sources.json`, `pipeline/buried_pipeline/io/registry.py`,
    `pipeline/tests/io/test_registry.py`.
    Requirements: 2.2, 2.3.
  - [x] 1.4 Implement the HTTP client interface (real client with httpx, User-Agent naming Buried,
    one request at a time) and a fake for tests.
    Files: `pipeline/buried_pipeline/io/http.py`, `pipeline/tests/fakes.py`.
    Requirements: 1.7, 2.8.
  - [x] 1.5 Implement safe unzip, the manifest, and `buried fetch` for plates: URL guard,
    rights-date refusal, streamed download with SHA-256, skip when up to date, stop on mismatch.
    Files: `pipeline/buried_pipeline/fetch/__init__.py`, `pipeline/buried_pipeline/fetch/plates.py`,
    `pipeline/buried_pipeline/fetch/manifest.py`, `pipeline/buried_pipeline/fetch/zipsafe.py`,
    `pipeline/tests/fetch/test_plates.py`, `pipeline/tests/fetch/test_zipsafe.py`,
    `pipeline/tests/fixtures/fetch/*.zip`.
    Requirements: 2.1 to 2.8.
  - [x] 1.6 **[PBT] F1** Fetch is idempotent and contained; escaping zip entries are always
    refused.
    Files: `pipeline/tests/fetch/test_fetch_properties.py`.
    Requirements: 2.4, 2.6, 2.7.
  - [x] 1.7 Record the pipeline commands (`uv sync`, `uv run pytest`, `uv run ruff check .`,
    `uv run buried fetch`, all from `pipeline/`) in `.kiro/steering/tech.md`.
    Files: `.kiro/steering/tech.md`.
    Requirements: 1.8.

- [x] 2. Inspect georeferencing
  - [x] 2.1 Implement the pure report functions: corners, densified bounds, pixel size from unit
    steps, rotation terms, origin proposal, and `project_bounds` (union plus 250 m, rounded outward
    to 100 m).
    Files: `pipeline/buried_pipeline/inspect/__init__.py`,
    `pipeline/buried_pipeline/inspect/report.py`, `pipeline/tests/inspect/test_report.py`.
    Requirements: 1.4, 4.1, 4.2, 4.6.
  - [x] 2.2 Implement `buried inspect [SOURCE_ID ...] [--propose-origin]`: read with rasterio,
    detect tags vs world file, fail on missing georeferencing, warn on disagreement, write
    `data/work/inspect/<id>.json`, print the table. Test on synthetic GeoTIFFs written by a helper
    (EPSG:26917 and EPSG:3857, one with no georeferencing, one with tags and a disagreeing world
    file).
    Files: `pipeline/buried_pipeline/inspect/georef.py`, `pipeline/buried_pipeline/cli.py`,
    `pipeline/tests/helpers/rasters.py`, `pipeline/tests/inspect/test_georef.py`.
    Requirements: 4.1 to 4.6.
  - [x] 2.3 Record `uv run buried inspect` in `.kiro/steering/tech.md`.
    Files: `.kiro/steering/tech.md`.
    Requirements: 1.8.

- [x] 3. Measure alignment error (completes the gate)
  - [x] 3.1 Implement pure affine maths: fit by least squares, apply, invert, stability check
    (`s_min / s_max < 0.05`).
    Files: `pipeline/buried_pipeline/align/__init__.py`, `pipeline/buried_pipeline/align/affine.py`,
    `pipeline/tests/align/test_affine.py`.
    Requirements: 6.3, 6.4, 6.9.
  - [x] 3.2 Implement pure residual maths: residuals, RMSE, max, leave-one-out, outlier flags,
    choice rule, error basis and the published error rule (`ceil_0.1(max(2.0, 2 × B))`); and the
    supplied mapping (affine then pyproj to EPSG:26917).
    Files: `pipeline/buried_pipeline/align/residuals.py`, `pipeline/buried_pipeline/align/supplied.py`,
    `pipeline/tests/align/test_residuals.py`, `pipeline/tests/align/test_supplied.py`.
    Requirements: 6.1, 6.5, 6.6, 6.7, 6.9.
  - [x] 3.3 Implement `buried align-check <SOURCE_ID>`: read the control file (shape from spec 01
    design `controlPoints`, checked in code until spec 01's Schema exists), check every point's
    reference against its present layer (`align/references.py`), refuse an unregistered reference
    source, refuse fewer than 3 points, compute, print the table with raw RMSE values and the
    published error on separate lines, write `data/alignment/<id>.json` (shape from spec 01 design
    `alignmentRecord`, including `source_pixel_size_m`, `error_basis`, `error_basis_m` and
    `error_rule`) atomically with the control file SHA-256, time and package version.
    Files: `pipeline/buried_pipeline/align/run.py`, `pipeline/buried_pipeline/align/references.py`,
    `pipeline/buried_pipeline/cli.py`, `pipeline/tests/align/test_run.py`,
    `pipeline/tests/align/test_references.py`, `pipeline/tests/fixtures/align/*.json`.
    Requirements: 5.1, 5.2, 5.4, 6.1 to 6.8, 6.10, 6.11.
  - [x] 3.4 **[PBT] A1** Inverse round-trip.
    Files: `pipeline/tests/align/test_align_properties.py`, `pipeline/tests/align/strategies.py`.
    Requirements: 6.9.
  - [x] 3.5 **[PBT] A2** Exact recovery from noise-free points.
    Files: `pipeline/tests/align/test_align_properties.py`.
    Requirements: 6.3.
  - [x] 3.6 **[PBT] A3** In-sample RMSE never exceeds the noise bound.
    Files: `pipeline/tests/align/test_align_properties.py`.
    Requirements: 6.3.
  - [x] 3.7 **[PBT] A4** Leave-one-out RMSE is never below in-sample RMSE.
    Files: `pipeline/tests/align/test_align_properties.py`.
    Requirements: 6.3, 6.6.
  - [x] 3.8 **[PBT] A5** The transform round-trips control points within the reported error.
    Files: `pipeline/tests/align/test_align_properties.py`.
    Requirements: 6.1, 6.6, 6.8.
  - [x] 3.9 **[PBT] A6** Order independence.
    Files: `pipeline/tests/align/test_align_properties.py`.
    Requirements: 6.1, 6.6.
  - [x] 3.10 **[PBT] A7** Choice rule, error basis and the published error rule.
    Files: `pipeline/tests/align/test_align_properties.py`.
    Requirements: 6.5, 6.6.
  - [x] 3.11 Record `uv run buried align-check <SOURCE_ID>` in `.kiro/steering/tech.md`.
    Files: `.kiro/steering/tech.md`.
    Requirements: 1.8.
  - [x] 3.12 Gate run (maintainer). Prerequisites: tasks 10.1 to 10.4 done, so
    `data/present/present_toronto_intersections_2026.geojson` exists; then a control file
    `data/control/fip_v3_1911_229.json` (or `fip_v3_1935_229`) with at least 4 points spread across
    the plate, read by a person, each pairing a street centreline crossing on the plate with an
    intersection from that layer (building corners from the outlines layer are allowed once that
    layer is clipped). Then run `uv run buried fetch` and `uv run buried inspect` (all four
    showcase plates, because the project bounds that clip the intersections layer come from all
    four; inspect reads only georeferencing, so this does not touch the held-out rule),
    `uv run buried present present_toronto_intersections_2026`,
    `uv run buried align-check fip_v3_1911_229`. Pass: the command prints per-point residuals,
    supplied RMSE, refined leave-one-out RMSE, the chosen transform and the published
    `alignment_error_m` in metres, and writes the alignment record. Record the numbers in
    `docs/kiro-sessions/` notes.
    Files: `data/control/<id>.json`, `data/alignment/<id>.json`.
    Requirements: 11.1, 11.2, 11.3.
  - [x] 3.13 **[PBT] A8** The published error is at least 2 m, at least twice the basis, less than
    0.1 m above the rule, and a multiple of 0.1 m.
    Files: `pipeline/tests/align/test_align_properties.py`.
    Requirements: 6.6, 6.10.
  - [x] 3.14 **[PBT] A9** Control point references are checked exactly.
    Files: `pipeline/tests/align/test_align_properties.py`, `pipeline/tests/align/strategies.py`.
    Requirements: 5.2.

- [x] 4. Validate alignment output against the Schema (needs spec 01 task 1)
  - [x] 4.1 Replace the in-code shape checks in align-check with spec 01's `controlPoints` and
    `alignmentRecord` definitions; align-check refuses to write a record that fails the Schema.
    Files: `pipeline/buried_pipeline/align/run.py`, `pipeline/tests/align/test_run.py`.
    Requirements: 5.1, 6.8.

- [ ] 5. Find and fetch the 1947 aerials
  - [ ] 5.1 Implement `buried fetch --aerial-candidates`: union bounds from inspect reports, ArcGIS
    query through the HTTP client with `AERIAL_INDEX_URL`, `AERIAL_ID_FIELD = "Name"` and
    `AERIAL_ZIP_FIELD = "zip_url"` as in design.md, cap of 10, write
    `data/work/aerial_candidates.json` with `Name`, proposed source id, `zip_url`, `url`,
    `thumbnail_url` and footprint bounds. Test with a fake response fixture.
    Files: `pipeline/buried_pipeline/fetch/aerials.py`, `pipeline/buried_pipeline/cli.py`,
    `pipeline/tests/fetch/test_aerials.py`, `pipeline/tests/fixtures/fetch/aerial_index_*.json`.
    Requirements: 3.1, 3.2, 3.4.
  - [ ] 5.2 Extend `buried fetch` to download registered `aerial_photograph` sources from their
    stored `url`, with the same manifest, rights-date and idempotence rules. Aerial ids enter the
    Registry only after they are agreed in `sources.md`.
    Files: `pipeline/buried_pipeline/fetch/plates.py` (rename to `fetch/download.py` if clearer),
    `pipeline/tests/fetch/test_aerials.py`.
    Requirements: 2.1, 2.3 to 2.7, 3.3.

- [ ] 6. Tile plates and aerials (needs spec 01 task 1 for the sidecar shape)
    (Plates done in session 008; the parent stays open until aerial tiling follows task 5.)
  - [x] 6.1 Implement pure corner and bilinear-check functions.
    Files: `pipeline/buried_pipeline/tile/__init__.py`, `pipeline/buried_pipeline/tile/corners.py`,
    `pipeline/tests/tile/test_corners.py`.
    Requirements: 7.4, 7.5.
  - [x] 6.2 Implement `buried tile [SOURCE_ID ...]`: refusals, area-averaged downsample to at most
    4096 px, palette expansion only, JPEG quality 85, sidecar validated against spec 01
    `tileSidecar`.
    Files: `pipeline/buried_pipeline/tile/run.py`, `pipeline/buried_pipeline/cli.py`,
    `pipeline/tests/tile/test_run.py`.
    Requirements: 7.1 to 7.3, 7.6.
  - [x] 6.3 **[PBT] T1** Tile corners are exact and independent of the downsample factor.
    Files: `pipeline/tests/tile/test_tile_properties.py`.
    Requirements: 7.4, 7.5.
  - [x] 6.4 Record `uv run buried tile` in `.kiro/steering/tech.md`.
    Files: `.kiro/steering/tech.md`.
    Requirements: 1.8.

- [ ] 7. Extract footprint proposals (tune on plate 229 only)
  - [x] 7.1 Implement the parameter set loader with `TUNING_SOURCES = ("fip_v3_1911_229",
    "fip_v3_1935_229")` and the `tuned_on` check; add `params/v1.json` with placeholder values.
    Files: `pipeline/buried_pipeline/extract/__init__.py`,
    `pipeline/buried_pipeline/extract/params.py`, `pipeline/buried_pipeline/extract/params/v1.json`,
    `pipeline/tests/extract/test_params.py`.
    Requirements: 8.4, 9.1.
  - [x] 7.2 Write the held-out guard test exactly as in design.md "Tuning fixtures and the held-out
    guard". It must pass on an empty fixture directory and fail on planted bad fixtures created in a
    temp dir by the test itself.
    Files: `pipeline/tests/extract/test_held_out.py`.
    Requirements: 9.1, 9.2, 9.3.
  - [x] 7.3 Implement the pure steps for greyscale plates (design.md "Steps", requirement 17): grey
    band, local-contrast normalisation, outlines, regions, polygons, tone class, scores with
    weakness flags, proposal ids. No colour classes and no material.
    Files: `pipeline/buried_pipeline/extract/tone.py`, `pipeline/buried_pipeline/extract/outline.py`,
    `pipeline/buried_pipeline/extract/regions.py`, `pipeline/buried_pipeline/extract/polygons.py`,
    `pipeline/buried_pipeline/extract/score.py`, `pipeline/tests/extract/test_steps.py`,
    `pipeline/tests/helpers/synthetic_plate.py`.
    Requirements: 1.4, 1.5, 8.1, 8.6, 17.1 to 17.5.
  - [x] 7.4 **[PBT] X1** Proposals are valid polygons above the minimum area.
    Files: `pipeline/tests/extract/test_extract_properties.py`.
    Requirements: 8.1.
  - [x] 7.5 **[PBT] X3** Proposal geometry equals the chosen transform applied to its pixel polygon.
    Files: `pipeline/tests/extract/test_extract_properties.py`.
    Requirements: 8.2.
  - [x] 7.6 **[PBT] X4** Scores are bounded and equal the minimum component.
    Files: `pipeline/tests/extract/test_extract_properties.py`.
    Requirements: 8.2.
  - [x] 7.7 **[PBT] X5** Synthetic greyscale rectangles are recovered with IoU at least 0.9 and
    their tone class, with no extras.
    Files: `pipeline/tests/extract/test_extract_properties.py`.
    Requirements: 8.1.
  - [ ] 7.8 Implement `buried extract <SOURCE_ID>`: refuse without an alignment record or a map
    area file (task 14.1), work inside the map area, write the proposal file with sorted output and
    the map area header (`map_area_sha256`, `map_area_px`, `map_area_geometry`).
    Files: `pipeline/buried_pipeline/extract/run.py`, `pipeline/buried_pipeline/cli.py`,
    `pipeline/tests/extract/test_run.py`.
    Requirements: 8.2, 8.3, 8.5, 8.7, 9.4, 16.3.
  - [ ] 7.9 **[PBT] X2** Determinism: two runs give byte-identical files.
    Files: `pipeline/tests/extract/test_extract_properties.py`.
    Requirements: 8.3.
  - [ ] 7.10 Tune on the tuning plates only. The maintainer cuts crops (at most 1024×1024 px) from
    `fip_v3_1911_229` and `fip_v3_1935_229` and draws expected polygons; the builder adds a
    tuning report script, sets `v1.json` values from those fixtures, and records
    `fixture_baseline`. Add the fixture regression test. Do not open, crop or sample
    `fip_v3_1935_232` at any point in this task.
    Files: `pipeline/tests/fixtures/extract/<fixture id>/{crop.png,expected.json,fixture.json}`,
    `pipeline/buried_pipeline/extract/params/v1.json`, `pipeline/tests/extract/test_fixtures.py`,
    `pipeline/scripts/tuning_report.py`.
    Requirements: 8.4, 9.1, 9.2.
  - [ ] 7.11 Record `uv run buried extract <SOURCE_ID>` in `.kiro/steering/tech.md`.
    Files: `.kiro/steering/tech.md`.
    Requirements: 1.8.

- [ ] 8. Publish accepted proposals (needs spec 01 task 4)
  - [ ] 8.1 Implement `publish/build.py` (pure): decisions to features per design.md, id
    allocation, skip already-published proposal ids, digitising term and position error rule,
    origin observation with `method: origin`, confidence rule, `mapped_area` from the map area,
    reviewed areas with `covers`, `tone_class` into provenance, attribute reads with their crops,
    and refusal of `material` without a read.
    Files: `pipeline/buried_pipeline/publish/__init__.py`, `pipeline/buried_pipeline/publish/build.py`,
    `pipeline/tests/publish/test_build.py`.
    Requirements: 10.2, 10.4 to 10.7, 10.10, 10.11, 17.3, 20.3.
  - [ ] 8.2 Implement `buried publish <SOURCE_ID>`: refusals (unregistered, attribution not
    confirmed, stale alignment), in-process validation of the would-be `data/` state, atomic write,
    printed counts.
    Files: `pipeline/buried_pipeline/publish/run.py`, `pipeline/buried_pipeline/cli.py`,
    `pipeline/tests/publish/test_run.py`.
    Requirements: 10.1, 10.3, 10.8, 10.9.
  - [ ] 8.3 **[PBT] U1** Publish writes a valid file or nothing.
    Files: `pipeline/tests/publish/test_publish_properties.py`, `pipeline/tests/publish/strategies.py`.
    Requirements: 10.8.
  - [ ] 8.4 **[PBT] U2** Only accepted, confirmed proposals are published.
    Files: `pipeline/tests/publish/test_publish_properties.py`.
    Requirements: 10.2.
  - [ ] 8.5 **[PBT] U3** Idempotence.
    Files: `pipeline/tests/publish/test_publish_properties.py`.
    Requirements: 10.7.
  - [ ] 8.6 **[PBT] U4** Ids are never reused or renumbered.
    Files: `pipeline/tests/publish/test_publish_properties.py`.
    Requirements: 10.6.
  - [ ] 8.7 **[PBT] U5** Every published feature's position error is at least the root-sum-square
    of the alignment error and the digitising term, rounded up to 0.1 m, and never below the
    reviewer's value.
    Files: `pipeline/tests/publish/test_publish_properties.py`.
    Requirements: 10.4.
  - [ ] 8.8 Record `uv run buried publish <SOURCE_ID>` in `.kiro/steering/tech.md`.
    Files: `.kiro/steering/tech.md`.
    Requirements: 1.8.
  - [ ] 8.9 **[PBT] U6** Reviewed areas are kept across publish runs, and `mapped_area` is set
    whenever reviewed areas exist.
    Files: `pipeline/tests/publish/test_publish_properties.py`.
    Requirements: 10.10.

- [ ] 9. Final check (run last, after tasks 11 and 14 to 16)
  - [ ] 9.1 Run `uv run ruff check .`, `uv run pytest` and `uv run buried validate` from
    `pipeline/`. All pass. Confirm every property A1 to A10, T1, T2, X1 to X6, U1 to U6, F1, R1, R2
    and M1 to M7 has a passing test, and the held-out guard passes.
    Files: none.
    Requirements: 1.4 to 1.7, 9.3.

- [ ] 10. Clip the present-day layers (10.1 to 10.4 are part of the gate; no spec 01 dependency)
  - [x] 10.1 Implement the CKAN client: `package_show` through the HTTP client, last-refresh date,
    GPKG resource choice (stop and list when there is none or several unnamed). Test with fake
    CKAN responses.
    Files: `pipeline/buried_pipeline/present/__init__.py`, `pipeline/buried_pipeline/present/ckan.py`,
    `pipeline/tests/present/test_ckan.py`, `pipeline/tests/fixtures/present/ckan_*.json`.
    Requirements: 1.7, 12.1, 12.2.
  - [x] 10.2 Implement the pure clip functions: project bounds (from `data/project.json` or from
    `inspect/report.py`'s `project_bounds`), densified bbox in the layer CRS, exact intersects
    filter in EPSG:26917, reprojection, field filter, id extraction, sorting, size limits; and the
    dataset table in `datasets.py` with the intersections layer first.
    Files: `pipeline/buried_pipeline/present/clip.py`, `pipeline/buried_pipeline/present/datasets.py`,
    `pipeline/tests/present/test_clip.py`, `pipeline/tests/helpers/vectors.py`.
    Requirements: 1.4, 12.5, 12.7, 12.9, 12.10.
  - [x] 10.3 Implement `buried present [SOURCE_ID ...] [--recheck]`: Registry year check, streamed
    download with manifest entry, read with `pyogrio`, clip, write
    `data/present/<id>.geojson` atomically (shape from spec 01 design `presentLayer`, checked in
    code until spec 01's Schema exists), skip when the file exists, stop on changed content under
    `--recheck`. Add the present-day sources to `data/sources.json` (ids, attribution and dates from
    `sources.md`).
    Files: `pipeline/buried_pipeline/present/run.py`, `pipeline/buried_pipeline/cli.py`,
    `pipeline/tests/present/test_run.py`, `data/sources.json`.
    Requirements: 12.1 to 12.10.
  - [x] 10.4 Run `uv run buried present present_toronto_intersections_2026` (maintainer, after
    `inspect` on the four plates). Confirm the id field and kept fields from the downloaded file,
    record them in design.md's dataset table, set the source's `year_from` from the CKAN metadata,
    and commit `data/present/present_toronto_intersections_2026.geojson`. Record
    `uv run buried present [SOURCE_ID ...]` in `.kiro/steering/tech.md`.
    Done in session 006: resource `Centreline Intersection - 2952.gpkg`, id `INTERSECTION_ID`,
    kept `INTERSECTION_DESC`, `CLASSIFICATION`, `CLASSIFICATION_DESC`, `year_from` 2026, 363
    intersections inside the bounds. Needed two clip rules (requirements 12.11 and 12.12).
    Files: `.kiro/specs/02-pipeline/design.md`, `data/sources.json`,
    `data/present/present_toronto_intersections_2026.geojson`, `.kiro/steering/tech.md`.
    Requirements: 1.8, 12.4, 12.6, 11.1, 12.11, 12.12.
  - [x] 10.5 Run `buried present` for the building outlines, property boundaries and address points
    layers in the same way: confirm fields, record them, set `year_from`, commit the files.
    Files: `.kiro/specs/02-pipeline/design.md`, `data/sources.json`, `data/present/*.geojson`.
    Requirements: 12.1 to 12.8.
  - [ ] 10.6 **[PBT] R1** Present layers are clipped, whole and in metres.
    Files: `pipeline/tests/present/test_present_properties.py`.
    Requirements: 12.5, 12.6.
  - [ ] 10.7 **[PBT] R2** Present layers never change under an id.
    Files: `pipeline/tests/present/test_present_properties.py`.
    Requirements: 12.8.
  - [ ] 10.8 Replace the in-code shape check with spec 01's `presentLayer` definition once spec 01
    task 1 is done.
    Files: `pipeline/buried_pipeline/present/run.py`, `pipeline/tests/present/test_run.py`.
    Requirements: 12.6.

- [ ] 11. Match published buildings across sources (needs task 8 and spec 01 task 12)
  - [ ] 11.1 Implement `match/rules.py` (pure): `MATCH_MIN = 0.5`, `COMPETE_MIN = 0.1`, `shrink`,
    `grow`, the overlap score, and the per-pair outcome for plates (match candidate, absence, not
    covered, review with reason) and for aerials (not covered or pending).
    Files: `pipeline/buried_pipeline/match/__init__.py`, `pipeline/buried_pipeline/match/rules.py`,
    `pipeline/tests/match/test_rules.py`, `pipeline/tests/helpers/synthetic_evidence.py`.
    Requirements: 13.2 to 13.7, 13.13.
  - [ ] 11.2 Implement `match/links.py` (pure): linked sets by union-find over person links plus
    candidate links, and the same-origin check that sends a whole clashing set to review.
    Files: `pipeline/buried_pipeline/match/links.py`, `pipeline/tests/match/test_links.py`.
    Requirements: 13.6.
  - [ ] 11.3 Implement `match/apply.py` (pure): strip `match_auto` results, apply the decisions
    file (`link`, `no_link`, `observation`, each requiring `confirmed_by` and `confirmed_at`), write
    new results, sort observations and links.
    Files: `pipeline/buried_pipeline/match/apply.py`, `pipeline/tests/match/test_apply.py`.
    Requirements: 13.8 to 13.11.
  - [ ] 11.4 Implement `buried match`: read evidence files, alignment records, tile sidecars and
    the decisions file; run the steps in design.md "Run order inside match"; validate the whole
    would-be `data/` state; write all changed files atomically or nothing; write
    `data/work/match/review.json`; print counts per source pair.
    Files: `pipeline/buried_pipeline/match/run.py`, `pipeline/buried_pipeline/cli.py`,
    `pipeline/tests/match/test_run.py`.
    Requirements: 13.1, 13.12, 13.14.
  - [ ] 11.5 **[PBT] M1** A match needs one clear, mutual winner.
    Files: `pipeline/tests/match/test_match_properties.py`, `pipeline/tests/match/strategies.py`.
    Requirements: 13.2, 13.3.
  - [ ] 11.6 **[PBT] M2** Absence only inside reviewed areas and with an empty core.
    Files: `pipeline/tests/match/test_match_properties.py`.
    Requirements: 13.4.
  - [ ] 11.7 **[PBT] M3** Code never reads a photograph.
    Files: `pipeline/tests/match/test_match_properties.py`.
    Requirements: 13.7, 13.8.
  - [ ] 11.8 **[PBT] M4** Person decisions are never overridden.
    Files: `pipeline/tests/match/test_match_properties.py`.
    Requirements: 13.9, 13.10.
  - [ ] 11.9 **[PBT] M5** Idempotence and order independence.
    Files: `pipeline/tests/match/test_match_properties.py`.
    Requirements: 13.11.
  - [ ] 11.10 **[PBT] M6** Linked sets stay one per origin source.
    Files: `pipeline/tests/match/test_match_properties.py`.
    Requirements: 13.6.
  - [ ] 11.11 **[PBT] M7** Only observations and links change.
    Files: `pipeline/tests/match/test_match_properties.py`.
    Requirements: 13.11.
  - [ ] 11.12 Record `uv run buried match` in `.kiro/steering/tech.md`.
    Files: `.kiro/steering/tech.md`.
    Requirements: 1.8.

- [x] 12. Plates as TIFF or JPEG (session 006; the real 1935 plates are JPEGs)
  - [x] 12.1 Find the raster as a TIFF or JPEG (ignoring `.ovr` and thumbnails) and choose its
    georeferencing in the order GeoTIFF tags, PAM sidecar, world file plus `.prj` or PAM SRS; record
    `georef_source` and `crs_source`; fail loudly on a transform with no CRS; warn once per
    disagreeing source. Test with synthetic JPEG + world file + PAM + `.prj` fixtures written by the
    test helper, in each combination, and a property test that a world file and a PAM sidecar read
    back the transform written. `align-check` opens a JPEG plate through the same functions (test).
    Files: `pipeline/buried_pipeline/inspect/georef.py`, `pipeline/buried_pipeline/inspect/choice.py`,
    `pipeline/buried_pipeline/inspect/run.py`, `pipeline/tests/helpers/rasters.py`,
    `pipeline/tests/inspect/test_georef.py`, `pipeline/tests/align/test_run.py`.
    Requirements: 4.1, 4.3, 4.4, 14.1 to 14.5, 14.8.
  - [x] 12.2 Record the plate's own `.txt` control points in the inspect report as
    `supplied_control_points` (count and coordinates, `independent: false`); a parse failure is a
    warning. Nothing else reads them. Test parsing, the report block, a wrongly named file, a
    malformed file, and a round-trip property.
    Files: `pipeline/buried_pipeline/inspect/supplied_points.py`,
    `pipeline/tests/inspect/test_georef.py`.
    Requirements: 14.6, 14.7.

- [x] 13. Control-point picking aid (session 006)
  - [x] 13.1 Implement the pure pixel maths: predicted pixel, inside test, crop size and window,
    crosshair drawing, RGB conversion. Test with fixed cases and property tests (inverse of the
    supplied mapping, window always inside the raster and holding the pixel, crosshair touches only
    its arms).
    Files: `pipeline/buried_pipeline/controlcrops/__init__.py`,
    `pipeline/buried_pipeline/controlcrops/pixels.py`,
    `pipeline/tests/controlcrops/test_pixels.py`.
    Requirements: 15.1, 15.2, 15.5.
  - [x] 13.2 Implement `buried control-crops <SOURCE_ID>`: read the plate and the intersections
    layer, write the PNG crops and `index.json`, remove the previous run's output, refuse unsafe
    ids. Test on synthetic GeoTIFF and rotated JPEG plates.
    Files: `pipeline/buried_pipeline/controlcrops/run.py`, `pipeline/buried_pipeline/cli.py`,
    `pipeline/tests/controlcrops/test_run.py`.
    Requirements: 15.1 to 15.4, 15.6.
  - [x] 13.3 Record `uv run buried control-crops` in `.kiro/steering/tech.md`. Run it on
    `fip_v3_1911_229` and `fip_v3_1935_229` (session 006: 39 and 62 intersections inside).
    Files: `.kiro/steering/tech.md`.
    Requirements: 1.8.

- [ ] 14. Map areas, map-area tiles and the full photograph (session 007; needs spec 01 task 16)
  - [x] 14.1 Implement `extract/maparea.py`: read `data/control/map_area/<source id>.json`, check it
    against the Schema, the source id and the raster's pixel extent; one reader for tile, extract
    and publish. Refusal messages name the file to write.
    Files: `pipeline/buried_pipeline/extract/maparea.py`, `pipeline/tests/extract/test_maparea.py`.
    Requirements: 16.1 to 16.5.
  - [x] 14.2 Change `buried tile`: refuse a plate without a map area; tile the map area's bounding
    box (`crop_px`) with no other pixel change; corners from the window's corners; sidecar
    `crop_px` and `map_area`; also write `<source id>_full.jpg` (long edge at most 2048 px) and the
    sidecar's `full_image` fields. Extend T1 to crop windows.
    Files: `pipeline/buried_pipeline/tile/run.py`, `pipeline/buried_pipeline/tile/corners.py`,
    `pipeline/tests/tile/test_run.py`, `pipeline/tests/tile/test_tile_properties.py`.
    Requirements: 7.3, 7.4, 16.3, 19.1 to 19.3.
  - [x] 14.3 **[PBT] T2** The tile shows the map area and nothing is recoloured.
    Files: `pipeline/tests/tile/test_tile_properties.py`.
    Requirements: 7.3, 19.1, 19.2.
  - [ ] 14.4 Maintainer: write `data/control/map_area/fip_v3_1911_229.json` and
    `data/control/map_area/fip_v3_1935_229.json` by eye (excluding margin, title block, scale bar,
    north arrow, and on the 1935 photograph the archive labels and the ruler), with `excluded`
    saying what was left out. Then rerun `uv run buried tile fip_v3_1911_229 fip_v3_1935_229` and
    commit the new tiles, full images and sidecars. Tell whoever is working on the Explorer that the
    tile corners changed (the gate test projects control points from reference coordinates, so it
    is not affected). Do not write a map area for `fip_v3_1935_232`; it is made live in the Studio.
    Files: `data/control/map_area/*.json`, `data/tiles/*`.
    Requirements: 16.1, 19.1, 19.2.
  - [x] 14.5 Update the `buried tile` line in `.kiro/steering/tech.md` (map area required; full
    image written).
    Files: `.kiro/steering/tech.md`.
    Requirements: 1.8.

- [x] 15. Control hull in alignment records (session 007; needs spec 01 task 16)
  - [x] 15.1 Implement `align/hull.py` (pure) and write `control_hull` and `control_hull_area_m2`
    from `align-check`; print the hull area and, with a map area, the share of it inside the hull.
    Files: `pipeline/buried_pipeline/align/hull.py`, `pipeline/buried_pipeline/align/run.py`,
    `pipeline/tests/align/test_hull.py`.
    Requirements: 18.1 to 18.3.
  - [x] 15.2 **[PBT] A10** The control hull is the convex hull.
    Files: `pipeline/tests/align/test_align_properties.py`.
    Requirements: 18.1.
  - [x] 15.3 Maintainer: rerun `uv run buried align-check fip_v3_1911_229` and
    `uv run buried align-check fip_v3_1935_229` so both records carry the hull; the error figures
    must not change (4.3 m and 3.1 m). If one changes, stop and report.
    Files: `data/alignment/*.json`.
    Requirements: 18.1.

- [ ] 16. Greyscale extraction checks (session 007; with task 7)
  - [ ] 16.1 **[PBT] X6** Nothing outside the map area; no material from a tone; a map area vertex
    outside the raster makes extract, tile and publish refuse.
    Session 011: the vertex-outside-raster part is done and tested at the shared reader
    (`tests/extract/test_maparea.py`, which `tile` uses; `extract` and `publish` will use the same
    function). "Nothing outside the map area" and "no material from a tone" wait for task 7.
    Files: `pipeline/tests/extract/test_extract_properties.py`.
    Requirements: 8.7, 16.2, 16.3, 17.3.
  - [ ] 16.2 Extend the held-out guard to `data/control/map_area/`: no map area file for
    `fip_v3_1935_232` may be committed before the demo. Tuning fixtures carry the person's tone
    class per expected polygon, and the fixture regression test also reports tone-class agreement
    (not gated).
    Session 011: the map area half is done in `tests/extract/test_maparea_held_out.py` (a
    committed-files guard and planted-file tests). It moves into `test_held_out.py` with task 7.2;
    the tone-class half waits for task 7.
    Files: `pipeline/tests/extract/test_held_out.py`, `pipeline/tests/extract/test_fixtures.py`.
    Requirements: 9.3, 17.2.

- [ ] 17. Held-out write guard for the Kiro hook (session 012; needs task 7.1)
  - [ ] 17.1 Move the held-out text patterns (`fip_v3_1935_232`, `1935_232`, `1935-232`) into one
    constant, `HELD_OUT_PATTERNS`, in `extract/params.py` next to `TUNING_SOURCES`, and make
    `tests/extract/test_held_out.py` read them from there. No behaviour change.
    Files: `pipeline/buried_pipeline/extract/params.py`, `pipeline/tests/extract/test_held_out.py`.
    Requirements: 9.2, 9.3.
  - [ ] 17.2 Implement `pipeline/buried_pipeline/hooks/held_out_write.py`, run by the `PreToolUse`
    hook in `.kiro/hooks/held-out.json` as
    `uv --directory pipeline run python -m buried_pipeline.hooks.held_out_write`. It reads the hook
    event as JSON on standard input and:
    - takes the tool input's target path from the first of `path`, `file_path`, `targetFile`, and
      the text being written from every one of `text`, `content`, `file_text`, `newStr`, `new_str`
      that is present;
    - resolves the path against the repository root (the nearest parent directory that holds
      `.kiro/`), not against its own working directory, which is `pipeline/`;
    - if the path is under `pipeline/buried_pipeline/extract/params/` or
      `pipeline/tests/fixtures/extract/`, and the path or any of the text matches one of
      `HELD_OUT_PATTERNS` (case-insensitive), writes to standard error
      "Blocked: <path> is an extraction tuning file and this write mentions the held-out plate
      fip_v3_1935_232. Plate 232 (1935) is never used to tune extraction (product.md, evidence.md)."
      and exits 2;
    - otherwise exits 0 and writes nothing;
    - if standard input is not JSON or has no recognisable path, writes one warning line to
      standard error and exits 0. The pytest guard (`test_held_out.py`) is the backstop for writes
      this hook cannot see, such as writes made by shell commands.
    Pure decision function separate from the stdin and exit handling. Example tests for: a blocked
    params write, a blocked fixture write by path only, a blocked `newStr` edit, an allowed write
    in those folders that does not mention plate 232, an allowed write elsewhere that does
    mention it (for example `data/sources.json`), a relative path given from `pipeline/`, and
    unreadable input. Record the hook command under "Commands" in `.kiro/steering/tech.md`.
    Files: `pipeline/buried_pipeline/hooks/__init__.py`,
    `pipeline/buried_pipeline/hooks/held_out_write.py`, `pipeline/tests/hooks/test_held_out_write.py`,
    `.kiro/steering/tech.md`.
    Requirements: 9.2, 9.3.
