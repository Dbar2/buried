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

### Not decided yet

Hosting, any API server, PDF rendering, the runtime AI provider (Amazon Bedrock or a direct API)
and the basemap provider are open. Do not pick them in passing. The spec that needs one decides it
and records why.

## Responsibilities

- **Web shell** owns all DOM UI: search, depth gauge, evidence card, Report, and the whole Studio.
- **Unity** renders the 3D Explorer scene. It draws what it is given. It does not decide dates,
  confidence or "on this lot"; those results arrive over the bridge, computed elsewhere.
- **Pipeline** fetches plates, checks alignment, segments footprints and writes evidence.
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

- Web shell install, dev, build, test: to be added by the spec that creates them.
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
  - `tile`, `extract`, `publish` and `match` are registered and exit 2 with "not
    implemented yet" until their tasks land.
- Unity WebGL build and EditMode test run: to be added by the spec that creates them.

## Model use in Kiro

- Opus: specs and design decisions.
- Sonnet: implementation.
- Haiku: mechanical edits.
