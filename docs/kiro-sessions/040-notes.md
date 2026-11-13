# Session 040 notes: the scene for "Raise the past"

Builder, main checkout. Group U of spec 06. Commits: `f0fa290` (U1), `951bc8c` (U6 and U8), `2c39c4e` (U9 and the palette
move), `379474e` (U7 and `scene/selectFeature`).

## What was built

- **Bridge 0.8.0** (U1): the five messages of design.md, with the property names exactly as the design table writes them
  (`feature_ids`, `era_id`, `first_feature_id`, `feature_id`, `on_screen`; the rest of the schema is camelCase, so this is
  the one place the two styles meet). Schema, fixtures (valid, invalid, 50 generated per type), generated TypeScript,
  C# DTOs, parser, writer and tests on both sides. All 0.7.0 content kept.
- **Raise** (U6): the Player owns the clock (`RaiseState`, `RaiseSchedule`). Plinths sink over 0.6 s (one vertex-shader
  rule: every height above 1 m is pulled to 1 m). Each ghost starts after a delay from 0.3 s (the first find) to 1.5 s
  (the farthest), rises over 0.7 s, edges first and fill after; settled at 2.2 s. The stagger is in the shaders:
  every ghost vertex carries its footprint centre in the second UV (`MeshData.uvs2`), so no mesh is rebuilt. Order test:
  `RaiseTests`; the HLSL constants are checked against the C# ones by reading `BuriedCommon.hlsl`. Reduced motion or
  `animate: false` goes straight to the end state and sends `scene/raised` at once. The camera does not move.
- **Anchors and frame** (U8): `AnchorProjection` (pure, tested against `CameraRigMath`), the top centre of a volume or the
  ground centroid of a land-use area. Sent after `setAnchors`, after `scene/raised`, on a resize, and while the camera
  moves only when a position changed by 0.01 px. `scene/frameFeature` flies (a cut under reduced motion) keeping heading
  and pitch.
- **Stills** (U9): `BlockCamera` (wide and tall poses, the constants the Player also uses), `Buried.Editor.Still.Render`,
  `web/public/still/block-wide.jpg` (209 KB), `block-tall.jpg` (111 KB), `block.json`. The scene is built by the Player's
  own code (`SceneBootstrap.Build`) from the Shell's messages, written by `npm --prefix web run gen:still-scene`
  (`web/scripts/genStillScene.ts`, output `data/work/still/scene.json`). The wide pose has the bank corner at 64 per cent
  of the width and 49 per cent of the height; the tall pose at 60 and 47 per cent (a test holds both to the brief).
  `Still.Render` also writes `data/work/still/block-*-raised.jpg` (not committed) to check the raised look by eye.
- **Look**: palette moved to the eleven new tokens (`BuriedPalette`, `PaletteTests`, every material); one warm lamp from
  the west (upper left of the opening view), the `soot` table taking `haze` fog, ghosts as translucent `parchment` with
  `copper` on faces turned from the lamp and `ink` edges, today's buildings as `block` volumes, the sheet toned to
  `parchment` and `ink`, dimmer before Raise (`LandingSheetGain` 0.75: the floor-light contrast stays above 4.5, a test
  checks it) and bright after. Selection (U7): `lantern` edges 1.5 times as thick with an emission above 1, plus a faint
  tint; a land-use area gets the same.

## Measured

- `tools/unity.sh test`: 214 of 214 pass. `npm --prefix web test -- src/bridge`: 63 of 63. `npm --prefix web run
  typecheck` (inside `npm run build`) clean. `tools/unity.sh build` succeeds.
- `npx playwright test e2e/art.spec.ts -g "frame times"` after the build: 60.0 fps on the GPU Chromium, also with 4x CPU
  throttling, with all 163 buildings on screen (the test passed, so the 30 fps floor holds). Software GL: 15.8 fps at
  rest, 9.1 fps with both eras under 4x throttling. I did not have the numbers from before this session to compare with,
  and I did not drop the fog quality.

## Where the spec could not be built as written

1. **A hold for the landing.** The Still shows the 1911 sheet with today's buildings solid and no ghosts. Nothing in the
   five messages lets the Shell ask for that: at depth 0 an era's sheet is not drawn, and at the era's depth its ghosts are
   up. I added an optional `held` boolean to `scene/loadEra`. While it is true the era's sheet is drawn at full opacity
   (dim), its ghosts are down and not clickable, and today's buildings stay solid; `scene/raise` ends the hold. A held load
   also takes the `BlockCamera` pose (once, and only if the visitor has not moved the view). **The web session needs to
   send `held: true` on the first `scene/loadEra` of the Block page.**
2. **Selection.** design.md says "Selection keeps the existing message", but no Shell-to-Player message carries the
   selection (`featureClicked` goes the other way). I added `scene/selectFeature` (optional `feature_id`; absent clears).
   The Shell sends it when a tag, a card or a click selects a find.
3. After `scene/raise` the raised era stays drawn whole until the next `scene/setDepth`, so the Shell can send `raise`,
   wait for `scene/raised`, then move the ruler. After the first raise today's buildings stay solid and sink with depth
   (Today full height, any era a plinth) instead of draining to an outline.
4. `scene/frameFeature`, `scene/selectFeature` and `scene/raise` for something the scene does not hold answer with an
   error (`invalid_message`, `era_not_initialised`). A `first_feature_id` that is not in the era is not an error: the
   stagger starts from the middle of the era's features.
5. `scene/anchors` `width` and `height` are the canvas in pixels divided by the Player's pixel-scale guess (`Screen.dpi`),
   which may not be the browser's device pixel ratio. The Shell should map by `x / width`, `y / height` against the
   canvas it measures.

## Skipped or short

- **Plate border** (U3) is not drawn, and the **ground fog** of U2 is the distance fog only (no separate low layer over the
  table). U2 and U3 stay unticked in tasks.md for that.
- The "mesh test" of U4 checks the sink arithmetic the shader uses, not rendered meshes.
- The bank `bld_fip_v3_1911_229_0001` is the only find in the data: `bld_fip_v3_1911_229_0101` (the factory) and
  `data/finds.json` do not exist yet, so `block.json` holds one anchor. When `finds.json` lands, rerun
  `npm --prefix web run gen:still-scene`, then `tools/unity.sh exec Buried.Editor.Still.Render`.
- The ghost edges look dense at the wide opening distance (many small buildings at 2.5 px). It reads better close up; a
  judgement for the maintainer.
- Not touched, as asked: `web/src` apart from the bridge folder, `pipeline/`, `data/evidence/`.
- Studied but not run: the other Playwright specs (`look`, `art` look checks, `lantern`) still carry expectations from the
  old palette; the web session owns those.

## Commands, for `tech.md` "Commands" once the other `tech.md` edit has landed

- `npm --prefix web run gen:still-scene` writes `data/work/still/scene.json` from the repository's `data/`.
- `tools/unity.sh exec Buried.Editor.Still.Render` writes `web/public/still/block-wide.jpg`, `block-tall.jpg` and
  `block.json`. It needs a graphics device, so `tools/unity.sh` starts the editor without `-nographics` for this method
  only. Run `tools/unity.sh exec Buried.Editor.Setup.Run` first after a token change; do not commit
  `unity/Assets/Buried/Scenes/Bootstrap.unity` or the `ProjectSettings` files it touches.
