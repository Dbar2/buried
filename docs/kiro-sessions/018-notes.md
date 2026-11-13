# Session 018 notes: two test decisions, then Dig

Builder, claude-sonnet-5.5. Brief: `018-dig.md`.

## 1. The two decisions

### 26.1 corner criterion: dropped

The test "26.1 / (d) at least two corners of the 1911 drape are off the canvas" is deleted from
`web/e2e/look.spec.ts`, and the clause is removed from requirement 26.1. The default view frames the
whole map area plus 15 per cent, so the four corners of a map-area tile are in view. The other half of
26.1 (the published building inside the middle third) is unchanged and its test still runs. Pitch 21
degrees with a 58 degree field of view stays.

### 17.4 margin: 15 m

`design.md` "Drape placement check" and the test constant (`INSIDE_MARGIN_M`, default `FEATHER_M`) now
say 15 m, the width of the drape's edge fade. `DRAPE_MARGIN_M` still overrides it for measuring runs.
Run on both plates at the default margin: 4 passed.

| Plate | Point | Inside the map area | Patch sd | NCC peak | Offset (px) | Result |
|---|---|---|---|---|---|---|
| 1911 | cp_13465478 | 20.0 m | 56.8 | 0.9842 | 0, 0 | tested, passes |
| 1911 | cp_13465645 | 17.4 m | 79.3 | 0.9815 | 0, 0 | tested, passes |
| 1911 | cp_13465760 | 42.9 m | 45.2 | 0.9881 | 0, 0 | tested, passes |
| 1911 | cp_13465711 | 81.1 m | 48.9 | 0.9845 | 0, 0 | tested, passes |
| 1911 | cp_13465571 | 8.5 m | | | | skipped (under 15 m) |
| 1911 | cp_13465784 | 9.1 m | | | | skipped |
| 1935 | cp_13465478 | 18.9 m | 45.2 | 0.9703 | 0, 0 | tested, passes |
| 1935 | cp_13465760 | 47.2 m | 31.1 | 0.9867 | 0, 0 | tested, passes |
| 1935 | cp_13465711 | 79.4 m | 46.7 | 0.9907 | 0, 0 | tested, passes |
| 1935 | cp_13465571 | 9.3 m | | | | skipped |
| 1935 | cp_13465645 | 13.5 m | | | | skipped |
| 1935 | cp_13465784 | 13.8 m | | | | skipped |

1911 has four tested points, 1935 has three, so both meet the "at least three" rule. Outside the map
area (item 6): 102.5 m outside the 1911 clip and 97.7 m outside the 1935 clip, the largest channel
difference against the same view with no drape is 0. Task 17.4 is ticked.

## 2. Dig (spec 03 task group 3)

Ticked: 3.1, 3.2 (E7), 3.3, 3.7. Not done: 3.5 (`sceneModel.ts`) and 3.6 (E6), which the brief did not
ask for. Every era is still loaded at start, so `erasToKeep` is built and tested but not yet used.

### What changed

- **Shell.** `depth.ts` (pure: tween, wheel notches, drag, nearest era, `erasToKeep`), `useDepth.ts`
  (one animation-frame loop while a tween runs), `DepthGauge` (drag, and a marker that follows the depth),
  the capture-phase wheel listener in `Explorer.tsx`, `eraNote.ts`. A tween is 750 ms per era step, clamped
  to 600 to 900 ms. The announcement is made when the depth reaches an era, not on the key press.
- **Player.** `DepthBlend` (pure), `EraLayer.SetWeight` with a material copy per era, `Rise` and `Weight` in
  `Ghost.shader`, `Rise` in `Edge.shader`, `SceneController.ApplyDepth` applies each depth as it arrives.
  Camera reports go out only when the depth lands on an era.
- **Input.** The plain wheel over the canvas is Dig's. Down and Up on the gauge were already Dig's keys.
  Zoom is Ctrl, Cmd or Shift with the wheel, trackpad pinch, and `+`/`-`.
- **1947.** At rest on 1947 the Shell shows "No 1947 imagery loaded yet" and the scene shows today's faint outlines.

### Decisions to look at

- **The Player does not read modifier keys.** `captureAllKeyboardInput` is off, so Unity sees Ctrl only while
  its canvas has focus, and a trackpad pinch (a wheel event with Ctrl set, no key) has no key at all. A rule
  "zoom only with a modifier held" failed the first Ctrl + wheel test for exactly this reason. Instead the
  Shell stops the plain wheel and the Player zooms on every wheel event that reaches it
  (`CameraInputMap.WheelEventsZoom`; `PlainWheelZooms` and `WheelZooms()` are gone). Requirement 16.6 and
  design.md "Camera" say so. The canvas now takes focus when pressed (`tabIndex=-1`), so `+`/`-` work.
- **Pinch is not tested.** Playwright cannot send a trackpad pinch. It reaches the Player through the same
  path as Ctrl + wheel, which is tested.
- **Look test waits for the announcement.** `look.spec.ts` read the announcement right after a key press;
  with a 750 ms tween the era is announced when reached. The helper `announced()` polls for the same text.
  No assertion changed.
- **Task 3.7 wording.** It says `cameraChanged` is not sent on a depth change. The bridge has always sent one
  report after a depth change (the gate test waits for it), now only when the depth lands. The test checks
  the view-projection is identical before and after digging, which is requirement 10.9.
- **Ghost rise** is a vertical scale about y = 0 in the vertex shader. The only published ghosts are the
  1911 and 1935 plate 229 buildings, so the rise is small on screen.

### Checks

- Web `npm test`: 44 files, 458 tests pass. `npm run build` (typecheck + build) passes.
- Unity EditMode: 101 of 101 (9 new in `DepthBlendTests`). WebGL build: 0 errors, 0 warnings.
- Playwright, whole suite: 23 of 23 (dig 6, drape 4, gate 2, look 11). Drape figures are in section 1.
- Dig measured: one key press runs 0 to 1 through fractions in about 750 ms; the marker is between the stops
  while the depth is.
- Frames: `web/e2e/output/dig-1.png` to `dig-5.png` (gauge dragged to depths 0, 0.75, 1.5, 2.25, 3 and held). Read
  by eye (frames 2 to 4): at 0.75 the present is a faint wireframe with no plate; at 1.5 the 1935 plate
  is on screen; at 2.25 the 1935 plate is still the one in view (1911 is at a quarter weight and I could
  not tell it apart by eye); the marker sits between the stops in each. Frames 1 and 5 were not read.
