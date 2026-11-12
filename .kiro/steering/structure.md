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
  schema/   JSON Schemas shared by pipeline, shell and Unity
  evidence/ Versioned JSON/GeoJSON evidence files (the contract)
  tiles/    Web- and Unity-ready showcase rasters (published)
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
  residuals, intervals) is kept separate from file and network I/O.
- **`data/schema/`**: the evidence schema and the bridge message schema. A change to a schema is
  a reviewed change with a version bump, never a side effect of other work.
- **`data/evidence/`**: written by the pipeline's publish step, or by a reviewed hand edit.
  Every file validates against the schema.
- **`data/tiles/`**: only the showcase plates and aerials, downsampled for the web. Never a bulk
  copy of a collection.
- **`data/raw/`**: fetched by the pipeline. Gitignored. Never referenced by the shell or Unity.
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

- Fire insurance plates: `fip_v<volume>_<edition year>_<plate>`.
  The 1911 (revised to 1914) edition uses its first year: `fip_v3_1911_229`, `fip_v3_1911_232`,
  `fip_v3_1935_229`, `fip_v3_1935_232`. The revision range is stored on the source record, not in
  the id.
- 1947 aerials: `aerial_1947_<id>`, where `<id>` is the record identifier from the U of T index
  service, lowercased.
- Other sources: `<type>_<publisher>_<year or edition>`, agreed in `sources.md` before first use.
- A source id is never reused or renamed once evidence cites it.

## Evidence ids

- Feature id: `<kind>_<origin source id>_<4-digit sequence>`, where kind is `bld` (building),
  `wtr` (water) or `use` (land-use area). Example form: `bld_fip_v3_1911_229_0001`.
- The origin source is the source the geometry was first read from. Later observations from other
  sources attach to the same id.
- Ids are stable. Never renumber, never reuse a retired id. A rejected or merged feature keeps its
  id with a status that says so.

## Evidence files

- One GeoJSON FeatureCollection per origin source: `data/evidence/<origin source id>.geojson`.
- Each file carries a `schema_version`. Git history is the version history.
