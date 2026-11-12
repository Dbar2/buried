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
- Pipeline (spec 02), all run from `pipeline/`:
  - Environment: `uv sync` (Python 3.12).
  - Tests: `uv run pytest`. Lint: `uv run ruff check .`.
  - Fetch the showcase plates into `data/raw/`: `uv run buried fetch [SOURCE_ID ...]`.
  - Read georeferencing of fetched rasters: `uv run buried inspect [SOURCE_ID ...]`. Add
    `--propose-origin` to print the project origin and bounds (writes nothing).
  - Clip the present-day City of Toronto layers into `data/present/`:
    `uv run buried present [SOURCE_ID ...]` (`--recheck` downloads again and compares).
  - Measure a raster's alignment error from `data/control/<id>.json`:
    `uv run buried align-check <SOURCE_ID>`.
  - Write PNG crops around each City intersection inside a plate, for picking control points by
    eye (output in `data/work/control/<id>/`, writes no control file):
    `uv run buried control-crops <SOURCE_ID>`.
  - Check every contract file under `data/` against the Schema and the cross-file rules:
    `uv run buried validate [PATH ...]` (exit 1 on any error; with paths, reports only those
    files but judges them against the whole `data/` tree).
  - Write each plate as a JPEG (long edge at most 4096 px) plus a sidecar with exact EPSG:26917
    corners into `data/tiles/`: `uv run buried tile [SOURCE_ID ...]`. Needs the plate's alignment
    record; plates only until aerials are registered. With no ids it tiles every plate that has
    a record and names the ones it skipped.
  - `extract`, `publish` and `match` are registered and exit 2 with "not
    implemented yet" until their tasks land.
- Unity (spec 03), run from the repository root with `tools/unity.sh` (headless Unity 6000.3.26f1;
  set `UNITY_BIN` to override the editor path; logs in `unity/Logs/`):
  - `tools/unity.sh exec Buried.Editor.Setup.Run`: creates the palette asset, URP assets, player
    settings and the Bootstrap scene. First run imports packages.
  - `tools/unity.sh test`: EditMode tests, results in `unity/Logs/editmode-results.xml`.
  - `tools/unity.sh build`: WebGL build into `web/public/unity/` (gitignored).
  - Equivalent raw commands: `Unity -batchmode -quit -projectPath unity -executeMethod Buried.Editor.Build.WebGL`
    and `Unity -batchmode -projectPath unity -runTests -testPlatform EditMode -testResults unity/Logs/editmode-results.xml`.
- Studio service (spec 04), run from `pipeline/`: dev server, service tests, Docker build and
  deploy steps are added by spec 04 tasks 3 and 15.2 (spec 04 requirement 22.4). Studio end-to-end tests
  (`npm run test:e2e:studio`) by spec 04 task 16.2. Report print tests
  (`npm run test:e2e:report`) by spec 05 task 7.3.

## Model use in Kiro

- Opus: specs and design decisions.
- Sonnet: implementation.
- Haiku: mechanical edits.
