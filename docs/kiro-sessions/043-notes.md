# Session 043 notes: the scene look pass

Builder, main checkout, Unity only (plus `web/scripts/genStillScene.ts`). Eight render rounds allowed; six used.
Final pictures: `docs/progress/043-landing.jpg` (the wide landing Still) and `docs/progress/043-raised.jpg` (wide, raised, factory selected).

## The six problems

1. **Camera too far.** `BlockCamera`: lens 33 degrees (`BlockCamera.FovDeg`, the Player sets it with the pose and `SceneController.ClearScene`
   puts the 58 degree default back; `scene/frameFeature` and `scene/focusLot` now use the camera's own field of view). Heading 342.5 degrees, the
   bearing of the sheet's bottom edge to its top edge, so "QUEEN EAST" runs left to right at the top (turn from plate up: 0 degrees, limit 25).
   Wide: target (-5.4, 61.3), 300 m, pitch 40. Tall: target (27.3, 4.6), 480 m, pitch 40. Measured in `BlockCameraTests`: the factory
   footprint is at least 120 px across in 1600 px (about 140 px), its centre is at 54 per cent across and 37 per cent down, the sheet's top and right edges are
   inside the frame, and the corner is in the upper 55 per cent of the tall frame. **Met.** The left third is the sheet running off into shadow, but
   it still carries today's slabs and plan lines, so a headline there needs its own scrim (web).
2. **Grey patches on the table.** The Shell sends every present building; `PresentLayer.RestrictTo` draws only those whose whole footprint lies in the sheet's
   rectangle (held load only). The table is empty. The table was `haze`, not `soot`: the ground is one huge quad whose fog was per vertex, and the sky painted over
   it because it wrote no depth. On the page the ground writes depth, takes its fog per pixel (`_FogPerFragment`) and the fog is 10 per cent of the
   project's, so it reads `soot` and only the far edge takes `haze`. **Met.**
3. **Cut-out sheet.** The held drape ignores its map-area clip and drapes the four corners (`SceneController.WithoutClip`, `DrapeLayer.MakePage`): crisp
   edge, an ink rule 1.4 m inside it, 0.4 m of paper below (four sides shaded by the lamp, the table lowered 0.4 m), and a soft contact shadow thrown along the lamp's
   travel. All in `Drape.shader` (`_SheetMode` 1 and 2) and the existing ghost shader, so no new shader reference and no change to `Bootstrap.unity`. **Met.**
4. **Cold grey sheet, no lamp.** The lamp now travels toward heading 105 at 32 degrees (upper left of the opening view). The pool is 85 m across and sits on the Queen and River corner; the
   paper is tinted warm under it (`_WarmTint`) and cool away from it (`_CoolTint`); light falls to the floor toward the lower left. The paper reads warm tan, a little
   darker and browner than `parchment` at the pool. **Mostly met.** A true vignette is not drawn (see "Not done").
5. **Ghosts as dark striped noise.** Edge width 2.5 to 1.3 px, casing 1.5 to 0.8 px, fill alpha 0.45 to 0.55, emission 0.25 to 0.3, copper shade of faces turned from the lamp 0.55 to 0.8,
   storey lines at 40 per cent alpha fading out between 220 and 420 m (the edge mesh marks floor lines with normal.x = 1). The 162 drafts have a lighter edge colour (`rule`) and a 0.2 fill.
   Land-use areas have copper outlines and a hatch at 0.34 alpha. Before the raise the 1911 features lie flat as `copper` outlines (`_HeldAlpha` in `Edge.shader`). **Partly met.** At the
   opening distance hand-traced ghosts read as pale boxes with fine edges, but the 162 drafts still read as scribble in the lower left.
6. **Today's buildings stay as slabs.** After raise they sink to 5 cm, their fill drains and what stays is a `block` outline at 35 per cent
   (`PresentLayer.SetSunk`). This **replaces the 1 m plinth** (`RaiseSchedule.PlinthM` is still 1 and still tested; the Player no longer uses it for Today's blocks);
   steering `design.md` ("The present", "Motion") should be updated to match. Before the raise they are matte `block` volumes, with a shadow to the lower right (a flattened copy of
   the lamp-facing faces, `Present.shader` `_ShadowMode`), shown on the page only. **Met.**

Selected find: edges 2.4 times as thick, in `lantern`, a faint `lantern` tint (0.26, kept under the 0.3 the tests allow) and a soft pool of `lantern` light under it (`Ghost.shader` `_Glow`). In the raised picture the selected factory is the first thing the eye lands on.

## Checks

- `tools/unity.sh test`: 218 of 218 (was 214; new camera tests). `LookTests` now pins `EdgeWidthCssPx` 1.3 (at most 1.5) and `GhostFillAlpha` 0.55 (still under 0.6), because the brief changed those two numbers. No other test was edited.
- `tools/unity.sh build`, `npm --prefix web run build`, then `npx playwright test e2e/art.spec.ts -g "frame times"`: passes. GPU Chromium: 60.0 fps at rest and with 163 buildings,
  59.7 and 60.0 fps with 4x CPU throttling. Software GL: 9.4 and 4.9 fps at 1x, 5.9 and 6.6 fps at 4x (the old notes gave 15.8 and 9.1; software GL is noisy and not the
  test's gate). **The first run failed at 34 fps**: every present building had a shadow renderer on the Place page; shadows are now on the page only.
- `block.json` holds an anchor for every find's 1911 feature (6 of 6, `on_screen` false for the coal yard and the mission hall in the wide view). `genStillScene.ts` read a `feature_id` that does not exist in `finds.json`; it now reads each find's `readings`.

## Camera numbers

Wide: target (-5.4, 61.3), 300 m, pitch 40, heading 342.5, lens 33. Tall: target (27.3, 4.6), 480 m, pitch 40, heading 342.5, lens 33. Factory centre at 54 per cent across and 37 per cent down in the wide Still; about 140 px wide.

## Not done, or not right

- **Vignette.** Post-processing is limited to bloom by `design.md` and by `LookTests.TheOnlyPostEffectIsBloom...`, so I did not add a Vignette override. The pool's falloff and the soot table darken the corners.
- **Landing headline room.** The left third has slabs and plan lines; it is darker than the right but not empty.
- **Raise pictures are still frames.** The raise animation was not looked at; the end state was.
- **Phone.** The tall Still was checked once by eye; the corner sits at about 28 per cent down, the top 24 per cent of the frame is table.
- **Present on non-page scenes** keeps its old look (roof gain, wall light, no shadows); only the held page changed.
- Not committed: `Bootstrap.unity`, `ProjectSettings`.
