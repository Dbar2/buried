# Session 046 notes: scene look pass, round two

Builder, main checkout, Unity only (plus `web/e2e/` test numbers). Six render rounds of the eight allowed.
Final pictures: `docs/progress/046-landing.jpg` (wide, before Raise) and `docs/progress/046-raised.jpg` (wide, raised, factory selected).
`web/public/still/` is re-rendered (`block-wide.jpg`, `block-tall.jpg`, `block.json`).

## The two failing browser tests

- **`art.spec.ts` edge patterns.** Three separate causes, none of them a blurred line style:
  1. The test's setup assumed the first documented building's three nearest large neighbours are estimated. The committed evidence now has six documented buildings and four `merged` features (not drawn), so the first assert (`estimated.properties.confidence`) failed before any rendering. The setup now takes published estimated candidates only and picks the documented building with the closest three, so they fit the 95 m view. **The measured assertions are unchanged.**
  2. Session 043 had drawn estimated edges in `rule`, which is too pale on the lit paper for the line to be told from the plate. Estimated edges are `ink` again (`LookSettings.EstimatedEdgeSoftness` 0), as `design.md` says ("Dashed `ink` outline").
  3. Measured now: documented 0.88, estimated 0.59, unknown 0.19 (limits: at least 0.85, below documented less 0.15, above unknown plus 0.15).
- **`look.spec.ts` 26.2, top rows.** The canvas's top 5 per cent spans 5.5 to 8 degrees above the horizon, and the sky only reached `soot` at 6.9 degrees, so those rows were a little lighter (7 away on red). `SkyZenithElevation` 0.12 to 0.08 (4.6 degrees). Fixed in code, the limit of 6 is unchanged.
- That exposed the next check in the same test, "sky above the horizon is bluer than the top". It passed before only because the top rows were mixed with the warm band. The band was `haze` toward the warm `parchment-dim`, so it was not bluer than `soot`. It is now `haze` toward `copper` (cool). I did **not** change the test. Note for the maintainer: this test still describes the dusk sky of the Place page (a lighter band above the horizon). Steering's block page has an empty `soot` table and no horizon glow; the Place page scene still draws the band. If the Place page loses it, the "lighter and bluer" half of 26.2 can go.
- Two more look tests turned up once the first stopped failing (they never ran before: the file runs in series):
  - "Today is not flat" read 1.342 : 1 (limit 1.35). Present roof gain 3.2 to 3.4 in `Present.shader` (the page overrides it with 1.2, so the first visit is unchanged). Now 1.357.
  - **Not fixed, not mine:** `26.6 / (e)` expects the wordmark in Fraunces and the card in Inter. Steering dropped both for Libre Baskerville and Source Sans 3, so the test is out of date (Shell fonts, `web/src/`). Tests 12 to 15 in `look.spec.ts` do not run behind it; "ghost at close range" (16) I ran alone and it passes (4.55 : 1).

## The seven items

1. **Ghosts as pale solids.** Fill alpha 0.70 documented, 0.45 estimated. `Ghost.shader` now lights with wrapped (half-Lambert) light: the roof is lifted toward white (`_TopLift`, capped under 1 so it never blooms) and is lighter than the lit paper; the wall toward the lamp is lit; walls turned from it take `copper` (`GhostCopperShade` 0.9, darker multiplier). Seen from the opening camera the south wall is mid-tone and the east wall is the `copper` one. The plan's lettering shows through faintly. **Met.** The ghosts in the lower left still have a lot of dashed ink, but they read as pale boxes, not wire.
2. **Selected find.** Fill alpha 0.5 (was 0.26) with its own lamp lighting: a lifted `lantern` roof and amber sides (`lantern` toward `ink`); edge 2.8 times a ghost's (was 2.4); the pool of `lantern` light is 1.3 times the footprint's longest side in radius (about 2.6 times its width across) with alpha 0.9. The landing lamp pool is 70 m (was 85) and the sheet's floor light 0.32 (was 0.38), so the pool stands out. **Met:** the factory is the first thing the eye lands on in the raised picture.
3. **Olive page.** The cause was the cool tint: it multiplied `copper` (green) into a yellow paper. It is now a small red and green reduction with blue untouched (`SheetCoolness` 0.04), the warm tint reaches 2.4 pool radii, and the floor is 0.32 (landing gain 0.85, so the dimmest landing sheet is 0.272, tested at 4.5 : 1). **Mostly met.** Lit paper stays warm parchment; the far lower part is now a dark warm brown-grey. On the phone Still the bottom of the frame is still a little grey. A warmer floor would need the contrast test's floor lowered, which I did not do.
4. **Small drafts.** Estimated features under 60 m2 build the roof ring only (`FootprintBuilder.Options.RoofOnly`, area by `FootprintBuilder.AreaM2`), and a segment shorter than 12 CSS px on screen is solid (`_DashMinSegPx` in `Edge.shader`). The 12 px rule is on a segment, not a whole feature. **Partly met:** the many mid-size drafts in the lower left (over 60 m2) keep their dashed ink and still read busy at this distance.
5. **Heights.** 3.6 m a storey, 4.5 m with none read (`LookSettings.BuildingHeightM`). `EraLayer.HeightOf` uses them for every building and **ignores the Shell's `heightM`** (the Shell's constants in `web/src/explorer/sceneFeatures.ts` are still 3.5 and 3.5, a file another session owns). Whoever edits it should set 3.6 and 4.5 and can then drop the override. I changed the roof heights in `e2e/art.spec.ts`, `look.spec.ts`, `lantern.spec.ts` and `gate.spec.ts` to match (the last two were not run). Storey lines stay one per documented storey. **Met.**
6. **Landing outlines.** Held outlines are `copper` at 0.7 (was 0.55). They are now one line (the top ring only: `Edge.shader` drops the base ring, corners and storey lines while held, which had doubled the alpha) and solid, not dashed. They are visible where a 1911 footprint is not under a block; most of the footprints are under blocks. **Met, but modest:** a few teal lines in the gaps between blocks.
7. **Camera.** Wide: target (2.2, 63.7), 255 m (was 300), pitch 40, heading 342.5, lens 33. The target moved 8 m to the right of the frame: closer on the old target put the sheet's right edge at 0.99 of the half-width. Now top edge 0.55 and right edge 0.93 (limit 0.98). Factory centre 52 per cent across, 37 per cent down, about 165 px across in 1600. Tall pose unchanged. **Met.**

## Checks

- `tools/unity.sh test`: 223 of 223 (was 218; five new in `GhostBodyTests`). Numbers changed in tests because the brief changed them: `LookTests` (fill 0.70, estimated 0.45, under 0.75), `RaiseSceneTests` (selected tint under 0.8), `RaiseTests` (building anchor 4.5 m).
- `tools/unity.sh build`, `npm --prefix web run build`, `npx playwright test e2e/art.spec.ts e2e/look.spec.ts`: art all four pass; look passes 1 to 10 and fails 11 (fonts, above).
- `npx playwright test e2e/art.spec.ts -g "frame times"` passes. GPU Chromium: 60.0 fps at rest and with 163 buildings at 1x and 4x CPU throttling (p95 16.7 to 16.8 ms). Software GL: 9.4 and 3.7 fps at 1x, 6.0 and 8.9 fps at 4x (noisy; not the gate; 043 had 9.4 and 4.9, 5.9 and 6.6).

## Not done

- The raise animation was not looked at; the end state was.
- `design.md` still says Today's blocks sink to 1 m plinths (043's note says it should say a flat outline), and does not give the new heights or opacities. Steering is not mine to edit.
- `lantern.spec.ts` and `gate.spec.ts` roof numbers were edited but not run.
- `Bootstrap.unity` and `ProjectSettings` are not committed.
