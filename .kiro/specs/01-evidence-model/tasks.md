# Tasks: 01 Evidence model

Property-based test tasks are marked **[PBT]** and name the correctness property from `design.md`
they implement. A task is done only when its tests pass. Do not weaken a property to make it pass.

Dependencies on spec 02:
- Task 4 needs the `pipeline/` package and CLI skeleton from spec 02 task 1.
- Task 10 needs `buried inspect` from spec 02 task 2 and the four plates downloaded.

Spec 02 tasks 1, 2, 10.1 to 10.4 and 3 (the gate) do not depend on this spec, so the Nov 14
alignment gate is not blocked by it.

- [x] 1. Write the Schema and its conformance fixtures
  - [x] 1.1 Write `data/schema/evidence.schema.json` (draft 2020-12) with `$defs` for
    `featureCollection` (root), `feature`, `observation`, `provenance`, `sourceRegistry`, `source`,
    `project`, `era`, `controlPoints`, `alignmentRecord`, `tileSidecar`, `link`, `coverageArea`,
    `presentLayer`, `presentFeature`, plus the common definitions (`schemaVersion`, `sourceId`,
    `featureId`, `position`, `date`, `dateTime`) exactly as in design.md "Data models", including
    observation `method`, `same_as`, `digitising_error_m`, per-point control references and the
    alignment error rule fields. Include the EPSG:26917 statements in the top-level and coordinate
    descriptions. Set `schema_version` to `1.0.0`.
    Files: `data/schema/evidence.schema.json`.
    Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 2.1 to 2.6, 3.1, 3.2, 4.1, 4.2, 5.1, 5.6, 6.1, 7.1,
    16.1 to 16.3, 17.1, 19.1, 19.2, 21.1, 21.2, 22.1.
  - [x] 1.2 Write conformance fixtures: at least one valid file per `$defs` entry, and one invalid
    file per rule the Schema enforces (no position error, zero position error, empty observations,
    lon/lat position, 3D position, id prefix not matching kind, line geometry on a building,
    documented building without storeys, merged without `merged_into`, rejected without
    `status_reason`, unknown attribute key, unknown visibility, `proposed` status, observation
    without `method`, person observation without `confirmed_by`, `match_auto` presence without
    `matched_feature`, person link without `confirmed_at`, reviewed area without `pixel_polygon`,
    building-corner control point without `reference_vertex`, alignment record with a different
    `error_rule`, present feature with a `LineString`). Name each invalid file after its reason.
    Geometry is synthetic rectangles near a placeholder point inside UTM 17N; no fixture describes
    a real building.
    Files: `data/schema/fixtures/valid/<def>/*.json`, `data/schema/fixtures/invalid/<def>/*.json`.
    Requirements: 9.3, 15.2.

- [x] 2. Create or check the source registry
  - [x] 2.1 If spec 02 task 1 has already created `data/sources.json`, check it against the
    `sourceRegistry` definition and fix only fields that differ from design.md. Otherwise create it
    with the four plate sources and the values in design.md "source and sourceRegistry"
    (`rights_checked_on: 2026-11-10`). Add the four present-day sources from `sources.md` with
    `rights_checked_on: 2026-11-12`; their `year_from` is set when spec 02 task 10 first reads the
    CKAN metadata. Add aerial records only for ids listed under "1947 aerial records in use" in
    `sources.md`.
    Files: `data/sources.json`.
    Requirements: 6.1, 6.4, 6.5, 6.7, 6.8.

- [ ] 3. Set up the web package, generated types and validated loading
  - [ ] 3.1 Create the minimal web package: TypeScript (strict), Vitest, fast-check, Ajv with
    `ajv-formats`, JSTS, `json-schema-to-typescript`. Scripts: `test` (`vitest run`), `typecheck`
    (`tsc --noEmit`), `gen:types`. No Vite app or React yet; spec 03 adds them to this package.
    Files: `web/package.json`, `web/tsconfig.json`, `web/vitest.config.ts`, `web/.gitignore`.
    Requirements: 15.2.
  - [ ] 3.2 Generate `web/src/evidence/types.generated.ts` from the Schema and add a test that
    regenerates into memory and fails if the output differs from the committed file.
    Files: `web/scripts/genTypes.ts`, `web/src/evidence/types.generated.ts`,
    `web/src/evidence/types.test.ts`.
    Requirements: 9.1.
  - [ ] 3.3 Implement `schema.ts`, `load.ts` and `sources.ts`. Loading validates with Ajv and
    throws `EvidenceLoadError` on failure. `indexSources` throws on duplicate ids.
    Files: `web/src/evidence/schema.ts`, `web/src/evidence/load.ts`, `web/src/evidence/sources.ts`,
    `web/src/evidence/load.test.ts`.
    Requirements: 9.2, 3.2.
  - [ ] 3.4 Add the TypeScript conformance test: every file under `data/schema/fixtures/valid/`
    passes and every file under `invalid/` fails for its `$defs` entry.
    Files: `web/src/evidence/conformance.test.ts`.
    Requirements: 9.3.
  - [ ] 3.5 Record the web commands (`npm install`, `npm test`, `npm run typecheck`,
    `npm run gen:types`, all run from `web/`) under "Commands" in `.kiro/steering/tech.md`.
    Files: `.kiro/steering/tech.md`.
    Requirements: 15.3.

- [x] 4. Build the Python Validator (needs spec 02 task 1)
  - [x] 4.1 Implement `schema.py`: load the Schema once, one `Draft202012Validator` per `$defs`
    entry with `FormatChecker`, and the path-to-definition map.
    Files: `pipeline/buried_pipeline/validate/__init__.py`,
    `pipeline/buried_pipeline/validate/schema.py`.
    Requirements: 8.2.
  - [x] 4.2 Implement `checks.py` as pure functions over parsed data: registry (duplicate ids, id
    form, year order), origin source and id match, observation sources registered, origin clear
    presence, one observation per source, alignment record present and measured, position error
    floor, `confirmed_at` not in the future (time passed in, not read from the clock inside the
    check), attribution status of cited sources, project bounds, duplicate feature ids, geometry
    validity with shapely, `merged_into` exists.
    Files: `pipeline/buried_pipeline/validate/checks.py`.
    Requirements: 2.7, 3.3, 3.4, 3.5, 5.2, 5.3, 5.4, 5.5, 6.2, 6.3, 7.5, 8.3, 8.4, 8.7.
  - [x] 4.3 Implement `run.py` and register `buried validate [PATH ...]` in the CLI. Print one line
    per error (path, feature id, JSON pointer, reason) and a summary; exit 1 on any error.
    Files: `pipeline/buried_pipeline/validate/run.py`, `pipeline/buried_pipeline/cli.py`.
    Requirements: 8.1, 8.5, 8.6.
  - [x] 4.4 Example tests for each cross-file check, using fixtures under `pipeline/tests/fixtures/validate/`
    (a small fake `data/` tree). Done as an in-memory fake tree built by
    `pipeline/tests/validate/builders.py` (no committed JSON), because the property tests mutate it.
    Files: `pipeline/tests/validate/test_checks.py`, `pipeline/tests/fixtures/validate/**`.
    Requirements: 2.7, 3.3 to 3.5, 5.2 to 5.5, 6.2, 6.3, 7.5, 8.3, 8.4.
  - [x] 4.5 Python conformance test over `data/schema/fixtures/`.
    Files: `pipeline/tests/validate/test_conformance.py`.
    Requirements: 9.3.
  - [x] 4.6 **[PBT] P13** Hypothesis: removing or zeroing `position_error_m`, emptying
    `observations`, or citing an unregistered source always yields an error for that feature id.
    Files: `pipeline/tests/validate/test_properties.py`, `pipeline/tests/validate/strategies.py`.
    Requirements: 2.4, 2.7, 3.3.
  - [x] 4.7 **[PBT] P14** Hypothesis: any position replaced by a lon/lat-range pair is rejected.
    Files: `pipeline/tests/validate/test_properties.py`.
    Requirements: 1.6.
  - [x] 4.8 **[PBT] P15** Hypothesis: a feature is accepted only if `position_error_m` is at least
    its origin source's `alignment_error_m`.
    Files: `pipeline/tests/validate/test_properties.py`.
    Requirements: 5.4.
  - [x] 4.9 Record `uv run buried validate` (run from `pipeline/`) as the schema validation command
    in `.kiro/steering/tech.md`.
    Files: `.kiro/steering/tech.md`.
    Requirements: 15.3.

- [ ] 5. Implement the date logic
  - [ ] 5.1 Implement `summariseDates` and `datePhrases` per design.md "DateSummary" and the rules
    in `evidence.md`. Sort every array so output is order-independent.
    Files: `web/src/evidence/dates.ts`.
    Requirements: 10.1 to 10.9, 11.1, 11.2.
  - [ ] 5.2 Write the shared fast-check generators (sources with year ranges, observations,
    features, rectangles, L-shaped lots).
    Files: `web/src/evidence/testing/arbitraries.ts`.
    Requirements: 15.1.
  - [ ] 5.3 Example tests: each phrase form; 1911-only, 1935-only, 1911 + 1935 with a clear 1947
    absence ("Gone by 1947"), 1911 + 1935 with an obscured 1947 observation ("Last seen 1935"),
    a before-absence, a conflict, no presence.
    Files: `web/src/evidence/dates.test.ts`.
    Requirements: 10.2 to 10.8, 11.1.
  - [ ] 5.4 **[PBT] P2** A vanish window is only closed by a clear absence.
    Files: `web/src/evidence/dates.property.test.ts`.
    Requirements: 10.5, 10.6.
  - [ ] 5.5 **[PBT] P3** Obscured and not-covered observations never change dates.
    Files: `web/src/evidence/dates.property.test.ts`.
    Requirements: 10.6.
  - [ ] 5.6 **[PBT] P4** Order independence.
    Files: `web/src/evidence/dates.property.test.ts`.
    Requirements: 10.9.
  - [ ] 5.7 **[PBT] P6** Phrases never say "Built in"; every year in a phrase comes from a cited
    source.
    Files: `web/src/evidence/dates.property.test.ts`.
    Requirements: 10.8.

- [ ] 6. Implement drawn-in-era and per-era lists
  - [ ] 6.1 Implement `isDrawnInEra` and `featuresForEra` per design.md "Eras": published only,
    conflicted features to `needsReview`, sorted output.
    Files: `web/src/evidence/eras.ts`, `web/src/evidence/eras.test.ts`.
    Requirements: 2.8, 11.3, 12.1 to 12.4.
  - [ ] 6.2 **[PBT] P1** A feature is never drawn outside its evidence window.
    Files: `web/src/evidence/eras.property.test.ts`.
    Requirements: 12.1.
  - [ ] 6.3 **[PBT] P5** Conflicts are flagged, never resolved (dates unchanged, feature in
    `needsReview`, absent from `features` in every era).
    Files: `web/src/evidence/eras.property.test.ts`.
    Requirements: 11.1, 11.2, 11.3.
  - [ ] 6.4 **[PBT] P12** Era lists are well-formed.
    Files: `web/src/evidence/eras.property.test.ts`.
    Requirements: 2.8, 12.2, 12.4.

- [ ] 7. Implement the lot relation
  - [ ] 7.1 Implement `lotRelation` with JSTS, including the `k = 1 / cos(π / (4q))` distance
    scaling for the inward buffer.
    Files: `web/src/evidence/lot.ts`, `web/src/evidence/lot.test.ts`.
    Requirements: 13.1 to 13.5.
  - [ ] 7.2 **[PBT] P7** "On this lot" survives any displacement within the error (include
    L-shaped lots).
    Files: `web/src/evidence/lot.property.test.ts`.
    Requirements: 13.2, 13.5.
  - [ ] 7.3 **[PBT] P8** "On this lot" never appears when the overlap is smaller than the error.
    Files: `web/src/evidence/lot.property.test.ts`.
    Requirements: 13.2, 13.4.
  - [ ] 7.4 **[PBT] P9** "Near" distance is an integer within one metre above distance plus error.
    Files: `web/src/evidence/lot.property.test.ts`.
    Requirements: 13.3.

- [ ] 8. Implement findings and the banned-word check
  - [ ] 8.1 Implement `text.ts` (`BANNED_WORDS`, `findBannedWords`, `HonestyError`) and
    `findings.ts` (`createFinding`, `createNothingFound`, the `not_covered` constructor,
    `statusLabel`, `checkedRecordsText`).
    Files: `web/src/evidence/text.ts`, `web/src/evidence/findings.ts`,
    `web/src/evidence/text.test.ts`, `web/src/evidence/findings.test.ts`.
    Requirements: 14.1 to 14.5.
  - [ ] 8.2 **[PBT] P10** Every finding has a source; banned words are always found and always
    refused.
    Files: `web/src/evidence/findings.property.test.ts`.
    Requirements: 14.2, 14.4, 14.5.
  - [ ] 8.3 **[PBT] P11** "Nothing found" lists every record and year range checked.
    Files: `web/src/evidence/findings.property.test.ts`.
    Requirements: 14.3.

- [ ] 9. Export the public API
  - [ ] 9.1 Export the library from `index.ts`. Nothing outside `web/src/evidence/` may import its
    internal modules directly.
    Files: `web/src/evidence/index.ts`.
    Requirements: 10.1.

- [ ] 10. Write the project file (needs spec 02 task 2 and the four plates)
  - [ ] 10.1 Run `uv run buried inspect --propose-origin` on the four showcase plates and write
    `data/project.json` with that origin, the bounds (union plus 250 m, rounded outward to 100 m),
    the `origin_note` stating the derivation and the date, and the four eras from design.md. This
    is a reviewed hand edit. After the first evidence file is published, the origin is frozen.
    Files: `data/project.json`.
    Requirements: 7.1 to 7.4, 7.6.

- [ ] 11. Final check (run after tasks 12 to 15 as well)
  - [ ] 11.1 Run `npm test` and `npm run typecheck` in `web/`, and `uv run pytest` and
    `uv run buried validate` in `pipeline/`. All pass. Confirm every property P1 to P21 has a
    passing test.
    Files: none.
    Requirements: 15.1.

- [x] 12. Validator checks added in session 002b (needs task 4)
  - [x] 12.1 Add to `checks.py`: observation method rules (origin observation, aerial
    clear/obscured only by a person, `match_auto` presence tied to a published, linked feature
    from the observation's source), link rules (target exists, published, same kind, not self,
    mirrored with the same method, no two members of a linked set from one origin source),
    coverage rules (reviewed areas inside the mapped area), the new position error floor and
    digitising floor, the alignment error rule and basis, present layer rules (registered,
    confirmed, unique ids, each feature intersects the bounds; exempt from 7.5), and control
    point references (layer exists, feature id exists, coordinate within 0.001 m, source allowed
    for the kind by the reference table). Map `data/present/*.geojson` to `presentLayer`.
    Files: `pipeline/buried_pipeline/validate/checks.py`, `pipeline/buried_pipeline/validate/schema.py`.
    Requirements: 5.4, 5.6, 7.5, 8.8, 16.4 to 16.6, 17.2, 17.3, 19.4, 20.1, 20.2, 21.3, 21.4,
    22.2, 22.3.
  - [x] 12.2 Example tests for each new check, extending the fake `data/` tree with a small present
    layer, a control file that cites it, two linked evidence files and a coverage area.
    Files: `pipeline/tests/validate/test_checks.py`, `pipeline/tests/fixtures/validate/**`.
    Requirements: as 12.1.
  - [x] 12.3 Update the **[PBT] P15** test from task 4.8 to the new floor (root-sum-square with
    the digitising term, rounded up to 0.1 m; digitising at least 2 source pixels).
    Files: `pipeline/tests/validate/test_properties.py`.
    Requirements: 5.4, 5.6.
  - [x] 12.4 **[PBT] P19** Code never reads a photograph: aerial clear or obscured observations
    without `method: person` are always rejected.
    Files: `pipeline/tests/validate/test_properties.py`, `pipeline/tests/validate/strategies.py`.
    Requirements: 16.5.
  - [x] 12.5 **[PBT] P20** Links are symmetric, point at published features, and never join two
    features with the same origin source.
    Files: `pipeline/tests/validate/test_properties.py`, `pipeline/tests/validate/strategies.py`.
    Requirements: 17.2, 17.3.
  - [x] 12.6 **[PBT] P21** The alignment error rule and its basis.
    Files: `pipeline/tests/validate/test_properties.py`, `pipeline/tests/validate/strategies.py`.
    Requirements: 20.1, 20.2.

- [ ] 13. Linked sets in the Evidence Library (needs tasks 5 and 6)
  - [ ] 13.1 Implement `links.ts` (`linkedSets`) and `summariseSet` in `dates.ts` per design.md
    "Linked sets". A set of one must give exactly `summariseDates`.
    Files: `web/src/evidence/links.ts`, `web/src/evidence/dates.ts`, `web/src/evidence/links.test.ts`.
    Requirements: 18.1, 18.2, 18.3, 18.7.
  - [ ] 13.2 Change `featuresForEra` to work per linked set with `drawnMember`, `linkedIds` and
    combined `sourceIds`, and conflicted sets to `needsReview`. Add the linked-set example tests
    from design.md "Testing strategy".
    Files: `web/src/evidence/eras.ts`, `web/src/evidence/eras.test.ts`.
    Requirements: 17.4, 18.4, 18.5, 18.6.
  - [ ] 13.3 Extend the shared generators with random `same_as` links between features from
    different origin sources, mirrored on both sides.
    Files: `web/src/evidence/testing/arbitraries.ts`.
    Requirements: 15.1.
  - [ ] 13.4 **[PBT] P16** Linking never widens a window.
    Files: `web/src/evidence/links.property.test.ts`.
    Requirements: 18.1, 18.3.
  - [ ] 13.5 **[PBT] P17** A linked set is drawn at most once, from the member the rule picks,
    whatever the input order.
    Files: `web/src/evidence/links.property.test.ts`.
    Requirements: 18.4, 18.5, 18.7.
  - [ ] 13.6 **[PBT] P18** Same-source disagreement inside a set is a conflict.
    Files: `web/src/evidence/links.property.test.ts`.
    Requirements: 18.2, 18.6.
  - [ ] 13.7 Rerun **[PBT] P1, P5 and P12** with linked generators enabled; they must still pass.
    Files: `web/src/evidence/eras.property.test.ts`.
    Requirements: 12.1, 11.3, 18.4.

- [ ] 14. Position wording
  - [ ] 14.1 Implement `positionPhrase` and its example tests; export it from `index.ts`.
    Files: `web/src/evidence/position.ts`, `web/src/evidence/position.test.ts`,
    `web/src/evidence/index.ts`.
    Requirements: 20.3, 20.4.

- [ ] 15. Banned word inflections
  - [ ] 15.1 Make sure `BANNED_WORDS` and the **[PBT] P10** generators include "safer", "safest",
    "cleaner" and "cleanest", and add example tests showing "safety" and "cleaning" pass. If task 8
    is already done, this is the change; otherwise task 8 builds it this way from the start.
    Files: `web/src/evidence/text.ts`, `web/src/evidence/text.test.ts`,
    `web/src/evidence/findings.property.test.ts`.
    Requirements: 14.4, 14.5.
