# Design: 03 Explorer

## Overview

```
data/project.json, sources.json, evidence/*.geojson, present/*.geojson, tiles/*.{json,jpg}
        │  (served read-only at /data/ by the Vite data plugin; never copied into git)
        ▼
web/src/data/            load + validate (Evidence Library load functions, Ajv)
        │
        ▼
web/src/evidence/        featuresForEra, datePhrases, positionPhrase, ...   (spec 01, unchanged)
        │
        ▼
web/src/explorer/        scene model: era order, scene features, drapes, depth, lantern, lot,
        │                search, coverage; React UI (gauge, card, list, hover label, status)
        │
        ├──► web/src/map/        2D fallback (MapLibre, no basemap); edge.ts is the only 26917↔4326
        │
        ▼
web/src/bridge/          the only sender/receiver: validate (Ajv) ─► SendMessage("Bridge","Receive")
        ▲                                                   ◄─ window.buriedBridge.onMessage(json)
        │                                                          │
════════╪═══════════════════ data/schema/bridge.schema.json ════════╪═════════════════════
        │                                                          │
unity/Assets/Buried/Runtime/Bridge/   Bridge.Receive(json) ─► parse + validate ─► SceneController
                                      BuriedBridge.jslib ◄── BridgeWriter ◄── events
        │
        ▼
Runtime/Scene/           build meshes and drapes from payloads; depth blend; lantern; picking;
                         camera rig; pinned lot; markers.       Draws what it is told.
```

- The Shell computes every fact. The Player receives positions, shapes, heights, confidence classes
  and image URLs, and turns them into pixels.
- No year values cross the bridge. The Player knows eras only by id and index. Era ids such as
  `1911` and feature ids such as `bld_fip_v3_1911_229_0001` contain digits, but the Player treats
  every id as an opaque string and never parses it.
- The Report (later spec) uses `web/src/evidence/` and `web/src/data/` and never imports
  `web/src/explorer/UnityView.tsx` or `web/src/bridge/`.

## Files

### Shell (`web/`)

Spec 01 created the minimal `web/` package. This spec adds Vite, React, MapLibre, Playwright and
the modules below to the same package.

| Path | Contents |
|---|---|
| `web/index.html`, `web/vite.config.ts` | Vite app entry and config |
| `web/vite/dataPlugin.ts` | Serves `/data/<allowed path>` from the repo's `data/` in dev; copies the allowed paths into `dist/data/` at build; serves and emits `/data/index.json` (the list of evidence, present and tile files). Allowed: `project.json`, `sources.json`, `evidence/`, `present/`, `tiles/`, `control/` (debug markers only). Never `raw/`, `work/`. |
| `web/src/main.tsx`, `web/src/App.tsx` | Routes: `/` Explorer, `/sources` Sources page. The Report route is added by its spec. |
| `web/src/styles/tokens.css` | The palette tokens from `design.md` as CSS custom properties; the only hex values in `web/src/`. |
| `web/src/styles/fonts.css`, `web/public/fonts/` | Self-hosted Fraunces, Inter, IBM Plex Mono (SIL OFL), with their licence files. |
| `web/src/data/loadData.ts` | Fetches `/data/index.json` and every listed file; validates with spec 01's `load.ts` / `schema.ts` (`featureCollection`, `sourceRegistry`, `project`, `presentLayer`, `tileSidecar`, `controlPoints`). |
| `web/src/bridge/bridge.schema.ts` | Imports `data/schema/bridge.schema.json` and `evidence.schema.json` for Ajv. |
| `web/src/bridge/types.generated.ts` | Types generated from the Bridge Schema. Never hand-edited. |
| `web/src/bridge/bridge.ts` | `createBridge(unityInstance)`: `send(msg)` validates then calls `SendMessage`; installs `window.buriedBridge.onMessage`, validates incoming, dispatches typed events. The only module that touches either. |
| `web/src/bridge/testing/arbitraries.ts` | fast-check generators for every message type. |
| `web/scripts/genBridgeTypes.ts`, `web/scripts/genBridgeSamples.ts` | Type generation; deterministic sample generation into `data/schema/bridge_fixtures/generated/`. |
| `web/scripts/checkUnitySize.ts` | Sums `web/public/unity/Build/` and fails over 15,000,000 bytes. |
| `web/src/explorer/eraOrder.ts` | Pure: eras from the project file to `[{ id, index, label }]`, Today first. |
| `web/src/explorer/initialView.ts` | Pure: the rectangle the default camera pose frames (see "Initial view"). |
| `web/src/shell/Header.tsx`, `web/src/shell/layout.css` | The Shell's header and page layout (see "Layout"). |
| `web/src/explorer/sceneFeatures.ts` | Pure: `toSceneFeature(entry)`, height rule, `land_use` filter. |
| `web/src/explorer/drapes.ts` | Pure: `drapesForEra(era, sources, sidecars)`, `drapeForSource(id)`. |
| `web/src/explorer/presentBuildings.ts` | Pure: present layer to `PresentBuilding[]`. |
| `web/src/explorer/depth.ts` | Pure: depth tween, wheel step, nearest era, adjacent eras to keep loaded. |
| `web/src/explorer/sceneModel.ts` | Pure reducer: what the Player holds per era; turns Shell state changes into the message list to send (load, add, depth, lantern, water). |
| `web/src/explorer/coverage.ts`, `lots.ts`, `search.ts` | Pure (JSTS, EPSG:26917): coverage union, point-in-lot, address index and query. |
| `web/src/explorer/sourceCrop.ts` | Pure: EPSG:26917 rectangle to tile pixel rectangle through the inverse of the sidecar corners. |
| `web/src/explorer/cardModel.ts` | Pure: builds the evidence card's text lines from an Era list entry, the linked set, the registry and the Evidence Library. |
| `web/src/explorer/Explorer.tsx`, `UnityView.tsx`, `DepthGauge.tsx`, `EvidenceCard.tsx`, `FeatureList.tsx`, `HoverLabel.tsx`, `SearchBox.tsx`, `LanternControl.tsx`, `WaterControl.tsx`, `Attribution.tsx`, `StatusLine.tsx` | React components. `UnityView` is the only importer of the Unity loader and of `bridge.ts`, and is loaded with `React.lazy`. |
| `web/src/explorer/webgl.ts` | WebGL 2 detection. |
| `web/src/map/edge.ts` | The only EPSG:26917 ↔ EPSG:4326 conversion (proj4 with the EPSG:26917 definition). |
| `web/src/map/MapView2D.tsx` | 2D fallback. |
| `web/src/sources/SourcesPage.tsx` | Sources page. |
| `web/e2e/*.spec.ts`, `web/playwright.config.ts` | End-to-end tests against `vite preview` with the real Unity build. |
| `web/public/unity/` | Player build output. Gitignored. |

### Player (`unity/`)

```
unity/
  Packages/manifest.json          URP, com.unity.nuget.newtonsoft-json, com.unity.test-framework
  ProjectSettings/                 Linear colour space, WebGL 2 only, Brotli + decompression fallback
  Assets/
    Buried/
      Scenes/Bootstrap.unity       one root GameObject "Bridge" (Bridge + SceneBootstrap components)
      Runtime/                     asmdef Buried.Runtime (no UnityEngine.UI, no TextMeshPro)
        Bridge/                    Bridge.cs, BridgeParser.cs, BridgeWriter.cs, JsBridge.cs,
                                   BridgeValidationException.cs, one DTO per payload (e.g.
                                   SceneInitPayload.cs, SceneFeatureDto.cs, DrapeDto.cs ...)
        Plugins/WebGL/BuriedBridge.jslib
        Geo/                       ProjectFrame.cs, GeoPosition.cs
        Meshing/                   PolygonPrep.cs, Triangulator.cs, Extruder.cs, EdgeMeshBuilder.cs,
                                   RibbonBuilder.cs, DrapeMeshBuilder.cs, DrapeMaskBuilder.cs,
                                   MeshChunk.cs
        Scene/                     SceneBootstrap.cs, SceneController.cs, EraLayer.cs,
                                   PresentLayer.cs, DrapeLayer.cs, DepthBlend.cs, LanternMask.cs,
                                   LanternController.cs, Picker.cs, CameraRig.cs, CameraRigMath.cs,
                                   CameraFlight.cs, LotMarker.cs, DebugMarkers.cs, TextureCache.cs,
                                   RiseAnimator.cs
        Look/                      BuriedPalette.cs (ScriptableObject), Palette.asset,
                                   LookSettings.cs, Shaders/*.shader, Textures/QuestionMark.png
      Editor/                      asmdef Buried.Editor: Build.cs (namespace Buried.Editor, class
                                   Build, static WebGL())
      Tests/EditMode/              asmdef Buried.Tests.EditMode (Editor only): tests + PropertyRunner.cs
```

No third-party source is vendored: the triangulator is Buried's own (see "Meshing" and "Decisions
and reasons").

One type per file, file name matches the type (`structure.md`).

### Shared (`data/schema/`)

| Path | Contents |
|---|---|
| `data/schema/bridge.schema.json` | The Bridge Schema |
| `data/schema/bridge_fixtures/valid/<message dir>/*.json` | Hand-written valid messages. `<message dir>` is the type with `/` replaced by `_` (`scene_init`). |
| `data/schema/bridge_fixtures/invalid/<message dir>/<reason>.json` | One reason per file, named after it. |
| `data/schema/bridge_fixtures/generated/<message dir>/<n>.json` | Deterministic random valid messages from `genBridgeSamples.ts` (fixed seed, 50 per type). |

Bridge fixtures live outside `data/schema/fixtures/` because spec 01's conformance tests treat each
directory there as an evidence `$defs` entry.

## Bridge

### Envelope and transport

```
{ "type": "<message type>", "payload": { ... } }
```

- Shell to Player: `unityInstance.SendMessage("Bridge", "Receive", JSON.stringify(envelope))`.
- Player to Shell: `BuriedBridge.jslib` exports `BuriedBridge_Send(ptr)` which calls
  `window.buriedBridge.onMessage(UTF8ToString(ptr))`. `JsBridge.cs` declares it with
  `[DllImport("__Internal")]`. In the editor (no WebGL), `JsBridge` writes to the log instead.
- `window.buriedBridge` is defined by `bridge.ts` before the Unity loader starts, and nowhere else.

### Schema layout

- `$schema` draft 2020-12, `$id` `bridge.schema.json`.
- Root: `oneOf` over one envelope per message type, each
  `{ type: { const: "<type>" }, payload: { $ref: "#/$defs/<payload def>" } }`,
  `additionalProperties: false`.
- `position`, `featureId` and `sourceId` are `$ref`s to `evidence.schema.json#/$defs/...`.
  Ajv loads both schemas; the C# parser implements the same checks by hand.
- Every object has `additionalProperties: false`. Every number is finite (JSON cannot carry
  NaN or Infinity; the C# parser also rejects them).
- Field names are camelCase, matching the Evidence Library's `EraFeature`.

Bridge version: `1.0.0` for the full catalogue. The gate uses a subset at `0.1.0` (tasks.md group
1). The look pass adds `initialView` and `debug/setCamera` at `0.2.0` (task 16.1); the drape `clip`
comes at `0.3.0` (task 17.1); group 2 completes the catalogue at `1.0.0`. The version is the
`const` of `bridgeVersion` in `scene/init` and `ready`, and `BridgeVersion.Value` in
C#, checked equal by an EditMode test that reads the schema.

### Common definitions

```
geometry      = GeoJSON Polygon | MultiPolygon | LineString | MultiLineString, positions only
                (EPSG:26917, $ref position)
screenPoint   = { x: number 0..1, y: number 0..1 }      // normalised canvas coords, origin top-left
drape         = { sourceId, url: string (relative, starts with "/data/tiles/"),
                  corners: { topLeft, topRight, bottomRight, bottomLeft: position },
                  widthPx: int >= 1, heightPx: int >= 1,
                  clip?: Polygon (EPSG:26917 positions; the plate's map area, from the sidecar's
                         `map_area`; bridge 0.3.0 on) }
rect          = { minE, minN, maxE, maxN: number }      // EPSG:26917, minE < maxE, minN < maxN
sceneFeature  = { id: featureId, kind: "building" | "water",
                  geometry, confidence: "documented" | "estimated" | "unknown",
                  heightM: number > 0 }                 // buildings: polygon types only
presentBuilding = { id: string, geometry: Polygon | MultiPolygon, heightM: number > 0 }
lot           = { id: string, geometry: Polygon | MultiPolygon }
eraRef        = { id: string, index: int >= 0 }
```

`if/then` blocks: a `building` scene feature has polygon geometry; `water` may be any of the four.

### Message catalogue

Shell to Player:

| Type | Payload | Player does |
|---|---|---|
| `scene/init` | `{ bridgeVersion, origin: { easting, northing }, bounds: { minE, minN, maxE, maxN }, initialView: rect (inside bounds; 0.2.0 on), eras: [eraRef] (indexes 0..n−1, each once), present: [presentBuilding], reducedMotion: bool, debug: bool }` | Checks version and 4000 m rule, builds frame, sky, fog, ground, present buildings, camera at the default pose framed on `initialView`. Clears any previous scene. |
| `scene/loadEra` | `{ eraId, features: [sceneFeature] (unique ids), drapes: [drape] }` | Replaces that era's content; builds meshes; loads textures; sends `eraLoaded`. |
| `scene/setDepth` | `{ depth: number 0..n−1 }` | Sets the blend (see "Depth"). |
| `scene/focusLot` | `{ lot: lot \| null, fly: bool }` | Pins or clears the lot; flies if asked. |
| `scene/selectFeature` | `{ featureId: featureId \| null }` | Selected treatment (brighter, thicker `ink` edges) on that feature in any era that has it. |
| `scene/setLantern` | `{ on: bool, center: screenPoint, radius: number 0.05..0.5 (fraction of canvas height), eraId: string }` | Lens on or off. |
| `scene/showEvidence` | `{ featureId, on: bool, drape: drape \| null }` (drape required when on) | Show Evidence on or off. |
| `scene/addFeatures` | `{ eraId, features: [sceneFeature] }` | Adds or replaces by id; rise animation. |
| `scene/setReducedMotion` | `{ reducedMotion: bool }` | Switches motion mode. |
| `scene/setWaterRemembers` | `{ on: bool, eraIds: [string] }` | Water of those eras drawn with Today. |
| `debug/markers` | `{ markers: [{ id: string, position }] } (max 16)` | Draws markers (see "Gate verification"). Only when `debug` was true. |
| `debug/setCamera` | `{ target: position, distanceM: number 30..3000, pitchDeg: number 20..80, headingDeg: number 0..<360 }` (0.2.0 on) | Sets the camera pose exactly, inside the limits of requirement 16.3, and sends `cameraChanged` once. Only when `debug` was true; otherwise refused with `debug_disabled`. Used by the look and drape placement tests. |

Player to Shell:

| Type | Payload | Sent when |
|---|---|---|
| `ready` | `{ bridgeVersion, unityVersion: string }` | Once, after the first frame. |
| `eraLoaded` | `{ eraId, featureCount: int, drapeCount: int, failedDrapes: [sourceId] }` | After an era's meshes and textures are done. |
| `featureClicked` | `{ featureId, eraId }` | Click (pointer up within 4 px of pointer down) on a drawn feature. |
| `groundClicked` | `{ position }` | Click that hits no feature; ground point under the cursor, EPSG:26917. |
| `featureHovered` | `{ featureId: featureId \| null, eraId: string \| null, screen: screenPoint \| null }` | Hover target changes (at most 20 per second). |
| `cameraChanged` | `{ eye: { easting, northing, heightM }, target: { easting, northing, heightM }, fovDeg, viewProjection: [16 numbers, column-major, Unity world space], canvas: { widthPx, heightPx } }` | At most 10 per second while moving, and once when it stops. |
| `error` | `{ code: "invalid_message" \| "unknown_type" \| "bridge_version_mismatch" \| "bounds_too_far" \| "era_not_initialised" \| "texture_load_failed" \| "mesh_build_failed" \| "debug_disabled", message: string, messageType: string \| null }` | On any refusal or failure. |

Order rules: `scene/init` is always the first message. Any other message that arrives before it is
refused with `era_not_initialised`. `scene/loadEra`, `scene/addFeatures`, `scene/setLantern` and
`scene/setWaterRemembers` that name an era id not listed in `scene/init` are refused with the same
code.

### Validation on each side

- Shell, outgoing: `bridge.ts` runs Ajv on the envelope; invalid throws `BridgeError` and nothing is
  sent (requirement 4.7). Incoming: Ajv; invalid is logged with the Ajv errors and dropped.
- Player, incoming: `BridgeParser` parses with Newtonsoft `JToken.Parse` (no reflection-based
  deserialisation, which IL2CPP stripping can break) and reads each field by hand into its DTO,
  checking: required fields, no unknown fields, types, enums, `const`s, numeric ranges, array
  lengths, id patterns, position ranges, geometry shape (rings closed, at least 4 positions per
  ring, at least 2 per line). Failure throws `BridgeValidationException`; `Bridge.Receive` catches
  it, logs, sends `error` with `invalid_message` or `unknown_type`, and drops the message.
- Player, outgoing: `BridgeWriter` builds a `JObject` from the DTO and serialises it. No string
  concatenation of JSON anywhere.

### Conformance

- TS: every file under `bridge_fixtures/valid/` and `generated/` passes Ajv and `bridge.ts` parsing;
  every file under `invalid/` fails.
- C#: every file under `valid/` and `generated/` parses, and serialising the DTO gives JSON equal
  to the file (compared as parsed trees, numbers compared exactly as doubles); every `invalid/` file
  is refused. This covers both directions: Player-to-Shell fixtures prove `BridgeWriter` produces
  what Ajv accepts.
- C#: a reflection test reads `bridge.schema.json` and checks, for each message type, that the DTO
  has one field per schema property with the same name, required-ness and JSON type.
- Every message type in the schema has at least one valid fixture, one generated set and, for each
  `required`, `enum`, `const`, range and pattern in its payload, one invalid fixture.

## Shell

### Startup

1. `loadData`: project, registry, evidence files, present layers, tile sidecars. Any file that fails
   validation is reported ("This evidence file could not be read") and left out; nothing partial is
   drawn from it.
2. Compute Era lists with `featuresForEra` for every era, and the coverage area.
3. If `webgl.ts` finds no WebGL 2: 2D map with the reason. Else lazy-load `UnityView`, which calls
   `createUnityInstance` with the build files from `/unity/Build/`.
4. On `ready`: version check, then `scene/init`, then `scene/loadEra` for Today and depth 1, then
   `scene/setDepth { depth: 0 }`. Timeout for `ready`: 30 s. Until `sceneModel.ts` (task 3.5)
   decides what to keep loaded, the Shell sends `scene/loadEra` for every era at start (task 16.6);
   with four eras and small data this costs little.

### Initial view

`initialView(eraLists, drapes, bounds, mapAreas)` (pure, `initialView.ts`) gives the rectangle the
default camera pose frames. Session 015 (maintainer decision): the opening view frames the mapped
ground of the showcase plates, centred, with a margin.

```
INITIAL_VIEW_MAP_AREA_MARGIN = 0.15   // of the box's width and height, on each side
INITIAL_VIEW_MARGIN_M = 60            // fallback paths
INITIAL_VIEW_MIN_M    = 200
```

1. Take the bounding box of the map-area polygons of the tile sidecars (`mapAreas`), and grow it by
   `INITIAL_VIEW_MAP_AREA_MARGIN` of its width and height on each side.
2. With no map area, take the bounding box of the geometry of every entry in every era's Era list
   (the features the Player will draw, from `featuresForEra`; `land_use` excluded as for scene
   features), grown by `INITIAL_VIEW_MARGIN_M` on each side.
3. With none, the bounding box of every drape's four corners, grown the same way. With none
   either, return the project bounds.
4. Widen each side about the centre to at least `INITIAL_VIEW_MIN_M`, then clip to the project
   bounds.

It reads only geometry; no year, date or source rule is involved.

### Layout

The Shell's first real layout (task 16.6), dark theme, colours only from `tokens.css`:

- **Header** across the top, `night` background, height 56 px: the wordmark "Buried" in Fraunces
  at the left; links "Explorer" and "Sources" in Inter at the right.
- **3D view** fills the rest of the window under the header.
- **Depth gauge** over the right edge of the view, on a `fog` panel at 90% opacity: one stop per
  project era from `eraOrder`, Today at the top; labels "Today" in Inter, years in IBM Plex Mono,
  both in `text`; the current stop is marked by a filled `text` bar and a heavier label weight, the
  others by a thin `muted` tick. Never `lantern` or `water`; `ink` stays for the past in the scene.
- **Evidence card** at the left edge of the view, below the header, width 360 px, on `fog`; the
  heading in Fraunces 22 px, body in Inter 16 px, ids, years and the position figure in IBM Plex
  Mono. It opens beside the building, not over it, because the default view centres the building.
- **Attribution lines** along the bottom edge of the view, Inter 14 px in `muted` on `night` at 80%
  opacity. (14 px is allowed here as secondary text; body text stays at 16 px or more.)
- **Focus ring**: 2 px `text` outline with a 2 px `night` offset on every interactive element.

### Era order and drapes

- `eraOrder`: project eras sorted by `year_to` descending, ties by `year_from` descending; index 0 is
  Today. For the submission eras: `today` 0, `1947` 1, `1935` 2, `1911` 3.
- `drapesForEra(era)`: every tile sidecar whose source is `confirmed` and has
  `source.year_from <= era.year_from` and `source.year_to >= era.year_to`, sorted by source id. The
  drape order is the draw order. `url` is `/data/tiles/<image>`.
- These rules use source years, which is why they run in the Shell. They do not date features.

### Scene features and heights

```
STOREY_HEIGHT_M         = 3.5     // per recorded storey
UNRECORDED_HEIGHT_M     = 3.5     // building with no recorded storeys: one storey's height
PRESENT_HEIGHT_M        = 7.0     // every present building (no storey data is used)
WATER_RIBBON_MIN_M      = 2.0
```

- `toSceneFeature(entry)`: `id`, `kind`, `geometry`, `confidence` copied; buildings get
  `heightM = storeys × STOREY_HEIGHT_M` when `attributes.storeys` exists, else
  `UNRECORDED_HEIGHT_M`; water gets `heightM = max(WATER_RIBBON_MIN_M, 2 × positionErrorM)`, which
  the Player uses as the ribbon width for lines (so the drawn width shows the position error) and
  ignores for polygons. `land_use` entries are dropped.
- Heights are display values. The card shows storeys as read, or "Storeys: not recorded", and never
  a height in metres. `tech.md` says the Explorer spec sets the present-day height; it is
  `PRESENT_HEIGHT_M`, until 3D massing is licensed and specified.
- These constants live in `sceneFeatures.ts` and `presentBuildings.ts` only.

### Depth

- Depth `d` in `[0, n−1]`. `depth.ts` provides:
  - `tween(from, to, now)`: duration `ERA_TRANSITION_MS = 750` per era step, capped at 900 ms total,
    ease-in-out cubic, clamped, ending exactly at `to`.
  - Wheel: each unmodified wheel notch (normalised `deltaY`, 100 px = one notch) moves the target by
    one era; trackpad deltas accumulate until 100 px. The Shell sends interpolated depths every
    animation frame while tweening (at most 60 per second).
  - Gauge drag: depth follows the pointer continuously; on release it tweens to the nearest integer.
  - `erasToKeep(d, lanternEra, waterEras)`: floor(d), ceil(d), floor(d)±1, the Lantern era and the
    water eras. The Shell sends `scene/loadEra` for any of these not yet loaded.
- Reduced motion: the Shell still tweens (the Player turns it into a crossfade).

### Scene model

`sceneModel.ts` is a pure reducer from Shell state (era lists, depth, lantern, water, selection,
lot, evidence-on) to the list of messages to send, with a record of what the Player holds per era
(feature ids and drapes). `UnityView` sends what it returns through `bridge.ts`. Every message that
carries features takes them from `featuresForEra` for its era via `toSceneFeature`, so property
E5 can be tested on the reducer without Unity.

Studio publish (requirement 22.1): `applyEvidenceUpdate(collections)` recomputes all Era lists and
compares each with what the Player holds: an era whose new list is a superset with unchanged
existing entries gets `scene/addFeatures` with the new entries; any other difference gets a full
`scene/loadEra`.

### Evidence card

`cardModel.ts` builds:

- heading: `attributes.use` if recorded, else "Building" / "Water";
- `datePhrases(entry.dates)` joined with " · ";
- confidence label and `confidenceReason`;
- `positionPhrase(entry.positionErrorM)`;
- storeys or "Storeys: not recorded";
- per source checked (presences, absences, conflicts and not-counted from `entry.dates`, each source
  once): `<source id> (<years>): present`, `absent (clear)`, or `not readable (obscured)` /
  `not covered`, where `<years>` is spec 01's `sourceYearsText(source)` once it exists (spec 01
  task 19.1): the source's `years_label`, such as "1931, revised to 1935", else the range;
- "Read from <title>" and the attribution line of the drawn member's origin source;
- "Confirmed by <confirmed_by> on <date>" from that member's provenance;
- the feature id, and `linkedIds` when there is more than one.

Years, ids and the position figure are in IBM Plex Mono. Every string passes `findBannedWords`
(test).

Source crop: `sourceCrop.ts` takes the feature's EPSG:26917 bounding box grown by 10 m and maps its
corners into tile pixels through the inverse of the bilinear corner mapping (Newton iteration; for
an affine tile it is exact in one step), clamps to the image, and the card draws that part of the
tile in a `<canvas>` with the feature outline in `ink` over it. It uses the geometry rather than
`provenance.crop_px`, because the tile sidecar does not record the full-resolution raster size
needed to scale `crop_px` exactly.

### Search, lots and coverage

- Address index: the address points layer's full-address field (kept field confirmed in spec 02
  task 10.5), normalised to upper case with punctuation removed and spaces collapsed. Query is
  prefix-by-token: every query token must prefix a token of the address. Up to 8 results, sorted by
  address.
- `lots.ts`: lot containing the point (JSTS `contains`, then `covers` for boundary points; the
  first by lot id if several).
- `coverage.ts`: union of all `mapped_area`s. A lot is in coverage if it intersects it with positive
  area.
- Messages: no match or lot outside coverage gives exactly "Not reconstructed yet." Search does not
  use the network.

### Lantern

- Space keydown (not repeated) with focus inside the Explorer region and depth 0: `on: true`,
  center = last pointer position over the canvas, else the canvas centre. Pointer moves update the
  centre at most once per animation frame. Arrow keys while held move it by 0.05 (requirement
  13.7). Keyup: `on: false`.
- Touch: long-press 500 ms without moving more than 8 px.
- Radius: 0.18 of the canvas height.
- Lantern era: `LanternControl` select, default index 1.

### Water remembers

`WaterControl` toggle at depth 0. `eraIds` = past eras whose Era list has a `water` entry. DOM text:
"Water shown from the <labels> records." With none: "No documented water in these records", then
the eras checked. Water features come from the Studio (spec 04), where a person traces the river
channel, shorelines and creeks from a plate as lines or polygons with the same provenance and
position error rules as buildings. There is no automatic water extraction. Until a water feature is
published, the path is built and tested on synthetic water features.

### 2D fallback

- `MapView2D` uses MapLibre with a style that has only a `background` layer in `night` and no
  external sources, so no basemap provider is involved.
- GeoJSON sources are built from the same data, with every position passed through
  `edge.toLonLat`. Era features use the confidence patterns from `design.md`: documented solid
  outline, estimated dashed (`line-dasharray`), unknown dotted, fill opacity lower for estimated and
  unknown. The selected feature gets an `ink` outline at full opacity and twice the normal width.
  Only the pinned lot uses `lantern`. Drapes are MapLibre `image` sources with their four corners
  converted by `edge.ts`.
- Clicks query rendered features, and open the same evidence card; a click on no feature does the
  lot lookup (point converted back with `edge.toUtm`).
- The depth gauge, search, card, list view and attribution are the same components as in 3D.

### Sources page

`/sources`: one entry per registry source, sorted by id: id, title, years (through
`sourceYearsText`), holding institution when recorded, URL, licence note, attribution line, rights
checked date. Sources with `to_be_confirmed` are listed as "Not shown in the app yet" and are never
sent to the Player.

Each plate whose tile sidecar names a `full_image` also shows that image: the whole photograph,
archive labels and ruler included, at most 2048 px on its long edge, `loading="lazy"`, with its
width and height set from `full_width_px` and `full_height_px` so the page does not jump, and alt
text "Full photograph of <title>, including the archive's labels". The full image is for this page
only; `drapesForEra` reads the sidecar's `image` and never `full_image`.

## Player

### Bootstrap and scene graph

`SceneBootstrap.Awake` creates, under a runtime root:

```
Root
  Camera (CameraRig, CameraFlight)        URP camera, HDR on, post-processing on
  Sun                                     directional light
  Ground                                  large quad at y = 0
  Present                                 PresentLayer: chunked meshes (fill + edges)
  Eras/<eraId>                            EraLayer: ghosts (by confidence class), water, drapes
  Lot                                     LotMarker: ground outline + point light
  Markers                                 DebugMarkers
```

Then `Bridge` waits for `scene/init`. `ready` is sent from the first `LateUpdate` after a frame has
rendered.

### Project frame

`ProjectFrame` (pure, double maths):

- `ToWorld(E, N, h) = new Vector3((float)(E − E0), (float)h, (float)(N − N0))`.
- `ToData(Vector3 v) = (E0 + (double)v.x, N0 + (double)v.z, (double)v.y)`.
- Constructed only from the `scene/init` origin. Refuses (throws) when any bounds corner is more
  than `MaxDistanceM = 4000` m from the origin. At 4096 m a float's spacing is about 0.0005 m, so
  every position inside that radius round-trips within 1 mm.

### Meshing

All pure, operating on `double` positions already converted to world `Vector2` (x, z).

- `PolygonPrep`: drop the closing vertex; merge a vertex closer than `MinEdgeM` = 2 cm to the one
  before it (session 015: E15 found a 13 mm fold-back jog in City building 306711 whose wall had no
  solid behind it); remove vertices whose removal
  moves the ring by less than 1 mm (collinear); orient exterior rings counter-clockwise and holes
  clockwise when seen from above; reject a ring with fewer than 3 vertices after this.
- `Triangulator`: Buried's own ear clipper with hole bridging (after Eberly, "Triangulation by Ear
  Clipping"), in double precision, output triangles counter-clockwise; then drop any triangle with
  area below 1e-6 m² (the property tests assert there are none to drop for valid input). The gate
  build kept it in place of LibTessDotNet (see "Decisions and reasons"); property E15 runs it on
  every committed real polygon.
- `Extruder`: top cap at `heightM` (normals +y), no bottom cap (never seen), walls as one quad per
  ring edge with outward normals, vertices not shared between walls so edges stay sharp. Index
  format UInt32.
- `EdgeMeshBuilder`: for each ring edge, a vertical and horizontal outline (top ring, bottom ring,
  vertical corners) as quads expanded in the vertex shader to 1.5 CSS px on screen, with a
  per-vertex distance along the edge for dashes.
- `RibbonBuilder`: lines as flat ribbons on the ground of the given width, mitred joins limited to
  2× width.
- `DrapeMeshBuilder`: a 16 × 16 grid; vertex (i, j) at the bilinear interpolation of the four
  corners at (u, v) = (i/16, j/16), UV (u, 1 − v) with v = 0 at the top edge. For a parallelogram
  (affine tile) this equals the transform exactly; for a slightly bent quad it follows the bilinear
  mapping that spec 02 checked against the true transform.
- `MeshChunk`: combines per-feature meshes of one era and one material into meshes of at most 500k
  vertices, keeping a triangle-range-to-feature-id table for picking. The gate build picks by its
  own ray-triangle test over that table rather than with `MeshCollider`s, so the Player needs no
  physics module.
- `DrapeMaskBuilder` (pure): see "Drape mask".

### Precision

Decided in session 012: **meshes keep one world frame; chunks do not carry a local origin.**

- Every vertex is stored as float32 in the project frame (`ToWorld`, subtracting in double first).
  The 4000 m rule bounds the frame; at 4096 m a float's spacing is about 0.0005 m, and the showcase
  content lies within about 1 km of the origin, where the spacing is about 0.00006 m. That is
  more than 10,000 times smaller than the 2 m floor on any position error.
- A chunk-local origin would not help in Unity as it stands: a `Transform` position is itself
  float32, so the offset would be rounded once anyway, and the GPU works in float. It would add a
  second, per-object offset path, which `tech.md` forbids ("No per-object offsets"), and every
  picking and projection test would have to account for it.
- What the gate run showed is a test matter, not a rendering one. The 1e-6 m² degenerate-triangle
  threshold is below the area change that float rounding causes at a few hundred metres from the
  origin, so a property that compares the stored mesh against the double-precision polygon fails
  for reasons no viewer could see. The mesh is what is drawn, so E4 compares it against the
  polygon rounded to float32, and E14 bounds the rounding itself at 1 mm.
- Revisit only if the bounds must grow past 4000 m (for example the citywide 1947 Lantern stretch
  goal). That is a migration-level decision (a floating origin), not a per-chunk one.

### Materials and treatments

Custom URP shaders in `Look/Shaders/`, all reading colours from `BuriedPalette` via material
properties set at runtime:

| Thing | Shader | Look |
|---|---|---|
| Present fill | `Buried/Present` | Lit by the sun only (Rendering Layer "Present"; the lot light excludes it), matte, `present` colour, alpha from depth blend |
| Present edges | `Buried/Edge` | `present` lightened toward `muted`, alpha from depth blend |
| Ghost documented | `Buried/Ghost` + `Buried/Edge` | Fill `ink` alpha 0.35, emission 0.15; solid edges, emission 1.2 (blooms) |
| Ghost estimated | same | Fill `ink` alpha 0.18; dashed edges, 1.5 m on, 1.0 m off |
| Ghost unknown | `Buried/FogVolume` | Fill `ink` alpha 0.12 with a soft falloff toward the edges and top (no hard edges, no edge mesh); a camera-facing "?" image above the centroid |
| Selected | `Buried/Edge` | Edges in `ink` at full opacity, twice the unselected width (3 CSS px), emission 1.6. Never `lantern` (requirement 11.7). The DOM label is drawn by the Shell. |
| Water | `Buried/WaterGlow` | `water` additive at 0.35, soft edge falloff, no animation |
| Drape | `Buried/Drape` | Unlit texture, sRGB sampling, no fog colour; alpha = drape opacity × drape mask × (1 − fog factor) |
| Lot outline | `Buried/Edge` on the ground | `lantern`, 2 CSS px |
| Debug marker | `Buried/Marker` | Unlit `#FF00FF`, ZTest Always, 9 × 9 px cross. The one colour outside the palette; debug only. |

Every ghost and present shader reads the global lens uniforms (`_LensCenter`, `_LensRadius`,
`_LensOn`, `_Aspect`) and a per-layer flag (inside-only, outside-only, or both), and discards
fragments on the wrong side.

### Depth blend

`DepthBlend` (pure) maps depth `d` to weights:

- `i = floor(d)`, `t = d − i`; weight of era i is `1 − t`, of era i+1 is `t`, all others 0.
- Present stage `p = min(d, 1)`:
  - normal motion: fill alpha `1 − smoothstep(0, 0.5, p)`; edge alpha
    `smoothstep(0, 0.5, p)` for `p ≤ 0.5`, then `lerp(1, 0.2, smoothstep(0.5, 1, p))`.
  - reduced motion: fill alpha `1 − p`, edge alpha `0.2 × p` (a crossfade to the faint outline).
- Ghost rise for an era with weight w (normal motion): vertical scale `smoothstep(0, 1, w)` applied
  in the vertex shader about y = 0, and alpha × w. Reduced motion: scale 1, alpha × w.
- Drapes: opacity × w.
- Era index 0 (Today) features use the same rule.

### Lantern

`LanternMask.Contains(point, center, radius, aspect)` (pure) decides inside or outside in
normalised canvas space corrected for aspect. While on: the Today era layer and present buildings
are set to outside-only, the Lantern era layer (weight 1) to inside-only. The lens rim is a thin
`ink` ring at alpha 0.4. `Picker` uses the same function to choose which era to raycast.

### Picking and hover

`Picker` raycasts on pointer up (if the pointer moved less than 4 px since down) and on pointer
move (throttled to 20 Hz) against the `MeshChunk`s of the visible era layers, honouring the lens.
The hit triangle index maps to a feature id through `MeshChunk`'s table. A ray that hits no feature
is intersected with the plane y = 0 and converted with `ToData` for `groundClicked`. Present
buildings are not pickable in this spec.

### Show Evidence

On: the selected feature's triangles are drawn with fill alpha 0.05 and edges at alpha 0.8 (a
per-feature property block on its chunk via a feature mask texture), the given drape is loaded
(or reused if loaded) and drawn at opacity 1, other drapes at 0. Off: restore.

### Pinned lot

`LotMarker` draws the lot outline on the ground and places one point light (warm, from
`lantern`, range 25 m, intensity low) 6 m above the lot centroid, with a rendering layer mask that
includes Ground, Ghost and Water but not Present. Fly-to: `CameraFlight` eases (ease-in-out cubic)
over 1500 ms to a target at the lot centroid with a distance that frames the lot's bounding box plus
40 m at the current pitch and heading. Reduced motion: cut.

### Camera

`CameraRig`: target point on the ground, distance, pitch, heading. Default pose after init: target
at the centre of `initialView` (see Shell "Initial view"), heading 22.5° (north-north-east), pitch 21°,
vertical field of view 58°,
and the smallest distance at which the whole rectangle is in view for the canvas's aspect ratio and
the camera's vertical field of view. Inputs per requirement 16.2; limits per 16.3. The rig never
changes without input, a fly-to or `debug/setCamera`. The rig's maths (pose to view, the fit
distance, the pan that keeps a ground point under the pointer) lives in `CameraRigMath` so EditMode
tests can call it without a scene.

- **Pan:** on pointer down the rig records the ground point under the pointer; on each move it
  moves the target so that point is under the pointer again (ray to the plane y = 0). There is no
  velocity and no easing after release.
- **Zoom:** each wheel notch (100 px of normalised `deltaY`) or pinch step scales the distance by
  0.85 or 1/0.85 about the ground point under the pointer, inside the limits. `+` and `-` do the
  same about the canvas centre.
- **The plain wheel.** Requirement 10.2 gives the unmodified wheel to Dig, and requirement 16.5 has
  the Shell capture it. Until task 3.1 adds Dig, the plain wheel reaches the Player and zooms
  (requirement 16.6, asked for in session 012). From task 3.1 on, only Ctrl or Shift with the wheel
  zooms. Open for the maintainer: if the plain wheel should keep zooming, Dig needs another input,
  and requirements 10.2 and 16.5 change with it.

The Shell's capture-phase wheel listener (from task 3.1) stops unmodified wheel events before Unity
sees them; Ctrl/Shift+wheel pass through and the Shell calls `preventDefault` so the page does not
zoom.

### Textures

`TextureCache` downloads each drape image with `UnityWebRequest`, decodes with
`Texture2D.LoadImage` into an RGBA32 sRGB texture with a mip chain, applies with
`makeNoLongerReadable: true`, bilinear filtering, anisotropic level 4, clamp. It keeps textures only
for eras within one index of the current depth, the Lantern era, the Show Evidence drape and the
water eras; others are destroyed and reloaded from their URL when needed. A failed download is
reported in `eraLoaded.failedDrapes` and an `error` with `texture_load_failed`; the era still draws
its features.

### Drape mask

Each drape has a mask that removes what is not map content and fades the drape into the ground
(requirements 8.8 and 8.9). It changes alpha only.

```
DRAPE_FEATHER_M   = 15.0     // fade band inside the boundary
DRAPE_MASK_MAX_PX = 512      // mask long edge
```

- **Boundary:** the drape's `clip` polygon when present (bridge 0.3.0 on), else the quad of its four
  corners. Converted with `ToWorld` to (x, z).
- **Mask texture:** two channels, axis-aligned in world x and z over the boundary's bounding box,
  long edge `DRAPE_MASK_MAX_PX` texels (about 0.8 m per texel for a plate tile). For each texel
  centre, `DrapeMaskBuilder` computes the signed distance d to the boundary (positive inside) in
  double precision and stores R = `smoothstep(0, DRAPE_FEATHER_M, d)` and G = 1 when d > 0, both 0
  for d ≤ 0. Bilinear filtering, clamp to 0 outside the texture.
- **Shader:** the drape fragment shader samples the mask at its world (x, z), which it already has,
  so no inverse of the corner mapping is needed in the Player. Normally it uses R.
- **Show Evidence:** the shown drape uses G: full opacity inside the boundary with no fade, because
  the viewer asked to see the source itself. Outside the boundary it stays at 0.
- The mask is built once per drape when the drape is loaded and kept with its texture.

### Look

- Colour space Linear. HDR on. Tonemapping **None**, so LDR colours, including drapes, reach the
  screen unchanged. Bloom threshold 1.0, intensity 0.3; only edge and `lantern` emission exceeds 1.
  No other post effect.
- Sky: a gradient sky shader: `fog` at and below the horizon, a lighter band
  `lerp(night, muted, 0.25)` at sin(elevation) 0.035, and `night` from sin(elevation) 0.12 up (about
  7°), so the top of the default view, which ends 8° above the horizon, is `night`. Ambient: flat,
  `fog` at intensity 0.3.
- Present buildings: matte `present` colour in three steps from the low west sun and the sky:
  walls facing away, walls facing the sun, roofs lightest. The look test measures the roof against
  the ground at least 1.35 : 1 (WCAG ratio) and below a ghost.
- Sun: directional, azimuth 270° (from the west), elevation 8°, colour `muted`, intensity 0.6, no
  shadows (cost; the dusk light is low and soft).
- Fog: exponential, colour `fog` (session 015 dropped the earlier darkening to `night`), density
  `ln(50) / R` where R is the distance from the bounds
  centre to its farthest corner plus 300 m. The ground quad extends to 4 × R in every direction in
  `fog` colour, so there is no world edge.
- `BuriedPalette.asset` holds the eight tokens. An EditMode test parses `web/src/styles/tokens.css`
  and compares.

### Motion and idle

Nothing animates unless depth, lens, flight, rise or a fade is in progress. No shader uses time.
Unity's `targetFrameRate` is -1 (browser animation frame).

### Build settings

`Build.WebGL()`: WebGL target, `Bootstrap` as the only scene, IL2CPP, managed stripping level
Medium with a `link.xml` that preserves Newtonsoft's `JToken` types, code optimisation for size,
Brotli compression with decompression fallback on (hosting is not decided, so the server may not
send `Content-Encoding: br`), WebGL 2 only, initial memory 256 MB, maximum memory 2048 MB, output to
`../web/public/unity/`. Exits 1 on any build error.

## Gate verification

Messages needed by the gate (bridge version `0.1.0`): `scene/init`, `scene/loadEra`,
`scene/setDepth`, `debug/markers`, `ready`, `eraLoaded`, `featureClicked`, `cameraChanged`,
`error`.

Gate data: eras `1911` and `1935`; drapes `fip_v3_1911_229` and `fip_v3_1935_229`; at least one
published building in `data/evidence/fip_v3_1911_229.geojson`; control files for both plates
(spec 02).

`web/e2e/gate.spec.ts`, run against `vite preview` with `?debug=1`:

1. Wait for `ready`, `eraLoaded` for both eras.
2. Pick three control points from `data/control/fip_v3_1911_229.json` whose `reference_feature_id`
   also appears in `data/control/fip_v3_1935_229.json` (same intersection on both plates); if fewer
   than three are shared, use the first three of the 1911 file. Send `debug/markers` with their
   `reference` positions.
3. Set depth to the index of `1911`; wait two frames and the next `cameraChanged`; screenshot the
   canvas; find the three marker centroids (connected components of `#FF00FF` pixels within ±8 px of
   the projected position).
4. Set depth to the index of `1935`; repeat.
5. Assert: each marker's centroid differs by at most 2 px between eras, and from the position the
   test projects with `viewProjection` (after subtracting the origin from the reference position in
   double precision) by at most 2 px.
6. Project the building's centroid the same way, click it, and assert the DOM card shows the
   feature id, origin source, position phrase, `confirmed_by`, `confirmed_at` and attribution line.
7. Save both screenshots to `web/e2e/output/` (gitignored) for the maintainer, who checks by eye
   that the markers sit on the drawn street intersections within the plate's alignment error, and
   records that in `docs/kiro-sessions/` notes.

The test fails with "Unity build not found; run the Unity build command" when
`web/public/unity/Build/` is missing.

### Drape placement check (task 17.4)

The gate test measures debug markers drawn at fixed world positions. It proves the camera and its
projection are consistent across eras; it does not look at the drape. This check looks at the
drape's own pixels.

`web/e2e/drape.spec.ts`, against `vite preview` with `?debug=1`, canvas 1280 × 800, Shell overlays
hidden by a debug-only CSS class during capture. For each gate plate and each control point in
`data/control/<source id>.json`:

1. **Tile pixel.** Convert the control point's `pixel` (full-resolution, `gdal_corner`) to tile
   pixels: `((px − crop.x) × widthPx / crop.width, (py − crop.y) × heightPx / crop.height)` with the
   sidecar's `crop_px`. Skip, and list, a point outside the tile or less than
   `DRAPE_FEATHER_M` + 10 m inside the drape's boundary. Fewer than three tested points on a plate
   fails the test.
2. **World point.** Map that tile pixel to EPSG:26917 through the sidecar corners by the same
   bilinear rule the drape mesh uses. This is deliberately not the control point's City
   `reference`: the reference differs from the drawn intersection by the alignment error, which
   spec 02 measures. This check isolates the renderer.
3. **Camera.** `debug/setCamera` with that point as target, heading 0, pitch 80°, distance 250 m
   (about 0.25 m per screen pixel). Show only that plate's era. Wait for `cameraChanged` and two
   frames; screenshot the canvas.
4. **Expected patch.** For each pixel of a 64 × 64 px window centred on the point's projection
   (with `viewProjection`, origin subtracted in double), unproject to the ground plane, map to tile
   pixels with the inverse corner mapping, and average 4 × 4 bilinear samples of the tile JPEG over
   that screen pixel's footprint. Convert both images to luminance.
5. **Match.** Compute the normalised cross-correlation of the expected patch against the screenshot
   at every offset in [−8, 8] px on both axes. Pass when the peak is at an offset within 1 px of
   (0, 0) and its value is at least 0.85. A patch whose expected luminance has a standard deviation
   below 8 (of 255) is too flat to test; the test fails with that message rather than passing.
6. **Outside the map area** (after task 17.1): one point inside the tile but more than 5 m outside
   the clip polygon renders within ±3 per channel of the same view with the drape hidden.

NCC is unchanged by a gain and an offset in brightness, so the fog fade, the drape opacity and the
blend with the ground do not affect it, as long as they are near constant over the patch.

**What it proves:** the tile's pixel at each control point is drawn where the camera's own matrix
puts the ground position that the tile corners give that pixel, within about 1 screen pixel
(0.25 m at this pose): no flip, mirror, half-texel shift, UV or corner-order error, on both plates.
With the alignment records (spec 02), which measure how far the corners put each drawn
intersection from the City's intersection, it means a plate on screen sits within its stated
alignment error of today's map.

**What it does not prove:** that the corners or the transform are right (that is `align-check`),
anything about extruded features, or placement far from the control points (all of plate 229's
points lie in the northern two-thirds; see `evidence.md`).

### Gate-only hand trace and the demo readiness check

If spec 02's `publish` is not ready by Nov 13, the gate building may be a reviewed hand edit (task
1.11). That is acceptable for the gate only (requirement 24.5). The hand-edited feature is written
without `provenance.proposal_id` and without `provenance.extraction_params_id`, so it can be found
later. Every feature written by `buried publish` carries a `proposal_id` (spec 02), and every
feature published through the Studio carries one too (spec 04 review item ids).

Before any demo the maintainer sets the hand-edited feature to `status: rejected` with
`status_reason: "Gate-only hand trace, replaced by a published footprint"`, publishes the
replacement with `buried publish`, and runs `npm run check:demo` from `web/`. The script
(`web/scripts/checkDemoReady.ts`) reads `data/evidence/*.geojson` and fails, naming each feature,
if any `published` feature has no `provenance.proposal_id`. It is not part of `npm test`, because
during development the gate feature is expected to be there.

## Budget

- **Reference machine:** the maintainer's Apple M3 Pro laptop, current stable Chrome, on mains
  power. The exact model, RAM and Chrome version are recorded with each result.
- **Mid-range profile:** the same machine and browser with Chrome DevTools CPU throttling at 4×,
  as the stand-in for a mid-range laptop. CPU throttling slows script, WebAssembly and layout but
  not the GPU, so frame-rate results on this profile can be optimistic where the GPU is the limit.
  The notes say so next to each frame-rate result. The pass or fail verdict for 23.1 and 23.3 comes
  from this profile (requirement 23.5).
- **Fast connection profile:** Chrome DevTools Protocol network emulation at 50 Mbit/s down,
  10 Mbit/s up, 20 ms latency, cache disabled.
- **First interactive frame (23.1):** `web/e2e/budget.spec.ts`, headed with hardware GPU, against
  `vite preview` of a production build. Time from `performance.timeOrigin` to the first
  `requestAnimationFrame` after `eraLoaded` for Today, read from the page. Median of 5 cold runs,
  on each profile.
- **Build size (23.2):** `npm run check:unity-size` after the Unity build.
- **Frame rate (23.3):** same spec, scripted: 5 s idle at Today, depth 0 → 3 → 0 by gauge steps,
  10 s Lantern sweep across the canvas at depth 0, 5 s pan. Frame intervals from page
  `requestAnimationFrame` timestamps (Unity renders in the same animation frame). Report median and
  95th percentile; pass when the 95th percentile is at most 33.3 ms on the mid-range profile.
- `budget.spec.ts` takes `--profile reference` or `--profile midrange`; `midrange` sets the CPU
  throttling rate to 4 through the DevTools Protocol before navigation.
- These runs need a real GPU, so they are run by the maintainer on the reference machine, not in
  headless CI. The gate and functional end-to-end tests run headless.

## Error handling

| Situation | Behaviour |
|---|---|
| No WebGL 2 | 2D map with the message in requirement 19.1. Player not loaded. |
| Player fails to load or no `ready` in 30 s | 2D map, "The 3D view did not load (<reason>). The map below shows the same records." |
| Bridge version mismatch | No `scene/init`; 2D map; both versions logged. |
| Outgoing message invalid (Shell) | `BridgeError` thrown; nothing sent. A bug, not a user state. |
| Incoming message invalid (either side) | Logged and dropped; Player also sends `error`. |
| Bounds more than 4000 m from origin | `scene/init` refused, `error` `bounds_too_far`; Shell shows the 2D map. |
| Message for an unknown era | Refused, `error` `era_not_initialised`. |
| Drape texture fails | Era drawn without it; `eraLoaded.failedDrapes`; Shell shows "The <source id> image could not be loaded." |
| Polygon cannot be triangulated | That feature skipped; `error` `mesh_build_failed` naming it; others drawn. The Shell lists it under "not shown". |
| Evidence file fails validation | Left out; message in the status line; other files used. |
| Search finds nothing / outside coverage | "Not reconstructed yet." |
| `debug/markers` without debug | Dropped, `error` `debug_disabled`. |

## Correctness properties

Shell properties use fast-check (at least 200 runs). Player properties use `PropertyRunner`, a small
seeded generator in the EditMode test assembly (fixed seeds, 1000 cases per property, failing case
printed with its seed), so no F# runtime or extra DLL is added to the Unity project.

**E1. Every bridge message parses on the Shell side.** For every message generated by
`bridge/testing/arbitraries.ts`, Ajv accepts it, and `bridge.ts` serialises and parses it back to an
equal value. For every file in `bridge_fixtures/invalid/`, Ajv and `bridge.ts` reject it.
*(req 4.4, 4.6, 4.7)*

**E2. Every bridge message parses on the Player side.** For every file in `bridge_fixtures/valid/`
and `generated/` (the generated set comes from E1's arbitraries with a fixed seed), `BridgeParser`
accepts it and `BridgeWriter` writes it back as an equal JSON tree; for every file in `invalid/`,
`BridgeParser` throws `BridgeValidationException`. *(req 4.5, 4.6, 4.8)*

**E3. World and data round-trip within 1 mm.** For every origin inside UTM 17N and every position
(E, N, h) with `|E − E0|, |N − N0| ≤ 4000` m and `0 ≤ h ≤ 500` m:
`|ToData(ToWorld(E, N, h)) − (E, N, h)| ≤ 0.001` m on each axis; and for every world vector inside
the same range, `|ToWorld(ToData(v)) − v| ≤ 0.001` m. *(req 3.1, 3.2, 3.4)*

**E4. Extrusion never produces degenerate triangles.** For every valid simple polygon (generated
star-shaped polygons with 3 to 64 vertices, rectilinear polygons, and either with up to 3 disjoint
holes strictly inside, at building scale 2 to 200 m, with optional collinear and duplicate vertices
inserted) and height 1 to 100 m: every output triangle has area at least 1e-6 m²; the cap triangles'
areas sum to the polygon's area within 1e-6 relative; every cap normal is +y; every wall triangle's
normal points away from the polygon interior; and every input edge (after preparation) has exactly
one wall quad. Areas and normals are computed from the stored float32 vertices and compared with
the polygon rounded to float32, because the stored mesh is what is drawn (see "Precision"); E14
bounds that rounding. *(req 2.3, 8.5)*

**E5. A feature is never drawn outside its evidence window.** For every generated set of
collections (spec 01's arbitraries) and every sequence of Shell actions (depth changes, Lantern,
Water remembers, Show Evidence, evidence updates through `applyEvidenceUpdate`): after replaying the
messages `sceneModel` emits, every feature id the Player would hold for era E is the id of an entry
in `featuresForEra(E)` for the current collections. Separately, a schema test checks that no
property anywhere in the Bridge Schema is named like a year or date (`/year|date|window|phrase/i`).
*(tech.md property 1; req 6.1, 6.2, 6.3, 22.1)*

**E6. Scene features mirror Era list entries.** For every Era list entry X of kind building or
water: `toSceneFeature(X)` has the same `id`, `kind`, `geometry` and `confidence` as X; `heightM`
follows the rule in "Scene features and heights"; and no `land_use` entry produces a scene feature.
*(req 6.4, 6.5)*

**E7. Depth stays in range and lands on eras.** For every start depth, target era and frame time
sequence: every tweened value lies between start and target and within `[0, n−1]`, is monotone, and
the last value equals the target exactly no later than 900 ms after the start. *(req 10.3)*

**E8. The map edge round-trips within 1 mm.** For every EPSG:26917 position inside the project
bounds grown by 1 km: `edge.toUtm(edge.toLonLat(p))` is within 0.001 m of p. *(req 3.6, 19.5)*

**E9. Drape meshes follow the corners.** For every set of four corners forming a convex quad of
50 to 2000 m: the drape mesh's corner vertices equal the corners (after `ToWorld`) within 1 mm, and
at every grid vertex the position equals the bilinear interpolation of the corners within 1 mm; for
a parallelogram, every interior point of every triangle equals the affine mapping within 1 mm.
*(req 8.3)*

**E10. Source crops invert the corner mapping.** For every convex quad of corners and every tile
pixel (u, v) inside the image: mapping (u, v) to EPSG:26917 by bilinear interpolation and back with
`sourceCrop`'s inverse returns (u, v) within 0.01 px. *(req 11.3)*

**E11. The lens decides picking and drawing alike.** For every lens centre, radius, aspect ratio
and screen point: `LanternMask.Contains` is true exactly when the aspect-corrected distance is at
most the radius, and `Picker` chooses the Lantern era for the point exactly when it is true.
*(req 13.2, 13.3)*

**E12. Explorer text never contains a banned word.** For every generated Era list entry, linked set
and registry, every string `cardModel` and `FeatureList` produce has no match in
`findBannedWords`; and the same holds for every fixed UI string in `web/src/explorer/` and
`web/src/map/`. *(req 7.4)*

**E13. The drape mask hides what is outside and keeps what is inside.** For every convex quad of
corners of 50 to 2000 m (and, from task 17.1, every simple clip polygon of 4 to 64 vertices inside
such a quad, concave allowed) and every sample point: where the point lies outside the boundary by
more than one texel diagonal, both mask channels sampled bilinearly are exactly 0; where it lies
inside by more than `DRAPE_FEATHER_M` plus one texel diagonal, R is 1; where it lies inside by more
than one texel diagonal, G is 1; and R never decreases along any segment from the boundary straight
inward. *(req 8.8, 8.9)*

**E14. Stored vertices stay within 1 mm of their data positions.** For every polygon E4 generates,
placed anywhere within 4000 m of a generated origin inside UTM 17N, every vertex `Extruder` and
`EdgeMeshBuilder` store, converted back with `ToData`, lies within 0.001 m of the input position
(easting, northing) and of its height. *(req 3.1, 3.4, 3.5)*

**E15. Every committed real polygon triangulates.** For every Polygon and MultiPolygon part in
`data/evidence/*.geojson` (published or not) and `data/present/*.geojson`, converted with the
origin read from `data/project.json`: `PolygonPrep` accepts it, and the extrusion satisfies every
condition of E4. A polygon that fails is named by file and feature id in the failure message. The
fix goes to the Triangulator or, for an invalid present-day polygon, to spec 02's `buried present`
(which should write only valid polygons); the test is never relaxed. This is an example-based run
over all real data rather than generated cases; it lives with the properties because it checks the
same conditions. *(req 2.3, 8.5, 25.7)*

## Testing strategy

- **Shell unit tests** (Vitest) next to each pure module. Component tests with React Testing
  Library for the gauge (keys, ARIA values), card, list view, search, Lantern key handling and the
  fallback messages.
- **Bridge boundary test** (`web/src/bridge/boundary.test.ts`): scans `web/src/` for
  `SendMessage`, `buriedBridge` and `createUnityInstance` outside `web/src/bridge/` and
  `UnityView.tsx`; scans `unity/Assets/Buried/Runtime/` for `DllImport("__Internal")` outside
  `Bridge/`; scans the C# runtime for numeric literals of 100000 or more (no hard-coded origin);
  scans the Report route's import graph for `UnityView` or `bridge` (requirement 19.6).
- **Unity EditMode tests** (`Buried.Tests.EditMode`): `ProjectFrame`, `PolygonPrep`,
  `Triangulator`, `Extruder`, `EdgeMeshBuilder`, `RibbonBuilder`, `DrapeMeshBuilder`,
  `DrapeMaskBuilder`, `CameraRigMath`, `DepthBlend`,
  `LanternMask`, `BridgeParser`/`BridgeWriter` conformance, DTO-vs-schema reflection, bridge version,
  palette vs `tokens.css`, the `Bootstrap` scene contents (one root `Bridge`, no renderers, lights or
  cameras), and the runtime asmdef's references (no `UnityEngine.UI`, no TextMeshPro).
- **End-to-end** (Playwright, headless Chromium with WebGL 2 through SwiftShader): the gate test,
  then one test per feature after the gate (Dig announcements, Lantern on and off, Show Evidence,
  search to "Not reconstructed yet.", the fallback when WebGL 2 is unavailable (a page
  init script makes `getContext("webgl2")` return null), the fallback when the build is missing,
  axe scan). A raster fidelity test drapes a synthetic tile
  of flat colour patches, viewed top-down at full opacity, and checks rendered pixels within ±2 of
  the source values per channel (requirement 20.5).
- **Fixtures:** synthetic evidence collections and present layers under `web/src/explorer/testing/`;
  a synthetic tile under `web/e2e/fixtures/` served only in test mode. The tests that use real data,
  read from `data/`, are the gate test, the look check (task 16.7), the drape placement check
  (task 17.4) and E15 (every committed polygon). Nothing else reads `data/`.
- No test uses the network beyond the local preview server.

## Decisions and reasons

- **Five messages and three payload fields beyond the brief's list.** `scene/setReducedMotion`
  (design.md requires passing the preference over the bridge, and it can change at runtime),
  `scene/setWaterRemembers` (Water remembers needs past water drawn at Today, which no listed
  message expresses), `debug/markers` (the gate test needs markers drawn by the Player at known
  coordinates), `eraLoaded` (tests and the budget need to know when an era is drawn) and
  `groundClicked` (clicking a lot needs the ground position, converted by the Player's frame).
  `scene/init` also carries the present buildings, `reducedMotion` and `debug`; `scene/loadEra`
  carries drapes; `scene/showEvidence` carries the drape to show, because the feature's origin
  source may not be draped in the current era.
- **Scene features are a subset of Era list entries.** Spec 01 says `scene/loadEra` carries its
  `EraFeature` type "or mirrors it". The Player needs id, kind, geometry, confidence and a height.
  Sending dates, phrases and sources would put years in the Player for no use, against the
  "draws what it is told" rule. Property E6 checks the copy.
- **No year values cross the bridge.** Eras are ids and indexes. Drape selection uses source years
  and so runs in the Shell.
- **Hand-written C# parsing over Newtonsoft `JToken`, not `JsonUtility` or reflection
  deserialisation.** `JsonUtility` cannot read nested coordinate arrays; reflection-based
  deserialisation is fragile under IL2CPP stripping; and hand reading lets the parser reject unknown
  fields and bad ranges as the schema does. A JSON Schema validator for C# is not used because the
  maintained one is commercially licensed.
- **Seeded generators instead of FsCheck in Unity.** Avoids adding FSharp.Core to the project for a
  handful of properties.
- **Buried's own ear clipper instead of LibTessDotNet** (session 012, recording the gate build's
  choice). The coder could not vendor LibTessDotNet and wrote an ear clipper with hole bridging;
  the builder kept it because E4 passed on generated polygons with holes, collinear and duplicate
  vertices. It adds no third-party source or licence file. Its known weaknesses are quadratic time
  and sensitivity to near-degenerate input. Buried's inputs are validated simple polygons of
  building size, so neither is expected to matter, and E15 checks every real polygon to make sure.
  If E15 finds a polygon the clipper cannot handle, vendor LibTessDotNet (MIT) behind the same
  `Triangulate` signature rather than special-casing the polygon.
- **No chunk-local origins** (session 012). See "Precision": the frame is small enough for float32,
  a Unity `Transform` offset would be float32 anyway, and a second offset path conflicts with
  `tech.md`.
- **A look pass right after the gate** (session 012). The scene should read as Buried before
  features are layered on, so look problems are found while the scene is small. It takes task 4.2
  and the documented part of 4.1 early; the rest of groups 3 and 4 is unchanged.
- **Default view framed on the published features, computed in the Shell** (session 012). The
  showcase block is not a stored shape; the features are. The rule reads geometry only, so it does
  not move a fact into the Player, and it needs no coordinates in C#.
- **Drape edges fade over 15 m, by a world-space mask** (session 012). A fade changes opacity only,
  which `design.md` allows. 15 m is under 5% of a plate tile's width, so the band covers the street
  margin at the plate edge and not the blocks. A world-space mask avoids inverting the corner
  mapping in the Player and serves both the rectangle and the map-area clip. Show Evidence turns the
  fade off.
- **`debug/setCamera`** (session 012). The look and drape checks need exact, repeatable poses.
  Pressing zoom keys from Playwright is not exact. It is refused unless `debug` is on, like
  `debug/markers`.
- **Drape placement by normalised cross-correlation** (session 012). NCC ignores the gain and
  offset that fog, opacity and blending add, so the check can run on the real look, not a debug
  material.
- **Present-day height 7.0 m, storey 3.5 m.** `tech.md` leaves the value to this spec. 3D massing is
  not licensed yet. Two storeys gives quiet context massing, and no height is shown as a fact.
- **Water ribbon width from position error.** A creek line has no recorded width; drawing it as wide
  as its uncertainty avoids implying precision.
- **Water remembers draws past eras' water at Today, each feature on behalf of an era whose list
  contains it.** This keeps "never drawn outside its evidence window" true: the feature is drawn
  for its era, composited with Today, and the DOM names the era.
- **The Lantern works from Today.** "The past inside, the present outside" defines the outside as
  Today. Allowing it at other depths would need a second meaning.
- **Tonemapping off, drapes unlit and unfogged, distance fade by opacity.** `design.md` forbids
  changing a raster's colours but asks for fog that dissolves the edge; fading opacity with the fog
  factor does both.
- **No basemap in the 2D fallback.** The basemap provider is not decided. The fallback shows the
  records, which do not need one.
- **Brotli with decompression fallback.** Hosting is not decided, so the build must work when the
  server does not send `Content-Encoding: br`. The hosting spec can turn the fallback off.
- **Build output in `web/public/unity/`.** Vite serves `public/` as-is in dev and copies it at build,
  so the Shell needs no extra copy step.
- **Bridge version 0.1.0 at the gate, 1.0.0 after.** The gate needs only part of the catalogue; the
  version change records that the rest was added, as `structure.md` asks for schema changes.
- **Gate eras 1911 and 1935 on plate 229.** Both editions are tuning plates (not held out), and the
  same intersections appear on both, so the marker test compares the same ground points.
- **`lantern` marks the pinned lot only** (session 005). A selected feature uses a brighter, thicker
  `ink` outline plus its DOM label. This keeps the one warm accent for the one thing the user chose
  to pin, and keeps the past drawn in one colour.
- **Budget measured on the maintainer's M3 Pro, verdict on 4× CPU throttling** (session 005). A
  real mid-range laptop is not available; throttling is the stated stand-in, and its blind spot
  (GPU speed) is written next to the results.
- **A hand-traced gate footprint is gate-only** (session 005). It is replaced through
  `buried publish` before any demo, and `npm run check:demo` enforces that.
- **Water comes from the Studio** (session 005). A person traces it; nothing extracts water
  automatically.

## Changes from session 007 (tasks 17.1 to 17.3)

Session 007 recorded facts about the real plates that reach the Explorer. They did not change task
group 1 (the gate). Session 012 added their tasks at the end of `tasks.md`: 17.1 (drape clip),
17.2 (card years), 17.3 (full photograph on the Sources page).

- **The 1935 era covers 1931 to 1935** (spec 01 requirement 7.4). The era id and label stay
  `1935` and "1935". `eraOrder` sorts by `year_to`, so the order is unchanged. `drapesForEra` still
  picks the 1935 plates for the 1935 era, since their range equals the era's. No year crosses the
  bridge, so the Player is unaffected.
- **Evidence card years.** The card shows each source's years through `sourceYearsText`
  ("1931, revised to 1935"), not a computed range (see "Evidence card").
- **Map-area tiles** (spec 02 requirements 16 and 19). Plate tiles now cover the bounding box of the
  plate's map area, and the sidecar carries `crop_px` and `map_area`. The corners in the sidecar
  still describe the tile exactly, so draping is unchanged. The Player clips a plate drape to the
  `map_area` polygon through the drape mask (see "Drape mask") so that pixels inside the box but
  outside the polygon are not shown. This needs one optional field on the drape payload (`clip`:
  the polygon as EPSG:26917 positions, converted by the Player's frame like every other geometry),
  so the bridge goes to `0.3.0` with it. Opacity is the only change to the raster; the clip removes
  non-map pixels, it does not recolour any.
- **Sources page.** Each plate's entry shows its full uncropped photograph (`full_image` from the
  sidecar, spec 01 requirement 31.2), archive labels included, with its title, `years_label`,
  `holding`, licence note and attribution line. The 1935 plates show the Library and Archives
  Canada credit line.
- **Greyscale drapes.** The plates are single-band; the Player loads them as they are. Nothing
  tints them.
