# Requirements: 05 Report

## Introduction

The Report is "The documented history of this place." A person picks a lot inside the covered area
and gets what stood there and when, what the records show about water and past land use, what they
cannot tell you, and who to talk to next. It is shown beside the 3D view, prints to a one-page PDF,
and has a share link. It may go to an inspector or a lawyer, so it is sober, sourced and exact.

The Report runs entirely in the Shell, with no server. Lots come from the property boundaries
present layer, address search from the address points present layer, and every fact from the
Evidence Library (`web/src/evidence/`). Every sentence is built by a template in code from evidence
fields, then checked for banned words, unsupported numbers and unsupported sources before it is
shown. No language model writes Report text for the submission.

The Report never depends on Unity. It works on its own route, beside the Explorer, beside the 2D
map, and in print.

Rules come from `.kiro/steering/` (`product.md` honesty rules 1 to 11, `evidence.md` "On this lot
vs near this lot" and "Findings", `design.md` "The Report takes the costume off", `sources.md`,
`tech.md`). The lot relation, findings, date phrases, position phrase and banned-word check come
from spec 01. The present layers come from spec 02. Search, lots, coverage and the Explorer come
from spec 03. Workspace features come from spec 04.

## Glossary

- **Report**: the model built by `buildReport` and the views that render it, in `web/src/report/`.
- **Report route**: `/report?lot=<lot id>&era=<era id>&v=<data version prefix>`.
- **Report panel**: the Report shown beside the Explorer or the 2D map.
- **Lot**: a feature of `present_toronto_property_boundaries_2026`, with the lot position error in
  design.md.
- **Coverage area**: as in spec 03, the union of the `mapped_area` of every evidence file (canon
  and workspace).
- **Plate source**: a registered source of type `fire_insurance_plan` or `historical_map` that has
  an evidence file.
- **Lot coverage**: for one plate source and one lot, `reviewed`, `mapped` or `not_covered`
  (design.md "Lot coverage").
- **Finding group**: one of "Water history", "Past land use", "Fill and old structures".
- **Finding**: spec 01's `Finding`, with a group, sentences and relation claims.
- **Sentence**: a Report string with its fact pack and relation claims (design.md "Sentences").
- **Fact pack**: the numbers, source ids and verbatim source strings a sentence was built from.
- **Relation claim**: a sentence's statement that a feature is on, or near (within X m), the lot.
- **Core sample**: one band per era, from Today to the earliest era.
- **Canon sections**: every part of the Report built from canon inputs only.
- **Workspace section**: the part of the Report built from workspace features (spec 04).
- **Data version**: as in spec 04.

## Requirement 1: Opening a Report

**User story:** As a resident, I want to open the Report for my lot from the Explorer, from search,
or from a link someone sent me.

### Acceptance criteria

1.1 THE Shell SHALL serve the Report route, and SHALL let the visitor open a Report for the pinned
lot from the Explorer and the 2D map.

1.2 THE Report route SHALL offer address search over
`data/present/present_toronto_address_points_2026.geojson` and lot lookup with spec 03's
`search.ts` and `lots.ts`, with no network geocoder.

1.3 WHEN the Report is opened beside the Explorer or the 2D map, it SHALL show as a panel beside
the view and SHALL follow the pinned lot.

1.4 THE Report route and every module it imports SHALL NOT import the Unity loader, `UnityView`,
`web/src/bridge/` or any module that does, and SHALL render with Unity unavailable.

## Requirement 2: The lot and its position error

**User story:** As a reader, I want "on this lot" to allow for the error in the lot boundary as well
as in the old map.

### Acceptance criteria

2.1 THE Report SHALL take the lot geometry from the property boundaries layer in EPSG:26917.

2.2 THE Report SHALL give every lot from `present_toronto_property_boundaries_2026` a position error
of 1.0 m, unless the dataset states its own accuracy, and SHALL record the value and its reason in
design.md "Lot position error".

2.3 THE lot position error SHALL be defined in one place in the Shell and passed to spec 01's
`lotRelation` as the lot's `positionErrorM`.

## Requirement 3: Coverage

**User story:** As a reader, I want to know plainly when Buried has nothing for a place, and which
records it checked when it found nothing.

### Acceptance criteria

3.1 IF the address is not found, the address point is in no lot, or the lot does not intersect the
coverage area with positive area, THEN THE Report SHALL show "Not reconstructed yet." and nothing
else.

3.2 THE Report SHALL compute, for each plate source and the lot, its lot coverage as in design.md
"Lot coverage".

3.3 WHEN the lot is inside the coverage area and no feature is on or near it, THE Report SHALL
still show every section, with each finding group's "Nothing found in these records" or "Not
covered" finding listing every record and year range checked.

## Requirement 4: Sections and their order

**User story:** As someone who may hand this to a professional, I want the same sections in the same
order every time.

### Acceptance criteria

4.1 THE Report SHALL show, in this order: the line "Buried screens; it doesn't certify."; the title
"The documented history of this place."; the place (addresses, lot id); the core sample; the three
finding groups (Water history, Past land use, Fill and old structures); the workspace section when
there is one; "What these records cannot tell you"; "Before you dig"; "Sources"; and the link back
to the live view and the share link.

4.2 "Buried screens; it doesn't certify." SHALL be the first line of the on-screen Report and of the
printed page.

4.3 Every section in 4.1 except the workspace section SHALL be present in every Report for a lot
inside the coverage area.

## Requirement 5: The core sample

**User story:** As a resident, I want to see at a glance what each era's records show at my lot.

### Acceptance criteria

5.1 THE core sample SHALL have one band per era in `data/project.json`, ordered from Today to the
earliest era as in spec 03.

5.2 THE Today band SHALL state how many present-day building outlines intersect the lot with
positive area, citing `present_toronto_building_outlines_2026`, and SHALL NOT use the words
"on this lot" for them.

5.3 EACH past band SHALL show the era label; whether any plate source or aerial for that era covers
the lot; the buildings and water drawn in that era (from `featuresForEra`) that are on the lot or
near it within the finding radii, with their relation; the uses recorded for them; and the source
ids.

5.4 A band SHALL include only features that `featuresForEra` returns for its era.

5.5 WHEN the visitor activates a band, THE Shell SHALL move the Explorer or 2D map to that era when
the Report is a panel, and SHALL open the live view at that era and lot when it is the Report
route.

## Requirement 6: Findings

**User story:** As a buyer, I want findings worth discussing with a professional, each with its
status, how close it is, and its sources.

### Acceptance criteria

6.1 THE Report SHALL build findings in three groups by the rules in design.md "Finding rules":
Water history (water features), Past land use (recorded uses of buildings and land-use areas), and
Fill and old structures (buildings drawn on or close to the lot, and water followed by a building
on the lot).

6.2 THE Report SHALL include a feature in a group only when `lotRelation` says it is on the lot, or
near it within the group's radius in design.md.

6.3 EACH finding SHALL show its status label ("Documented", "Estimated", "Nothing found in these
records" or "Not covered") as text, "on this lot" or "near this lot (within X m)" from
`lotRelation`, its date phrases from `datePhrases`, its position phrase from `positionPhrase`, the
confidence label and reason of the features behind it, and its source ids.

6.4 THE Report SHALL set a finding's status by the rule in design.md "Finding status".

6.5 WHEN a linked set is conflicted, THE Report SHALL show it as an Estimated finding that names the
sources that disagree and says it needs review, and SHALL NOT pick a side.

6.6 EACH group with at least one Documented or Estimated finding SHALL end with its next step from
design.md "Fixed copy".

6.7 Every finding SHALL be created with spec 01's `createFinding`, `createNothingFound` or the
`not_covered` constructor, so that a finding without a source or with a banned word cannot exist.

## Requirement 7: Nothing found and not covered

**User story:** As a reader, I want "nothing found" to say exactly which records were checked.

### Acceptance criteria

7.1 WHEN a group has no Documented or Estimated finding, THE Report SHALL show the group's
"Nothing found in these records" and "Not covered" findings by the rules in design.md "Empty
groups".

7.2 EVERY "Nothing found in these records" and "Not covered" finding SHALL list every plate source
in the inputs with its year range and its lot coverage, as spec 01's `checkedRecordsText` and the
coverage wording in design.md.

7.3 THE Report SHALL say "Nothing found in these records" for a group only when every plate source
it lists as clear has the lot inside its reviewed areas at that group's radius.

7.4 UNTIL spec 01's Schema can record that a source was reviewed for water, THE Water history
group SHALL never say "Nothing found in these records"; with no water finding it SHALL say
"Not covered" and give the reason in design.md.

## Requirement 8: What these records cannot tell you

**User story:** As a reader, I want the limits of the records stated every time.

### Acceptance criteria

8.1 THE section SHALL say that the records cannot tell you about present-day soil, water or
structural condition; anything outside the years the records cover, naming those years for this
lot; or underground utilities.

8.2 THE section SHALL say that history before colonial maps is outside what these records cover,
and SHALL include the land acknowledgement and link in design.md "Fixed copy".

## Requirement 9: Before you dig

**User story:** As a homeowner planning to dig, I want to know these maps are not utility locates
and where to request locates.

### Acceptance criteria

9.1 THE section SHALL say "Buried's maps are not utility locates." and "Request locates through
Ontario Dig Authority before you dig.", with a link to Ontario Dig Authority.

## Requirement 10: Sources

**User story:** As a reader, I want every source the Report relies on listed with its licence and
credit.

### Acceptance criteria

10.1 THE Sources section SHALL list every source cited by any finding or band, and the present-day
sources the Report used (property boundaries, address points, building outlines), each with id,
title, years, URL, licence note and attribution line, sorted by id.

10.2 THE Sources section SHALL show the data version the Report was built from.

10.3 THE Report SHALL NOT cite or show a source whose `attribution_status` is `to_be_confirmed`.

## Requirement 11: Wording

**User story:** As the person responsible for honesty, I want every sentence built from evidence
fields by code and checked before it is shown.

### Acceptance criteria

11.1 Every Report sentence SHALL be produced by a template in `web/src/report/templates.ts` or be
fixed copy in `web/src/report/copy.ts`. No language model SHALL produce Report text.

11.2 Every sentence SHALL carry the fact pack it was built from.

11.3 THE Evidence Library SHALL provide `checkSentence(text, pack)` that fails when the text contains
a banned word, a number that is not in the pack, or a source id that is not in the pack, as defined
in design.md "Sentence check".

11.4 THE Report SHALL run `checkSentence` on every sentence, and IF a sentence fails, THEN THE Report
SHALL NOT show the Report, SHALL show "This report could not be produced" with the place, and SHALL
log the sentence and the reason.

11.5 THE Report SHALL use "Built by", "Gone by", "Last seen" and "Not yet built at" only through
`datePhrases`, and SHALL NOT say "Built in".

11.6 THE phrase "on this lot" SHALL appear only in a sentence whose relation claims are all
`on` claims that `lotRelation` confirms, and "near this lot (within X m)" only when X is the largest
`withinM` that `lotRelation` gives for the features the sentence names.

11.7 WHEN a recorded `use` or label contains a banned word, THE Report SHALL NOT reproduce it, and
SHALL use the wording in design.md "Uses that cannot be printed" instead.

## Requirement 12: The same lot and evidence give the same report

**User story:** As a lawyer comparing two copies, I want the Report to depend only on the lot and
the records.

### Acceptance criteria

12.1 `buildReport` SHALL be a pure function of the lot id, the era id, the canon inputs, the
workspace inputs, the data version and the site origin.

12.2 THE Report SHALL NOT read the clock, the locale, the time zone, the viewport or any random
source, and SHALL NOT depend on the order of features, observations, sources or files in its
inputs.

## Requirement 13: PDF

**User story:** As a buyer, I want to print the Report on one page for my inspector.

### Acceptance criteria

13.1 THE Report SHALL provide a Print button that opens the browser's print dialog, and a print
stylesheet that fits the Report on one Letter page and on one A4 page without clipping.

13.2 THE printed page SHALL include the sources with their licence notes and attribution lines,
the data version, and the share link as text.

13.3 WHEN a group has more findings than the print limit in design.md, THE printed page SHALL show
the first ones by the order in design.md and a line stating how many more findings that group has
in the live report.

13.4 THE printed page SHALL use the Report's light paper theme, with no fog, glow or atmospheric
copy, and status labels in text.

## Requirement 14: Share link

**User story:** As a resident, I want to send my Report to someone and have them see the same thing.

### Acceptance criteria

14.1 THE share link SHALL encode the lot id, the era id and the first 12 hex characters of the data
version, and nothing else.

14.2 WHEN the share link is opened, THE Shell SHALL build the Report for that lot and era from the
records it is serving.

14.3 IF the link's data version differs from the one served, THEN THE Report SHALL say "The records
have changed since this link was made. This report uses the current records."

14.4 THE share link SHALL NOT carry workspace data, and THE Report SHALL say so when it has a
workspace section.

## Requirement 15: The workspace section

**User story:** As a Studio visitor, I want the buildings I published to appear in the Report for
their lot, marked as mine.

### Acceptance criteria

15.1 WHEN workspace features are on or near the lot, THE Report SHALL show them in a separate
section headed "From your workspace", with the line in design.md "Fixed copy", built with the same
groups, rules and templates as the canon sections.

15.2 THE canon sections, the core sample and the share link SHALL be built from canon inputs only.

15.3 THE printed page SHALL include the workspace section with its heading and line when it is
shown on screen.

## Requirement 16: Accessibility

**User story:** As a keyboard or screen reader user, I want to read and use the whole Report.

### Acceptance criteria

16.1 THE Report SHALL use one `h1` (the title), an `h2` per section and an `h3` per finding group,
and lists for bands, findings and sources.

16.2 THE core sample bands, the Print button, the share link and the live link SHALL be reachable
and usable by keyboard, with visible focus rings.

16.3 Confidence and status SHALL be shown by text label and pattern, never by colour alone.

16.4 THE Report SHALL pass an axe scan with no serious or critical violations, on screen and in print
emulation.

16.5 Text SHALL meet 4.5:1 contrast and large text and rules 3:1 on the Report theme.

## Requirement 17: Tests and tooling

**User story:** As the maintainer, I want the honesty rules proved by property tests.

### Acceptance criteria

17.1 Each correctness property in design.md SHALL have a fast-check test with at least 200 runs.

17.2 Tests SHALL NOT use the network. Fixtures SHALL be synthetic lots, features and present layers
committed under `web/src/report/testing/`.

17.3 WHEN a task adds a command, THE same change SHALL record it under "Commands" in
`.kiro/steering/tech.md`.
