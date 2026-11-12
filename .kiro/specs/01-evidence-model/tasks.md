# Tasks: 01 Evidence model

Property-based test tasks are marked **[PBT]** and name the correctness property from `design.md`
they implement. A task is done only when its tests pass. Do not weaken a property to make it pass.

Dependencies on spec 02:
- Task 4 needs the `pipeline/` package and CLI skeleton from spec 02 task 1.
- Task 10 needs `buried inspect` from spec 02 task 2 and the four plates downloaded.

Spec 02 tasks 1 to 3 do not depend on this spec, so the Nov 14 alignment gate is not blocked by it.

- [ ] 1. Write the Schema and its conformance fixtures
  - [ ] 1.1 Write `data/schema/evidence.schema.json` (draft 2020-12) with `$defs` for
    `featureCollection` (root), `feature`, `observation`, `provenance`, `sourceRegistry`, `source`,
    `project`, `era`, `controlPoints`, `alignmentRecord`, `tileSidecar`, plus the common
    definitions (`schemaVersion`, `sourceId`, `featureId`, `position`, `date`, `dateTime`) exactly
    as in design.md "Data models". Include the EPSG:26917 statements in the top-level and
    coordinate descriptions. Set `schema_version` to `1.0.0`.
    Files: `data/schema/evidence.schema.json`.
    Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 2.1 to 2.6, 3.1, 3.2, 4.1, 4.2, 5.1, 6.1, 7.1.
  - [ ] 1.2 Write conformance fixtures: at least one valid file per `$defs` entry, and one invalid
    file per rule the Schema enforces (no position error, zero position error, empty observations,
    lon/lat position, 3D position, id prefix not matching kind, line geometry on a building,
    documented building without storeys, merged without `merged_into`, rejected without
    `status_reason`, unknown attribute key, unknown visibility, `proposed` status). Name each
    invalid file after its reason. Geometry is synthetic rectangles near a placeholder point
    inside UTM 17N; no fixture describes a real building.
    Files: `data/schema/fixtures/valid/<def>/*.json`, `data/schema/fixtures/invalid/<def>/*.json`.
    Requirements: 9.3, 15.2.

- [ ] 2. Create or check the source registry
  - [ ] 2.1 If spec 02 task 1 has already created `data/sources.json`, check it against the
    `sourceRegistry` definition and fix only fields that differ from design.md. Otherwise create it
    with the four plate sources and the values in design.md "source and sourceRegistry". Add no
    aerial records until their ids are agreed in `sources.md`.
    Files: `data/sources.json`.
    Requirements: 6.1, 6.4, 6.5.

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

- [ ] 4. Build the Python Validator (needs spec 02 task 1)
  - [ ] 4.1 Implement `schema.py`: load the Schema once, one `Draft202012Validator` per `$defs`
    entry with `FormatChecker`, and the path-to-definition map.
    Files: `pipeline/buried_pipeline/validate/__init__.py`,
    `pipeline/buried_pipeline/validate/schema.py`.
    Requirements: 8.2.
  - [ ] 4.2 Implement `checks.py` as pure functions over parsed data: registry (duplicate ids, id
    form, year order), origin source and id match, observation sources registered, origin clear
    presence, one observation per source, alignment record present and measured, position error
    floor, `confirmed_at` not in the future (time passed in, not read from the clock inside the
    check), attribution status of cited sources, project bounds, duplicate feature ids, geometry
    validity with shapely, `merged_into` exists.
    Files: `pipeline/buried_pipeline/validate/checks.py`.
    Requirements: 2.7, 3.3, 3.4, 3.5, 5.2, 5.3, 5.4, 5.5, 6.2, 6.3, 7.5, 8.3, 8.4, 8.7.
  - [ ] 4.3 Implement `run.py` and register `buried validate [PATH ...]` in the CLI. Print one line
    per error (path, feature id, JSON pointer, reason) and a summary; exit 1 on any error.
    Files: `pipeline/buried_pipeline/validate/run.py`, `pipeline/buried_pipeline/cli.py`.
    Requirements: 8.1, 8.5, 8.6.
  - [ ] 4.4 Example tests for each cross-file check, using fixtures under `pipeline/tests/fixtures/validate/`
    (a small fake `data/` tree).
    Files: `pipeline/tests/validate/test_checks.py`, `pipeline/tests/fixtures/validate/**`.
    Requirements: 2.7, 3.3 to 3.5, 5.2 to 5.5, 6.2, 6.3, 7.5, 8.3, 8.4.
  - [ ] 4.5 Python conformance test over `data/schema/fixtures/`.
    Files: `pipeline/tests/validate/test_conformance.py`.
    Requirements: 9.3.
  - [ ] 4.6 **[PBT] P13** Hypothesis: removing or zeroing `position_error_m`, emptying
    `observations`, or citing an unregistered source always yields an error for that feature id.
    Files: `pipeline/tests/validate/test_properties.py`, `pipeline/tests/validate/strategies.py`.
    Requirements: 2.4, 2.7, 3.3.
  - [ ] 4.7 **[PBT] P14** Hypothesis: any position replaced by a lon/lat-range pair is rejected.
    Files: `pipeline/tests/validate/test_properties.py`.
    Requirements: 1.6.
  - [ ] 4.8 **[PBT] P15** Hypothesis: a feature is accepted only if `position_error_m` is at least
    its origin source's `alignment_error_m`.
    Files: `pipeline/tests/validate/test_properties.py`.
    Requirements: 5.4.
  - [ ] 4.9 Record `uv run buried validate` (run from `pipeline/`) as the schema validation command
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
    `data/project.json` with that origin, the bounds, the `origin_note` stating the derivation and
    the date, and the four eras from design.md. This is a reviewed hand edit. After the first
    evidence file is published, the origin is frozen.
    Files: `data/project.json`.
    Requirements: 7.1 to 7.4.

- [ ] 11. Final check
  - [ ] 11.1 Run `npm test` and `npm run typecheck` in `web/`, and `uv run pytest` and
    `uv run buried validate` in `pipeline/`. All pass. Confirm every property P1 to P15 has a
    passing test.
    Files: none.
    Requirements: 15.1.
