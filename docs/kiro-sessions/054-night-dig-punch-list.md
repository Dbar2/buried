# Session 054: night dig punch list (builder)

Agent: `builder`. The night dig is live and it is a big step up. The maintainer reran the tests
(1,220 unit, 33 browser) and walked the live site. This is what that showed. Open
`web/e2e/output/night-*.png` and the three concept pictures
(`docs/brand/concept-o-night-landing.jpg`, `-p-night-dig.jpg`, `-q-night-result.jpg`) first.

## Read first, and only these

- `docs/kiro-sessions/053-notes.md`.
- `web/src/lotcheck/` (the files each item names), `web/src/styles/lotcheck.css`,
  `web/e2e/night.spec.ts`, `web/e2e/lotcheck.spec.ts`.

Do not touch `unity/`, `pipeline/`, `data/` or the hooks. Commit each numbered item on its own
with `git commit -m "<message>" -- <paths>`. No Co-Authored-By line.

## The list

1. **A real bug: pressing Enter skips the dig.** On the live site: focus the field, type "2a p",
   arrow down to the suggestion, press Enter. The result is on screen at once; the dig never
   shows. The same Enter that chooses the address is being taken as "skip". Typing an address and
   pressing Enter is the most common way anyone will use this page, so the build-up is missing
   for most visitors. Fix it: the key press that starts a dig can never skip it, and skip keys
   count only from a fresh key press at least 600 ms after the dig begins. Add browser tests that
   would have caught it: choose by keyboard (suggestion plus Enter, and typed address plus Enter
   on the form) and assert the dig overlay is visible 1.5 s later and the result arrives after it.
2. **The scan sits on the paper as a white box**, on the landing and in the compare view. Lay it
   on the paper: `mix-blend-mode: multiply` over the paper art (and over parchment in the compare
   view), so white becomes paper and the ink lines stay ink. The pixels of the scan are not
   changed. Change the caption under the compare view to "The plan is the scan as digitized, laid
   on paper." The lettering crops in "What the plans show" stay as they are, on white.
3. **Landing atmosphere.** The skyline is almost invisible: bring it to about half strength. There
   is no visible fog: add two slow drifting layers low on the page (soft, `--haze`, 40 to 60 s
   loops, opposite directions). Give the lantern a soft pool of light on the paper under it. Lot
   outlines on the map: 2 px, and the hovered one clearly brighter than the rest.
4. **The dig needs more light and a bigger lantern.** The lantern is small and the earth barely
   lit. Lantern about 1.5 times its size; the lit area about 45 percent of the window's shorter
   side, bright enough that the stones and bricks near it read clearly, falling to near black at
   the edges. At the start the skyline and the ground line must be on screen for the first
   0.8 s, so it reads as going down from the street. Add a slight sway to the rope and lantern.
   At the bottom, before the reveal: a 2 px downward jolt and a quick dimming, like a spade
   hitting something. All of it off under reduced motion.
5. **The result.** The stamp is faint and small: about 1.35 times the size, a thicker double
   border, ink at 0.85 opacity or more, so it reads as a stamp at a glance. The sentence under
   the inscription is body size, not display size. Tighten the inscription's padding so that at
   1440 by 900 at least the top third of the compare map is on screen without scrolling.
6. **Titles.** Page title for `/`: "Buried: what is buried under your address?". Description:
   "Type an address and dig down through old fire-insurance plans to see what stood on that
   land. A lot check for one block of Toronto, built with Kiro." Update the social card text if
   it carries the old line.
7. **The test hook** `window.__buriedDigHold` must do nothing for a real visitor: honour it only
   when `navigator.webdriver` is true.
8. **Phone.** Run the phone screenshots after the changes and fix anything that overflows or
   overlaps: the suggestion list, the slips in the dig, the stamp over the inscription.

## At the end, once

`npm --prefix web test`, `npm --prefix web run typecheck`, `npm --prefix web run build`,
`playwright.lotcheck.config.ts`, the hosting spec. Look at the final screenshots.

## Notes file

`docs/kiro-sessions/054-notes.md`: what changed, and what still looks wrong to you.
