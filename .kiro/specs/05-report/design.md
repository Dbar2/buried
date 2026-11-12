# Design: 05 Report

## Overview

```
data/present/ (lots, address points, building outlines)   data/evidence, sources, project, tiles
        │                                                          │
        ▼                                                          ▼
web/src/data/loadData.ts (spec 03)        web/src/workspace/load.ts + merge.ts (spec 04)
        │                                                          │
        └───────────────────────┬──────────────────────────────────┘
                                ▼
web/src/report/buildReport.ts     pure: (lot id, era id, canon, workspace, data version, origin)
        │   uses web/src/evidence/: linkedSets, summariseSet, featuresForEra, lotRelation,
        │   datePhrases, positionPhrase, createFinding, createNothingFound, findBannedWords,
        │   checkSentence (added here)
        ▼
ReportModel ──► ReportView.tsx  (route /report, panel beside Explorer or 2D map, print stylesheet)
```

- Everything is computed in the Shell. There is no server and no language model.
- `buildReport` is the only place that decides what the Report says. Views only lay it out.
- The Report imports nothing from `web/src/bridge/` or `UnityView.tsx` (spec 03 boundary test).

## Files

| Path | Contents |
|---|---|
| `web/src/evidence/sentences.ts` | `SentencePack`, `checkSentence` (spec 01 design "Findings" leaves this to the Report spec). Exported from `index.ts`. |
| `web/src/report/lotError.ts` | `LOT_POSITION_ERROR_M` and its reason. The only place the value appears. |
| `web/src/report/coverage.ts` | Pure: lot coverage per plate source and radius; aerial footprints per era. |
| `web/src/report/radii.ts` | The finding radii. |
| `web/src/report/sentence.ts` | Pure: the `sentence` builder and its slots, which record the fact pack. |
| `web/src/report/templates.ts` | Pure: every templated sentence. |
| `web/src/report/copy.ts` | Fixed copy. |
| `web/src/report/findings.ts` | Pure: the three groups, statuses, empty-group findings, ordering. |
| `web/src/report/coreSample.ts` | Pure: bands. |
| `web/src/report/links.ts` | Pure: share link and live link format and parse. |
| `web/src/report/buildReport.ts` | Pure: the whole model. |
| `web/src/report/printModel.ts` | Pure: print caps and hidden counts. |
| `web/src/report/ReportView.tsx`, `ReportPanel.tsx`, `ReportRoute.tsx`, `Band.tsx`, `FindingItem.tsx`, `StatusBadge.tsx` | Views. |
| `web/src/report/report.tokens.css`, `report.css`, `report.print.css` | Report theme tokens, screen and print styles. |
| `web/src/report/testing/arbitraries.ts`, `web/src/report/testing/fixtures/**` | Generators and synthetic fixtures (lots, features, present layers, a "busiest lot"). |
| `web/src/explorer/deepLink.ts` | Pure: `?lot=&era=` for the Explorer route, parse and format. |
| `web/e2e/report*.spec.ts` | End-to-end and print tests. |

## Lot position error

`LOT_POSITION_ERROR_M = 1.0`.

Reason, recorded with the constant: the task brief sets 1.0 m for City of Toronto property
boundaries unless the dataset states otherwise. When this spec was written, no accuracy statement
had been recorded from the `property-boundaries` package. Task 1.1 reads the package page, its
metadata and any readme on the CKAN portal at the time of spec 02 task 10.5's retrieval. If they
state a positional accuracy, the constant becomes that value rounded up to the next 0.1 m (and never
below 1.0 m), and this section records the statement, where it was found and the date. If they
state none, the value stays 1.0 m and this section records that none was found.

The value is added to every feature's `position_error_m` inside spec 01's `lotRelation`
(`e = feature error + lot error`), so a larger lot error only ever moves findings from "on this lot"
to "near this lot".

## Inputs and model

```ts
type ReportInputs = {
  lotId: string; eraId: string | null;
  canon: { collections: FeatureCollection[]; registry: SourceRegistry; project: Project;
           sidecars: TileSidecar[]; lots: PresentLayer; addresses: PresentLayer;
           buildings: PresentLayer };
  workspace: { collections: FeatureCollection[]; sources: Source[] } | null;
  dataVersion: string; linkDataVersion: string | null; siteOrigin: string;
};

type ReportModel =
  | { kind: 'not_reconstructed'; text: 'Not reconstructed yet.' }
  | { kind: 'failed'; text: 'This report could not be produced.'; place: string | null; reason: string }
  | Report;

type Report = {
  kind: 'report';
  screensLine: Sentence; title: Sentence;
  place: { lotId: string; addresses: string[]; sentences: Sentence[] };
  recordsChanged: Sentence | null;
  coreSample: Band[];
  groups: [Group, Group, Group];                       // water, land_use, structures
  workspace: { line: Sentence; groups: [Group, Group, Group] } | null;
  cannotTell: Sentence[]; beforeYouDig: Sentence[];
  sources: SourceEntry[]; dataVersion: string;
  links: { live: string; share: string };
};

type Group = { id: 'water' | 'land_use' | 'structures'; heading: string;
               findings: ReportFinding[]; nextStep: Sentence[] | null };
type ReportFinding = { finding: Finding;                // spec 01, created through its constructors
                       sentences: Sentence[];
                       confidence: { label: string; reason: string; pattern: 'solid' | 'dashed' | 'dotted' }[];
                       featureIds: string[]; sortKey: SortKey };
type Band = { eraId: string; label: string; coverage: BandCoverage; sentences: Sentence[];
              sourceIds: string[]; target: { eraId: string; lotId: string } };
type Sentence = { text: string; pack: SentencePack; claims: RelationClaim[] };
type RelationClaim = { featureId: string; kind: 'on' } | { featureId: string; kind: 'near'; withinM: number };
```

`buildReport(inputs): ReportModel` runs in this order: find the lot; check coverage; compute linked
sets and summaries over canon (and, separately, over canon plus workspace for the workspace
section); relations; groups; core sample; fixed sections; sources; links; then `checkSentence` on
every sentence. Any failure gives `failed`.

## Lot coverage

For a plate source P (a registered `fire_insurance_plan` or `historical_map` source), the lot L and
a radius r:

| Coverage | Rule | Visibility in `CheckedRecord` | Wording |
|---|---|---|---|
| `not_read` | P has no evidence file | `not_covered` | "not read into Buried yet" |
| `not_mapped` | `area(L ∩ mapped_area(P)) = 0` | `not_covered` | "does not show this lot" |
| `reviewed` | `grow(L, r)` lies inside the union of P's reviewed areas grown by 0.01 m | `clear` | "checked here" |
| `mapped` | otherwise | `not_covered` | "shows this lot, not fully checked here" |

All in EPSG:26917 with JSTS. `grow` uses round joins. The 0.01 m tolerance matches spec 01
requirement 19.4.

Aerials (`aerial_photograph` sources with a tile sidecar) count for the core sample only: an aerial
covers the lot when its sidecar's four corners, as a polygon, intersect the lot with positive area.
Aerials add observations to buildings, not buildings, so they never make a group "Nothing found".

## Finding radii

```
STRUCTURE_RADIUS_M = 10    // buildings: the lot and its immediate neighbours' edges
LAND_USE_RADIUS_M  = 30    // uses: roughly the neighbouring lots and the street in front
WATER_RADIUS_M     = 100   // water: past water near a lot is worth a question
```

A feature is in a group when `lotRelation` is `on`, or `near` with `withinM ≤` the group's radius.
These are screening distances chosen for a dense block of narrow lots. They are design values, not
measured, and changing one is a reviewed change to this file.

## Linked sets and relations

The Report works on spec 01 linked sets (`linkedSets`) of published features, so a building drawn
on both the 1911 and 1935 plates is one finding.

- Each member gets its own `lotRelation` (its geometry and error).
- The set is `on` if any member is `on`; the claim names the first such member by id.
- Otherwise the set is `near` with `withinM` the minimum over members; the claim names that member.
- Dates come from `summariseSet` and `datePhrases`.
- Uses are per member (each origin source's own reading), not per set.

## Finding rules

All three groups, for canon and (separately) for the workspace section. "Sources" for a finding are
the cited source ids of every set or feature behind it (origin sources, plus every source with an
observation that counted or was checked).

### Water history

One finding per water set in range:

```
"Water{ labelled '<use>'} is drawn {on this lot | near this lot (within X m)} on <source list>."
"<date phrases joined with ' · '>."
"<positionPhrase(drawn member's error)>."
"<confidence label>: <confidence reason>"
```

`<source list>` is the members' origin sources, each with its years: `fip_v3_1911_229
(1911–1914)`, joined by "; ". The label clause appears only when the claim member has a `use`.

### Past land use

Features (not sets) of kind `building` or `land_use` with a recorded `use`, in range. Grouped by
(the exact `use` text, relation kind). One finding per group key:

```
"'<use>' is recorded for {a building | N buildings | an area | N areas}
 {on this lot | near this lot (within X m)} on <source list>."
"<positionPhrase(largest error among them)>."
```

For a `near` key, X is the largest `withinM` among its features, so "within X m" holds for each.
Every feature gets its own claim. No use is classified as industrial or otherwise by code; the
group's next step asks the reader to judge (see "Fixed copy").

### Fill and old structures

1. One finding per building set in range (radius 10 m):

   ```
   "A building{ recorded as '<use>'} is drawn {on this lot | near this lot (within X m)} on <source list>."
   "<date phrases>."
   "{Storeys: N | Storeys: not recorded}."
   "<positionPhrase>."
   "<confidence label>: <confidence reason>"
   ```

2. One finding per pair (water set W `on` the lot, building set B `on` the lot) where both are
   dated, unconflicted, and B's window starts after W's "Last seen" year:

   ```
   "Water is drawn on this lot on <W source list> (<W's 'Last seen' or 'Gone by' phrase>),
    and a building is drawn on this lot on <B source list> (<B's 'Built by' phrase>)."
   ```

   The phrases are taken from `datePhrases` output by their prefix, so no year is worded here.
   The sentence states two records. It does not say the land was filled.

### Conflicts

A conflicted set in any group (spec 01 requirement 18.2 or 11.1) gives instead:

```
"The records disagree about {a building | water} drawn {on this lot | near this lot (within X m)}:
 <sources with a clear presence> show it; <sources with a conflicting clear absence> show the spot
 empty. It needs review."
```

### Finding status

- `documented` when every feature behind the finding has `confidence: documented` and no set is
  conflicted;
- `estimated` otherwise (estimated, unknown, or conflicted).

This is the conservative reading: a building whose storeys were not recorded is "Estimated" in the
Report as everywhere else, and the reason says why. The confidence label and reason of each
feature are shown with the pattern from `design.md` (solid, dashed, dotted with "?").

### Ordering

Within a group: `on` before `near`; then by the earliest `year_from` among the finding's sources;
then by the smallest feature id. Groups and sections have the fixed order in requirement 4.1.

### Empty groups

Let R, M, X be the plate sources whose coverage at the group's radius is `reviewed`, `mapped`, and
`not_read` or `not_mapped`. Every checked list holds every plate source in the inputs, in id order,
with its years and coverage.

| Group | No Documented or Estimated finding | With findings |
|---|---|---|
| Fill and old structures | If R is non-empty: `nothing_found`, "No building is drawn at this lot or within 10 m in these records." If M is non-empty: `not_covered`, "<M sources> show this lot, but not every building they draw here has been checked." | If M is non-empty, the same `not_covered` finding is added. |
| Past land use | If any building or land-use feature is in range without a `use`: `not_covered`, "Uses are not recorded for N buildings drawn at this lot or within 30 m of it." Else if R is non-empty: `nothing_found`, "No building or land use is drawn at this lot or within 30 m in these records." If M is non-empty: the M `not_covered` finding. | The "uses not recorded" and M findings are added when they apply. |
| Water history | Always `not_covered`: "No record Buried has read has been checked for water at this lot. Water is traced by hand, and a record can show water that has not been traced." | None added. |

Water never says "Nothing found" (requirement 7.4), because a reviewed area attests buildings only
(spec 01 requirement 19.3). The wording uses "at this lot", never "on this lot", because it makes no
relation claim.

## Core sample

One band per era in spec 03's era order:

- **Today**: count of present building outlines intersecting the lot with positive area:
  "N building outline(s) at this lot today." or "No building outline at this lot today.", citing
  `present_toronto_building_outlines_2026`. Present layers are not evidence and have no position
  error, so the band never says "on this lot".
- **Past era E**:
  - Coverage: the era's sources (registered, `confirmed`, year range containing E's): plate sources
    with their lot coverage at 10 m, and aerials that cover the lot. "Covered by: <ids with
    wording>." or "Not covered by these records."
  - Content: entries of `featuresForEra(E)` over canon. Buildings in range at 10 m and water at
    100 m, by `lotRelation` on the entry's geometry and error:
    "N building(s) drawn on this lot.", "N building(s) drawn near this lot (within X m).",
    the same for water, "Uses recorded: '<a>', '<b>'." (distinct, sorted), or, when covered and
    none: "No building is drawn at this lot or within 10 m in this era."
  - `needsReview` entries of that era list that would be in range: "N record(s) here need review
    because their sources disagree."
- Band activation: in a panel, `onBandSelect(eraId)` sets the Explorer or 2D map depth; on the
  route, the band is a link to the live view (`links.live` with that era).

## Sentences

### Builder

`sentence.ts` exposes a tagged template whose slots record the fact pack as they render:

| Slot | Renders | Adds to the pack |
|---|---|---|
| `num(n)` | integer as decimal | `numbers` |
| `years(source)` | `1911–1914` or `1935` from the registry | both years to `numbers`, the id to `ids` |
| `id(x)` | a source or feature id | `ids` |
| `quote(text)` | `'text'` | `verbatim` |
| `dates(summary)` | `datePhrases(summary)` joined by " · " | the summary's `builtBy`, `lastSeen`, `goneBy`, `notYetBuiltAt` to `numbers` |
| `datePhrase(summary, prefix)` | the one phrase with that prefix | the matching year |
| `position(m)` | `positionPhrase(m)` | `m.toFixed(1)` |
| `within(x)` | `near this lot (within X m)` and a `near` claim | `X` |
| `onLot(featureId)` | `on this lot` and an `on` claim | nothing |
| `link(url)` | the URL | `verbatim` |

Templates in `templates.ts` use only these slots. The pack therefore holds exactly the values a
sentence was built from, and the check below compares the rendered text with them. For `dates` and
`position`, the pack holds the numbers from the summary and the error, not from the phrase text, so
the check also catches a phrase that disagrees with its inputs.

### Sentence check

`checkSentence(text, pack): { ok: true } | { ok: false; reasons: string[] }` in
`web/src/evidence/sentences.ts`:

1. `findBannedWords(text)` must be empty.
2. Remove each `pack.verbatim` string from a working copy (longest first), and fail if a verbatim
   string contains a banned word.
3. Every token matching `[a-z][a-z0-9]*(_[a-z0-9]+)+` (snake-case with at least one underscore) must
   be in `pack.ids`; remove them.
4. Every remaining token matching `\d+(\.\d+)?` must be in `pack.numbers` as the exact string.

The check is a guard on the templates today, and is the check product rule 10 needs if generated
wording is ever added. `buildReport` runs it on every sentence; a failure makes the whole model
`failed` (requirement 11.4), because a partly checked report is worse than none.

### Uses that cannot be printed

If a `use` (or a water label) contains a banned word, the Report does not quote it. The finding
says: "A use printed on <source id> is recorded for a building {on this lot | near this lot
(within X m)}. Its wording is not reproduced in this report; see the source." Such uses are grouped
per source, not per text. The Studio warns the reviewer when this will happen (spec 04).

## Fixed copy

`copy.ts`, every string passing `findBannedWords` (test):

| Key | Text |
|---|---|
| `SCREENS_LINE` | Buried screens; it doesn't certify. |
| `TITLE` | The documented history of this place. |
| `NOT_RECONSTRUCTED` | Not reconstructed yet. |
| `COULD_NOT_PRODUCE` | This report could not be produced. |
| `RECORDS_CHANGED` | The records have changed since this link was made. This report uses the current records. |
| `CANNOT_CONDITION` | These records cannot tell you about present-day soil, water or structural condition. |
| `CANNOT_YEARS` (template) | They cover only the years of these records: <year ranges>. They say nothing about this place in other years. |
| `CANNOT_UTILITIES` | They do not show underground utilities. |
| `BEFORE_COLONIAL` | History before colonial maps is outside what these records cover. |
| `LAND_ACKNOWLEDGEMENT` | Supplied by the maintainer from an authoritative source, with its link (task 5.3). Not written by Buried. |
| `DIG_NOT_LOCATES` | Buried's maps are not utility locates. |
| `DIG_REQUEST` | Request locates through Ontario Dig Authority before you dig. |
| `ONTARIO_DIG_AUTHORITY_URL` | Confirmed by the maintainer (task 5.3). |
| `NEXT_WATER` | Ask your inspector to look for signs of past water, and ask the seller about basement water. The City of Toronto offers basement flooding protection subsidies. |
| `CITY_FLOOD_SUBSIDY_URL` | Confirmed by the maintainer (task 5.3). |
| `NEXT_LAND_USE` | If any of these uses was industrial or fuel-related, ask whether an environmental review exists before you dig. |
| `NEXT_STRUCTURES` | Mention these records to your structural engineer before underpinning or extending. |
| `WORKSPACE_LINE` | These findings come from work saved in this browser. They are not part of Buried's published records, and the share link does not include them. |

`<year ranges>` is the merged year ranges of the plate sources whose lot coverage is `reviewed` or
`mapped`, plus the aerials that cover the lot, written as `1911–1914, 1935, 1947`.

## Sources section

Every source id that appears in any finding, band or checked list, plus
`present_toronto_property_boundaries_2026`, `present_toronto_address_points_2026` (when the lot was
found by address) and `present_toronto_building_outlines_2026`, sorted by id. Each entry: id, title,
years, URL, licence note, attribution line. Then "Data version <first 12 hex characters>". A source
with `to_be_confirmed` attribution is never cited (spec 03 and spec 01 already keep it out).

## Links

- Share link: `<siteOrigin>/report?lot=<encodeURIComponent(lot id)>&era=<era id>&v=<12 hex>`.
  `era` defaults to the earliest era when absent.
- Live link: `<siteOrigin>/?lot=<lot id>&era=<era id>`.
- `links.ts` parses and formats both; unknown parameters are ignored; an unknown era falls back to
  the default; a malformed lot id gives "Not reconstructed yet.".
- `web/src/explorer/deepLink.ts` makes the Explorer route read `lot` and `era`: it pins the lot
  (`scene/focusLot` with `fly: true`, which the Player cuts to under reduced motion) and sets the
  depth to the era's index after the first `eraLoaded`. Spec 04's "View in Explorer" uses `era`.

## Workspace section

Built when the workspace has a published feature in range of the lot. It runs the same three
groups over workspace features only, with dates from linked sets over canon plus workspace (spec 04:
workspace sets never include canon features), and checked lists over workspace plate sources. It
has the `WORKSPACE_LINE`, and every feature in it carries spec 04's "Your workspace" label. The core
sample, the canon groups, the sources list's canon part and the share link are built from canon
inputs before the workspace is looked at, so nothing from the workspace can reach them.

The coverage check (requirement 3.1) uses spec 03's coverage area over canon plus workspace (spec
04 requirement 15.4). For a lot covered only by a workspace plate, the canon groups are "Not
covered" findings that list every canon plate source, and the workspace section holds what was
found.

## Views

- `ReportRoute.tsx`: loads data and the workspace, offers search, renders `ReportView`.
- `ReportPanel.tsx`: the same view in a side panel beside the Explorer or 2D map; follows the pinned
  lot; band activation calls back into the Explorer.
- `ReportView.tsx`: semantic HTML per requirement 16; status labels in text; dates, years, ids and
  error figures in IBM Plex Mono; Print button (`window.print()`); share link with a copy button.
- Theme (`report.tokens.css`), starting values, near-monochrome, to be checked for contrast (task
  4.4):

  | Token | Value | Use |
  |---|---|---|
  | `--report-paper` | `#FBFAF7` | Background |
  | `--report-ink` | `#1A1A18` | Text, solid badges |
  | `--report-ink-soft` | `#4D4C48` | Secondary text |
  | `--report-rule` | `#8E8D88` | Rules, outlines |

  No `lantern`, `water` or `fog`.

### Print

- `report.print.css` (`@media print`): hides app chrome, the Explorer and the panel frame; page
  margins 12 mm; Letter and A4 by the printer's page size.
- Type sizes in print: body 9.5 pt Inter, headings 11 to 14 pt Fraunces, dates and ids 9 pt Plex
  Mono, the sources and checked-records blocks 8 pt in two columns. See "Dependencies on other
  documents" for the conflict with the 16 px minimum.
- `printModel.ts`: `PRINT_FINDINGS_PER_GROUP = 2`, in the group order above; then
  "N more findings in this group are in the live report." Checked lists print on one line per
  finding. The workspace section prints with the same limit. The core sample, fixed sections and
  sources always print in full.
- Links print as their URL text.
- The limits are checked by the print test on the "busiest lot" fixture: the most features, longest
  uses and most sources the generators allow within the showcase area. If it does not fit one page,
  the limits or sizes here are changed and the reason recorded.

## Error handling

| Situation | Behaviour |
|---|---|
| No address match, no lot, lot outside coverage | "Not reconstructed yet." only. |
| Lot geometry invalid (`lotRelation` throws) | `failed`: "This report could not be produced." with the lot id. Logged. |
| A sentence fails `checkSentence` | `failed`, with the sentence and reasons logged. |
| `createFinding` throws `HonestyError` | `failed`. Never caught and continued. |
| Present layers missing or invalid | Route says "Lots are not available right now." |
| Evidence file left out by `loadData` | Report built from the rest; status line "Some records could not be read." listed in the panel. |
| Share link data version differs | `RECORDS_CHANGED` shown above the Report. |
| Unity not available | No effect; the Report never loads it. |

## Correctness properties

fast-check, at least 200 runs, over `web/src/report/testing/arbitraries.ts`: lots (rectangles,
L-shapes, multipolygons, with integer-metre coordinates near the origin), present layers, evidence
collections from spec 01's arbitraries (buildings and water, lines and polygons, linked sets,
conflicts, reviewed and mapped areas), registries, uses with random text (including inserted banned
words and numbers), workspace sets from spec 04's arbitraries, and data versions.

**R1. Every finding sentence has a source and no banned word.** For every input, every finding in
the model has at least one source id in the registry, and every sentence anywhere in the model has
an empty `findBannedWords` result. *(tech.md property 5; req 6.7, 11.4, 11.7)*

**R2. "On this lot" never appears when the shrink test fails.** For every input and every sentence:
if its text contains "on this lot", every claim is `on` and `lotRelation` of that feature and the
lot (recomputed independently) is `on`; if it contains "near this lot (within X m)", there is a
`near` claim with `withinM === X` that `lotRelation` confirms, and no claim in the sentence has a
larger `withinM`; and no sentence without an `on` claim contains "on this lot". Radius statements
in empty-group and band text ("at this lot or within 30 m") make no claim and never use either
phrase. *(tech.md property 3; req 6.3, 11.6)*

**R3. The same lot and evidence give the same report.** For every input, `buildReport` gives a
deep-equal model when called twice, when every input array is permuted, and with `Date`,
`Math.random` and `Intl` replaced by functions that throw. *(req 12.1, 12.2)*

**R4. "Nothing found" and "Not covered" list every record checked.** For every input, every
`nothing_found` and `not_covered` finding's checked list has exactly one entry per plate source in
the inputs, with that source's `year_from`, `year_to` and the coverage computed by
`coverage.ts`, and its text contains every one of those source ids and years. *(tech.md property 6;
req 7.2)*

**R5. "Nothing found" only where every clear record was checked.** For every input, a group has a
`nothing_found` finding only if every source listed as clear has `reviewed` coverage at that
group's radius; and the water group never has one. *(req 7.3, 7.4)*

**R6. Outside coverage there is nothing else.** For every lot that does not intersect the coverage
area with positive area, and every lot id not in the layer, the model is exactly
`{ kind: 'not_reconstructed', text: 'Not reconstructed yet.' }`. *(req 3.1)*

**R7. Bands never show a feature outside its era.** For every input and band, every feature id
behind the band's sentences is the id of an entry in `featuresForEra` for that era over canon.
*(tech.md property 1; req 5.4)*

**R8. Sentence check.** For every template and generated input, the rendered sentence passes
`checkSentence` with its own pack; and for every such sentence with a number, an id or a banned word
inserted that its pack does not hold, `checkSentence` fails. *(product rule 10; req 11.2, 11.3)*

**R9. Required parts, in order.** For every input inside coverage, the model's first sentence is
`SCREENS_LINE`, the sections appear in the order of requirement 4.1, `cannotTell` contains the
condition, years and utilities sentences and `BEFORE_COLONIAL`, and `beforeYouDig` contains both
dig sentences. *(product rules 6 and 7; req 4.1 to 4.3, 8.1, 9.1)*

**R10. The workspace never reaches canon parts.** For every canon and workspace input, the core
sample, the canon groups, the share link and the canon source entries contain no workspace feature
id or workspace source id, and are deep-equal to the model built with `workspace: null`.
*(req 14.4, 15.2)*

**R11. Share links round-trip.** For every lot id (any Unicode string), era id and data version,
parsing the formatted share link gives the same lot id, era id and 12-hex prefix, and the link has
no other parameter. *(req 14.1, 14.2)*

**R12. Print limits hide nothing silently.** For every model, each printed group shows the first
`min(n, PRINT_FINDINGS_PER_GROUP)` findings in order, and the "more findings" line appears exactly
when n exceeds the limit, with the count `n − PRINT_FINDINGS_PER_GROUP`. *(req 13.3)*

## Testing strategy

- Unit tests next to each pure module: lot coverage cases (each row of the table), radii edges
  (exactly at the radius), each template, each fixed string, the empty-group table, ordering.
- Example reports on synthetic fixtures: a lot with a 1911 and 1935 linked building gone by 1947
  (person-set aerial absence); one "Last seen 1935"; a conflicted set; water near the lot; water then
  a building on the lot; a use containing a banned word; a lot covered only by a workspace plate; a
  lot outside coverage. Source ids are the real plate ids; geometry is synthetic; no example states
  what stood on a real lot.
- Component tests (React Testing Library): heading structure, band activation in panel and route,
  Print button, share link copy, focus order.
- End-to-end (Playwright): open from the Explorer's pinned lot, from search, and from a share link;
  open with WebGL 2 disabled; print to PDF on Letter and A4 for the busiest fixture and a typical
  fixture, asserting one page each and no element overflowing the page box; axe scan on screen and
  with print media emulation.
- No test uses the network.

## Dependencies on other documents

| Document | Change needed | Effect until then |
|---|---|---|
| `tech.md` | PDF rendering decided: the browser's print-to-PDF from a print stylesheet; no server. | Nothing blocked. |
| `design.md` | The 16 px minimum body size applies on screen; print uses the sizes in "Print" so the Report fits one page. Record the Report tokens and their contrast results. | Print sizes here depart from `design.md` as written. |
| `sources.md` | A link-only row for the City of Toronto basement flooding protection subsidy page, like the Ontario Dig Authority row. | `CITY_FLOOD_SUBSIDY_URL` cannot be shown until it exists. |
| Spec 01 | A way to record that a reviewed area covers water as well as buildings (for example a `covers` list on `coverageArea`, schema 1.1.0). | Water history never says "Nothing found" (requirement 7.4). |
| Spec 03 | The Explorer reads `?lot=&era=` (task 6.1 here) and hosts the Report panel. | Code changes are tasks here. |
| Spec 04 | `mergeForDisplay` and `originOf`. | The workspace section waits for spec 04 task 9.2. |

## Decisions and reasons

- **Templates in code, no model, for the submission.** The brief requires it, and it lets the
  sentence check be a test of the templates rather than a filter on unpredictable text.
- **Browser print-to-PDF.** No server exists for the Report, `tech.md` leaves PDF rendering open,
  and a print stylesheet keeps one layout for screen and paper. The cost is less control over page
  breaks, which the one-page print test covers.
- **A failed sentence fails the whole Report.** Showing a report with a sentence removed would hide
  a fact without saying so.
- **Fixed radii.** Simple to explain ("within 30 m") and testable. They are screening distances, and
  the Report says "near this lot (within X m)" with the measured X, not the radius.
- **Finding status from feature confidence.** One vocabulary across scene, card, list and Report, as
  `design.md` asks, read conservatively.
- **Uses listed as printed, not classified.** Code deciding that a use was "industrial" would be a
  judgement the records do not make. The next step asks the reader and their professional to judge.
- **Water never "Nothing found".** A reviewed area attests buildings only, so the absence of a
  traced creek is not evidence of no creek.
- **Water then building is stated as two records.** "Fill" is an inference; the Report states what
  each record shows and puts it in the group whose next step asks a structural engineer.
- **Canon parts built before the workspace is read.** Separation by construction, so property R10
  holds by design and the share link always reproduces what a recipient will see.
- **Lot error 1.0 m by default.** From the brief. It may be optimistic for a parcel fabric; see the
  open question in the session reply.
