# Requirements: 01 Evidence model

## Introduction

The evidence model is the contract that the pipeline, the web shell and Unity all read. This spec
defines:

- one JSON Schema for every contract file under `data/`;
- the source registry `data/sources.json`;
- the project file `data/project.json` (project origin and eras);
- a TypeScript library in `web/src/evidence/` that is the single implementation of the date logic
  and the honesty rules;
- a Python validator in `pipeline/` that checks every contract file against the schema and the
  cross-file rules.

Rules come from `.kiro/steering/evidence.md`, `product.md`, `structure.md` and `tech.md`. Where this
spec and the concept brief differ, the steering docs win.

## Glossary

- **Schema**: `data/schema/evidence.schema.json`, JSON Schema draft 2020-12.
- **Contract file**: any file under `data/` that the Schema describes: evidence files, the source
  registry, the project file, control point files, alignment records and tile sidecars.
- **Evidence file**: `data/evidence/<origin source id>.geojson`, one GeoJSON FeatureCollection.
- **Validator**: the Python command `buried validate` in `pipeline/buried_pipeline/validate/`.
- **Evidence Library**: the TypeScript modules in `web/src/evidence/`.
- **Clear presence / clear absence**: an observation with `visibility: clear` and `present: true`
  or `present: false`.
- **P, A**: a feature's clear presences and clear absences.
- **Evidence window, Built by, Last seen, Gone by, Not yet built at, conflict**: as defined in
  `evidence.md`, "Date logic".
- **Era**: an id, a label and a year range (`year_from`, `year_to`), stored in the project file.
- **Lot**: a polygon in EPSG:26917 with its own position error. Where lots come from is decided by
  the Report spec; this spec only takes a lot as input.

## Requirement 1: One schema for all contract files

**User story:** As a developer on any part of Buried, I want one schema that describes every
contract file, so that the pipeline, the shell and Unity cannot drift apart.

### Acceptance criteria

1.1 THE Schema SHALL be a single JSON Schema draft 2020-12 document at
`data/schema/evidence.schema.json`.

1.2 THE Schema SHALL define, under `$defs`, the shapes `featureCollection`, `feature`,
`observation`, `provenance`, `sourceRegistry`, `source`, `project`, `era`, `controlPoints`,
`alignmentRecord` and `tileSidecar`, and its root SHALL validate a `featureCollection`.

1.3 THE Schema SHALL state in its top-level `description` and in the `description` of every
coordinate definition that coordinates are EPSG:26917 (NAD83 / UTM zone 17N) metres, easting
first, and never longitude/latitude.

1.4 THE Schema SHALL require every contract file to carry a `schema_version` string in
`MAJOR.MINOR.PATCH` form.

1.5 WHEN the Schema changes, THE change SHALL bump `schema_version` in the Schema and in every
contract file it affects, in the same change.

1.6 THE Schema SHALL require every geometry position to have exactly two numbers, an easting in
the range 166000 to 834000 and a northing in the range 0 to 9400000, so that a lon/lat pair fails
validation.

## Requirement 2: Features

**User story:** As a reader of the Explorer or the Report, I want every building, water feature and
land-use area to carry its geometry, its error and its evidence, so that nothing is shown without
proof.

### Acceptance criteria

2.1 THE Schema SHALL define a feature as a GeoJSON Feature with an `id`, a `geometry` and
`properties` holding `kind`, `position_error_m`, `attributes`, `observations`, `confidence`,
`confidence_reason`, `provenance` and `status`.

2.2 THE Schema SHALL restrict `kind` to `building`, `water` and `land_use`, and SHALL require the
`id` to match `<bld|wtr|use>_<origin source id>_<4 digits>` with the prefix that matches `kind`.

2.3 THE Schema SHALL allow `Polygon` and `MultiPolygon` geometry for `building` and `land_use`
features, and `Polygon`, `MultiPolygon`, `LineString` and `MultiLineString` for `water` features.

2.4 THE Schema SHALL require `position_error_m` to be a number greater than 0.

2.5 THE Schema SHALL allow only the optional attributes `use` (string), `material` (string) and
`storeys` (integer, at least 1), and SHALL reject any other attribute key.

2.6 THE Schema SHALL restrict `status` to `published`, `rejected` and `merged`; WHEN `status` is
`merged`, THE Schema SHALL require `merged_into` (a feature id); WHEN `status` is `rejected`,
THE Schema SHALL require `status_reason`.

2.7 WHEN a feature has no `observations`, an empty `observations` array, or no
`position_error_m`, THE Validator SHALL reject the evidence file that contains it.

2.8 THE Evidence Library and every consumer SHALL treat only features with `status: published`
as drawable or reportable.

## Requirement 3: Observations and visibility

**User story:** As a researcher, I want each source's view of a feature recorded with how readable
it was, so that unclear sources never count as evidence.

### Acceptance criteria

3.1 THE Schema SHALL define an observation with `source` (a source id), `present` (boolean) and
`visibility` (`clear`, `obscured` or `not_covered`), plus an optional `note`.

3.2 THE Schema SHALL NOT store a year on an observation; THE Evidence Library SHALL take each
observation's `year_from` and `year_to` from its source in the source registry.

3.3 THE Validator SHALL reject a feature whose observations cite a source id that is not in
`data/sources.json`.

3.4 THE Validator SHALL reject a feature that has no clear presence from its origin source.

3.5 THE Validator SHALL reject a feature with two observations from the same source.

## Requirement 4: Confidence

**User story:** As a viewer, I want to know how sure Buried is about each feature and why.

### Acceptance criteria

4.1 THE Schema SHALL restrict `confidence` to `documented`, `estimated` and `unknown` and SHALL
require a non-empty `confidence_reason`.

4.2 WHEN a `building` feature has `confidence: documented`, THE Schema SHALL require
`attributes.storeys`, because "documented" means footprint and storeys were both read from a
source.

## Requirement 5: Provenance and position error

**User story:** As a reviewer, I want to know where each feature came from, who confirmed it and
how far off it may be.

### Acceptance criteria

5.1 THE Schema SHALL require `provenance` with `origin_source`, `crop_px` (integer `x`, `y`,
`width`, `height` in origin-source pixels, width and height at least 1), `alignment_error_m`
(greater than 0), `confirmed_by` (non-empty) and `confirmed_at` (RFC 3339 date-time), and SHALL
allow an optional `proposal_id` and `extraction_params_id`.

5.2 THE Validator SHALL reject a feature whose `provenance.origin_source` differs from the evidence
file's `origin_source`, or whose `id` does not contain that origin source id.

5.3 THE Validator SHALL reject a feature whose origin source has no alignment record at
`data/alignment/<origin source id>.json` with `status: measured`.

5.4 THE Validator SHALL reject a feature whose `position_error_m` is less than the
`alignment_error_m` in its origin source's alignment record, or less than its own
`provenance.alignment_error_m`.

5.5 THE Validator SHALL reject a feature whose `confirmed_at` is later than the time of
validation.

## Requirement 6: Source registry

**User story:** As the maintainer, I want every source registered once with its licence and
attribution, so that nothing uncredited reaches the app.

### Acceptance criteria

6.1 THE Schema SHALL define `data/sources.json` as a `sourceRegistry` with a `sources` array; each
source SHALL have `id`, `type`, `title`, `year_from`, `year_to`, `url`, `licence_note`,
`attribution_line`, `attribution_status` (`confirmed` or `to_be_confirmed`), `rights_checked_on`
(ISO 8601 date or null) and `held_out` (boolean).

6.2 THE Validator SHALL reject the registry if two sources share an id, if a source id does not
follow `structure.md`, or if `year_from` is greater than `year_to`.

6.3 IF an evidence file cites a source whose `attribution_status` is `to_be_confirmed`, THEN THE
Validator SHALL reject that evidence file.

6.4 THE registry SHALL mark `fip_v3_1935_232` with `held_out: true` and no other plate as held out.

6.5 THE registry SHALL contain only sources that already have a row in `.kiro/steering/sources.md`.
This is checked by review, not by code, because code does not read steering docs.

## Requirement 7: Project file and eras

**User story:** As the Explorer and the pipeline, I want one place that defines the project origin
and the eras, so that every part uses the same values.

### Acceptance criteria

7.1 THE Schema SHALL define `data/project.json` with `schema_version`, `crs` (the constant
`EPSG:26917`), `origin` (`easting`, `northing`), `bounds` (`min_e`, `min_n`, `max_e`, `max_n`) and
`eras` (an array of `era`).

7.2 THE origin SHALL be the centre of the union of the EPSG:26917 bounds of the four showcase
plates as reported by `buried inspect`, with each coordinate rounded down to a multiple of 100 m,
and SHALL be recorded with that derivation in the file's `origin_note`.

7.3 WHEN any evidence file has been published, THE origin SHALL NOT change except by a migration
spec.

7.4 THE eras at submission SHALL be `1911` (label "1911 (revised to 1914)", 1911 to 1914), `1935`
(1935 to 1935), `1947` (1947 to 1947) and `today`.

7.5 THE Validator SHALL reject a contract file with any coordinate outside the project `bounds`.

## Requirement 8: Python validator

**User story:** As the maintainer, I want one command that tells me whether `data/` is valid, so
that no bad evidence is committed.

### Acceptance criteria

8.1 THE Validator SHALL be run as `uv run buried validate` from `pipeline/`, SHALL check every
contract file under `data/` except `data/raw/`, `data/work/` and `data/schema/fixtures/`, and SHALL
accept explicit paths to check only those files.

8.2 THE Validator SHALL pick the `$defs` entry for each file from its path: `data/evidence/*.geojson`
as `featureCollection`, `data/sources.json` as `sourceRegistry`, `data/project.json` as `project`,
`data/control/*.json` as `controlPoints`, `data/alignment/*.json` as `alignmentRecord`,
`data/tiles/*.json` as `tileSidecar`.

8.3 THE Validator SHALL check each polygon with shapely and reject it if it is invalid, empty or
has zero area, and reject a line with zero length.

8.4 THE Validator SHALL reject a feature id that appears more than once across all evidence files.

8.5 WHEN validation fails, THE Validator SHALL print one line per error with the file path, the
feature id where there is one, the JSON pointer and the reason, and SHALL exit with a non-zero
status.

8.6 WHEN validation passes, THE Validator SHALL print the number of files and features checked and
exit with status 0.

8.7 THE Validator SHALL NOT compute dates, windows, conflicts or lot relations.

## Requirement 9: TypeScript loading and types

**User story:** As a shell developer, I want typed, validated evidence in TypeScript.

### Acceptance criteria

9.1 THE Evidence Library SHALL use TypeScript types generated from the Schema into
`web/src/evidence/types.generated.ts`, and a test SHALL fail if regenerating them changes the file.

9.2 WHEN the Evidence Library loads a contract file, THE Evidence Library SHALL validate it against
the Schema with Ajv (draft 2020-12) and SHALL reject it with the Ajv errors if it is invalid.

9.3 THE Python Validator and the Evidence Library SHALL give the same schema verdict on every file
under `data/schema/fixtures/valid/<def name>/` and `data/schema/fixtures/invalid/<def name>/`.

## Requirement 10: Date logic

**User story:** As a viewer, I want dates that never claim more than the sources show.

### Acceptance criteria

10.1 THE Evidence Library SHALL be the only implementation of the date logic in Buried. Unity, the
pipeline and any server SHALL receive its results and SHALL NOT recompute them.

10.2 THE Evidence Library SHALL compute, for each feature, Built by (minimum `year_to` over P),
Last seen (maximum `year_from` over P) and the evidence window (minimum `year_from` over P to
maximum `year_to` over P).

10.3 THE Evidence Library SHALL classify each clear absence as a before-absence (its `year_to` is
less than the window start), an after-absence (its `year_from` is greater than the window end) or a
conflict (neither).

10.4 WHEN a feature has before-absences, THE Evidence Library SHALL report Not yet built at the
maximum `year_from` over them; otherwise it SHALL leave the start open.

10.5 WHEN a feature has after-absences, THE Evidence Library SHALL report Gone by the minimum
`year_to` over them; otherwise it SHALL leave the vanished window open and report Last seen.

10.6 THE Evidence Library SHALL ignore `obscured` and `not_covered` observations when computing
dates, and SHALL keep them in the result as checked-but-not-counted.

10.7 IF a feature has no clear presence, THEN THE Evidence Library SHALL return a "no presence"
result with no window.

10.8 THE Evidence Library SHALL produce date phrases only of the forms "Built by YYYY",
"Not yet built at YYYY", "Last seen YYYY" and "Gone by YYYY", and SHALL NOT produce "Built in".

10.9 THE result of the date logic SHALL NOT depend on the order of observations.

## Requirement 11: Conflicts

**User story:** As a reviewer, I want sources that disagree flagged to me and never quietly
settled by code.

### Acceptance criteria

11.1 WHEN a clear absence overlaps the evidence window, THE Evidence Library SHALL mark the feature
as conflicted and list the conflicting observations.

11.2 THE Evidence Library SHALL NOT drop, reorder or reweight observations to remove a conflict,
and SHALL NOT let a conflicting absence change Built by, Last seen or the evidence window.

11.3 WHILE a feature is conflicted, THE Evidence Library SHALL leave it out of every per-era
feature list and SHALL list its id in that list's `needs_review`.

## Requirement 12: Drawn in era and per-era lists

**User story:** As the Explorer, I want a ready-made list of what to draw in each era.

### Acceptance criteria

12.1 THE Evidence Library SHALL treat a feature as drawn in an era only if the era's `year_from`
is at least the window start and the era's `year_to` is at most the window end.

12.2 THE Evidence Library SHALL provide a function that takes evidence collections, the source
registry and an era, and returns that era's feature list: each published, non-conflicted feature
drawn in the era, with id, kind, geometry (EPSG:26917), position error, confidence, confidence
reason, attributes, date result, date phrases and cited source ids, sorted by id.

12.3 THE per-era list SHALL be the payload the shell sends to Unity; Unity SHALL NOT filter it by
date.

12.4 THE Evidence Library SHALL NOT include a feature with no clear presence in any per-era list.

## Requirement 13: On this lot vs near this lot

**User story:** As a buyer reading a Report, I want "on this lot" only when the feature is on the
lot whatever its error.

### Acceptance criteria

13.1 THE Evidence Library SHALL compute lot relations in EPSG:26917 metres with
`e = feature position_error_m + lot position_error_m`.

13.2 WHEN the feature intersects the lot shrunk inward by `e` with positive area (polygons) or
positive length (lines), THE Evidence Library SHALL return "on this lot".

13.3 WHEN the feature does not meet 13.2, THE Evidence Library SHALL return "near this lot" with
X = ceiling(distance from feature to lot + `e`) in whole metres.

13.4 IF the lot shrunk by `e` is empty, THEN THE Evidence Library SHALL never return "on this lot"
for that lot.

13.5 THE inward buffer SHALL be computed so that its polygonal approximation of round joins never
leaves the shrunk lot larger than the exact one.

## Requirement 14: Findings and banned words

**User story:** As someone who may show a Report to an inspector or lawyer, I want every finding
sourced, labelled and free of words that overclaim.

### Acceptance criteria

14.1 THE Evidence Library SHALL define a finding with a status of `documented`, `estimated`,
`nothing_found` or `not_covered`, shown with the labels "Documented", "Estimated",
"Nothing found in these records" and "Not covered".

14.2 IF a finding would be created with no source id, or with a source id that is not in the
registry, THEN THE Evidence Library SHALL refuse to create it.

14.3 WHEN a `nothing_found` finding is created, THE Evidence Library SHALL require the list of
records checked and SHALL store, for each, the source id, `year_from`, `year_to` and visibility,
including `obscured` and `not_covered` records.

14.4 THE Evidence Library SHALL provide a banned-word check that finds "contaminated", "unsafe",
"safe", "clean" and "will flood" as whole words or phrases, case-insensitive, with any run of
whitespace inside "will flood".

14.5 IF a finding's text contains a banned word, THEN THE Evidence Library SHALL refuse to create
the finding.

## Requirement 15: Tests and tooling

**User story:** As the maintainer, I want the honesty rules proved by property tests and the
commands recorded where Kiro reads them.

### Acceptance criteria

15.1 Each correctness property in `design.md` SHALL have a property-based test: fast-check for the
Evidence Library, Hypothesis for the Validator.

15.2 Tests SHALL NOT use the network and SHALL use fixtures committed under `web/`, `pipeline/` or
`data/schema/fixtures/`.

15.3 WHEN this spec adds a command (web install, test, type generation, schema validation), THE
same change SHALL record it under "Commands" in `.kiro/steering/tech.md`.
