# Session 044: Block page punch list (builder, web lane)

Agent: `builder`. You are in the web worktree (`lane/web`). The Block page was run against the
real Unity Player for the first time (6 of 7 tests in `playwright.block.config.ts` pass). This is
the list of what looking at it showed.

A Unity build is in `web/public/unity/` in this worktree now, so you can and should run
`cd web && npm run build && npx playwright test -c playwright.block.config.ts` yourself. It takes
about two minutes. Look at the screenshots it writes to `web/e2e/output/` after each change.

## Read first, and only these

- `docs/kiro-sessions/042-notes.md`, `docs/kiro-sessions/040-notes.md`.
- `.kiro/steering/design.md` (loaded for you): "The raised scene and the card", Controls.
- `.kiro/specs/06-first-visit/requirements.md`: requirements 1, 2, 6, 11.
- `web/src/block/`, `web/e2e/block.spec.ts`, `web/e2e/block-phone.spec.ts`,
  `web/e2e/block-flat.spec.ts`.

Do not edit `unity/`, `pipeline/`, `data/schema/` or generated files.

## The list

Commit each item on its own with `git commit -m "<message>" -- <paths>`. No Co-Authored-By line.

1. **The landing is an empty dark page.** In `block-landing-1440.png` neither the Still nor the
   Player is visible: only the headline and the button on a dark field. The Still
   (`web/public/still/block-wide.jpg`) must be on screen at first paint and must stay until the
   Player has loaded the held scene and drawn it, not merely drawn a first frame. Find out which
   of the two it is (the Still never shown, or faded too early) and fix it. Add to
   `block.spec.ts`: at first paint the Still image is visible with a natural width above zero; and
   the Still is not faded before the Player reports the held era loaded.
2. **The card's crop is blank in the screenshot.** The `img` is `loading="lazy"`. Load it eagerly,
   and have the specs wait for it to be complete with a natural width above zero before the
   screenshot.
3. **The failing test:** "the Lantern: the L key and the control toggle the ring, Escape turns it
   off" stays in phase `waiting`. Fix the cause. Check what the Player accepts for the lens at a
   plan stop (040 notes) and send that.
4. **The era ruler sits in a heavy dark box.** Remove the box. The ruler sits directly on the
   scene; give the bottom of the scene a soft `--soot` gradient so the labels stay legible. The
   Lantern and List controls keep their outline but lose the filled slab look: hairline rule,
   transparent fill, parchment text.
5. **Phone, after the raise** (`block-phone-raised.png`): a dark empty band sits between the tag
   row and the scene, and the Lantern, List, ruler and caption stack eats a third of the screen.
   The scene fills from the tag row down to the sheet. Lantern, List and the ruler share one
   line over the scene's lower edge. The caption shrinks to the one link "Look up an address"
   on a phone.
6. **Flat sheet (no WebGL):** tone the big tile toward `--parchment` with a CSS blend so it is not
   a white rectangle (the card's crop stays untouched); clip today's outlines to the sheet; move
   the line "This browser cannot show the 3D view..." into the caption bar at the bottom, not a
   banner over the tags.
7. **Pinned tags** must never cover the selected find or the leader line's start. Add that to
   `tagLayout`'s keep-outs with a test.

## Test

After each item: the relevant unit tests. At the end, once: `npm --prefix web test`,
`npm --prefix web run typecheck`, `npm --prefix web run build`, then the three Block configs
(`playwright.block.config.ts`, `playwright.blockflat.config.ts`) and the hosting spec. Look at the
final screenshots and say in your notes what still looks wrong to you.

## Notes file

`docs/kiro-sessions/044-notes.md`.
