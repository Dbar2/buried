---
inclusion: always
---

# Tech

## Stack

| Part | Choice |
|---|---|
| Web shell | Vite + React + TypeScript |
| 2D map in the Studio | MapLibre GL JS (today's map for plate alignment and review) |
| Explorer 3D | Unity 6 (6000.3.26f1), URP, WebGL build, embedded in the web shell |
| Hero props, video stills | Blender, exported as GLB. Never the source of building geometry. |
| Pipeline | Python 3.12: rasterio/GDAL, OpenCV, shapely, pyproj, pyogrio. Run from the terminal via Kiro CLI. |
| Studio service | FastAPI app in `pipeline/buried_pipeline/service/`, same package and functions as the CLI (spec 04) |
| Evidence store | Versioned JSON/GeoJSON files under `data/evidence/`, validated by one JSON Schema |
| Tests | Vitest + fast-check (TS), pytest + Hypothesis (Python), Unity EditMode tests (C#) |

Three.js is not used. PostGIS is not used now; a database can come later. The evidence files are
the contract between the pipeline, the shell and Unity, whatever comes later.

### Decided

- **Present-day data:** City of Toronto Open Data, Open Government Licence - Toronto, checked
  2026-11-12. Building outlines (`topographic-mapping-building-outlines`) for today's buildings,
  property boundaries (`property-boundaries`) for lots, address points
  (`address-points-municipal-toronto-one-address-repository`) for search, and the intersection
  file (`intersection-file-city-of-toronto`) for alignment control points. Source ids and
  attribution are in `sources.md`. Fetched and clipped by `buried present` (spec 02). Reason:
  one publisher and one licence for all four layers, published as current City data, with no
  login.
- **Present-day heights:** optional, from City of Toronto 3D massing once its licence is
  confirmed; otherwise a fixed storey height. The Explorer spec sets the value.
- **Hosting** (spec 04): the static site (shell, Unity build, fonts, `data/` contract files,
  tiles) on Cloudflare Pages; the Studio service on Railway from a Dockerfile in `pipeline/`.
  Reason: the site has no server-side code, and the service needs GDAL in a container. Both are
  swappable. The Explorer, the Report and the Sources page work with the service down.
- **API server** (spec 04): one, the Studio service. It is stateless and exposes the pipeline's own
  pure functions (inspect, align, extract, match, publish with validation) plus label assist. It
  never computes dates, lot relations or confidence wording. Nothing else is a server.
- **Runtime AI provider** (spec 04): Amazon Bedrock, behind a label provider interface in the
  service, for label assist only (product rule 9). The model id comes from
  `BURIED_LABEL_MODEL_ID` and must be a vision-capable Anthropic Claude model enabled in the
  account's Bedrock region. There is no default model id in code. Without credentials the provider
  is `none` and the Studio falls back to manual entry. No model writes Report text.
- **Basemap** (spec 04): none from a third party. Today's map is drawn from Buried's own
  `data/present/` layers, styled with the palette tokens. No tile provider, no API key.
- **PDF rendering** (spec 05): the browser's print-to-PDF from a print stylesheet. No server.

### Not decided yet

Anything not listed under "Decided" is open. Do not pick it in passing. The spec that needs it
decides it and records why.

## Responsibilities

- **Web shell** owns all DOM UI: search, depth gauge, evidence card, Report, and the whole Studio.
- **Unity** renders the 3D Explorer scene. It draws what it is given. It does not decide dates,
  confidence or "on this lot"; those results arrive over the bridge, computed elsewhere.
- **Pipeline** fetches plates, checks alignment, segments footprints and writes evidence. The same
  package also runs as the Studio service, which calls the same functions.
- Date logic and honesty rules have a single implementation. Do not copy them into a second
  language.

## Unity scene rules

- The scene is built at runtime from evidence data. Footprints are extruded procedurally. Rasters
  are draped on ground quads. Nothing in the showcase area is hand-modelled in the editor.
- Unity units are metres. Axes: x = east, z = north, y = up.

## Coordinate systems

- **EPSG:26917** (NAD83 / UTM zone 17N, metres) for all stored data, all pipeline maths and Unity.
- **EPSG:4326 / EPSG:3857** only at the web map edge (MapLibre and geocoded search input).
  Convert at that edge in one module and nowhere else. Never store lon/lat in evidence.
- Distances, areas and buffers are computed in EPSG:26917, never in degrees.

## Project origin rule

- One fixed project origin (E0, N0) in EPSG:26917, defined once in one shared file that the
  pipeline, the shell and Unity all read. Its value and path are set by the spec that creates it.
- Unity world position = (easting - E0, height, northing - N0).
- Subtract in double precision before converting to float.
- The origin never changes once evidence is published. Changing it is a migration, not an edit.
- No per-object offsets, manual nudges or editor-placed alignment fixes. Alignment is exact by
  construction or it is a bug.

## Shell-to-Unity bridge rule

- Exactly one typed bridge: a `.jslib` plugin (Unity to JS) plus `SendMessage` (JS to Unity).
- One message schema, shared by both sides. TypeScript types and C# types are generated from it
  or checked against it in tests.
- No other channel: no globals, no ad hoc `SendMessage` calls, no string-built JSON outside the
  bridge module on either side.
- Every message is validated on receipt. Unknown or malformed messages are logged and dropped.

## Testing rules

- The property tests below are requirements. A feature is not done until its properties pass.
  - A feature is never drawn outside its evidence window.
  - A vanish window is only closed by a clear absence.
  - "On this lot" never appears when the overlap is smaller than the position error.
  - An alignment transform round-trips control points within the reported error.
  - Every finding has at least one source, and report text never contains a banned word.
  - "Nothing found" always lists the records and years checked.
- TypeScript: Vitest, with fast-check for properties. Python: pytest, with Hypothesis for
  properties. C#: Unity EditMode tests for bridge parsing, coordinate conversion and mesh building.
- A test fails if any extraction tuning fixture or parameter set references plate 232 (1935).
- Pure functions for transforms, intervals and overlap tests, so they can be property-tested.
- Tests never hit the network. Use small fixtures committed under the owning package.

## Secrets and data

- Secrets live in `.env` (gitignored). Commit `.env.example` with names only.
- `data/raw/` and `data/work/` are gitignored. Never commit raw archival downloads.

## Commands

No tooling exists yet. Each command below is to be added by the spec that creates it. Do not
invent commands; when one is added, record it here.

- Web package (spec 01), all run from `web/`:
  - Install: `npm install`. Tests: `npm test` (Vitest + fast-check). Type check:
    `npm run typecheck`.
  - Regenerate `src/evidence/types.generated.ts` from the Schema: `npm run gen:types`. A test
    fails if the committed file differs from a fresh generation.
  - Dev server and build (spec 03): `npm run dev`, `npm run build` (type check, then Vite build),
    `npm run preview`.
  - Regenerate the bridge types and the generated bridge samples (spec 03): `npm run gen:bridge-types`
    and `npm run gen:bridge-samples`. Tests fail if the committed files differ from a fresh run.
  - Explorer gate test (spec 03): `npm run test:e2e` (builds, then runs Playwright against
    `vite preview` with the real Unity build in `web/public/unity/`). One-time browser install:
    `npm exec -- playwright install chromium`. Screenshots and pixel deltas go to
    `web/e2e/output/` (gitignored).
  - Drape placement check (spec 03 task 17.4, requirement 25.5): `npx playwright test e2e/drape.spec.ts`
    after `npm run build`. Opens `/?debug=1&markers=0`, sets the camera over each control point through
    the debug-only form and correlates the canvas with the tile's own pixels. Results go to
    `web/e2e/output/drape-ncc.json`. `DRAPE_MARGIN_M` overrides the inside-the-map-area margin for a
    measuring run (the default is the design's 25 m). Helper tests: `npm test` runs `e2e/support/*.test.ts`.
  - Look check (spec 03 task 16.7, requirement 26): `npx playwright test e2e/look.spec.ts` after
    `npm run build`. Opens the page without `?debug=1` at 1280 × 800 and saves
    `web/e2e/output/look-*.png` for the maintainer to judge against requirement 26. The web build
    copies `web/public/unity/` into `dist/`, so run `npm run build` after every Unity build, and
    only once `web/public/unity/Build/` has stopped changing (the Unity build was seen to finish
    writing its data file after the command returned).
- Pipeline (spec 02), all run from `pipeline/`:
  - Environment: `uv sync` (Python 3.12).
  - Tests: `uv run pytest`. Lint: `uv run ruff check .`.
  - Fetch the showcase plates and the registered 1947 aerials into `data/raw/`:
    `uv run buried fetch [SOURCE_ID ...]`. List the 1947 aerial records whose footprints touch
    the plates (downloads no imagery; needs `buried inspect` reports of the plates; more than 10
    records is an error): `uv run buried fetch --aerial-candidates`, which writes
    `data/work/aerial_candidates.json`. A person lists the chosen ids in `sources.md`, then
    registers them in `data/sources.json`.
  - Read georeferencing of fetched rasters: `uv run buried inspect [SOURCE_ID ...]`. Add
    `--propose-origin` to print the project origin and bounds (writes nothing).
  - Clip the present-day City of Toronto layers into `data/present/`:
    `uv run buried present [SOURCE_ID ...]` (`--recheck` downloads again and compares).
  - Measure a raster's alignment error from `data/control/<id>.json`:
    `uv run buried align-check <SOURCE_ID>`. The record also states the control hull; with a map
    area file the summary shows the share of the map area inside it.
  - Write PNG crops around each City intersection inside a plate, for picking control points by
    eye (output in `data/work/control/<id>/`, writes no control file):
    `uv run buried control-crops <SOURCE_ID>`.
  - Check every contract file under `data/` against the Schema and the cross-file rules:
    `uv run buried validate [PATH ...]` (exit 1 on any error; with paths, reports only those
    files but judges them against the whole `data/` tree).
  - Write each plate's map-area tile as a JPEG (long edge at most 4096 px) plus a sidecar with
    exact EPSG:26917 corners, `crop_px` and `map_area`, and its whole photograph as
    `<id>_full.jpg` (long edge at most 2048 px, for the Sources page), into `data/tiles/`:
    `uv run buried tile [SOURCE_ID ...]`. Needs the plate's alignment record and its map area
    file `data/control/map_area/<id>.json` (written by a person; no command writes it); plates
    only until aerials are registered. With no ids it tiles every plate that has both and names
    the ones it skipped.
  - Propose building footprints from a plate's map area, deterministic image processing only:
    `uv run buried extract <SOURCE_ID> [--preview]`. Needs the plate's alignment record and map
    area file. Writes `data/work/proposals/<id>.geojson` (gitignored) and prints counts, score
    quartiles, tone classes, weakness flags and run time. `--preview` also writes
    `data/work/extract/<id>_preview.jpg`: the map area with every proposal outlined, coloured by
    quality band (a debugging aid, spec 02 requirement 21). Thresholds are in
    `pipeline/buried_pipeline/extract/params/v1.json`.
  - Write accepted proposals as evidence: `uv run buried publish <SOURCE_ID> [--decisions PATH]`.
    Reads `data/work/proposals/<id>.geojson`, the decisions file (default
    `data/work/review/<id>.json`, spec 02 design "Decisions file"; the Studio's v2 file is read
    for accept and reject only) and the alignment record, then writes
    `data/evidence/<id>.geojson` atomically, only if the would-be `data/` state passes the
    Validator. Refuses: unregistered or unconfirmed source, a stale alignment record, no reviewed
    area, an undecided proposal inside a reviewed area, `material` without a read, `documented`
    without storeys. Prints counts. Running it twice gives the same file.
  - Add observations and links to published buildings from every other source that covers them:
    `uv run buried match [--decisions PATH]`. Reads every `data/evidence/*.geojson`, the plates'
    alignment records, the tile sidecars of registered aerials that have an alignment record, and
    the decisions file (default `data/work/review/match.json`, optional; spec 02 design "Match
    decisions file"). Writes only `observations` and `same_as` in the evidence files, and only
    if the would-be `data/` state passes the Validator (otherwise nothing). Removes and
    recomputes every `match_auto` result on each run, so running it twice gives the same bytes.
    Writes `data/work/match/review.json` (cases for a person, and pending aerial checks) and
    prints counts per source pair. Aerials without an alignment record or tile sidecar are
    skipped and named. Code writes `not_covered` for an aerial and nothing else.
- Unity (spec 03), run from the repository root with `tools/unity.sh` (headless Unity 6000.3.26f1;
  set `UNITY_BIN` to override the editor path; logs in `unity/Logs/`):
  - `tools/unity.sh exec Buried.Editor.Setup.Run`: creates the palette asset, URP assets, player
    settings and the Bootstrap scene. First run imports packages.
  - `tools/unity.sh test`: EditMode tests, results in `unity/Logs/editmode-results.xml`.
  - `tools/unity.sh build`: WebGL build into `web/public/unity/` (gitignored).
  - Equivalent raw commands: `Unity -batchmode -quit -projectPath unity -executeMethod Buried.Editor.Build.WebGL`
    and `Unity -batchmode -projectPath unity -runTests -testPlatform EditMode -testResults unity/Logs/editmode-results.xml`.
- Studio service (spec 04), run from `pipeline/`:
  - Install the server: `uv sync --extra service` (adds `uvicorn`; `fastapi` is also in the dev
    group, so `uv run pytest tests/service` needs no extra). A plain `uv sync` removes `uvicorn`
    again.
  - Dev server: `uv run uvicorn buried_pipeline.service.app:create_app --factory --reload`
    (add `--port N`; reads the environment: `BURIED_REPO_ROOT` (default: nearest ancestor with
    `.kiro/`), `BURIED_ALLOWED_ORIGINS` (comma-separated, for CORS), `BURIED_TEST_MODE=1`).
    Endpoints that exist: `GET /v1/health`, `GET /v1/plates/registered`, `POST /v1/extract`,
    `POST /v1/publish`. Plate rasters are read from `data/raw/<id>/` on the machine the Service
    runs on; the image has none, so extract and publish need the plate fetch (spec 04 task 4).
    The Service writes nothing under `data/`.
  - Tests: `uv run pytest tests/service`. Docker image (spec 04 task 3.4), from the repository
    root: `docker build -f pipeline/Dockerfile .`. Its context is set by
    `pipeline/Dockerfile.dockerignore` (BuildKit reads it next to the Dockerfile; a
    `pipeline/.dockerignore` would not be read for a root context). The image build and deploy
    steps are not yet run or recorded (spec 04 task 15.2).
  - The Service API Schema is `data/schema/studio_api.schema.json`; its fixtures are in
    `data/schema/studio_api_fixtures/`. TypeScript types: `npx tsx scripts/genStudioApiTypes.ts`
    from `web/`, which writes `web/src/studio/service/types.generated.ts` (no `npm run` alias yet).
  - Studio end-to-end tests (`npm run test:e2e:studio`) by spec 04 task 16.2. Report print tests
    (`npm run test:e2e:report`) by spec 05 task 7.3.

## Model use in Kiro

- Opus: specs and design decisions.
- Sonnet: implementation.
- Haiku: mechanical edits.
