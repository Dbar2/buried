# Session 051: build the lot check (builder)

Agent: `builder`. Spec 08, all eleven tasks, in order. One session; keep it tight.

## Read first, and only these

- `.kiro/specs/08-lot-check/requirements.md`, `design.md`, `tasks.md` (230 lines together).
- `.kiro/steering/design.md` (loaded for you): Identity, the token table, "The lot check pages",
  "What it must not look like".
- The files spec 08's design names as reused, and only the parts you call: `web/src/report/
  buildReport.ts` (the `Report` type), `web/src/report/coreSample.ts` (the band fields),
  `web/src/report/search.ts`, `web/src/report/ReportRoute.tsx`, `web/src/block/sheetTransform.ts`,
  `web/src/block/FlatSheet.tsx`, `web/src/place/placeLink.ts`, `web/src/App.tsx`,
  `web/src/shell/Header.tsx`, `web/src/styles/tokens.css`.
- `docs/brand/concept-l-lotcheck-landing.jpg`, `concept-m-lotcheck-result.jpg`,
  `concept-n-lotcheck-phone.jpg`, if you can read images. They are the layout target. The
  architect could not see them, so where the spec's layout words and the pictures differ, the
  pictures win. Text and rules come from the spec.

Do not read other specs. Do not touch `unity/`, `pipeline/`, `data/` or `.kiro/hooks/`.

## Facts from the maintainer (checked on the committed data, Nov 25)

- Three more uses were traced by hand from the plans this morning, as drafts: on the 1911 plan
  "Lumber Piles; R. Laidlaw & Co. Ltd." (an area); on the 1931-35 plan "Department of Street
  Cleaning, Eastern Division, City of Toronto" (an area) and "Knitting Mill; Joseph Simpson &
  Sons" (a building). `buried validate` passes with 178 features; the web unit tests pass (1,092).
- Address points inside lettered features today, before any shrinking: the coal and wood yard
  holds 2A, 2B, 2C and 2D Percy St, 37 Sumach St and 549 King St E. The lumber yard and the
  street-cleaning yard hold 30 and 38 St Lawrence St. The machine shop holds 522, 524 and 526
  King St E; the cork factory 489 Queen St E and 73 Sumach St; the overall factory 535 Queen St
  E; the knitting mill 52 St Lawrence St. Seventeen addresses in all.
- Lot ids: 2A Percy St is lot `5451729`; 524 King St E is `5448428`; 535 Queen St E is `5447060`.
- `web/node_modules` is installed. `data/raw`, `data/work`, `unity/Library` and
  `web/public/unity` are symlinks to an external disk; leave them alone.

## Decisions already made (do not stop to ask)

1. **The industrial list.** "street cleaning" is not on the list and stays off: a City works
   yard is a past use worth showing, but the tag "Past industrial use recorded" must not fire on
   it. So the Result needs to show every lettered use on or next to the lot in "What the plans
   show", tagged or not. A lot with a lettered use that matches no entry gets the tag "A past use
   is lettered on these plans" (a fifth tag; add it to the spec's requirement 4 and to P1 and P6
   as a spec edit in the same commit as the code). The lumber yard and the knitting mill already
   match "lumber" and "mill". Add no entry to the list; put proposals in your report.
2. **Tile weight.** The 1911 tile is 2.2 MB and the 1931-35 tile 1.4 MB. Load the full tile on
   the Result for now, lazily, after the text has painted. Report the numbers.
3. **The block link.** The Unity Player is about 81 MB at the moment because the parked walk
   model is in it. Treat it as over the limit: do not show "See this block in 3D". Keep the
   `/block` and `/find/<slug>` routes working (shared links must not break). The maintainer will
   rebuild the Player without the walk model and turn the link back on.
4. **Print.** "Download the one-page record" opens the existing Report for the lot and calls the
   browser's print dialog (`/report?lot=<id>&print=1`).
5. **Dig line.** Ontario Dig Authority, as steering says.
6. **The landing count** is computed as the spec says (areas shrunk by their own position
   error). Whatever number comes out is what the page prints. Report it and which addresses fall
   out; do not adjust the rule.

## How to work

- Pure modules and their tests first (tasks 1 to 4), then routes, then the pages.
- Look at your own pages: after task 7 and again at the end, run the lot-check browser spec and
  open the screenshots it writes. Compare them with the three concept pictures and fix what is
  off: spacing, type sizes, the divider handle, the lot outline, the lettering crops. This page is
  what a judge sees for about thirty seconds, so the look matters as much as the logic.
- Commit each task on its own with `git commit -m "<message>" -- <paths>`. No Co-Authored-By line.
- Narrow test runs while you work. At the end, once: `npm --prefix web test`,
  `npm --prefix web run typecheck`, `npm --prefix web run build`, the lot-check spec, the hosting
  spec. Do not run the Unity-backed specs.

## Notes file

`docs/kiro-sessions/051-notes.md`: what you built, the landing count and addresses, load sizes,
proposals for the industrial list, every departure from the spec, and what still looks wrong to
you in the final screenshots.
