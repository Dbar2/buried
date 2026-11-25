# Session 053: the night dig (builder)

Agent: `builder`. Theme, build-up and suggestions for the lot check. This is the pass that makes a
judge smile, so look at your own work as you go.

## Why

The maintainer clicked through the live lot check. It works, and it is plain. His words: "make
the UI better, more Halloween-like, add animations, cool fun stuff"; "make sure the addresses,
like if people don't know, we have suggestions"; "make sure it's slow, there's a build up, don't
make everything instant ... waiting for something is where we have the opportunity to do cool
stuff." This is a Halloween hackathon, the product is called Buried, and the lookup currently
answers in a blink with no theatre at all.

## The idea: a night dig

You come to a dark field at night with a lantern and a map. You name an address (or pick one from
the list, or click a glowing lot on the map). The lantern is lowered down through the layers of
earth, year by year, and at each plan's depth a paper slip shows what that plan letters there.
At the bottom the record is unearthed: a sheet of paper lit by the lantern, "HERE STOOD / Coal &
Wood Yard", and a rubber stamp comes down on it.

Target pictures. Open them first and keep them beside you:

- `docs/brand/concept-o-night-landing.jpg`
- `docs/brand/concept-p-night-dig.jpg`
- `docs/brand/concept-q-night-result.jpg`

They are generated direction. The real plan scans, the real lettering crops and the real compare
view go where the pictures show them.

## Art you are given (already in the repo; do not regenerate or edit the files)

All under `web/public/lotcheck/art/`, WebP. `art.json` there lists each file's pixel size.

| File | What | How to use |
|---|---|---|
| `strata.webp` | A tall engraved cross-section of the ground: sky, fence and tree at the top, then roots, stones, brick rubble with a bottle and a pipe, a coal-black band, clay, bedrock. Dark background. | The backdrop of the dig sequence, panned downward. |
| `lantern.webp` | An engraved brass oil lantern with a lit flame, transparent background. | Landing (standing at the map's corner), the dig (lowered on a rope), the result (beside the sheet). |
| `paper.webp` | A blank aged parchment sheet with torn edges, transparent outside the sheet. | The background of the map on the landing and of the record sheet on the result (stretched to the box with `background-size: 100% 100%`; keep content inside about 6 percent padding). |
| `skyline.webp` | A wide strip: night horizon with houses, bare trees, a moon. Transparent background. | Along the top of the landing and above the ground line in the dig. |
| `spade.webp` | An engraved spade, transparent background. | Small: beside the "Dig" button's label is too small for it; use it standing in the ground at the page edge on the landing and for the "not covered" page. |

Credit them on the Sources page under a heading "Illustrations": "The lantern, the earth
cross-section, the paper, the skyline and the spade are illustrations made with an image model.
They are decoration, not evidence."

## Read first, and only these

- The three concept pictures above.
- `docs/kiro-sessions/051-notes.md`, `052-notes.md`.
- `web/src/lotcheck/` (all of it), `web/src/styles/lotcheck.css`, `web/src/styles/tokens.css`,
  `web/src/report/search.ts`, `web/e2e/lotcheck.spec.ts`, `web/src/sources/SourcesPage.tsx`.
- `.kiro/steering/design.md` "The lot check pages" and Motion; `.kiro/steering/product.md`
  "The lot check"; `.kiro/specs/08-lot-check/requirements.md`.

Do not touch `unity/`, `pipeline/`, `data/` or the hooks.

## Build

Commit each numbered item on its own with `git commit -m "<message>" -- <paths>`. No
Co-Authored-By line. Start with item 0.

### 0. Write it down first (short)

- `.kiro/steering/design.md`: replace "The lot check pages" with the night dig: the page is night
  (`--soot`, with `--haze` fog), text on it is `--parchment`, and the record is a parchment sheet
  with `--ink` text lying in the dark. Motion: what moves, how long, and the reduced-motion rule.
  One new colour token, `--stamp` (rust red, about `#8E3B2E`, used only for the rubber stamp on
  parchment), with its contrast pair. The Halloween rule stays: night, fog, lantern, earth,
  spade, grave-marker lettering; no skulls, pumpkins, cartoon ghosts, blood or bats; nothing
  invented about a place.
- `.kiro/steering/product.md` "The lot check": add the dig sequence and one honesty rule: the dig
  is presentation. It shows nothing the result does not show, it never pretends to compute, and
  the How page says so in one line ("The dig is an animation. The lookup itself is instant.").
- `.kiro/specs/08-lot-check/`: add requirements 8 (suggestions), 9 (the dig sequence), 10 (the
  reveal) and their properties and tasks, briefly. Keep the three files under 330 lines together.

### 1. Suggestions, so nobody is stuck

- The address field is a proper combobox (ARIA combobox and listbox, arrow keys, Enter, Escape).
- While typing: up to seven matches. Match on the house number and the start of any word of the
  street name, so "2a p", "percy" and "king 52" all work. Addresses on a lot with a lettered use
  come first and carry a small lantern-coloured dot and the note "something recorded".
- On focus with nothing typed: the heading "Try one of these" and the addresses that have
  something recorded (one per lot, at most eight), so a visitor who knows no address still has
  somewhere to go.
- "or dig somewhere at random" under the field: picks a lot with something recorded.
- A typed address that matches nothing: "We have not dug there yet. Try one of these:" and the
  same list.
- Pure module `web/src/lotcheck/suggest.ts` with tests, including a property: every suggestion
  matches the query's tokens, and no unrecorded address is listed above a recorded one.

### 2. The landing at night

As the first concept picture: night page, the skyline along the top, low fog, headline "What is
buried under your address?", one line "Type an address. We dig down through the old plans and
show you what stood there.", the field, the button (now "Dig"), the random link. The map on the
right is the real plan crop on the paper art, lit by the lantern standing at its corner. Lots
with something recorded are outlined faintly in lantern and pulse slowly; hovering or focusing
one brightens it and shows a paper tag with its lettering; clicking it digs there. Caption,
computed: "N lots on this block have something recorded. Click one." Keep the computed fact line
("On this block, six addresses stand on a former coal and wood yard.") and the coverage line.

Entrance, about 1.6 s in all: the lantern flickers alight, its light spreads over the paper, the
lots begin to glow one after another. Then: the flame flickers gently; the fog drifts; a soft
pool of lantern light follows the pointer over the map.

### 3. The dig: the build-up

A full-window overlay that plays when a visitor chooses an address from the landing (field,
suggestion, random or map). A direct visit to `/lot/<id>` does not play it.

- Backdrop: `strata.webp` with the skyline above the ground line. The view pans down as the
  lantern is lowered on a rope down the centre. The earth is dark except in the lantern's light
  (a radial light that travels with it).
- A depth ruler at the left with one mark per layer: "Today", then one per plan that covers the
  lot, newest first, labelled with the plan's plain years. Marks come from the data, not a fixed
  list.
- When the lantern reaches a mark it pauses, and a paper slip appears beside it with what the
  result will show for that layer: the lettering and firm name for a lettered use ("Coal & Wood
  Yard, Northern Fuels Co."), "next door: ..." for a use near the lot, or a muted "nothing
  lettered here". Today's slip is the address. The slips are built from the same view model as
  the result (`buildLotCheck`), never from anything else.
- Caption at the bottom: "Digging down to <oldest plan year>…" and the address. A "Skip" control
  at the lower right; Escape and Enter skip too.
- Timing: about 4.5 s with two plans (0.8 s to break ground, about 1.2 s per layer including its
  pause, 0.8 s at the bottom). If the data is not ready the lantern waits at the ground line with
  "Lighting the lamp…". It never runs longer than 7 s.
- The end: a short dark beat, then the result with its reveal (item 4).
- `prefers-reduced-motion`: no overlay. Go to the result, which appears without motion.
- A pure module `web/src/lotcheck/digTimeline.ts`: from the view model and the motion preference
  to a list of timed steps. Tests, with properties: every slip's text appears in the result's
  view model; total time is within bounds; skip from any step ends at the result; reduced motion
  gives no steps.
- A polite live region says "Digging down through the plans" at the start and the verdict
  sentence at the end. Focus lands on the result's title.

### 4. The reveal: the unearthed record

As the third concept picture.

- Night page. The address as the title, in parchment.
- The record sheet on the paper art, the lantern beside its upper left corner (hidden on a
  phone). At the top of the sheet an inscription block, set like a grave marker (thin ink rule,
  small corner ornaments, centred, Libre Baskerville):
  - "HERE STOOD" / the lettered name / "recorded on the plans of 1911 and 1931-35" for a use on
    the lot;
  - "NEXT DOOR STOOD" / name / "within N m, on the plan of ..." for a use near it;
  - "NOTHING LETTERED HERE" / "on the plans of ..." when the plans cover it and letter no use;
  - "NOT DUG YET" for an address outside coverage, with the spade art and the coverage line.
  The existing verdict sentence stays under it, and the existing rules hold (the tag never
  appears without its lettering; the not-a-clearance line stays with "nothing lettered").
- The verdict tag becomes a rubber stamp: `--stamp` ink, a double border, rotated about minus 6
  degrees, slightly uneven (an SVG turbulence filter on the stamp only). It comes down about
  0.4 s after the sheet settles: scale from 1.5 to 1 with a little overshoot, and the sheet nudges
  1 px. Same text as the tag today.
- The sheet rises into place from below over about 0.6 s. Then the compare view teaches itself:
  the divider sweeps once from the right edge to the middle. On the Today side, the outline of
  each lettered use on the lot is drawn as a faint dashed parchment line that breathes slowly:
  where it stood.
- The rows of "What the plans show" arrive one after another.
- "Dig another address" next to "Share this check", back to the landing with the field focused.
- All of it cuts to its end state under reduced motion.

### 5. Small things that make it feel made

- The "Dig" button: on hover and focus the label nudges down 1 px like a spade going in.
- The header mark (the core-sample circle) glows faintly lantern on the night pages.
- The How page takes the night theme too, with the lantern, and gains the one honesty line about
  the dig.
- Page transitions between landing and result never flash white.
- The one-page record (the printed Report) stays plain paper. Do not theme it.

## Weight and speed

- The landing may now transfer up to 950 KB before the visitor acts (the art is most of it); the
  result up to 700 KB before the tile. Update requirement 1.4 with one line of reason and make the
  tests assert the new figures. Load `strata.webp` after the landing is idle, not before first
  paint. Animate only `transform` and `opacity` (and the stamp's filter once).
- Nothing here needs WebGL, and the pages still must not request `/unity/`.

## Look at it

After items 2, 3 and 4, and at the end, run the lot-check browser spec and open the screenshots.
Add screenshots to the spec: the landing after its entrance, the suggestion list open, the dig
at its second mark (pause the timeline with a test hook, not a sleep), the result after the stamp,
each at 1440 by 900 and 390 by 844, saved as `web/e2e/output/night-*.png`. Compare with the
concept pictures and fix what is off: darkness, where the light falls, type sizes, spacing, the
slips, the stamp. If a piece of art fights the layout, change the layout, not the art.

## Tests, at the end, once

`npm --prefix web test`, `npm --prefix web run typecheck`, `npm --prefix web run build`, the
lot-check spec (with a reduced-motion run: no overlay, same verdict) and the hosting spec.

## Notes file

`docs/kiro-sessions/053-notes.md`: what you built, timings, weights, every departure, and what
still looks wrong to you in the final screenshots.
