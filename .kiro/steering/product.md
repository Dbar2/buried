---
inclusion: always
---

# Product: Buried

Buried turns archival fire insurance plans and aerial photos into a 3D model of a neighbourhood
through time. Every building it shows carries the evidence behind it. People can explore the model,
add to it, and get the documented history of a place it covers.

Entry for Kiroween 2026, category Resurrection (Frankenstein is the fallback, decided at
submission). Tagline: "Forgotten maps, rebuilt with proof."

## The first visit and the find

The unit is a **find**: one thing the plans letter on this block (a building or a yard), with the
lettering crop that names it. The verb is **"Raise the past"**. Detail: spec 06, `data/finds.json`.

1. **Land** (`/`). The block at once: the 1911 sheet like paper on a dark table, lit warm from
   the upper left as if by a lamp, today's buildings on it as soot blocks, a little ground fog.
   "Something used to stand here." One lantern button, "Raise the past", over "Every ghost comes
   with the map that proves it." Paper tags pinned to the map: "Overall factory", "Bank", "Coal
   yard". No search field; the header holds the wordmark and "Sources". A still picture of the
   real scene shows at once while the Player loads; the button never waits on an endless spinner.
2. **Raise.** Today's blocks sink flat and stay as a thin outline, the sheet brightens, and the 1911 plan's
   buildings stand up as ghosts, staggered, in about two seconds. The camera stays put.
3. **First find.** The overall factory selects itself: lantern edges, a leader line to a
   catalogue card at the right (a bottom sheet on a phone): "LETTERED ON THE 1911 PLAN", the name
   as lettered, the lettering crop, "Seen on: 1911 plan, sheet 229", "Placed within about N m",
   "Status: ...", "Show the original sheet".
4. **Look around.** Find tags along the top switch finds; any ghost can be clicked. The era ruler
   has Today, 1935, 1911; on a find it says what the other plan letters there. The Lantern is a
   round lens dragged with a pointer or a finger.
5. **Keep it.** "Share this find" copies `/find/<slug>`, which opens raised on that find. "Full
   record" opens the Report for that lot. "Look up an address" is a small link to the place page.

Where the rest sits. "Buried screens; it doesn't certify." is not on the landing; it stays word
for word at the top of the record, the Report and the print.

1. **Explorer.** The 3D scene on `/`, `/find/<slug>` and the place page: ghosts rise where they
   stood, each showing how sure we are. Raise, the era ruler (Dig on the place page), the
   Lantern, Show Evidence (the source beneath a ghost), Water remembers (documented water).
2. **Reconstruction Studio** (`/studio`, not in the header; the Sources page links it as "The
   workshop (runs on a maintainer's machine)"). Import a plate, align it with the error in
   metres, let Buried propose footprints, confirm, publish; they rise in that plate's era with
   full provenance. This proves Buried is a tool, not a hand-built model.
3. **Report** (`/report`, the "Full record"): "The documented history of this place." What stood
   on a covered lot and when, water and past land use, what the records cannot tell you, who to
   talk to next; a one-page PDF and a share link. It never depends on 3D working.
4. **Place page** (`/place?lot=`; search at `/place`): unchanged, reached by "Look up an address".

- **The core sample is made of pictures.** For each era the place page shows a real crop of that
  lot from that era's source, with the lot outlined, next to one plain sentence. A crop is
  evidence a person can read without our interpreting it, so it appears even where nothing has
  been reviewed, labelled "From the plate, not yet reviewed", beside a sentence that says what the
  source is and states no finding. A row for one plan says what that plan shows; a feature first
  read from another plan is worded "first drawn on the 1911 plan; drawn again on the 1935 plan".
- **Plain words in the body, ids in the footnotes.** Sentences name sources as "the 1911 plan"
  and "the 1931-35 plan". Source ids, plate numbers and error figures sit in mono in a sources
  block and on hover or focus, never in the middle of a sentence.

## Past land use is the practical value

Uses lettered on the plates (yards, works, factories, stables, shops) are recorded as read by a
person, like material, and drive the "past land use" findings. This is what a buyer, renovator or
neighbour would act on. "Buried screens; it doesn't certify" and the dig pointer stay.

## Who it is for

- **Curious residents and local-history teachers** (first contact, the face of the demo): what
  stood on this block, what the plans lettered there, and the map that proves it.
- **People who live in, are buying, or will dig into an old city block:** "Full record" and the
  Report carry the past-land-use screening, with a pointer to request locates through Ontario Dig
  Authority before a dig. Buried's maps are not utility locates.
- **Heritage groups, museums, researchers:** the Studio, to rebuild their own neighbourhoods.
- **Environmental and property professionals** (later): a faster first pass at historical research.

## Kiro is part of the product

The repository ships what a Kiro user needs to add a plate or a city: steering, hooks, the
`archivist` and `plate-qa` agents, and an MCP server that answers "what do the records show at
this address" from the evidence files. It reads the evidence files; it computes no dates, lot
relations or confidence wording of its own.

## Showcase area and eras

- Eastern Avenue at the Don River, Toronto.
- Eras at submission: **today, 1947, 1935, 1911 (revised to 1914)**. The 1935 era is labelled
  "1935" and covers 1931 to 1935, because the plates read "January 1931, revised to May 1935".
- Sources: Goad fire insurance plan Volume 3, plates 229 and 232, editions 1911 (rev. 1914) and
  1931 (rev. 1935, which U of T calls the 1935 edition); the 1947 aerial photographs. See
  `sources.md`.
- The plate scans are greyscale photographic copies. A grey tone on a scan is not a construction
  material. Material is recorded only when it is read from the plate's lettering or legend.
- **Plate 232 (1935) is the held-out plate.** It is never used to tune extraction. It is the plate
  processed live in the demo.
- An earlier layer is a stretch goal. It needs its own sources before any work starts.
- Choose blocks from where the data overlaps. Write story content only after the sources show what
  happened. Never script a building, use, demolition or creek ahead of the evidence.

## Scope at submission

Real, end to end:
- First visit: the block, Raise the past, the three finds with their cards, the era ruler (Today,
  1935, 1911; 1947 joins once its imagery is aligned), the draggable Lantern, share links. Works
  on a phone and without WebGL.
- Place page: address search, dig and report on one screen, with the picture core sample.
- Explorer: the showcase area, Dig, ghosts, Lantern, Show Evidence, Water remembers.
- Studio: import, align, extract, review, publish, on the held-out plate, on a maintainer's machine.
- Report: any lot inside the coverage area, with coverage disclosure, PDF and share link.
- Kiro kit: steering, hooks, the two agents and the evidence MCP server.
- Story mode ("The Lost Marsh", industrial waterfront), built only after the three parts work.
  It needs its own sources. It never claims residential lots were marsh without evidence.

Stretch: the 1947 Lantern for any Toronto address.

Cut until after the competition:
- Citywide reports.
- Ontario's Environmental Site Registry and the federal contaminated sites inventory.
- General-purpose AI chat.
- Photoreal reconstruction, street-level AR, other cities.
- Any claim about present-day condition.

Outside the coverage area, say "Not reconstructed yet." Nothing else.

## Honesty rules (hard rules, enforced in code and tests)

1. **Banned words.** Report text and generated text never contain "contaminated", "unsafe",
   "safe", "safer", "safest", "clean", "cleaner", "cleanest" or the phrase "will flood". Matching
   is whole-word and case-insensitive, so "safety" is allowed. A test fails the build if they
   appear.
2. **On this lot vs near this lot.** A finding is "on this lot" only if the feature overlaps the
   lot by more than its position error. Otherwise it is "near this lot (within X m)". The exact
   test is in `evidence.md`.
3. **Absence must be clear.** A building counts as gone only when a later source shows the spot
   clearly (an empty lot or a different building). Obscured, unclear or not covered means
   "Last seen [year]".
4. **No source, no claim.** Every feature and every finding links to at least one source.
5. **Each finding has a status:** Documented, Estimated, Nothing found in these records, or
   Not covered. "Nothing found" always lists which records and years were checked.
6. **"Buried screens; it doesn't certify."** This line sits at the top of every report.
7. **Every report says what the records cannot tell you:** present-day soil, water or structural
   condition; anything outside the years covered; underground utilities. It includes the
   "request locates through Ontario Dig Authority before you dig" pointer.
8. **The AI proposes and a person confirms.** No extracted footprint is published without a
   person accepting it. The write-up says so plainly.
9. **Code does the maths.** Geometry, coordinates, distances, overlaps, intervals and dates are
   computed in code. An LLM only writes sentences from facts it is given, with one exception:
   in the Studio, a vision model may propose the text of a label printed on a source (storeys, a
   use, a street number, or a material as lettered or in the legend) for a person to confirm or
   correct. The proposal keeps the crop it was
   read from. The model never touches geometry, coordinates, dates or confidence.
10. **Generated sentences are checked before display:** no banned words, no numbers absent from
    the evidence, no sources absent from the evidence pack.
11. **No invented exact years.** Use "Built by", "Gone by", "Last seen", never "Built in" unless a
    source states that year.
12. **A find's name is the plate's lettering.** It is quoted as lettered, with the crop it was
    read from. Buried never names a business, owner or use that the plate does not letter, and
    never says "confirmed" of a record no named person has reviewed.

## Tone

- Plain language for non-specialists. Specific numbers with units and sources.
- The Explorer can be atmospheric. The Report is sober and printable, because it may go to an
  inspector or a lawyer.
- History before colonial maps is outside what these records cover. Say so plainly: the records
  Buried uses begin with colonial-era mapping. Buried does not write its own land
  acknowledgement; it links to the City of Toronto's published land acknowledgement. The
  maintainer approves the final wording before submission. Never invent.

## The walk (a test)

`/walk` (spec 07) is a test of one street corner, walked in first person at night. It is a
**labelled reconstruction**, the way a museum labels one. The plan gives the outline, the storeys
read from it and the name as lettered. The brick, the windows, the doors, the lamps and the sign
paint are imagined, and every exhibit panel says so. This is the one place where the walk shows
walls, windows and signs that no source gives; the "no windows" rule for ghosts still holds on the
Block page and in the Explorer. All other honesty rules hold in the walk: a find's name is the
plate's lettering, the status line is the record's own, no banned words, nothing is called
"confirmed" that no named person reviewed. Later sessions must not "fix" this by removing the
labelled reconstruction, or by dropping the labels. If the maintainer rejects the test, the mode is
removed whole.
