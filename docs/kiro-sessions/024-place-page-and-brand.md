# Kiro session 024: the landing, the place page and the brand shell (web lane)

Agent: builder (claude-sonnet-5.5). Checkout: the `lane/web` worktree (you are in it). Lane:
`web/` only (not `web/src/bridge/**`, not the generated bridge files, not `web/src/evidence/`
except adding plain-wording helpers with tests). Do not change the bridge or anything under
`unity/`, `pipeline/` or `data/`; another builder is changing the bridge in a different checkout
and you will adopt its messages next round. `web/public/unity/` holds a working Player build.
Commit with `git commit -m ... -- <paths>` on this branch.

Read only: this brief; `.kiro/steering/product.md` and `design.md` (both changed today: the place
page, search first, the picture core sample, plain words, identity, Studio look, controls);
`docs/brand/concept-a-landing.jpg`, `concept-b-place-page.jpg`, `concept-c-studio.jpg` and
`concept-d-identity.jpg` if you can open images (layout and mood targets; their map content is
invented); `web/src/report/` and `web/src/explorer/` as they are. Do not read the specs.

## State

Evidence now has 100 buildings from the 1911 plate and 63 from the 1931-35 plate (a draft pass,
marked estimated), so real lots have real nearby features. Tiles and sidecars for both plates are
in `data/tiles/` (cropped scans plus `_full.jpg`), present-day layers in `data/present/`.

## Build

1. **Identity.** The core-sample mark as an inline SVG component (a circle holding three or four
   strata lines, thin `ink` strokes), used in the header, as the favicon and as the loading mark.
   Header: mark, wordmark, the current address when there is one, nav (Explorer, Studio, Sources)
   with a `lantern` underline on the active item. Controls per `design.md` "Controls".
2. **Landing (`/`).** The dusk scene full-bleed behind; the wordmark; one field, "What was here?",
   searching the clipped address points; under it three real example addresses chosen from lots
   that have evidence within 15 m (pick them from the data at build time, do not hard-code
   guesses). Choosing one goes to its place page. Nothing else on the page.
3. **Place page (`/place?lot=<id>`).** Left about 58 per cent: the scene, depth gauge on its left
   edge. Right about 42 per cent: the report on the paper theme. Narrow screens stack. The existing
   `/report?lot=` stays as the print and share target and uses the same components.
4. **The picture core sample.** For each era a square crop of this lot (lot bounds plus about
   25 m, lot outlined) cut in the browser from that era's untouched tile using its sidecar
   transform; Today is drawn as a small vector map from the present-day layers; 1947 says "No 1947
   photograph loaded yet". Beside each crop, one plain sentence. Where nothing is reviewed the
   sentence says what the source is and states no finding ("From the 1911 plan. Not yet
   reviewed."). Each crop opens larger on click or Enter, with its attribution.
5. **Plain words.** Sentences say "the 1911 plan" and "the 1931-35 plan". Source ids, plate
   numbers and error figures move to the sources block and to `title` or focus text. Every
   sentence still passes the banned-word and has-a-source checks; add tests for the new templates.
   Estimated features read as "A building outline traced automatically from the 1911 plan sits
   near this lot (within 7 m). Not yet checked by a person." or equivalent, driven by the
   feature's confidence and `confirmed_by` facts, never by guesswork.
6. **Studio restyle** per `design.md` "Studio": dimmed scan, `ink` outlines, the current outline
   thicker with a mono tag, one primary button per panel, active step underlined. No new features.

## Checks

Playwright screenshots to `web/e2e/output/`: `brand-landing.png`, `brand-place-1911.png` (a lot
with a nearby building, dug to 1911), `brand-place-narrow.png` (390 px wide), `brand-studio.png`.
Assert: fonts are self-hosted and the right families; no raw hex outside the tokens file; body
text 4.5:1 on both themes; the core sample shows four bands in order; keyboard reaches search,
gauge, each crop and the PDF action; the landing makes no request off-origin.

Never weaken a test. Narrow tests while iterating, full suites once at the end. Commit per item.
Do not push. Short final report with screenshot paths and anything you could not do without a
bridge change.
