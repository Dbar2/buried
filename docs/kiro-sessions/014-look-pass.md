# Session 014: the look pass (spec 03 task group 16)

Builder, claude-sonnet-5.5. Tasks done: 16.1 to 16.7, 3.4 (pulled forward), and the two follow-ups
(`gateCard.test.ts` uses `findBannedWords`; `drapes.test.ts` uses the 1931-1935 fixtures). Group 17
was not started.

## Results

- Bridge 0.2.0 (`initialView`, `debug/setCamera`). Unity EditMode: 89 of 89. Web `npm test`: 414 of
  414 before the layout work, then the new tests added. `npx playwright test`: gate (2) and look (10) pass.
- The Unity WebGL build is 7.9 MB in `Build/` (data 1.9 MB, wasm 5.8 MB, framework 0.07 MB, loader
  0.12 MB), under the 15 MB budget.
- Screenshots: `web/e2e/output/look-today.png`, `look-1935.png`, `look-1911.png`,
  `look-card-1911.png`, `look-gauge-focus.png` (gitignored; the look test writes them).

## Requirement 26, item by item (the maintainer confirms)

| Item | Result |
|---|---|
| 26.1 building in the middle third, two drape corners off the canvas | Met, checked by the test from the Player's own view-projection. |
| 26.2 top of the canvas darkest and close to `night`; no default skybox; no hard horizon | Met for the top rows (median colour within 6 per channel of `night`). **The sky itself is never on screen:** see "Two things that cannot be done as written". |
| 26.3 drape fades into the ground, ground continues into the distance | Met for the fade (15 m band, see 1935 and 1911 shots). The distant ground darkens from `fog` to `night`, which is a choice: see below. |
| 26.4 thin `ink` lines on top, corners and base, translucent fill, no tint, glow at most about 2 px | Met by construction (1.5 px line plus 1 px glow each side, fill `ink` at alpha 0.35). Judge by eye in `look-1911.png`. |
| 26.5 no `lantern` or `water` colour in canvas or DOM | Met, checked on every saved canvas and on every element's computed colours. |
| 26.6 header with wordmark in Fraunces, Sources link in Inter | Met, checked. |
| 26.7 gauge on the right edge, Today, 1947, 1935, 1911, years in Plex Mono, current era by shape and weight | Met, checked. |
| 26.8 card is a `fog` panel that does not cover the building, Fraunces heading, Inter 16 px body, Plex Mono ids | Met, checked. |
| 26.9 attribution legible along the bottom, no debug marker | Met, checked. |
| 26.10 focus ring visible on the gauge | Met (2 px `text` outline); see `look-gauge-focus.png`. |

## Two things that cannot be done as written

1. **Task 16.7 (c), the horizon.** The camera looks 50 degrees down with a 40 degree vertical field
   of view, so the top edge of the canvas is 30 degrees below the horizon (it projects to row -846 of
   744). At the lowest pitch the limits allow, 20 degrees, the top edge is exactly the horizon. So no
   sky is ever drawn, and "the band just above the horizon" cannot be compared. The test records the
   horizon row, asserts it is off the canvas, and checks the top rows against `night` instead. To show
   the sky, the field of view must grow (about 60 degrees would show 10 degrees of sky at the lowest
   pitch) or the minimum pitch must fall. This is the maintainer's call.
2. **Task 16.7 (f), Down then Up.** Down from Today reaches 1947, not 1935. The test presses Down
   twice to reach 1935 and Up twice to return to Today.

## Choices the maintainer should look at

- **Fog colour.** To make the top of the canvas close to `night` (26.2) the haze is `fog` where at
  least half the light survives and darkens to `night` where a quarter or less survives
  (`BuriedApplyFog`). The ground is therefore `fog` near the block and `night` far away, and the sky
  is `night` at the horizon. 26.3 and `design.md` say "fog colour". If you want pure `fog`, 26.2's top
  rows cannot be met at the default pose.
- **Median, not mean.** The top-rows check uses the per-channel median, because present buildings
  reach the top rows at Today and would pull a mean away from the ground colour.
- **Drapes fade with distance** (spec 20.5, `design.md`): at the default pose the plate is at about
  60 to 70 per cent opacity, which is why it reads grey, not white.
- **Bloom** is on (threshold 1.0, intensity 0.3, scatter 0.2) with HDR on and tone mapping None. The
  ink edges are the only emission above 1. The raster fidelity test (task 4.3) will say whether bloom
  leaks into the plate.
- **Pixel scale.** Edge width is 1.5 CSS px only if Unity reports the display density
  (`Screen.dpi / 96`); otherwise it is 1.5 device px. The bridge carries no devicePixelRatio.
- **Gate test.** The default pose now frames the block (requirement 16.8), so one of the three control
  points is off the canvas. `gate.spec.ts` zooms out with the wheel until all three are inside it and
  hides the Shell overlays before measuring. Tolerances are unchanged; the deltas are 0.4 px or less.
- **Present buildings** are drawn solid at Today and as a faint outline in every other era (hard
  switch until `DepthBlend`, task 3.3); their attribution line shows in every era.

## Not done

- Task group 17 (17.1 to 17.8), see the report.
- The bundle split: `web/dist/assets/index-*.js` is still 673 kB. Dropping JSTS from the first load
  with a bundler setting works (335 kB) but removes `monkey.js`, which JSTS needs for `buffer()`; that
  would break the lot code when search lands. The safe fix is for the lot and search code to be
  imported dynamically by its consumers (task 9.1).

## A note on the Unity build

After `tools/unity.sh build` returns, `web/public/unity/Build/` can still change for a minute or so.
Running `npm run build` (which copies it into `dist/`) too soon serves an older Player. Wait until the
folder stops changing, then build the web package. Shader edits are worth a visible test (a coloured
output) when something looks stale: this session lost time to exactly that.
