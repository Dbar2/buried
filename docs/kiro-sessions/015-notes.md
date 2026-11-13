# Session 015 notes: look review fixes, map-area clip, drape placement check

Builder, claude-sonnet-5.5. Brief: `015-look-review-and-drape.md`.

## 1. The maintainer's review of the look pass

| Item | What changed | Result |
|---|---|---|
| 1 Dusk | Sky shows the horizon. Fog is the `fog` colour again (the darken-to-`night` workaround is gone). Sky shader: `fog` at and below the horizon, a lighter grey-blue band just above it, `night` from about 7 degrees up. Requirement 26.2 rewritten as the brief says, and its test. | Horizon at row 114.4 of 744 (15.4 %). Top rows within 6 per channel of `night`. Rows above the horizon lighter and bluer than the top. Worst contrast across the horizon band 1.002 : 1. |
| 2 Today is flat | `Buried/Present` lighting in three steps: leeward walls, walls facing the west sun, roofs. | Roof against ground 1.447 : 1 (WCAG ratio; 46 large buildings in the lower half of the canvas, ground from 200 open points). Roof luminance stays under a ghost's. |
| 3 Framing | `initialView` frames the union of the plates' map areas plus 15 % of its width and height each side. Heading 22.5 degrees (NNE). | Centre of the map area at the canvas centre. Published building inside the middle third. |
| 4 Card | The card is a flex column: heading and Close stay put, the fields scroll. Focus on Close no longer scrolls the card. Confirmation time shows as `12 Nov 2026, 21:32 UTC` with the ISO string in `title`. | Look test asserts the heading is inside the viewport, below the header, topmost at its own position. |

Screenshots (gitignored, written by the look test): `web/e2e/output/look-today.png`, `look-1935.png`,
`look-1911.png`, `look-card-1911.png`, `look-gauge-focus.png`.

### Two numbers in the brief could not both hold: please check

The brief asks for a pitch of about 32 degrees and a vertical field of view of about 50 degrees,
and for a sky band in the top 15 to 20 per cent of the canvas. They disagree. The horizon sits at
`(1 - tan(pitch) / tan(fov / 2)) / 2` of the canvas height from the top. With 32 and 50 that is
`tan 32 / tan 25 = 1.34`, above 1, so the horizon is off the canvas: the top edge is 7 degrees
below the horizon (32 - 25). I kept the **outcome** (horizon between 12 and 22 per cent, which
the new 26.2 test checks) and moved the two inputs: **pitch 21 degrees, field of view 58
degrees**, which put the horizon 15.4 per cent down. The minimum pitch stays 20 degrees. If you
would rather keep 32 and about 50 and lose the sky, say so; if you would rather keep the sky at a
steeper pitch, the field of view must grow (pitch 32 needs about 84 degrees).

### Requirement 26.1 and item 3 disagree: left failing

26.1 (task 16.7 (d)) wants at least two corners of the 1911 drape outside the canvas. The tile is
now cropped to the map area, and item 3 frames the map area plus 15 per cent, so all four corners
are inside. The check is kept unchanged at the end of `look.spec.ts`
(`26.1 / (d) at least two corners ...`) and **fails** (0 corners outside). The brief authorised
rewriting 26.2 only, so I did not touch this one. The building-in-the-middle-third half of 26.1
passes as its own test. Decide: drop the corner criterion (the tile no longer includes margins the
view needs to hide), or frame tighter than the map area.

### Choices to look at

- Roof gain 2.3 and sun gain 4.5 in `Present.shader` are tuned by measurement; the roof ratio is
  1.447 against the 1.35 floor.
- The fog is the unchanged `ln(50) / R` with R from the project bounds. The default camera is now
  several hundred metres from the block, so buildings in the far half are mostly fog. The near
  half carries the roof measurement.

## 2. Task 17.1: the drape is clipped to the map area (done, ticked)

Bridge `0.3.0`: optional `clip` (a closed Polygon) on `drape`. Schema, fixtures (two invalid: open
ring, not a Polygon; one valid concave clip), generated types and samples (500 regenerated),
DTOs, parser, writer, `toDrape`, `DrapeLayer.Boundary` (clip ring, else the four corners) and the
mask. Unity EditMode 92 of 92 (E13 now also runs a concave star clip inside a rotated quad through
the DTO, E1 and E2 pass on the regenerated samples). Web `npm test` passes. The screenshot
`look-1911.png` shows the notch and the feathered edge.

## 3. Task 17.6: triangulation on every real polygon (done, ticked)

E15 (`RealPolygonTests`): 3102 polygons in the 5 committed files (13 with holes), 0 dropped by
preparation. It found a real counterexample on the first run: City building outline 306711 has a
13 mm fold-back jog (vertices 39, 40, 0 of its exterior ring), and the wall quad on that edge has no
solid behind it. The fix is in the code, not the test: `PolygonPrep` now merges a vertex closer than
2 cm to the one before it (`MinEdgeM`). Two centimetres is a hundredth of the smallest position
error. Recorded in design.md "Meshing". `Triangulator.cs` now states the decision to keep Buried's
own ear clipper.

## 4. Task 17.4: the drape placement check (NOT ticked: it fails its own rule)

`web/e2e/drape.spec.ts` runs as the design says (camera 80 degrees down above the point, about 0.25
m per pixel, canvas screenshot with the overlays hidden, 64 x 64 px patch, NCC over +-8 px).
Plumbing added: a debug-only camera form in the Explorer (`?debug=1`, sent over the one bridge as
`debug/setCamera`), `?markers=0` to leave the gate markers out, `e2e/support/ncc.ts` and
`drapeMath.ts` with vitest tests (16), the tile's pixels decoded by the browser.

### Measured, every control point of both plates (offset 0, 0 px at all twelve)

| Plate | Point | Inside the map area | Patch sd | NCC peak | Offset (px) | Design rule |
|---|---|---|---|---|---|---|
| 1911 | cp_13465571 | 8.5 m | 68.6 | 0.447 | 0, 0 | skipped (under 25 m) |
| 1911 | cp_13465478 | 20.0 m | 56.8 | 0.984 | 0, 0 | skipped |
| 1911 | cp_13465645 | 17.4 m | 79.3 | 0.982 | 0, 0 | skipped |
| 1911 | cp_13465784 | 9.1 m | 66.1 | 0.476 | 0, 0 | skipped |
| 1911 | cp_13465760 | 42.9 m | 45.2 | 0.988 | 0, 0 | tested, passes |
| 1911 | cp_13465711 | 81.1 m | 48.9 | 0.985 | 0, 0 | tested, passes |
| 1935 | cp_13465571 | 9.3 m | 58.2 | 0.564 | 0, 0 | skipped |
| 1935 | cp_13465478 | 18.9 m | 45.2 | 0.970 | 0, 0 | skipped |
| 1935 | cp_13465645 | 13.5 m | 46.8 | 0.860 | 0, 0 | skipped |
| 1935 | cp_13465784 | 13.8 m | 55.4 | 0.817 | 0, 0 | skipped |
| 1935 | cp_13465760 | 47.2 m | 31.1 | 0.987 | 0, 0 | tested, passes |
| 1935 | cp_13465711 | 79.4 m | 46.7 | 0.991 | 0, 0 | tested, passes |

Outside the map area (item 6): at a point 102.5 m outside the 1911 clip and one 97.7 m outside the
1935 clip, the canvas with the drape and with the 1947 era (no drape) differ by 0 per channel.

### Why it is red

The design skips a point less than 25 m inside the boundary and fails a plate with fewer than
three tested points. Only two points per plate are at least 25 m inside the committed map areas, so
both plate tests fail with "control points far enough inside the map area to test ... 2". The
measurements say the renderer places the tile exactly (peak at 0, 0 px everywhere) and that the
25 m rule is stricter than it needs to be: the two points between 17 and 20 m inside correlate at
0.97 to 0.98, and only points within about 10 m of the edge lose correlation, because the 15 m fade
changes the opacity across the patch (NCC assumes it is near constant). I did not change the rule.
Your options: lower the margin to about 15 m (then 1911 has four testable points and 1935 has
three: 18.9, 47.2 and 79.4 m), pick more control points in the southern part of the plates, or
both. `DRAPE_MARGIN_M` in the environment overrides the margin for a measuring run only; the
committed default is the design's 25 m.

## Things you should know

- The other builder's `git commit` in the shared index swept my staged item 1 files into commit
  `9f53156` ("Spec 02 tasks 7.3 to 7.7 ..."), and my 17.1 and 17.6 commit `e21cfd3` may carry
  staged files of theirs. The content is right; only the commit messages are mixed.
- `unity/Assets/Buried/Scenes/Bootstrap.unity` changes object ids every time the tests run; I left
  it uncommitted.
