# Session 015 notes: look review fixes, map-area clip, drape placement check

Builder, claude-sonnet-5.5. Brief: `015-look-review-and-drape.md`.

## 1. The maintainer's review of the look pass

| Item | What changed | Result |
|---|---|---|
| 1 Dusk | Sky shows the horizon. Fog is the `fog` colour again (the darken-to-`night` workaround is gone). Sky shader: `fog` at and below the horizon, a lighter grey-blue band just above it, `night` from about 7 degrees up. Requirement 26.2 rewritten as the brief says, and its test. | Horizon at row 114.4 of 744 (15.4 %). Top rows within 6 per channel of `night`. Rows above the horizon lighter and bluer than the top. Worst contrast across the horizon band 1.002 : 1. |
| 2 Today is flat | `Buried/Present` lighting in three steps: leeward walls, walls facing the west sun, roofs. | Roof against ground 1.447 : 1 (WCAG ratio; 46 large buildings in the lower half of the canvas, ground from 200 open points). Roof luminance stays under a ghost's. |
| 3 Framing | `initialView` frames the union of the plates' map areas plus 15 % of its width and height each side. Heading 22.5 degrees (NNE). | Centre of the map area at the canvas centre. Published building inside the middle third. |
| 4 Card | The card is a flex column: heading and Close stay put, the fields scroll. Focus on Close no longer scrolls the card. Confirmation time shows as `12 Nov 2026, 21:32 UTC` with the ISO string in `title`. | Look test asserts the heading is inside the viewport, below the header, topmost at its own position. |

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

## Choices to look at

- Roof gain 2.3 and sun gain 4.5 in `Present.shader` are tuned by measurement; the roof ratio is
  1.447 against the 1.35 floor.
- The fog is the unchanged `ln(50) / R` with R from the project bounds. The default camera is now
  several hundred metres from the block, so buildings in the far half are mostly fog. The near
  half carries the roof measurement.
