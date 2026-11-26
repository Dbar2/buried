---
inclusion: always
---

# Product: Buried

Buried reads old fire insurance plans and aerial photos and tells you what the plans recorded on a
piece of land, with the proof. Type an address; see what the plans lettered there, the scan it was
read from, and what the records cannot tell you. A 3D model of the block exists behind it.

Entry for Kiroween 2026, category Resurrection (Frankenstein is the fallback, decided at
submission). Tagline: "Forgotten maps, rebuilt with proof."

## The lot check

Decided on Nov 25 (session 050), not to be reopened: **finish one product, the lot check.** The raised
block, the walk and the Studio stay in the repository but are not the front door. Detail: spec 08.

Who it is for: **someone about to buy, dig or plant on an old city lot.** They want to know whether
the old plans recorded an industrial use on or beside it, and to see the plan that says so. Also
curious residents and local-history teachers, who get the same page.

1. **Landing** (`/`). A night page with a slim soot header ("Buried"; "How it works", "Sources"). Kicker
   "A LOT CHECK FROM OLD FIRE-INSURANCE PLANS". Headline "What is buried under your address?". One line:
   "Type an address. We dig down through the old plans and show you what stood there." One address
   combobox with suggestions (on focus, "Try one of these": addresses with something recorded; typing
   matches the house number and the start of any street word) and one button, "Dig". "or dig somewhere
   at random". One fact, computed from the data and never typed in ("On this block, six addresses stand
   on a former coal and wood yard."), and the plan on a sheet of paper lit by a lantern, with the lots
   that have something recorded outlined; clicking one digs there. A coverage line: "Covered so far: one
   block of Toronto. Plans of 1911-14 and 1931-35."
   **The dig** (session 053). Choosing an address on the Landing plays a full-window sequence of about
   4.5 s: a lantern is lowered through the layers of earth, year by year, and at each plan's depth a
   paper slip shows what that plan letters there, then the Result appears with its record sheet and
   a rubber stamp. A direct visit to a Result, and `prefers-reduced-motion`, skip the sequence. **The
   dig is presentation.** It shows nothing the Result does not show, it is built from the same view
   model, and it never pretends to compute: the How page says "The dig is an animation. The lookup
   itself is instant."
2. **Result** (`/lot/<lot id>`; `/place?lot=` shows the same page).
   - The address as the title, and a record sheet: an inscription ("HERE STOOD / Coal & Wood Yard /
     recorded on the plans of 1911 and 1931-35"), one sentence quoting the plan ("The 1911 and 1931-35
     plans letter this lot “Coal & Wood Yard”."), and the tag as a rubber stamp. The tag is one of "Past industrial use
     recorded", "Industrial use recorded next to this lot", "No industrial use lettered on these
     plans", "Not covered yet" (the inscription then reads "NOT DUG YET").
   - A compare view: one map, a draggable divider, the old plan (untouched scan, lot outlined) on the
     left and today (City building outlines and lot lines) on the right, a switch between the two
     plans. Keyboard and touch work.
   - "What the plans show": one row per plan and one for today, each with its lettering crop and a
     line ("1911: Coal & Wood Yard, J. W. Corson & Co.").
   - "What this does not tell you": today's soil, water or structure; "Buried screens; it doesn't
     certify."; request locates through Ontario Dig Authority before a dig.
   - One primary action, "Download the one-page record" (the print Report), and "Share this check" and
     "Dig another address".
   - A provenance strip: who scanned the plan, placed within about X m, how the outline was
     traced, review status. Every figure comes from the record.
3. **How it works** (`/how`). Four short steps, one picture each, one line about the dig ("The dig is an
   animation. The lookup itself is instant."), then "Built with Kiro" in a few plain lines (agents
   propose, a person confirms, hooks stop bad writes). Night theme with the lantern.

The lot check needs no WebGL and does not fetch the Unity Player on first load.

The showcase for the demo: a coal and wood yard lettered behind Percy Street on the 1911 plan
(J. W. Corson & Co.) and the 1931-35 plan (Northern Fuels Co.), with six present-day addresses on
it (2A to 2D Percy St, 549 King St E, 37 Sumach St). The page computes this; nothing is scripted.

### Pictures (session 055)

The compare view can show real aerial photographs (today, 1939) and views imagined from the plans.
Rules for every picture:

1. A real photograph is labelled with its year and "aerial photograph, City of Toronto". An imagined
   view is labelled "Imagined from the <plan> plan. Not a photograph." in the caption, every time it
   is on screen, in addition to the mark set into the picture. An imagined picture is never cropped,
   and its "IMAGINED" corner is never covered.
2. No finding, tag, sentence or inscription is ever taken from a photograph or an imagined view. The
   verdict comes from the plans' lettering.
3. An imagined view is never the default. The plan is. A visitor chooses to see it.
4. An imagined view is never shown for a place the plans do not letter (not for a lot that is only
   next to a recorded site).
5. The Sources page lists both kinds: the aerial photographs with their licence, and the imagined
   views as "made with an image model from the plans; decoration and illustration, not evidence".

## Where the rest sits

- **Block** (`/block`, and `/find/<slug>` links already shared). The raised 3D block with finds, the
  era ruler and the Lantern. Linked once, from the result page, as "See this block in 3D". If its
  download is too large to ship (spec 08 task 10), the link and the route go.
- **Report** (`/report`). The long printable record: "The documented history of this place." Reached
  from "Download the one-page record". It never depends on 3D working.
- **Reconstruction Studio** (`/studio`). Import a plate, align it with the error in metres, propose
  footprints, confirm, publish. Runs on a maintainer's machine. Linked only from the Sources page.
  It proves Buried is a tool, not a hand-built model.
- **Walk** (`/walk`, spec 07). Parked on Nov 25: not linked, not shipped. If revived, it stays a
  labelled reconstruction: the plan gives outline, storeys and lettered name; brick, windows, signs
  and lamps are imagined and every panel says so. No one removes those labels to "fix" it.
- **Place page** (`/place?lot=`) and its search: replaced by the lot check pages.
- **Kiro kit.** Steering, hooks, the `archivist` and `plate-qa` agents and the read-only
  `buried-evidence` MCP server, which answers "what do the records show at this address" from the
  evidence files and computes no dates, lot relations or confidence wording.

## Past land use is the practical value

Uses lettered on the plates (yards, works, factories, stables, shops) are recorded as read by a
person, like material, and drive the verdict. This is what a buyer, renovator or neighbour would
act on. Buried's maps are not utility locates.

## Showcase area and eras

- Eastern Avenue at the Don River, Toronto.
- Eras at submission: **today, 1947, 1935, 1911 (revised to 1914)**. The 1935 era is labelled
  "1935" and covers 1931 to 1935, because the plates read "January 1931, revised to May 1935".
- Sources: Goad fire insurance plan Volume 3, plates 229 and 232, editions 1911 (rev. 1914) and
  1931 (rev. 1935, which U of T calls the 1935 edition); the 1947 aerial photographs. See
  `sources.md`.
- The plate scans are greyscale photographic copies. A grey tone is not a construction material.
  Material is recorded only when read from the plate's lettering or legend.
- **Plate 232 (1935) is the held-out plate.** It is never used to tune extraction. It is the plate
  processed live in the Studio demo.
- Choose blocks from where the data overlaps. Never script a building, use, demolition or creek
  ahead of the evidence.

## Scope at submission

Real, end to end:
- Landing, Result and How pages for any lot inside the coverage area, with coverage disclosure,
  the compare view, the one-page record and share links. Works on a phone and without WebGL.
- Studio: import, align, extract, review, publish, on the held-out plate, on a maintainer's machine.
- Kiro kit: steering, hooks, the two agents and the evidence MCP server.
- Block page, only if it ships in a small download.

Cut: story mode, the walk, the 1947 Lantern for any address, citywide reports, Ontario's
Environmental Site Registry and the federal contaminated sites inventory, general-purpose AI chat,
photoreal reconstruction, street-level AR, other cities, and any claim about present-day
condition. Outside the coverage area, say "Not reconstructed yet." Nothing else.

## Honesty rules (hard rules, enforced in code and tests)

1. **Banned words.** Report text and generated text never contain "contaminated", "unsafe",
   "safe", "safer", "safest", "clean", "cleaner", "cleanest" or the phrase "will flood". Matching
   is whole-word and case-insensitive, so "safety" is allowed. A test fails the build if they
   appear. This covers every lot check page, not only the Report.
2. **On this lot vs near this lot.** A finding is "on this lot" only if the feature overlaps the
   lot by more than its position error. Otherwise it is "near this lot (within X m)". The exact
   test is in `evidence.md`.
3. **Absence must be clear.** A building counts as gone only when a later source shows the spot
   clearly (an empty lot or a different building). Obscured, unclear or not covered means
   "Last seen [year]".
4. **No source, no claim.** Every feature and every finding links to at least one source.
5. **Each finding has a status:** Documented, Estimated, Nothing found in these records, or
   Not covered. "Nothing found" always lists which records and years were checked.
6. **"Buried screens; it doesn't certify."** This line sits at the top of every report and on the
   result page's "What this does not tell you".
7. **Every report says what the records cannot tell you:** present-day soil, water or structural
   condition; anything outside the years covered; underground utilities. It includes the
   "request locates through Ontario Dig Authority before you dig" pointer.
8. **The AI proposes and a person confirms.** No extracted footprint is published without a
   person accepting it. The write-up says so plainly.
9. **Code does the maths.** Geometry, coordinates, distances, overlaps, intervals and dates are
   computed in code. An LLM only writes sentences from facts it is given, with one exception:
   in the Studio, a vision model may propose the text of a label printed on a source (storeys, a
   use, a street number, or a material as lettered or in the legend) for a person to confirm or
   correct. The proposal keeps the crop it was read from. The model never touches geometry,
   coordinates, dates or confidence.
10. **Generated sentences are checked before display:** no banned words, no numbers absent from
    the evidence, no sources absent from the evidence pack.
11. **No invented exact years.** Use "Built by", "Gone by", "Last seen", never "Built in" unless a
    source states that year.
12. **A find's name is the plate's lettering.** It is quoted as lettered, with the crop it was
    read from. Buried never names a business, owner or use that the plate does not letter, and
    never says "confirmed" of a record no named person has reviewed.

### The verdict (spec 08)

13. **Industrial is decided by code, from lettering, by one list.** The list of words and phrases
    lives in the Evidence Library, is reviewed by the maintainer (coal, wood yard, lumber,
    factory, machine shop, foundry, cork, mill, works, oil, gas, garage, auto, laundry, dye,
    paint, tannery, storage of fuel, and the like), and matches whole words. No word outside the
    list triggers the tag. The tag always appears with the lettering that triggered it, and the
    crop it was read from.
14. **Relation.** "On this lot" and "next to this lot (within X m)" follow rule 2 and
    `evidence.md`. No page invents a nearer or wider claim.
15. **No industrial use lettered is not a clearance.** "No industrial use lettered on these plans"
    carries, beside it, the line that it is not a clearance and says nothing about the land today.
    The absence and coverage rules (3 and 5) hold: a lot the plans do not cover gets "Not covered
    yet", never "No industrial use".
16. **Names are the plan's lettering, quoted.** Status lines are the record's own wording. A
    landing fact is computed from the evidence files and checked like any generated sentence.
17. **The dig is presentation.** The dig sequence and the reveal show nothing the Result does not show.
    Every slip, inscription and caption is built from the same `buildLotCheck` view model and passes
    the same sentence check. They never imply a computation in progress, and the How page says so.

## Tone

- Plain language for non-specialists. Specific numbers with units and sources.
- The lot check is calm and exact, at night. The Report is sober and printable, because it may go to an
  inspector or a lawyer, and stays plain paper. The 3D pages may be atmospheric.
- History before colonial maps is outside what these records cover. Say so plainly: the records
  Buried uses begin with colonial-era mapping. Buried does not write its own land
  acknowledgement; it links to the City of Toronto's published land acknowledgement. The
  maintainer approves the final wording before submission. Never invent.
