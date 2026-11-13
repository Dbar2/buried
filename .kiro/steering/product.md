---
inclusion: always
---

# Product: Buried

Buried turns archival fire insurance plans and aerial photos into a 3D model of a neighbourhood
through time. Every building it shows carries the evidence behind it. People can explore the model,
add to it, and get the documented history of a place it covers.

Entry for Kiroween 2026, category Resurrection (Frankenstein is the fallback, decided at
submission). Tagline: "Forgotten maps, rebuilt with proof."

## The place page and the three parts

The first ten seconds: type an address, the camera drops to the lot, the past rises, and a plain
page says what stood there.

- **The unit is the place page.** One screen per lot: the dig (3D) on the left, a paper report on
  the right. The Explorer and the Report are two halves of it, not two destinations. The Studio
  stays its own screen.
- **Search first.** The landing is the dusk scene with the wordmark and one field, "What was
  here?", plus two or three real example addresses from the coverage area. No tour, no modal.
- **The core sample is made of pictures.** For each era the place page shows a real crop of that
  lot from that era's source (today's map, the 1947 photograph when aligned, the 1931-35 plate,
  the 1911 plate), with the lot outlined, next to one plain sentence. A crop is evidence a person
  can read without our interpreting it, so it appears even where nothing has been reviewed,
  labelled "From the plate, not yet reviewed". The sentence beside an unreviewed crop says what
  the source is and states no finding.
- **Plain words in the body, ids in the footnotes.** Sentences name sources as "the 1911 plan"
  and "the 1931-35 plan". Source ids, plate numbers and error figures sit in mono in a sources
  block and on hover or focus, never in the middle of a sentence.

1. **Explorer.** The left half. A foggy 3D neighbourhood at dusk. Digging down goes back in time,
   one era per layer. Vanished buildings rise as ghosts where they stood, each showing how sure
   we are. Includes Dig, ghosts, the Lantern (a lens showing the past inside, the present
   outside), Show Evidence (the source beneath a ghost) and Water remembers (documented creeks,
   marsh and shorelines).
2. **Reconstruction Studio.** Import a plate, align it to today's map with the error in metres,
   let Buried propose footprints, confirm them, publish. Published buildings rise in the Explorer
   in that plate's era with full provenance. This proves Buried is a tool, not a hand-built model.
3. **Report.** The right half. "The documented history of this place." For a lot inside the
   covered area: what stood there and when, what the records show about water and past land use,
   what they cannot tell you, and who to talk to next. Also a one-page PDF and a share link. The
   Report never depends on 3D working.

## Past land use is the practical value

Uses lettered on the plates (yards, works, factories, stables, shops) are recorded as read by a
person, like material, and drive the "past land use" findings. This is what a buyer, renovator or
neighbour would act on. "Buried screens; it doesn't certify" and the dig pointer stay.

## Who it is for

- **People who live in, are buying, or are about to dig into an old city block** (the face of the
  demo): what was on my street, what the plans show was used here, and is anything worth asking a
  professional about. For a dig, a pointer to request locates through Ontario Dig Authority.
  Buried's maps are not utility locates.
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
- Place page: search, dig and report on one screen, with the picture core sample.
- Explorer: the showcase area, four eras, Dig, ghosts, Lantern, Show Evidence, Water remembers.
- Studio: import, align, extract, review, publish, shown live on the held-out plate.
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

## Tone

- Plain language for non-specialists. Specific numbers with units and sources.
- The Explorer can be atmospheric. The Report is sober and printable, because it may go to an
  inspector or a lawyer.
- History before colonial maps is outside what these records cover. Say so plainly: the records
  Buried uses begin with colonial-era mapping. Buried does not write its own land
  acknowledgement; it links to the City of Toronto's published land acknowledgement. The
  maintainer approves the final wording before submission. Never invent.
