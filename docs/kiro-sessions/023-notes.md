# Session 023 notes: scene art direction and the pinned lot (Unity lane)

Builder, claude-sonnet-5.5. Brief: `023-scene-art-direction.md`. Bridge 0.4.0 to 0.5.0.

## New bridge messages and fields (for the web lane to adopt)

| Name | Direction | Payload | What the Player does |
|---|---|---|---|
| `scene/focusLot` | Shell to Player | `{ lot: Polygon or MultiPolygon }` (EPSG:26917) | Outlines the lot on the ground in `lantern` in every era (3 px, `night` casing, over everything, no fog), puts one lamp beside it, moves the light pool to it, flies the camera to frame it (eased, 900 ms; a cut under reduced motion). A second one replaces the first. |
| `scene/clearLot` | Shell to Player | `{}` | Removes the pin, flies back to the default view (cut under reduced motion). Does nothing with no lot pinned. |
| `scene/setDrapeMode` | Shell to Player | `{ mode: "lit" or "original", sourceId? }` | "View original scan" and back. No `sourceId`: every drape. Default is lit. Remembered for drapes that load later. |
| `sceneFeature.storeys` | optional field | integer 1 to 100 | One horizontal line per recorded storey. Absent: no lines. `heightM` is unchanged. |
| `drape.kind` | optional field | `"plate"` or `"aerial"` | Aerials are lit but not recoloured. Absent: plate. |

Adopted already, because the brief asked for it: the Explorer sends `scene/focusLot` for `/?lot=<id>` (lot polygon from the
City property boundaries layer, `web/src/explorer/pinnedLot.ts`), and `toSceneFeature` sends `storeys` when the evidence has it.
Not adopted: nothing sends `scene/clearLot` or `scene/setDrapeMode` yet. `buildClearLot` and `buildSetDrapeMode` exist in
`pinnedLot.ts` for the "view original scan" control and for dropping a pin.

## Decisions to look at

- **Roofs stay lighter than the ground.** design.md says today's buildings are darker than the fog near the camera. Walls are now
  Walls are now darker than the fog (a leeward wall is 0.28 of `present`, a sunward one 0.38). Roofs are not: `look.spec.ts` ("Today is not flat") holds roofs to
  1.35 : 1 against the ground, and a roof darker than the fog cannot do that (the ground is the fog colour). The test is unchanged
  and passes at 1.41 : 1. If the maintainer wants dark roofs too, that test has to change first.
- **Estimated ghosts are dashed by screen size.** The dash period is the larger of 2.5 m and 11 CSS px at the vertex's distance, so
  the pattern reads from the default view as well as close up.
- **Unknown has no outline and no "?" marker.** The soft volume thins toward its roof and silhouette. The "?" marker in design.md is
  not drawn (the Player has no text); the DOM label carries it.
- **The lamp is an edge-shader post and head, not a point light.** A real light would need a new shader reference in the Bootstrap
  scene. The head glows (emission 2.4, so bloom takes it). It stands 2.5 m outside the lot's southernmost corner.
- **The lit pool also lifts the drape out of the distance fog** (85 per cent under the pool), so the sheet is brightest at the lot
  and falls off into the fog.
- **Storey lines.** `storeys - 1` floor lines plus the roof line, so one line for each storey. Only one committed building has
  recorded storeys (2), so one floor line shows in the scene.

## Checks

- Unity EditMode: 136 tests, 135 pass. `RealPolygonTests.E15_TriangulationAndExtrusionHoldOnEveryCommittedPolygon` fails, and it
  failed on the first run of the session, and nothing changed here touches `PolygonPrep` or `Extruder`, the code it exercises: `bld_fip_v3_1935_229_0009` (39 vertices, valid and simple per shapely)
  gives "wall triangle 23 faces into the solid". The draft-pass evidence (commit 183cb1e) is the first data to hit it. Not fixed
  here: it is in Extruder or Triangulator, and the counterexample needs its own look. The test stops at the first failing polygon,
  so polygons after it in file order are untested.
- Web `npm test`: 68 files, 637 tests pass. Typecheck passes.
- Playwright: art 4 of 4, look 12 of 12, dig 6, drape 4, gate 2 pass. `report.spec.ts` "one page on Letter and A4" fails
  (Letter prints 2 pages). That is the Report lane's file and does not touch Unity or the bridge; the evidence growth is the likely cause.
- Pinned lot (parcel 5446981, holds `bld_fip_v3_1911_229_0001`): lantern at 121 of 121 outline points, 1024 lantern pixels,
  none more than 50 px from the outline, line work against paper 13.1 : 1 (lit sheet; floor-light figure in `LitSheetTests`: at
  least 4.5 : 1).
- Edge pattern, share of a roof edge drawn: documented 1.00, estimated 0.80, unknown 0.12 (`art-edge-patterns.json`). The unknown
  ghosts there are served by a test route; the committed evidence has none.
- Frame times, 1280 x 800, held half way from 1935 to 1911 so all 163 buildings are drawn (`art-frame-times.json`):

  | Chromium | Rest on 1911 | 163 buildings | 163 buildings, 4x CPU throttle |
  |---|---|---|---|
  | GPU (Metal) | 60.0 fps, p95 16.7 ms | 60.0 fps, p95 16.7 ms | 60.0 fps, p95 16.7 ms |
  | Software GL (the suite's default) | 16 to 26 fps | 16 to 23 fps | 12 to 21 fps |

  The software numbers are the SwiftShader rasteriser, not the scene; they are recorded, not judged. Frame time is measured
  from `requestAnimationFrame` in the page. No ghost batching was needed: a class is one renderer per 500 000-vertex chunk.

## Pictures

`web/e2e/output/art-1911-pinned.png`, `art-estimated-close.png`, `art-today.png` (each also as `-<time>.png`).
