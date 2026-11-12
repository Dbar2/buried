# Tasks: 02 Pipeline

Property-based test tasks are marked **[PBT]** and name the correctness property from `design.md`.
A task is done only when its tests pass. Do not weaken a property to make it pass.

**Gate (due Nov 14): tasks 1, 2 and 3 on their own fetch one plate, inspect it, and report its
alignment error in metres.** They do not depend on spec 01. Use `fip_v3_1911_229` or
`fip_v3_1935_229` for the gate, not the held-out plate.

- [ ] 1. Create the package and fetch the showcase plates
  - [ ] 1.1 Create the uv project: Python 3.12, package `buried_pipeline`, console script `buried`,
    dependencies and dev dependencies from design.md, `argparse` CLI with the seven subcommands
    registered (unimplemented ones exit 2 with "not implemented yet"), repo root discovery and
    `--root`.
    Files: `pipeline/pyproject.toml`, `pipeline/uv.lock`, `pipeline/.python-version`,
    `pipeline/buried_pipeline/__init__.py`, `pipeline/buried_pipeline/cli.py`,
    `pipeline/buried_pipeline/paths.py`, `pipeline/tests/test_cli.py`.
    Requirements: 1.1, 1.2, 1.3.
  - [ ] 1.2 Add `.gitignore` entries for `data/raw/` and `data/work/` if missing, and the atomic
    write helper.
    Files: `.gitignore`, `pipeline/buried_pipeline/io/atomic.py`, `pipeline/tests/io/test_atomic.py`.
    Requirements: 1.6.
  - [ ] 1.3 If `data/sources.json` does not exist, create it with the four showcase plates exactly
    as in spec 01 design "source and sourceRegistry", with `rights_checked_on: null`. The
    maintainer fills in the date after checking each item's rights statement. Add the Registry
    reader.
    Files: `data/sources.json`, `pipeline/buried_pipeline/io/registry.py`,
    `pipeline/tests/io/test_registry.py`.
    Requirements: 2.2, 2.3.
  - [ ] 1.4 Implement the HTTP client interface (real client with httpx, User-Agent naming Buried,
    one request at a time) and a fake for tests.
    Files: `pipeline/buried_pipeline/io/http.py`, `pipeline/tests/fakes.py`.
    Requirements: 1.7, 2.8.
  - [ ] 1.5 Implement safe unzip, the manifest, and `buried fetch` for plates: URL guard,
    rights-date refusal, streamed download with SHA-256, skip when up to date, stop on mismatch.
    Files: `pipeline/buried_pipeline/fetch/__init__.py`, `pipeline/buried_pipeline/fetch/plates.py`,
    `pipeline/buried_pipeline/fetch/manifest.py`, `pipeline/buried_pipeline/fetch/zipsafe.py`,
    `pipeline/tests/fetch/test_plates.py`, `pipeline/tests/fetch/test_zipsafe.py`,
    `pipeline/tests/fixtures/fetch/*.zip`.
    Requirements: 2.1 to 2.8.
  - [ ] 1.6 **[PBT] F1** Fetch is idempotent and contained; escaping zip entries are always
    refused.
    Files: `pipeline/tests/fetch/test_fetch_properties.py`.
    Requirements: 2.4, 2.6, 2.7.
  - [ ] 1.7 Record the pipeline commands (`uv sync`, `uv run pytest`, `uv run ruff check .`,
    `uv run buried fetch`, all from `pipeline/`) in `.kiro/steering/tech.md`.
    Files: `.kiro/steering/tech.md`.
    Requirements: 1.8.

- [ ] 2. Inspect georeferencing
  - [ ] 2.1 Implement the pure report functions: corners, densified bounds, pixel size from unit
    steps, rotation terms, origin proposal.
    Files: `pipeline/buried_pipeline/inspect/__init__.py`,
    `pipeline/buried_pipeline/inspect/report.py`, `pipeline/tests/inspect/test_report.py`.
    Requirements: 1.4, 4.1, 4.2, 4.6.
  - [ ] 2.2 Implement `buried inspect [SOURCE_ID ...] [--propose-origin]`: read with rasterio,
    detect tags vs world file, fail on missing georeferencing, warn on disagreement, write
    `data/work/inspect/<id>.json`, print the table. Test on synthetic GeoTIFFs written by a helper
    (EPSG:26917 and EPSG:3857, one with no georeferencing, one with tags and a disagreeing world
    file).
    Files: `pipeline/buried_pipeline/inspect/georef.py`, `pipeline/buried_pipeline/cli.py`,
    `pipeline/tests/helpers/rasters.py`, `pipeline/tests/inspect/test_georef.py`.
    Requirements: 4.1 to 4.6.
  - [ ] 2.3 Record `uv run buried inspect` in `.kiro/steering/tech.md`.
    Files: `.kiro/steering/tech.md`.
    Requirements: 1.8.

- [ ] 3. Measure alignment error (completes the gate)
  - [ ] 3.1 Implement pure affine maths: fit by least squares, apply, invert, stability check
    (`s_min / s_max < 0.05`).
    Files: `pipeline/buried_pipeline/align/__init__.py`, `pipeline/buried_pipeline/align/affine.py`,
    `pipeline/tests/align/test_affine.py`.
    Requirements: 6.3, 6.4, 6.9.
  - [ ] 3.2 Implement pure residual maths: residuals, RMSE, max, leave-one-out, outlier flags,
    choice rule, rounding up to 0.01 m; and the supplied mapping (affine then pyproj to EPSG:26917).
    Files: `pipeline/buried_pipeline/align/residuals.py`, `pipeline/buried_pipeline/align/supplied.py`,
    `pipeline/tests/align/test_residuals.py`, `pipeline/tests/align/test_supplied.py`.
    Requirements: 6.1, 6.5, 6.6, 6.7, 6.9.
  - [ ] 3.3 Implement `buried align-check <SOURCE_ID>`: read the control file (shape from spec 01
    design `controlPoints`, checked in code until spec 01's Schema exists), refuse an unregistered
    reference source, refuse fewer than 3 points, compute, print the table, write
    `data/alignment/<id>.json` (shape from spec 01 design `alignmentRecord`) atomically with the
    control file SHA-256, time and package version.
    Files: `pipeline/buried_pipeline/align/run.py`, `pipeline/buried_pipeline/cli.py`,
    `pipeline/tests/align/test_run.py`, `pipeline/tests/fixtures/align/*.json`.
    Requirements: 5.1, 5.2, 6.1 to 6.8.
  - [ ] 3.4 **[PBT] A1** Inverse round-trip.
    Files: `pipeline/tests/align/test_align_properties.py`, `pipeline/tests/align/strategies.py`.
    Requirements: 6.9.
  - [ ] 3.5 **[PBT] A2** Exact recovery from noise-free points.
    Files: `pipeline/tests/align/test_align_properties.py`.
    Requirements: 6.3.
  - [ ] 3.6 **[PBT] A3** In-sample RMSE never exceeds the noise bound.
    Files: `pipeline/tests/align/test_align_properties.py`.
    Requirements: 6.3.
  - [ ] 3.7 **[PBT] A4** Leave-one-out RMSE is never below in-sample RMSE.
    Files: `pipeline/tests/align/test_align_properties.py`.
    Requirements: 6.3, 6.6.
  - [ ] 3.8 **[PBT] A5** The transform round-trips control points within the reported error.
    Files: `pipeline/tests/align/test_align_properties.py`.
    Requirements: 6.1, 6.6, 6.8.
  - [ ] 3.9 **[PBT] A6** Order independence.
    Files: `pipeline/tests/align/test_align_properties.py`.
    Requirements: 6.1, 6.6.
  - [ ] 3.10 **[PBT] A7** Choice rule and rounding.
    Files: `pipeline/tests/align/test_align_properties.py`.
    Requirements: 6.5, 6.6.
  - [ ] 3.11 Record `uv run buried align-check <SOURCE_ID>` in `.kiro/steering/tech.md`.
    Files: `.kiro/steering/tech.md`.
    Requirements: 1.8.
  - [ ] 3.12 Gate run (maintainer). Prerequisites the builder cannot supply: a registered reference
    source for present-day coordinates, and a control file
    `data/control/fip_v3_1911_229.json` (or `fip_v3_1935_229`) with at least 4 points spread across
    the plate, read by a person. Then run `uv run buried fetch fip_v3_1911_229`,
    `uv run buried inspect fip_v3_1911_229`, `uv run buried align-check fip_v3_1911_229`. Pass:
    the command prints per-point residuals, supplied RMSE, refined leave-one-out RMSE, the chosen
    transform and `alignment_error_m` in metres, and writes the alignment record. Record the
    numbers in `docs/kiro-sessions/` notes.
    Files: `data/control/<id>.json`, `data/alignment/<id>.json`.
    Requirements: 11.1, 11.2, 11.3.

- [ ] 4. Validate alignment output against the Schema (needs spec 01 task 1)
  - [ ] 4.1 Replace the in-code shape checks in align-check with spec 01's `controlPoints` and
    `alignmentRecord` definitions; align-check refuses to write a record that fails the Schema.
    Files: `pipeline/buried_pipeline/align/run.py`, `pipeline/tests/align/test_run.py`.
    Requirements: 5.1, 6.8.

- [ ] 5. Find and fetch the 1947 aerials
  - [ ] 5.1 Implement `buried fetch --aerial-candidates`: union bounds from inspect reports, ArcGIS
    query through the HTTP client, cap of 10, write `data/work/aerial_candidates.json`. Leave
    `AERIAL_INDEX_URL` and `AERIAL_ID_FIELD` unset (command fails clearly) until the maintainer
    records them. Test with a fake response fixture.
    Files: `pipeline/buried_pipeline/fetch/aerials.py`, `pipeline/buried_pipeline/cli.py`,
    `pipeline/tests/fetch/test_aerials.py`, `pipeline/tests/fixtures/fetch/aerial_index_*.json`.
    Requirements: 3.1, 3.2.
  - [ ] 5.2 Extend `buried fetch` to download registered `aerial_photograph` sources from their
    stored `url`, with the same manifest, rights-date and idempotence rules. Aerial ids enter the
    Registry only after they are agreed in `sources.md`.
    Files: `pipeline/buried_pipeline/fetch/plates.py` (rename to `fetch/download.py` if clearer),
    `pipeline/tests/fetch/test_aerials.py`.
    Requirements: 2.1, 2.3 to 2.7, 3.3.

- [ ] 6. Tile plates and aerials (needs spec 01 task 1 for the sidecar shape)
  - [ ] 6.1 Implement pure corner and bilinear-check functions.
    Files: `pipeline/buried_pipeline/tile/__init__.py`, `pipeline/buried_pipeline/tile/corners.py`,
    `pipeline/tests/tile/test_corners.py`.
    Requirements: 7.4, 7.5.
  - [ ] 6.2 Implement `buried tile [SOURCE_ID ...]`: refusals, area-averaged downsample to at most
    4096 px, palette expansion only, JPEG quality 85, sidecar validated against spec 01
    `tileSidecar`.
    Files: `pipeline/buried_pipeline/tile/run.py`, `pipeline/buried_pipeline/cli.py`,
    `pipeline/tests/tile/test_run.py`.
    Requirements: 7.1 to 7.3, 7.6.
  - [ ] 6.3 **[PBT] T1** Tile corners are exact and independent of the downsample factor.
    Files: `pipeline/tests/tile/test_tile_properties.py`.
    Requirements: 7.4, 7.5.
  - [ ] 6.4 Record `uv run buried tile` in `.kiro/steering/tech.md`.
    Files: `.kiro/steering/tech.md`.
    Requirements: 1.8.

- [ ] 7. Extract footprint proposals (tune on plate 229 only)
  - [ ] 7.1 Implement the parameter set loader with `TUNING_SOURCES = ("fip_v3_1911_229",
    "fip_v3_1935_229")` and the `tuned_on` check; add `params/v1.json` with placeholder values.
    Files: `pipeline/buried_pipeline/extract/__init__.py`,
    `pipeline/buried_pipeline/extract/params.py`, `pipeline/buried_pipeline/extract/params/v1.json`,
    `pipeline/tests/extract/test_params.py`.
    Requirements: 8.4, 9.1.
  - [ ] 7.2 Write the held-out guard test exactly as in design.md "Tuning fixtures and the held-out
    guard". It must pass on an empty fixture directory and fail on planted bad fixtures created in a
    temp dir by the test itself.
    Files: `pipeline/tests/extract/test_held_out.py`.
    Requirements: 9.1, 9.2, 9.3.
  - [ ] 7.3 Implement the pure steps: colour classes, outlines, regions, polygons, scores, proposal
    ids.
    Files: `pipeline/buried_pipeline/extract/colour.py`, `pipeline/buried_pipeline/extract/outline.py`,
    `pipeline/buried_pipeline/extract/regions.py`, `pipeline/buried_pipeline/extract/polygons.py`,
    `pipeline/buried_pipeline/extract/score.py`, `pipeline/tests/extract/test_steps.py`,
    `pipeline/tests/helpers/synthetic_plate.py`.
    Requirements: 1.4, 1.5, 8.1, 8.6.
  - [ ] 7.4 **[PBT] X1** Proposals are valid polygons above the minimum area.
    Files: `pipeline/tests/extract/test_extract_properties.py`.
    Requirements: 8.1.
  - [ ] 7.5 **[PBT] X3** Proposal geometry equals the chosen transform applied to its pixel polygon.
    Files: `pipeline/tests/extract/test_extract_properties.py`.
    Requirements: 8.2.
  - [ ] 7.6 **[PBT] X4** Scores are bounded and equal the minimum component.
    Files: `pipeline/tests/extract/test_extract_properties.py`.
    Requirements: 8.2.
  - [ ] 7.7 **[PBT] X5** Synthetic rectangles are recovered with IoU at least 0.9 and no extras.
    Files: `pipeline/tests/extract/test_extract_properties.py`.
    Requirements: 8.1.
  - [ ] 7.8 Implement `buried extract <SOURCE_ID>`: refuse without an alignment record, neatline
    rule, write the proposal file with sorted output.
    Files: `pipeline/buried_pipeline/extract/run.py`, `pipeline/buried_pipeline/cli.py`,
    `pipeline/tests/extract/test_run.py`.
    Requirements: 8.2, 8.3, 8.5, 9.4.
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
    allocation, skip already-published proposal ids, error floor, confidence rule.
    Files: `pipeline/buried_pipeline/publish/__init__.py`, `pipeline/buried_pipeline/publish/build.py`,
    `pipeline/tests/publish/test_build.py`.
    Requirements: 10.2, 10.4 to 10.7.
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
  - [ ] 8.7 **[PBT] U5** Every published feature's position error is at least the alignment error.
    Files: `pipeline/tests/publish/test_publish_properties.py`.
    Requirements: 10.4.
  - [ ] 8.8 Record `uv run buried publish <SOURCE_ID>` in `.kiro/steering/tech.md`.
    Files: `.kiro/steering/tech.md`.
    Requirements: 1.8.

- [ ] 9. Final check
  - [ ] 9.1 Run `uv run ruff check .`, `uv run pytest` and `uv run buried validate` from
    `pipeline/`. All pass. Confirm every property A1 to A7, T1, X1 to X5, U1 to U5 and F1 has a
    passing test, and the held-out guard passes.
    Files: none.
    Requirements: 1.4 to 1.7, 9.3.
