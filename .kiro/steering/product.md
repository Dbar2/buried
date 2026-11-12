---
inclusion: always
---

# Product: Buried

Buried turns archival fire insurance plans and aerial photos into a 3D model of a neighbourhood
through time. Every building it shows carries the evidence behind it. People can explore the model,
add to it, and get the documented history of a place it covers.

Entry for Kiroween 2026, category Resurrection (Frankenstein is the fallback, decided at
submission). Tagline: "Forgotten maps, rebuilt with proof."

## The three parts

1. **Explorer.** A foggy 3D neighbourhood at dusk. Digging down goes back in time, one era per
   layer. Vanished buildings rise as ghosts where they stood, each showing how sure we are.
   Includes Dig, ghosts, the Lantern (a lens showing the past inside, the present outside),
   Show Evidence (the source beneath a ghost) and Water remembers (documented creeks, marsh and
   shorelines).
2. **Reconstruction Studio.** Import a plate, align it to today's map with the error in metres,
   let Buried propose footprints, confirm them, publish. Published buildings rise in the Explorer
   in that plate's era with full provenance. This proves Buried is a tool, not a hand-built model.
3. **Report.** "The documented history of this place." Pick a lot inside the covered area and get
   what stood there and when, what the records show about water and past land use, what they
   cannot tell you, and who to talk to next. On screen beside the 3D view, plus a one-page PDF and
   a share link. The Report never depends on 3D working.

## Who it is for

- **Residents and buyers** (the face of the demo): what was on my street, and is anything worth
  asking a professional about.
- **Homeowners planning to dig:** what used to be there, and a pointer to request locates through
  Ontario Dig Authority. Buried's maps are not utility locates.
- **Heritage groups, museums, researchers:** the Studio, to rebuild their own neighbourhoods.
- **Environmental and property professionals** (later): a faster first pass at historical research.

## Showcase area and eras

- Eastern Avenue at the Don River, Toronto.
- Eras at submission: **today, 1947, 1935, 1911 (revised to 1914)**.
- Sources: Goad fire insurance plan Volume 3, plates 229 and 232, editions 1911 (rev. 1914) and
  1935; the 1947 aerial photographs. See `sources.md`.
- **Plate 232 (1935) is the held-out plate.** It is never used to tune extraction. It is the plate
  processed live in the demo.
- An earlier layer is a stretch goal. It needs its own sources before any work starts.
- Choose blocks from where the data overlaps. Write story content only after the sources show what
  happened. Never script a building, use, demolition or creek ahead of the evidence.

## Scope at submission

Real, end to end:
- Explorer: the showcase area, four eras, Dig, ghosts, Lantern, Show Evidence, Water remembers.
- Studio: import, align, extract, review, publish, shown live on the held-out plate.
- Report: any lot inside the coverage area, with coverage disclosure, PDF and share link.
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
   computed in code. An LLM only writes sentences from facts it is given.
10. **Generated sentences are checked before display:** no banned words, no numbers absent from
    the evidence, no sources absent from the evidence pack.
11. **No invented exact years.** Use "Built by", "Gone by", "Last seen", never "Built in" unless a
    source states that year.

## Tone

- Plain language for non-specialists. Specific numbers with units and sources.
- The Explorer can be atmospheric. The Report is sober and printable, because it may go to an
  inspector or a lawyer.
- History before colonial maps is outside what these records cover. Say so plainly, include a
  respectful land acknowledgement, and link to authoritative sources. Never invent.
