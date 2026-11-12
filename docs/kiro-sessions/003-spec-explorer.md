# Kiro session 003: spec for the Explorer (Unity + web shell)

Agent: architect (claude-opus-5.5). Writes only steering, specs and docs.

## Task

Read `.kiro/steering/`, `docs/concept-brief.md` (sections 3, 6, 8) and the finished specs in
`.kiro/specs/01-evidence-model/` and `.kiro/specs/02-pipeline/`. Then write
`.kiro/specs/03-explorer/` as `requirements.md`, `design.md` and `tasks.md`, in the same format
as the earlier specs.

## What the Explorer is

The 3D experience: a dusk, foggy neighbourhood you dig through. Depth is time. It is a Unity 6
(6000.3.26f1, URP) project in `unity/`, built to WebGL and embedded in the React shell in `web/`.

### Hard constraints

- **Runtime-built scene.** One bootstrap scene. Everything about the showcase area is created at
  runtime from data the shell sends: extruded footprints, draped rasters, water. No hand-placed
  buildings. The Unity project must also build headless:
  `Unity -batchmode -quit -projectPath unity -executeMethod Buried.Editor.Build.WebGL`.
- **Coordinates.** Unity world = EPSG:26917 metres minus the project origin in
  `data/project.json` (x east, y up, z north). The origin lives in one place and is sent over the
  bridge; no constant is duplicated in C#.
- **One typed bridge.** Shell to Unity by `SendMessage` to a single `Bridge` GameObject with a JSON
  envelope `{ type, payload }`; Unity to shell through a `.jslib` plugin that calls
  `window.buriedBridge.onMessage(json)`. The message catalogue is one JSON Schema in
  `data/schema/bridge.schema.json`; TypeScript types and C# DTOs are checked against it by tests.
  Messages needed: `scene/init` (origin, bounds, eras), `scene/loadEra` (era id plus the per-era
  feature list computed by `web/src/evidence/`), `scene/setDepth` (continuous 0..n for transitions),
  `scene/focusLot`, `scene/selectFeature`, `scene/setLantern` (on/off, screen position, era),
  `scene/showEvidence` (feature id, on/off), `scene/addFeatures` (Studio publish: buildings rise),
  and from Unity: `ready`, `featureClicked`, `featureHovered`, `cameraChanged`, `error`.
- **Unity never computes dates or confidence.** It draws what it is told. Confidence arrives as a
  field and maps to a visual treatment: documented (solid ink outline, filled), estimated (dashed
  outline, lighter fill), unknown (soft fog volume, no hard edges). Pattern and label, never colour
  alone; the label itself is DOM, drawn by the shell from `featureHovered`.
- **The shell owns all text and UI.** Search, depth gauge, era labels, evidence card, list view.
  Unity renders world-space visuals only. No Unity UI canvas.
- **Fallbacks.** `prefers-reduced-motion` gives crossfades only. If WebGL 2 is missing or the build
  fails to load, the shell shows the 2D map view with the same data and says why. The Report must
  never depend on Unity.
- **Budget.** First interactive frame in under 8 s on a mid-range laptop on a fast connection;
  compressed build under 15 MB; 60 fps target on desktop, 30 fps floor. State how each is measured.

### Look

Follow `.kiro/steering/design.md`. Dusk sky, distance fog, cold slate present-day buildings, warm
bone ghosts with ink outlines, lantern-amber selection, teal buried water. The plate or aerial for
the current era is draped on the ground. Era transitions take 600 to 900 ms: the present drains to
wireframe, then to a faint outline; ghosts rise from the ground. The camera never moves unasked
except on fly-to after a search or story step.

### Task ordering

The first group of tasks must reach this checkpoint and nothing more, because it is a go/no-go gate
due Nov 14: the WebGL build loads inside the shell, draws one plate draped on the ground and at
least one extruded footprint from a real evidence file at the correct position, shows its
provenance in a DOM card on click, and switches between two eras without the alignment moving.
Give that checkpoint an explicit verification task (a Playwright screenshot test comparing the
projected screen position of three known ground control points across both eras, within 2 px).

After the gate: Dig transitions, ghost treatments, the Lantern, Show Evidence (plate projected
beneath a transparent ghost), Water remembers, fly-to on search, keyboard paths, list view, the 2D
fallback.

Include Unity EditMode tests for the pure parts (coordinate conversion, polygon triangulation and
extrusion, bridge message parsing), and property tests where a property is real: extrusion never
produces degenerate triangles for valid simple polygons; world-to-data-to-world round-trips within
1 mm; every bridge message in the schema parses on both sides.

## Rules for this session

- Write only inside `.kiro/specs/03-explorer/`.
- No implementation code.
- Plain, direct English. No marketing language, no emoji.
- Reply with the files written and any open question.

## Present-day data: decided

Checked on the City of Toronto Open Data portal (CKAN) on Nov 12, 2026. All four are published
under the Open Government Licence - Toronto. Add them to `.kiro/steering/sources.md` with the
attribution line "Contains information licensed under the Open Government Licence - Toronto." and
resolve the matching "not decided yet" items in `tech.md`:

| Use | Dataset (CKAN package id) | Formats |
|---|---|---|
| Present-day building footprints | `topographic-mapping-building-outlines` | GeoJSON, GPKG, SHP |
| Lots for the Report and the pinned lot | `property-boundaries` | GeoJSON, GPKG, SHP |
| Address search inside the coverage area | `address-points-municipal-toronto-one-address-repository` | GeoJSON, GPKG, CSV |
| Street corners as alignment control references | `intersection-file-city-of-toronto` | GeoJSON, GPKG, CSV |

The `3d-massing` package still exists (SHP, refreshed Dec 2025) and may supply present-day building
heights; treat it as optional and fall back to a fixed storey height when a height is missing.

The pipeline clips each dataset to the showcase bounds and writes small files under `data/present/`.
Nothing citywide is committed or shipped. Add a pipeline task for this clip to spec 02's `tasks.md`
(a new numbered task at the end, so existing numbering does not move), and reference it from the
Explorer spec.

For this session you may therefore also edit `.kiro/steering/sources.md`, `.kiro/steering/tech.md`
and `.kiro/specs/02-pipeline/tasks.md`.
