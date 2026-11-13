# Session 048: round three (builder, web lane)

Agent: `builder`. You are in the web worktree (`lane/web`). A current Unity build is in
`web/public/unity/`; run the Block configs yourself and look at the screenshots.

## Read first, and only these

- `docs/kiro-sessions/045-notes.md`, `docs/kiro-sessions/046-notes.md`.
- `.kiro/steering/design.md` (loaded for you): Type, "The raised scene and the card".
- `web/src/block/`, `web/src/explorer/sceneFeatures.ts`, `web/src/explorer/webgl.ts`,
  `web/e2e/look.spec.ts` (test 26.6 only), `web/e2e/block.spec.ts`, `web/e2e/block-flat.spec.ts`.

Do not edit `unity/`, `pipeline/`, `data/schema/` or generated files.

## The list

Commit each item on its own with `git commit -m "<message>" -- <paths>`. No Co-Authored-By line.

1. **One old test still fails and blocks five behind it.** `e2e/look.spec.ts` 26.6 expects the
   wordmark in Fraunces and the card body in Inter. Steering now says Libre Baskerville and Source
   Sans 3 (IBM Plex Mono unchanged). Update the test to steering, then run the whole of
   `look.spec.ts` (`cd web && npm run build && npx playwright test e2e/look.spec.ts`) and fix
   whatever the five blocked tests show, by the same rule: steering wins where it has changed,
   and a test that still describes current steering is not relaxed.
2. **Storey heights.** `sceneFeatures.ts` still sends 3.5 m per storey and 3.5 m when no storeys
   are read. The scene now uses 3.6 and 4.5 (session 046, which overrides what the Shell sends).
   Set the Shell's constants to 3.6 and 4.5 and update the tests that pin them, so both sides
   agree. Note in your notes that the Unity override can then be removed by the Unity lane.
3. **The paper tags are missing from the landing at desktop width.** Before the raise the landing
   should show a paper tag on a string for each find whose anchor is on screen and outside the
   intro's scrim ("Overall factory", "Bank", "Machine shop" at 1440 by 900). In
   `block-landing-1440.png` there are none. Find out why (the Still's anchors in
   `web/public/still/block.json`, the scrim keep-out from session 045, or the camera change in
   session 046) and fix it. A tag that would sit under the scrim moves to the nearest free spot to
   its right, still tied to its anchor by the string. Add a check to `block.spec.ts`: at 1440 by
   900 the landing shows at least two pinned tags before the raise, on the Still and again once
   the Player has loaded.
4. **When 3D cannot start, say how to turn it on.** A real visitor hit this in Chrome with
   graphics acceleration switched off: no WebGL at all. The caption line now reads "This browser
   cannot show the 3D view (WebGL 2 is not available). The sheet is shown flat." Replace it with
   two short sentences in plain words, no jargon: what they are seeing ("You are seeing the flat
   sheet.") and one way forward ("To see it in 3D, turn on graphics acceleration in your browser's
   settings and reload."). Keep the block's name in the caption as well; the notice must not
   replace it. Same wording on the place page's fallback. The message for a Player that timed out
   or failed stays different ("The 3D view did not start. You are seeing the flat sheet.") with a
   "Try again" control that reloads.
5. **The flat sheet is the whole product for that visitor, so it gets the same care.** Look at
   `block-flat-landing-1440.png` and `block-flat-raised-1440.png`:
   - The landing shows today's outlines running off the sheet into the dark; clip them (session
     044 said this was done; check it at 1440).
   - After the raise, the named finds must stand out from the 160 small outlines: a find's
     outline is filled with `--parchment` at about 35 percent with a 2 px `--ink` edge, the
     selected one in `--lantern`; draft-by-rule outlines stay thin.
   - The sheet is centred in the space left of the card, with a paper edge and a soft shadow on
     the `--soot` table, so it reads as the same page as the 3D view.
   - The raise draws the outlines on over about 1.5 s, named finds last, then the first card
     opens. Reduced motion cuts.
6. **`/place` (address search) still wears the old landing's layout.** Give it the new brand: a
   parchment card on the `--soot` table with the heading "Look up an address", the field, the
   three example addresses as plain links, and a link back to the block. No dusk gradient.

## Test

Unit tests for what you touch while you work. At the end, once: `npm --prefix web test`,
`npm --prefix web run typecheck`, `npm --prefix web run build`, `playwright.block.config.ts`,
`playwright.blockflat.config.ts`, the hosting spec, and `e2e/look.spec.ts`. Look at the final
screenshots and list in your notes what still looks wrong to you.

## Notes file

`docs/kiro-sessions/048-notes.md`.
