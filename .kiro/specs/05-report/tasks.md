# Tasks: 05 Report

Property-based test tasks are marked **[PBT]** and name the correctness property from `design.md`
they implement. A task is done only when its tests pass. Do not weaken a property to make it pass.

Dependencies:
- Spec 01: tasks 3, 5 to 9, 13 and 14 (loading, date logic, era lists, `lotRelation`, findings,
  banned words, linked sets, `positionPhrase`).
- Spec 02: task 10.5 (property boundaries, address points and building outlines present layers).
- Spec 03: tasks 1.1, 1.2 (Shell, data plugin), 9.1 (`search.ts`, `lots.ts`, `coverage.ts`), 11.1
  (2D map) and 11.3 (boundary test covering the Report route).
- Spec 04: task 9.2 (`mergeForDisplay`, `originOf`) for group 8 only. Groups 1 to 7 do not need
  spec 04.

Examples and fixtures use synthetic geometry. No test or fixture states what stood on a real lot.

- [ ] 1. Lot error, coverage and radii
  - [ ] 1.1 Check the `property-boundaries` package page, metadata and any readme on the City of
    Toronto CKAN portal (maintainer, when spec 02 task 10.5 retrieves the layer) for a stated
    positional accuracy. Record what was found, where and the date in design.md "Lot position
    error", and set the value by the rule there.
    Files: `.kiro/specs/05-report/design.md`.
    Requirements: 2.2.
  - [ ] 1.2 Implement `lotError.ts` (the constant and its reason), `radii.ts` and `coverage.ts` (the
    four lot coverage values per plate source and radius, aerial coverage per era). Example tests
    for each row of the coverage table, the 0.01 m tolerance, and features exactly at each radius.
    Files: `web/src/report/lotError.ts`, `web/src/report/radii.ts`, `web/src/report/coverage.ts`,
    `web/src/report/coverage.test.ts`, `web/src/report/testing/fixtures/**`.
    Requirements: 2.1 to 2.3, 3.2, 6.2.

- [ ] 2. Sentences
  - [ ] 2.1 Implement `checkSentence` and `SentencePack` in the Evidence Library per design.md
    "Sentence check", export them from `index.ts`, with example tests (source ids, feature ids,
    decimals, year ranges with an en dash, verbatim strings with digits, a banned word inside a
    verbatim string).
    Files: `web/src/evidence/sentences.ts`, `web/src/evidence/sentences.test.ts`,
    `web/src/evidence/index.ts`.
    Requirements: 11.3.
  - [ ] 2.2 Implement the `sentence` builder and its slots (`sentence.ts`), `templates.ts` and
    `copy.ts`. Test that every fixed string passes `findBannedWords` and that no fixed or template
    string contains "Built in", "±", "exactly" or "guaranteed".
    Files: `web/src/report/sentence.ts`, `web/src/report/templates.ts`, `web/src/report/copy.ts`,
    `web/src/report/sentence.test.ts`, `web/src/report/copy.test.ts`.
    Requirements: 11.1, 11.2, 11.5.
  - [ ] 2.3 Write the shared generators: lots, present layers, evidence with linked sets, conflicts,
    reviewed and mapped areas, water lines and polygons, uses with inserted banned words and digits.
    Files: `web/src/report/testing/arbitraries.ts`.
    Requirements: 17.1, 17.2.
  - [ ] 2.4 **[PBT] R8** Every template sentence passes its own check; inserted numbers, ids and
    banned words are always caught.
    Files: `web/src/report/sentence.property.test.ts`.
    Requirements: 11.2, 11.3.

- [ ] 3. Findings
  - [ ] 3.1 Implement `findings.ts`: linked-set relations, the three groups by design.md "Finding
    rules", conflicts, finding status, ordering, empty groups, uses that cannot be printed, next
    steps; every finding through spec 01's constructors. Example tests for each case listed in
    design.md "Testing strategy".
    Files: `web/src/report/findings.ts`, `web/src/report/findings.test.ts`.
    Requirements: 3.3, 6.1 to 6.7, 7.1 to 7.4, 11.7.
  - [ ] 3.2 **[PBT] R1** Every finding sentence has a source and no banned word.
    Files: `web/src/report/findings.property.test.ts`.
    Requirements: 6.7, 11.4, 11.7.
  - [ ] 3.3 **[PBT] R2** "On this lot" never appears when the shrink test fails.
    Files: `web/src/report/findings.property.test.ts`.
    Requirements: 6.3, 11.6.
  - [ ] 3.4 **[PBT] R4** "Nothing found" and "Not covered" list every record checked.
    Files: `web/src/report/findings.property.test.ts`.
    Requirements: 7.2.
  - [ ] 3.5 **[PBT] R5** "Nothing found" only where every clear record was checked; never for water.
    Files: `web/src/report/findings.property.test.ts`.
    Requirements: 7.3, 7.4.

- [ ] 4. The core sample, the whole model and links
  - [ ] 4.1 Implement `coreSample.ts` (Today band from building outlines; past bands from
    `featuresForEra`, coverage, uses, needs-review counts).
    Files: `web/src/report/coreSample.ts`, `web/src/report/coreSample.test.ts`.
    Requirements: 5.1 to 5.4.
  - [ ] 4.2 **[PBT] R7** Bands never show a feature outside its era.
    Files: `web/src/report/coreSample.property.test.ts`.
    Requirements: 5.4.
  - [ ] 4.3 Implement `links.ts` and `buildReport.ts` (order of work in design.md "Inputs and
    model", not-reconstructed and failed models, cannot-tell years, sources section, data version,
    records-changed line, `checkSentence` on every sentence).
    Files: `web/src/report/links.ts`, `web/src/report/buildReport.ts`,
    `web/src/report/buildReport.test.ts`, `web/src/report/links.test.ts`.
    Requirements: 3.1, 4.1 to 4.3, 8.1, 9.1, 10.1 to 10.3, 11.4, 12.1, 14.1 to 14.3.
  - [ ] 4.4 **[PBT] R3** The same lot and evidence give the same report.
    Files: `web/src/report/buildReport.property.test.ts`.
    Requirements: 12.1, 12.2.
  - [ ] 4.5 **[PBT] R6** Outside coverage there is nothing else.
    Files: `web/src/report/buildReport.property.test.ts`.
    Requirements: 3.1.
  - [ ] 4.6 **[PBT] R9** Required parts, in order.
    Files: `web/src/report/buildReport.property.test.ts`.
    Requirements: 4.1 to 4.3, 8.1, 9.1.
  - [ ] 4.7 **[PBT] R11** Share links round-trip.
    Files: `web/src/report/links.property.test.ts`.
    Requirements: 14.1, 14.2.

- [ ] 5. Views, theme and copy
  - [ ] 5.1 Implement `ReportView.tsx`, `Band.tsx`, `FindingItem.tsx` and `StatusBadge.tsx` (semantic
    structure, status and confidence by text and pattern, Plex Mono for dates and ids, Print button,
    share link copy), `report.tokens.css` and `report.css`. Component tests for headings, lists and
    focus order.
    Files: `web/src/report/ReportView.tsx`, `web/src/report/Band.tsx`,
    `web/src/report/FindingItem.tsx`, `web/src/report/StatusBadge.tsx`,
    `web/src/report/report.tokens.css`, `web/src/report/report.css`,
    `web/src/report/ReportView.test.tsx`.
    Requirements: 6.3, 13.4, 16.1 to 16.3.
  - [ ] 5.2 Implement `ReportRoute.tsx` (`/report`, data and workspace loading, search, share link
    parsing) and add the route to `App.tsx`.
    Files: `web/src/report/ReportRoute.tsx`, `web/src/App.tsx`, `web/src/report/ReportRoute.test.tsx`.
    Requirements: 1.1, 1.2, 14.2, 14.3.
  - [ ] 5.3 Look up and link-check the City of Toronto's land acknowledgement page and its basement
    flooding protection subsidy page (do not guess either URL), record both in `sources.md`'s
    link-only rows, and set `CITY_LAND_ACKNOWLEDGEMENT_URL` and `CITY_FLOOD_SUBSIDY_URL`; set
    `ONTARIO_DIG_AUTHORITY_URL` to `https://ontariodigauthority.ca/`. The maintainer approves the
    wording of `BEFORE_COLONIAL` and `LAND_ACKNOWLEDGEMENT_LINK` before submission. Then add a test
    that all three URLs are non-empty `https` URLs and that every string passes `findBannedWords`.
    Buried does not write a land acknowledgement.
    Files: `web/src/report/copy.ts`, `web/src/report/copy.test.ts`, `.kiro/steering/sources.md`.
    Requirements: 8.2, 9.1.
  - [ ] 5.4 WCAG contrast test on the Report tokens (4.5:1 text, 3:1 large text and rules). If a pair
    fails, report it; do not change a token without the maintainer.
    Files: `web/src/report/contrast.test.ts`.
    Requirements: 16.5.

- [ ] 6. The Report beside the Explorer
  - [ ] 6.1 Implement `web/src/explorer/deepLink.ts` and make the Explorer route read `?lot=&era=`
    (pin with `fly: true`; set the depth after the first `eraLoaded`). Spec 04's "View in Explorer"
    uses it.
    Files: `web/src/explorer/deepLink.ts`, `web/src/explorer/deepLink.test.ts`,
    `web/src/explorer/Explorer.tsx`.
    Requirements: 5.5.
  - [ ] 6.2 Implement `ReportPanel.tsx` beside the Explorer and the 2D map, following the pinned lot,
    with band activation setting the depth. Confirm spec 03's boundary test covers `/report` and
    `web/src/report/`.
    Files: `web/src/report/ReportPanel.tsx`, `web/src/explorer/Explorer.tsx`,
    `web/src/map/MapView2D.tsx`, `web/src/bridge/boundary.test.ts`.
    Requirements: 1.1, 1.3, 1.4, 5.5.

- [ ] 7. Print
  - [ ] 7.1 Implement `printModel.ts` and `report.print.css` per design.md "Print".
    Files: `web/src/report/printModel.ts`, `web/src/report/report.print.css`,
    `web/src/report/printModel.test.ts`.
    Requirements: 13.1 to 13.4.
  - [ ] 7.2 **[PBT] R12** Print limits hide nothing silently.
    Files: `web/src/report/printModel.property.test.ts`.
    Requirements: 13.3.
  - [ ] 7.3 End-to-end print test: PDF on Letter and A4 for the busiest and a typical fixture, one
    page each, no element outside the page box, sources and share link present. If it fails, change
    the limits or sizes in design.md "Print" and record why. Record `npm run test:e2e:report` in
    `.kiro/steering/tech.md`.
    Files: `web/e2e/reportPrint.spec.ts`, `web/e2e/fixtures/report/**`, `web/package.json`,
    `.kiro/steering/tech.md`.
    Requirements: 13.1, 13.2, 17.3.

- [ ] 8. The workspace section (needs spec 04 task 9.2)
  - [ ] 8.1 Build the workspace section per design.md "Workspace section", canon parts first, with
    the workspace line and labels; print it with the same limit.
    Files: `web/src/report/buildReport.ts`, `web/src/report/findings.ts`,
    `web/src/report/ReportView.tsx`, `web/src/report/buildReport.test.ts`.
    Requirements: 14.4, 15.1 to 15.3.
  - [ ] 8.2 **[PBT] R10** The workspace never reaches canon parts.
    Files: `web/src/report/workspace.property.test.ts`.
    Requirements: 14.4, 15.2.

- [ ] 9. Accessibility and independence end-to-end
  - [ ] 9.1 End-to-end: open the Report from the Explorer's pinned lot, from search and from a share
    link; open it with WebGL 2 disabled and with the Unity build missing; keyboard-only path through
    bands, Print and links; axe scan on screen and with print media emulation (no serious or
    critical violations).
    Files: `web/e2e/report.spec.ts`, `web/e2e/reportAccessibility.spec.ts`.
    Requirements: 1.1 to 1.4, 16.2, 16.4.

- [ ] 10. Final check
  - [ ] 10.1 Run `npm test`, `npm run typecheck`, `npm run test:e2e` and `npm run test:e2e:report` in
    `web/`. All pass. Confirm every property R1 to R12 has a passing test and the boundary test
    covers the Report.
    Files: none.
    Requirements: 17.1.

- [ ] 11. Session 007 changes (needs spec 01 tasks 16, 18 and 19)
  - [ ] 11.1 Set `LOT_POSITION_ERROR_M = 2.0` with its reason (or the dataset's figure by the rule in
    design.md "Lot position error", never below 2.0 m), and update the coverage and radii tests
    that assumed 1.0 m.
    Files: `web/src/report/lotError.ts`, `web/src/report/coverage.test.ts`.
    Requirements: 2.2.
  - [ ] 11.2 Use `reviewedAreaCovers` in `coverage.ts` and `findings.ts`: water "Nothing found" only
    where every clear source's reviewed areas at the lot cover water; the same for land-use areas.
    Update **[PBT] R5** to the new rule.
    Files: `web/src/report/coverage.ts`, `web/src/report/findings.ts`,
    `web/src/report/findings.property.test.ts`.
    Requirements: 7.3, 7.4.
  - [ ] 11.3 Include `land_use` features in the Past land use group ("an area", "N areas"), word
    source years with `sourceYearsText` through the `years` slot, and never show a material without
    an attribute read. Example tests with a synthetic land-use area and a 1931-35 source.
    Files: `web/src/report/findings.ts`, `web/src/report/sentence.ts`,
    `web/src/report/findings.test.ts`.
    Requirements: 18.1 to 18.3.
