# Session 037: the first visit, redesigned (architect)

Agent: `architect`. You write steering, one new short spec, and `docs/brand/README.md`. You write no
code and run no commands.

## Why

The maintainer opened the live site and said: the journey is unclear, there is nothing fun or on
brand, and it looks like a generic dark dashboard. He is right. A stranger lands on a search field
with three bare addresses and has no reason to type anything. The place page is a grey scene beside
a wall of cautious text. The Studio link is a dead page on the live site.

An outside review (`docs/research/gpt-what-it-takes-to-win-2026-11-13.md`, read it whole, it is
short) looked at the rules and last year's winners and reached the same conclusion: winners have one
concrete verb, a visible transformation, and a clear person it is for. Ours has a form.

The 1911 plate itself has what the site is missing. The surveyors lettered real places on this
block: a "Glove & Overall Factory" (Hamilton Carhartt Mfr. Ltd.), a Bank of Nova Scotia at Queen and
River, a machine shop (Wm. R. Perrin & Co. Limited), a cork factory, a coal and wood yard
(J. W. Corson & Co. on the 1911 plan; Northern Fuels Co. on the 1935 plan), lumber piles, a mission
hall. None of this is on the site.

## The decision (already made; write it down, do not reopen it)

**The unit is now a find, not an address.** A find is one named thing the plans letter on this
block: a building or a yard, with the lettering crop that names it. The visitor's verb is
**"Raise the past"**.

The journey, in five beats:

1. **Land.** The block is on screen at once: the 1911 sheet lying like paper on a dark table, lit
   warm from the upper left as if by a lamp, today's buildings standing on it as soot blocks, a
   little ground fog. Headline "Something used to stand here." One lantern-coloured button,
   "Raise the past". One line under it: "Every ghost comes with the map that proves it." Three
   paper tags are pinned to the map: "Overall factory", "Bank", "Coal yard". No search field, no
   nav beyond the wordmark and "Sources". A still picture of the real scene shows instantly, and
   the Player loads behind it; the button never waits on a spinner with no end.
2. **Raise.** Today's blocks sink to low plinths, the sheet brightens, and the buildings drawn on
   the 1911 plan stand up as ghosts, staggered, in about two seconds. The camera stays anchored.
3. **First find.** The overall factory selects itself: its edges turn lantern, a thin leader line
   runs to a catalogue card docked at the right edge. The card says, in order: "LETTERED ON THE
   1911 PLAN", the name as lettered, the crop of the lettering, "Seen on: 1911 plan, sheet 229",
   "Placed within about N m", "Status: ...", and "Show the original sheet". On a phone the card is
   a bottom sheet.
4. **Look around.** Find tags along the top switch finds. Any ghost can be clicked. An era ruler
   at the bottom has three stops: Today, 1935, 1911 (1947 is dropped from the ruler until imagery
   is loaded). On a find, moving the ruler says what the other plan letters there ("On the 1935
   plan this yard is lettered Northern Fuels Co."). The Lantern is a round lens the visitor drags
   with a pointer or a finger: the other layer shows inside it.
5. **Keep it.** "Share this find" copies a link that opens straight on that find, raised. "Full
   record" opens the existing report for that lot. "Look up an address" is a small link, and the
   place page it leads to still works.

What gets demoted or cut from the first visit: the search-first landing, the long report beside the
scene (it becomes "Full record"), the Studio link in the header (the Studio stays at `/studio` and
is linked from Sources as "The workshop (runs on a maintainer's machine)"), the 1947 stop, the
"List the features" button as a primary control (it stays as the accessible list, reached from a
small "List" control), and the opening disclaimer line (it stays, word for word, in the record, the
report and the print).

**Who it is for** on first contact: curious residents and local-history teachers. The past-land-use
screening value stays, inside "Full record" and the Report.

**Brand: an archival atlas examined by lamplight.**

- Palette: parchment `#E8DCC1`, ink `#23221F`, soot `#121715`, copper `#6D8376`, lantern `#DCA34B`.
  Lantern stays rare: the one primary action, the selected find, focus rings.
- Type: keep Fraunces for headings if you judge it reads as a historical serif at display size,
  otherwise name one self-hosted replacement; a humanist sans for controls; monospace only for
  measurements and sheet numbers. Fonts are self-hosted (no off-origin requests).
- Motifs: survey marks, registration crosses in corners, plate borders, sheet numbers, ink
  hatching, catalogue cards, paper tags on string. Real scans are the main imagery.
- It must not look like a dark dashboard: no card grids, no pill buttons, no gradient fills, no
  sidebar, no glass.
- Motion: ghosts rise with ink edges drawing on; restrained camera; a reduced-motion path that cuts.
- Voice: short, curious, exact. "Raise the past." "Show the original sheet." "Near this lot, within
  7 m." "Draft, not yet reviewed." "No record loaded for this date."
- Halloween without cheese: buildings as apparitions, a lamp, fog, digging. No invented deaths,
  hauntings or dialogue; no skulls, pumpkins or cartoon ghosts.

Concept pictures (generated, direction only, nothing ships): `docs/brand/concept-h-theatre.jpg`
(landing), `concept-f-raised.jpg` (after Raise, with the card), `concept-g-phone.jpg` (phone),
`concept-e-landing.jpg` (calmer landing, not chosen). Look at them if you can read images. The
props in them (a brass lamp, books) are not part of the product: the lamp is light, not a picture
of a lamp. The ghosts in them have windows and chimneys; ours are plain volumes with ink edges and
storey lines, because no source gives us windows.

## Two honesty fixes that ride along

1. The page prints "Confirmed by: Buried maintainers (gate draft, unreviewed)". "Confirmed" beside
   "unreviewed" contradicts itself. Decide the fix in the spec: the evidence record gains a review
   state (reviewed by a named person / draft by rule / draft by hand), and the card prints
   "Status: reviewed by NAME, DATE" or "Status: draft, not yet reviewed". Schema bump to 1.2.0.
2. The core sample's 1935 row says "A building outline read from the 1911 plan". A row for one
   plan must say what that plan shows, or say plainly "first drawn on the 1911 plan; drawn again on
   the 1935 plan".

## Read first

- `.kiro/steering/product.md` and `.kiro/steering/design.md`, whole (312 lines together).
- `docs/research/gpt-what-it-takes-to-win-2026-11-13.md`, whole.
- `docs/brand/README.md`.
- `web/src/styles/tokens.css`, `web/src/App.tsx` (routes).
- `.kiro/specs/03-explorer/requirements.md`: only the headings, to cite requirement numbers you
  supersede. Do not read the other spec files.

## Write

### 1. `.kiro/steering/product.md`

Rewrite "The place page and the three parts" as "The first visit and the find" with the five beats
above, and say where the place page, the Report and the Studio now sit. Update "Who it is for" and
"Scope at submission" (drop 1947 from the first-visit ruler; finds listed; Studio not in the
header). Keep "Past land use is the practical value", "Kiro is part of the product", "Showcase area
and eras" and every honesty rule. Add one honesty rule: a find's name is the plate's lettering,
quoted as lettered, with the crop; Buried never names a business the plate does not letter. Keep
the file under 170 lines.

### 2. `.kiro/steering/design.md`

Rewrite Identity, Palette tokens, Type, Motion, Place page layout (becomes "The raised scene and
the card"), Controls, and "How the Unity scene looks" for the brand above. Give every token a name
and a hex value, and say what each old token (`--night`, `--fog`, `--present`, `--ink`, `--lantern`,
`--water`, `--text`, `--muted`) becomes, so a builder can change `tokens.css` mechanically. Give
contrast pairs that must pass WCAG AA. Keep Confidence encoding, Accessibility and "The Report
takes the costume off". Say plainly what the brand is not (the dashboard list above). Keep the
file under 200 lines.

### 3. New spec `.kiro/specs/06-first-visit/` (requirements.md, design.md, tasks.md)

Short: 350 lines across the three files, no more. EARS requirements for the five beats, the two
honesty fixes, the phone layout, reduced motion, no-WebGL fallback (the flat sheet with outlines
and the same tags and card), and load behaviour (still picture first; the button usable within 2
seconds of first paint; if the Player is not ready when pressed, the button says "Lighting the
lamp" and the raise plays when it is).

Design must settle:

- **The finds file.** `data/finds.json`, a contract file validated by `buried validate`: for each
  find an id, a slug, a kind (`building` or `area`), an order, a short tag ("Overall factory"), and
  per source the name as lettered, the evidence feature id, and the lettering crop in plate
  pixels. Cross-file rules: every feature id exists; every crop lies inside its plate; a find with
  no lettering crop is an error.
- **Tags and the leader line.** HTML over the canvas, placed from screen positions the Player
  reports (one new bridge message carrying anchor positions for the finds, sent when the camera
  moves). Say what happens when an anchor is off screen.
- **Raise.** One bridge message from the Shell; the Player owns the animation and reports when it
  ends. Stagger order: nearest the first find first.
- **The card.** One component for a find and for an unnamed ghost. An unnamed ghost's title is
  what the record supports ("Two-storey building" when storeys are read, otherwise "Building on
  the 1911 plan").
- **Share.** `/find/<slug>` opens raised on that find; the page title and description name it.
- **Routes.** `/` is the block. `/place?lot=` and `/report` keep working. Old `/?era=` links still
  resolve.
- **Properties** (mark `[PBT]`): every find resolves to a feature and a crop inside the plate;
  tag positions never overlap the card; the card never prints "Confirmed" for a draft; a row for
  plan X never names plan Y as its source without the words "first drawn on".

Tasks, numbered and split into three groups that can be built at the same time without touching
the same files:

- **W (web):** tokens and fonts; landing with still picture and the button; find tags and leader
  line; the card and phone bottom sheet; era ruler; draggable Lantern lens with touch; share link
  and `/find/<slug>`; header cleanup; the two honesty fixes in text; no-WebGL fallback; browser
  tests.
- **U (Unity and the bridge schema):** table and lamp light, parchment sheet, soot blocks and
  plinths, ghost material (parchment white, ink edges, storey lines, copper tint), fog, the raise
  animation, selection glow, anchor positions message, a headless method that renders the still
  picture used by the landing. Only this group edits `data/schema/bridge.schema.json`.
- **P (pipeline and data contract):** `finds` schema and validation, the review-state field in the
  evidence schema (1.2.0) with a migration of the existing files (the bank: draft by hand; the 162:
  draft by rule), MCP `find_places` returning finds.

Each task names its files and its requirement numbers. Mark which tasks the demo video needs.

### 4. `.kiro/specs/03-explorer/requirements.md`

Add one short note at the top naming the requirement numbers spec 06 supersedes. Change nothing
else in spec 03.

### 5. `docs/brand/README.md`

Add the four new concept files to the table with what each settles, and one line saying concepts
a to d are superseded for the landing and the place page layout.

## Do not

- Do not touch `.kiro/steering/tech.md`, `structure.md`, `sources.md`, `evidence.md` or any hook.
  Another session is editing `tech.md` right now.
- Do not weaken or remove any honesty rule.
- Do not write code or tests.
- Do not grow any file past the limits above.

## Report

End with a list of the files you wrote, their line counts, and any decision you had to make that
this brief did not make for you.
