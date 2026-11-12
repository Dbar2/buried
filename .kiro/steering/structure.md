---
inclusion: always
---

# Structure

## Repository layout

```
web/        Vite + React + TypeScript shell: all DOM UI, Studio, Report, bridge (JS side)
unity/      Unity 6 project: Explorer scene, runtime mesh building, bridge (C# side, .jslib)
pipeline/   Python 3.12: fetch, inspect, align check, tile, extract, publish
data/
  schema/       JSON Schemas shared by pipeline, shell and Unity
  sources.json  Source registry
  project.json  Project origin, bounds and eras
  evidence/     Versioned JSON/GeoJSON evidence files (the contract)
  control/      Control point files, one per aligned raster
  alignment/    Alignment records, one per aligned raster
  present/      Present-day City of Toronto layers, clipped to the project bounds
  tiles/        Web- and Unity-ready showcase rasters (published)
  raw/      Archival downloads (gitignored)
  work/     Intermediate pipeline output (gitignored)
docs/       Concept brief, Kiro session notes, write-up material
.kiro/      Steering, specs, hooks, agents. Never gitignored.
```

## What belongs where

- **`web/`**: UI components, the Studio, the Report, the bridge module, the 4326/3857 conversion
  at the map edge. No pipeline code. No copies of evidence data; read it from `data/`.
- **`unity/`**: scene setup, materials, procedural extrusion, raster draping, the C# side of the
  bridge and its `.jslib` plugin. Nothing in the showcase area is placed by hand in a scene file.
  Blender hero props (GLB) live here as assets. Building geometry never comes from Blender.
- **`pipeline/`**: everything that reads rasters or writes evidence. Pure maths (transforms,
  residuals, intervals) is kept separate from file and network I/O. The Studio service
  (`pipeline/buried_pipeline/service/`, spec 04) lives here too and calls the same functions as
  the CLI.
- **`data/schema/`**: the evidence schema, the bridge message schema and the Studio service API
  schema (`studio_api.schema.json`, with its fixtures in `data/schema/studio_api_fixtures/`). A
  change to a schema is a reviewed change with a version bump, never a side effect of other work.
- **`data/sources.json`**: the source registry. A reviewed hand edit. Only sources with a row in
  `sources.md`.
- **`data/project.json`**: the project origin (E0, N0), the project bounds and the eras. Created
  once by the evidence model spec; the origin is frozen after the first evidence is published.
- **`data/evidence/`**: written by the pipeline's `publish` and `match` steps, or by a reviewed
  hand edit. Every file validates against the schema.
- **`data/control/`**: `<source id>.json`, control points read by a person: plate pixels paired
  with present-day reference features. Committed, so alignment can be remeasured.
  `data/control/map_area/<source id>.json` holds each plate's map area: the pixel polygon of map
  content, set once by a person. Committed.
- **`data/alignment/`**: `<source id>.json`, written by `buried align-check`. Committed.
- **`data/present/`**: `<source id>.geojson`, present-day layers written by `buried present`,
  clipped to the project bounds and in EPSG:26917. Small files only; never a citywide copy.
- **`data/tiles/`**: only the showcase plates and aerials, downsampled for the web. Never a bulk
  copy of a collection. Each plate tile shows its map area only; a separate full uncropped image
  (`<source id>_full.jpg`) is published for the Sources page.
- **`data/raw/`**: fetched by the pipeline. Gitignored. Never referenced by the shell or Unity.
- **The Studio workspace** (spec 04) is the visitor's store in the browser (IndexedDB). It is not
  part of `data/`, is never committed, and nothing in it is canon. It reaches the repository only
  through an exported bundle that the maintainer reviews and publishes with the pipeline.
- **`docs/`**: human-facing notes. Code does not read from `docs/`.
- **`.kiro/`**: `steering/`, `specs/`, `hooks/`, `agents/`. Specs live in
  `.kiro/specs/<NN>-<name>/` as `requirements.md`, `design.md`, `tasks.md`.

## File naming

- TypeScript: React components `PascalCase.tsx`; other modules `camelCase.ts`; tests next to the
  code as `*.test.ts(x)`.
- Python: modules and packages `snake_case.py`; tests `test_*.py`.
- C#: one type per file, file name matches the type in `PascalCase.cs`. EditMode tests in an
  `Editor` tests assembly.
- Data: lowercase, `snake_case`, no spaces. JSON files `.json`, geometry files `.geojson`.
- Dates in file names and data: ISO 8601 (`2026-11-12`).

## Source ids

A source id names one archival item. Lowercase, `snake_case`, built from what the archive calls it.

- Fire insurance plates: `fip_v<volume>_<edition year>_<plate>`, where the edition year is the one
  in U of T's file name (`v3-1911-229`, `v3-1935-229`). So the 1911 (revised to 1914) edition is
  `fip_v3_1911_*`, and the edition the plates letter "January 1931, revised to May 1935" is
  `fip_v3_1935_*`: `fip_v3_1911_229`, `fip_v3_1911_232`, `fip_v3_1935_229`, `fip_v3_1935_232`. The
  year range is stored on the source record, not in the id.
- 1947 aerials: `aerial_1947_<id>`, where `<id>` is the record identifier from the U of T index
  service, lowercased.
- Studio uploads (workspace only, never in `data/sources.json`): `ws_upload_<first 12 hex
  characters of the image's SHA-256>`. An upload that enters canon gets a new id agreed in
  `sources.md`, and the export rewrites every id that contains the old one.
- Other sources: `<type>_<publisher>_<year or edition>`, agreed in `sources.md` before first use.
  When one publisher supplies several datasets, the dataset name goes after the publisher:
  `<type>_<publisher>_<dataset>_<year or edition>`. Present-day City of Toronto layers use type
  `present` and the retrieval year, for example `present_toronto_intersections_2026`.
- A source id is never reused or renamed once evidence cites it.

## Evidence ids

- Feature id: `<kind>_<origin source id>_<4-digit sequence>`, where kind is `bld` (building),
  `wtr` (water) or `use` (land-use area). Example form: `bld_fip_v3_1911_229_0001`.
- The origin source is the source the geometry was first read from. Later observations from other
  sources attach to the same id.
- A building drawn on two plates is two features, one per origin source, linked with `same_as`.
  Each keeps its own id and provenance. Linking is not merging.
- Ids are stable. Never renumber, never reuse a retired id. A rejected or merged feature keeps its
  id with a status that says so.

## Evidence files

- One GeoJSON FeatureCollection per origin source: `data/evidence/<origin source id>.geojson`.
- Each file carries a `schema_version`. Git history is the version history.
