# Session 045 notes: Block page punch list, round two

Branch `lane/web`, builder. Web only: nothing in `unity/`, `pipeline/`, `data/schema/` or a generated file changed.

## What was done

0. **Two browser tests, and the place card.**
   - `studio-landuse`: the first `use_` row was the committed coal yard. The test now takes the row that says "From your workspace" and checks that the committed row does not. `FeatureRow` has a `workspace` flag and the row prints "From your workspace" (list on the place page and on the Block page). A second failure was behind the first: the Player scene check compared the picture with `?areas=0`, which also removes the committed coal yard on the same ground (1.7 per cent of pixels outside the traced ring changed). The "nothing else changes" check now compares with a browser whose workspace is empty (0.00 per cent), and the stripe check keeps its old baseline and threshold (2.7 against 2.5). It passes, including the GPU frame-rate runs.
   - `cardsync` "gauge and core sample": I could not reproduce the failure in three runs. The cause I found is in the test: the column scrolls smoothly to the band, and the test read "in view" once, straight after the announcement, while the animation (slower when the Player is busy) was still running. It now polls until the band is in view and the column has stopped for 150 ms. The product code is unchanged. I did not prove this was the only cause of the full-run failure.
   - Card heading (`cardHeading` in `placeCard.ts`): a feature in a find takes the find's lettered lines (first line is the heading, the rest are the subtitle); any other feature's use is split at its first semicolon, the "(as lettered on the plate)" note is dropped from the heading and the rest is the subtitle. The "Use as lettered" row keeps the recorded string whole. The place page loads `finds.json` for this (`loadFinds`). `cardsync` now expects "Bank of Nova Scotia" with the subtitle "Off. 2nd".
1. **Landing words.** A `--soot` scrim (`.block-scrim`): solid at the left edge, 94 per cent at 38 per cent of the width, gone at 55 per cent; on a phone the same from the top. The small line is `--parchment`. `e2e/support/introContrast.ts` makes the intro's text transparent, screenshots each line where it was and takes the worst pixel against the text colour; the 1440 check passes at 12.4 and 12.7 to 1 (floor 4.5). The phone check failed first at 1.9: a tag string (Bank's) ran through the headline. `layoutTags` now rejects a spot whose string runs through a keep-out, so that tag is hidden on the phone landing (it is still in the top row after the raise).
2. **Markers.** After the raise an unselected find is a 10 px parchment dot with an ink ring, inside a 44 px button. The tag text shows beside it on hover and keyboard focus. `layoutMarkers` hides a marker whose hit area meets the leader line, a keep-out or the viewport, and picks a label side (right, left, above) that stays clear of the leader line. Property tests: no marker or label meets the leader line.
3. **Ruler.** Labels are Source Sans 600 upright, `--parchment`, on a tight `--soot` chip; the current stop is `--lantern` with the underline and larger mark. Ticks kept.
4. **Lantern.** "Lantern" / "Lantern on". The accessible name when on is "Lantern on. Inside the lens: 1911 plan". The hint "Drag the lens to compare." sits in a strip under the button (`rects.lensHint`; the controls moved up 24 px on a wide screen to make room, 16 px free on a phone) until the lens is moved or turned off; then never again in this browser (localStorage).
5. **Scene hint.** "Click any ghost for its record." replaces the block's name in the caption for 5 s or until a pointer, key, wheel or touch event; session storage. It fades in over 300 ms, and not at all under `prefers-reduced-motion`. Browser tests: any input ends it, five seconds ends it, a reload does not bring it back, reduced motion has `animation-name: none`.
6. **Card actions.** "Show the original sheet" is the one outlined button (a double rule when on). "Share this find" and "Full record" are text links on one line; "Show on the map", when offered, joins them. After a copy the link reads "Link copied" for two seconds (the hidden live region still says "Link copied.").
7. **Title and social text for `/`.** "Buried: something used to stand here" and "Raise the past over one Toronto block, then click any ghost to see the fire insurance plan that shows it and the lettering it was read from." `index.html` carries both (and the Open Graph copies), because a crawler reads the static file for every route; `/place` still sets its own in the browser. `e2e/hosting.spec.ts` and `pageTitle.test.ts` updated.

## Tests

- `npm --prefix web test`: 116 files, 1052 passed, 1 todo.
- `npm --prefix web run typecheck` and `npm --prefix web run build`: clean.
- `playwright.block.config.ts`: 13 of 13. `playwright.blockflat.config.ts`: 5 of 5 (the 390 px test crashed the browser once, after the 1440 px test, with "GPU process exited" in the log; it passes alone).
- `playwright.hosting.config.ts` (hosting, cardsync, polish, report): 17 of 17. `npm run test:e2e:landuse`: passes.

## Decisions to check

- Items 3 to 6 and the tag-string change are in one commit (`d3b7790`), not one each: they share `block.css`, `BlockStage.tsx` and the tests, and I cannot stage hunks without the interactive mode.
- The Block page's controls sit 24 px higher on a wide screen to leave room for the Lantern hint. That is a permanent change to the layout, not only while the hint shows.
- `useSeenOnce` takes an optional `'session'` store. The Lantern hint uses localStorage, the scene hint sessionStorage.
- The static `index.html` title is now the Block page's, so a link preview of `/place` or `/report` shows it too (as before, it showed the old generic card).
- A tag string that would run through a keep-out hides the tag. On the phone landing that hides the Bank tag.
- The scrim goes with the intro when the raise starts (it is not faded).

## What still looks wrong to me

- On a phone landing only "Mission hall" shows as a pinned tag, at the bottom edge over the sheet; the others are hidden. The landing still gives little hint that the tags exist.
- After the raise only two or three markers show at 1440: the others are under the card or the top row, or would meet the leader line. The top row names them all.
- With the mouse resting on a marker (as after pressing "Raise the past", whose button sits where the Cork factory marker lands) its label shows in `block-raised-1440.png`.
- The Lantern strip pushes the Lantern and List buttons above the ruler's label row; on the 1440 screenshots they line up with the ruler marks, not its labels.
- The ruler's `--lantern` current stop adds a second warm accent in the lower band next to the selected find's lantern edges. It was asked for; design.md keeps `--lantern` rare.

## Commands

No new command. New support files: `e2e/support/contrast.ts` (with a unit test) and `e2e/support/introContrast.ts`.
