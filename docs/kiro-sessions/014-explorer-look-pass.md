# Kiro session 014: the Explorer look pass

Agent: builder (claude-sonnet-5.5). You can run commands, including `tools/unity.sh`.

Implement spec `.kiro/specs/03-explorer/` task group 16 (the look pass), then group 17. Read the
spec's requirements (26 in particular), `design.md` sections "Initial view", "Layout", "Drape
mask", "Drape placement check" and "Precision", and `.kiro/steering/design.md` first.

## State since the gate

- Schema is at 1.1.0. Tiles are now cropped to each plate's map area: sidecars carry `crop_px` and
  `map_area`, and `<id>_full.jpg` holds the uncropped photograph. Corners changed; the gate e2e
  still passes on the new tiles (re-run by the maintainer).
- `data/present/` holds building outlines (1507), property boundaries (1591), address points
  (2119) and intersections (363) for the showcase bounds.
- `web/src/evidence/` now exports the lot relation, findings, `findBannedWords`,
  `sourceYearsText`. The shell bundle grew to about 669 kB because JSTS is pulled in through the
  index; split it so the Explorer's first load does not pay for it.

## Decisions from the maintainer on the architect's open items

1. **Wheel.** For this session the plain wheel zooms (16.5, interim). Once Dig exists (group 3)
   the plain wheel digs and zoom moves to pinch, Ctrl/Cmd + wheel, and the plus and minus keys.
   Write the camera input so that switch is one mapping change.
2. **Today is not empty.** Pull task 3.4 (present buildings in `scene/init`, fixed height) into
   this session, after 16.1, so the opening view has today's buildings in cold slate.
3. **Glow.** A subtle edge glow on ghosts, capped at about 2 px, as requirement 26.4 has it. No
   bloom on anything else.
4. **Held-out guard** also covers `data/control/map_area/` (one-line extension, with the test).

## Order

1. 16.1, then 3.4, then 16.2 to 16.6. Build and look after each visual task: run
   `tools/unity.sh build`, then the look test (16.7), and read the screenshots it writes. Judge them
   against requirement 26 before moving on. If a screenshot does not meet a criterion, fix it; do
   not edit the criterion.
2. 16.7 (the look check).
3. 17.1 (clip the drape to the map area), 17.2, 17.3, 17.4 (drape placement check), 17.5, 17.6,
   17.7, 17.8.
4. Follow-ups from session 011: replace the local banned-word regex in
   `web/src/explorer/gateCard.test.ts` with `findBannedWords`; move
   `web/src/explorer/drapes.test.ts` to the 1931-1935 era fixture.

## What good looks like

A person opening the page sees a city block at dusk, not a test harness: a graded sky, fog that
dissolves the edge of the coverage area, today's buildings as quiet cold volumes, the plate's
edge fading out instead of ending in a hard rectangle, one pale ghost with ink edges, and a page
layout with real type and spacing. Restraint matters more than effects: no particles, no lens
flare, no grain, no gradients on UI chrome, no rounded-everything cards, no drop shadows used as
decoration. The palette tokens and the three typefaces are the whole visual vocabulary.

## Rules

- Never weaken a test, a property or a threshold to pass. Report numbers instead.
- Keep the WebGL build under the 15 MB budget and report its size.
- Commit per task once its tests pass; tick tasks only then. Record new commands in `tech.md`.
- Do not push.
- If you run short of room, stop at a clean task boundary.

End with: what was built, the final command results, the build size, the look-test screenshots'
paths, which requirement 26 criteria you believe are met and which are not, and anything
unfinished.
