# Session 045: Block page punch list, round two (builder, web lane)

Agent: `builder`. You are in the web worktree (`lane/web`). A Unity build is in
`web/public/unity/`; run `cd web && npm run build && npx playwright test -c
playwright.block.config.ts` yourself and look at the screenshots in `web/e2e/output/` after each
change.

## Read first, and only these

- `docs/kiro-sessions/044-notes.md`.
- `.kiro/steering/design.md` (loaded for you): "The raised scene and the card", Controls, Motion.
- `web/src/block/`, `web/e2e/block.spec.ts`, `web/e2e/block-phone.spec.ts`.

Do not edit `unity/`, `pipeline/`, `data/schema/` or generated files.

## The list

Commit each item on its own with `git commit -m "<message>" -- <paths>`. No Co-Authored-By line.

0. **Two browser tests fail on the merged build. Fix these first.**
   - `e2e/studio-landuse.spec.ts` "trace a land-use area, publish it, and read it on the place
     page" (run with `npm run test:e2e:landuse` from `web/`): it clicks the first `use_` row in
     the list, which is now the committed coal yard (`use_fip_v3_1911_229_0001`, heading "Coal &
     Wood Yard; J. W. Corson & Co. (as lettered on the plate)"), not the area the test just
     traced. Make the test pick the workspace area it published. Then check the real question
     behind it: when a workspace area and a committed area are both in the list, can a person
     tell them apart? The workspace one must say "From your workspace" in the row itself.
   - `e2e/cardsync.spec.ts` "the gauge and the core sample follow each other, in both
     directions": "the 1911 band is in view" is false. It failed in the full run and reportedly
     passes alone. Find out whether it is a real scroll race or load, and make it deterministic
     without weakening what it checks.
   - While you are on the place card: a committed feature's heading prints the raw `use` string
     with "(as lettered on the plate)" in it. When the feature belongs to a find, the heading is
     the find's first lettered line and the second line is its subtitle. Otherwise split the
     string at the semicolon and drop the bracketed note from the heading (the card already says
     where the name comes from).
1. **The landing's words are hard to read.** In `block-landing-1440.png` the headline runs over
   the sheet's top edge and the line "Every ghost comes with the map that proves it." disappears
   into the buildings. Put a `--soot` scrim behind the intro: solid at the left edge, gone by
   about 55 percent of the width, full height. The small line is `--parchment` at full strength.
   On a phone the scrim comes from the top instead. The headline, button and line must pass the
   contrast floors in design.md against what is actually behind them; add a browser check that
   samples the pixels behind the small line and fails under 4.5:1.
2. **Pinned tags after the raise crowd the scene.** After the raise the top row already names
   every find. So after the raise, a find that is not selected shows on the scene as a small
   marker only: a 10 px parchment dot with an ink ring at its anchor, with the tag text appearing
   beside it on hover and on keyboard focus, and the whole marker is a button that selects the
   find. Before the raise the paper tags on strings stay as they are. Nothing may cross the
   selected find's leader line.
3. **Ruler labels are thin over the bright plan.** "Today" and "1935" need to read at a glance:
   upright Source Sans at 600 weight in `--parchment` with a tight `--soot` backing chip, the
   current stop in `--lantern`. Keep the scale-bar ticks.
4. **The Lantern button's label** reads "Lantern: 1911 plan" or "Lantern: today" depending on the
   state, which reads like a setting, not an invitation. Label: "Lantern" when off, "Lantern on"
   when on, with a short hint on first use only, under the button: "Drag the lens to compare."
5. **First-use hint for the scene.** Once, after the first raise ends, for five seconds or until
   any input: "Click any ghost for its record." in the caption bar. `prefers-reduced-motion`
   shows it without a fade. Never shown again in the same browser (session storage is enough).
6. **The card's actions** are three text links in a column. Make "Show the original sheet" the
   one outlined button, and "Share this find" and "Full record" text links on one line under it.
   After "Share this find" copies, the link text reads "Link copied" for two seconds.
7. **Page title and social text for `/`**: "Buried: something used to stand here" and a
   description that says what a visitor does in one sentence. Update the hosting spec.

## Test

Unit tests for what you touch while you work. At the end, once: `npm --prefix web test`,
`npm --prefix web run typecheck`, `npm --prefix web run build`, `playwright.block.config.ts`,
`playwright.blockflat.config.ts`, and the hosting spec. Look at the final screenshots and list in
your notes what still looks wrong to you.

## Notes file

`docs/kiro-sessions/045-notes.md`.
