# Design: 08 Lot check

All in `web/src/`; nothing in `pipeline/`, `data/` or `unity/` changes.

| File | Role |
|---|---|
| `evidence/industrialUse.ts` | The Industrial list and `industrialMatch(text)` |
| `lotcheck/lotCheck.ts`, `copy.ts` | `buildLotCheck` (pure view model); fixed texts |
| `lotcheck/landing.ts` | `landingFact`, `pickExamples`, `normaliseLettering` (pure) |
| `lotcheck/compare.ts` | `compareModel`: viewBox and paths (pure) |
| `lotcheck/*Page.tsx`, `CompareView.tsx` | Layout only |
| `place/placeLink.ts` | `Route` gains `landing`, `lot`, `how`; `lotLink(id)` |

Reused as is: `buildReport`, `lettering()`, `checkSentence`, the sentence builder, `statusSentences`,
the sheet transform functions, the address search and `ReportRoute`'s data loading.
## Routes

`routeFor`: `/` with no query and `/place` without `lot` give `landing`; `/lot/<id>` and
`/place?lot=` give `lot`; `/how` gives `how`; `/block` and `/find/<slug>` give `block` (decision:
shared `/find/` links keep working); `/` with a query stays `explorer`. `/walk` leaves `Route`,
`routeFor` and `App.tsx`; its files stay, unimported. The three new pages are lazy and import none of
`explorer/`, `bridge/` or `walk/`.

## The Industrial list

`INDUSTRIAL_ENTRIES`, readonly, lowercase, sorted, unique: `auto`, `coal`, `cork`, `dye`, `factory`,
`foundry`, `garage`, `gas`, `laundry`, `lumber`, `machine shop`, `mill`, `oil`, `paint`, `storage of
fuel`, `tannery`, `wood yard`, `works`. The header says "Reviewed by: not yet" until the maintainer
fills it. The builder adds no entry; it lists proposals in its report. `industrialMatch(text)`
lowercases, turns runs of non-letters into one space, and returns the first entry found at word
boundaries, or `null`. Plurals match only if listed. It reads use strings only, never street names.

## `buildLotCheck(report, collections)`

Returns `not_covered`, `failed` or `check` with `lotId`, `title`, `verdict` (`tag`, `triggers`,
`sentence`, `notClearance`), `rows`, `cannotTell`, `dig`, `provenance`, `compare.planSourceIds` and
`links`. A trigger is `{ featureId, sourceId, lettering, matched, relation, positionErrorM, cropRef }`.

Departure from the brief, which says one function from the `Report` plus the address points: the
`Report` holds sentences, not raw lettering, so the function also takes the evidence collections and
reads `attributes.use` by `featureId`. Address points are only needed by `landing.ts`; the title
comes from `Report.place`.

Order: `not_reconstructed` gives `not_covered`. For each feature id cited by `groups[1]`, read its
use, run `industrialMatch(lettering(use))`, keep matches with the finding's relation; "on" wins over
"near". No match gives 4.4 if a plan row is `reviewed`, else 4.5. Sentences use the sentence builder
and pass `checkSentence`; a failure gives `failed`, as in `buildReport`. `cropRef` and `rows` come from
`Report.coreSample` (the builder confirms the `Band` fields; session 050 did not read that file).

## `landing.ts`

`normaliseLettering`: `lettering()`, lowercase, `&` to "and", non-letters to one space, trim.
`landingFact(collections, addresses, registry)`: take `land_use` features whose normalised use has an
`industrialMatch`; group by normalised key; per group shrink each area inward by its own
`position_error_m`, union them, and count distinct, banned-word-free `ADDRESS_FULL` values whose
point lies inside; choose the largest count (ties by key); count 0 gives `null`. Sentence: "On this
block, {count in words to twelve} addresses stand on a former {key}." (singular for one; "a" or "an"
by first letter; the count is a number slot). If the Percy Street count is not 6, the builder
reports the count and why, and does not loosen the rule. `pickExamples` takes lots tagged 4.2, one
address each (first by text), one per distinct key first, then fills by address text, at most three.

## Compare view

`compareModel({ lot, tile, present, marginM = 15 })` returns `{ viewBox, lotPath, presentPaths,
lotLinePaths, mapAreaPath, uncovered }`. It uses `makeSheetTransform(tile.corners, w, h)`, maps the lot's bounding box plus
`marginM` through `worldToPixel` to a viewBox padded to the frame and centred on the lot (session 052: the
frame is not slid back onto the sheet), and draws every path with
`ringsToPath` from that transform, so both sides align by construction. The scan is clipped to the sidecar's
`map_area`, so what lies outside it is parchment, and `uncovered` says how much of the frame that is and where
(the page prints "edge of sheet 229" there). The divider is not an input.
`CompareView` stacks two SVGs with that viewBox: the tile (untoned, no footprints) and today's lines
(`canon.buildings`, `canon.lots` filtered to the viewBox); the right one is clipped by
`clip-path: inset(0 0 0 X%)`. The lot path string is drawn on both, a 6 px `--ink` casing under a
4 px `--lantern` stroke. Tiles load as the Flat sheet loads them (`/data/tiles/<id>.jpg` and sidecar).

## Load weight

No map or 3D library on the three pages. The landing plan is a crop of the 1911 tile written by
`npm run gen:landing-plan` to `web/public/lotcheck/landing-plan.jpg` (at most 200 KB) with
`landing-plan.json` (crop corners, so the outline uses the same transform). The Result loads the full
tile; the builder reports its size, and above 1.5 MB the maintainer decides on per-lot crops.

## Properties (fast-check, no network)

- P1 [PBT] Tag 4.2 or 4.3 always has at least one trigger; each trigger's lettering contains its
  `matched` entry as a whole word; `matched` is in the list. The tags 4.4, 4.5 and 4.7 have none.
  Tags 4.2, 4.3 and 4.7 have exactly one sentence, about the use that covers the most of the lot
  (3.3).
- P2 [PBT] A string with no entry at word boundaries gives `null`; one with an entry does not.
- P3 [PBT] For generated lettering (banned words included), every sentence from `buildLotCheck`,
  `landingFact` and the how copy, and the rendered text, has no `findBannedWords` hit.
- P4 [PBT] `landingFact`'s count equals an independent count of points inside generated rectangles
  shrunk by their errors.
- P5 [PBT] For any divider in [0, 1], `compareModel` output and the rendered outline path are equal.
- P6 [PBT] "No industrial use" appears only with tag 4.4 and always with its not-a-clearance line;
  the fifth tag ("A past use is lettered on these plans") never carries that line.
- P7 [PBT] Every suggestion matches every token of the query; no unrecorded address is listed above a
  recorded one; at most seven.
- P8 [PBT] Every slip's text is a line of the result's view model (or fixed copy); a muted slip belongs to
  a row with no lines; reduced motion gives no steps.
- P9 [PBT] Total time is between 2 and 7 s; skipping at any step ends at the Result.
- P10 [PBT] Each inscription's lettering is the verdict's lettering; "NOT DUG YET" only for not covered.
- P11 [PBT] An image's placement (`photoPlacement`) puts its four corners where `worldToPixel` puts the
  four world points, within 1 px.
- P12 [PBT] Every caption for an imagined layer contains "Imagined" and "Not a photograph"; no caption for a
  photograph contains either; changing the layers never changes the verdict, inscription or any row.
- P13 [PBT] An imagined view is offered only when one of its `feature_ids` is a lettered use ON the lot
  (never "near"); the default layers are the first plan and today's photograph.

## Photographs and imagined views (session 055)

`photos.ts` (pure): reads the two indexes, `photoPlacement(bounds, frame)` (an affine `translate/scale` from
a bounds box and the tile's `SheetTransform`), `layerChoices(lot, plans, photos, imagined)` (the Then and
Now choices), `layerCaption(then, now)`. `CompareView` draws the chosen Then image under the plan's lot
outline and the chosen Now image under today's. The lot outline and "where it stood" outline stay last in
each layer, so they sit on top of any photograph. Photographs are requested only after the plan tile has
loaded; until a picture has loaded its side shows the outlines.

## The night dig (session 053)

Pure modules: `suggest.ts` (matching, ranking), `digTimeline.ts` (timeline from a `LotCheck` and the motion
preference; `stateAt(t)` gives the lantern position, the slips shown and the phase), `inscription` (a field
of `verdict`, built with the sentence builder). The Landing builds the check for the chosen lot with the
data it already holds (`computeLotCheck`, shared with the Result) and plays `DigOverlay`, which drives
transforms from `requestAnimationFrame`; at the end it opens `/lot/<id>`. A test hook, `window.__buriedDigHold
= <mark index>`, freezes the clock inside that mark's pause, so a test reads the screen without a sleep.
