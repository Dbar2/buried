# Kiro session 001: steering docs

Model: claude-opus-5.5 (Kiro CLI). Tools: file read and write only.

## Task

Read `docs/concept-brief.md` in full. It is the product brief for **Buried**, a Kiroween 2026 entry
(category: Resurrection). Then write the steering docs for this repository into `.kiro/steering/`.

The brief was written before the decisions below were made. Where the brief and these decisions
disagree, **these decisions win** and the steering docs must reflect them.

## Decisions made since the brief

1. **The Explorer's 3D is built in Unity, not Three.js.** Unity 6 (6000.3.26f1), URP, WebGL build,
   embedded in the web shell. The Unity scene is built at runtime from evidence data: footprints are
   extruded procedurally, rasters are draped on ground quads. Nothing about the showcase area is
   hand-modelled in the editor. Unity units are metres. World position = EPSG:26917 easting/northing
   minus one fixed project origin, so alignment is exact by construction (x = east, z = north, y = up).
2. **Blender is only for hero props and video stills** (for example the lantern). Exported as GLB.
   It is never the source of building geometry.
3. **Web shell:** Vite + React + TypeScript. The shell owns all DOM UI: search, depth gauge, evidence
   card, Report, and the whole Reconstruction Studio (2D plate work, using MapLibre GL JS for today's
   map). The shell talks to Unity through one typed bridge (a `.jslib` plugin plus `SendMessage`),
   with a message schema shared by both sides.
4. **Pipeline:** Python 3.12 with rasterio/GDAL, OpenCV, shapely and pyproj. It is run from the
   terminal through Kiro CLI. It fetches plates, checks alignment, segments footprints and writes
   evidence.
5. **Evidence store:** versioned JSON/GeoJSON files under `data/evidence/`, validated by one JSON
   Schema that the pipeline, the web shell and Unity all read. A database can come later; the files
   are the contract.
6. **Raw archival downloads live in `data/raw/` and are gitignored.** Only the showcase plates,
   tiled for the web, are published. Every source needs a licence and attribution line before use.
7. **Showcase area:** Eastern Avenue at the Don River, Toronto. Goad fire insurance plan Volume 3,
   plates 229 and 232, editions 1911 (revised to 1914) and 1935, plus the 1947 aerial photographs.
   Plate 232 (1935) is the **held-out plate**: it is never used to tune extraction and is the one
   processed live in the demo.
8. **Tests:** Vitest + fast-check for TypeScript, pytest + Hypothesis for Python, Unity EditMode
   tests for C#. The property tests in section 10.6 of the brief are requirements, not nice-to-haves.
9. **Repository layout:** `web/` (shell), `unity/` (Unity project), `pipeline/` (Python),
   `data/` (schema, evidence, tiles), `docs/`, `.kiro/`.
10. **Model use in Kiro:** Opus for specs and design decisions, Sonnet for implementation, Haiku for
    mechanical edits.

## Files to write

Write each as Markdown with Kiro steering front matter (`inclusion: always`, or
`inclusion: fileMatch` with a `fileMatchPattern` where a doc only matters for some files).

- `.kiro/steering/product.md` (always): what Buried is, the three parts (Explorer, Studio, Report),
  who it is for, scope at submission and the cut list, and the honesty rules as hard rules: banned
  words, "on this lot" vs "near this lot", absence must be clear, no source no claim, "Buried
  screens; it doesn't certify", the AI proposes and a person confirms, code does the maths.
- `.kiro/steering/tech.md` (always): the stack above, coordinate systems (EPSG:26917 for data and
  Unity, 4326/3857 only at the web map edge), the project origin rule, the shell-to-Unity bridge
  rule, testing rules, and commands. Do not invent commands for tooling that does not exist yet;
  mark them "to be added by the spec that creates them".
- `.kiro/steering/structure.md` (always): the repository layout, what belongs where, naming
  conventions for files, evidence ids and sources.
- `.kiro/steering/design.md` (fileMatch for `web/**` and `unity/**`): palette tokens, type, motion,
  the confidence encoding (pattern and label, never colour alone), accessibility, "the Report takes
  the costume off". Add one section on how the Unity scene should look: dusk, fog, cold present,
  warm past, ink-on-paper ghosts. Be specific and restrained; no generic "modern, sleek" language.
- `.kiro/steering/evidence.md` (fileMatch for `data/**`, `pipeline/**`): the evidence model, the
  date logic from section 8.3 as precise rules, position error, observation visibility.
- `.kiro/steering/sources.md` (always): a table of every source in section 9 with status, licence
  note and the exact attribution line. Include these confirmed download patterns:
  - 1911 edition: `https://maps.library.utoronto.ca/datapub/FIP/vol3_19111914/v3-1911-<plate>.zip`
  - 1935 edition: `https://maps.library.utoronto.ca/datapub/FIP/vol3_1935/Georeferenced/v3-1935-<plate>.zip`
  - 1947 aerials: index service `Toronto_Aerial_Photographs_1947_Index` on U of T's ArcGIS org;
    each record has a `zip_url`.
  Attribution for plates: "Digitized and georeferenced by the University of Toronto Map & Data Library."

## Rules for this session

- Write only inside `.kiro/steering/`. Do not create code, specs or any other file.
- Plain, direct English. Short sentences. No marketing language, no emoji.
- Keep each file focused; a steering doc that is too long gets ignored. Aim for under 150 lines each.
- Do not state facts about the showcase blocks (what stood where) that the brief does not contain.
- When you are done, reply with a short list of the files written and any conflict you found
  between the brief and the decisions.
