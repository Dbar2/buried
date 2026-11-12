# Requirements: 01 Evidence model

## Introduction

The evidence model is the contract that the pipeline, the web shell and Unity all read. This spec
defines:

- one JSON Schema for every contract file under `data/`;
- the source registry `data/sources.json`;
- the project file `data/project.json` (project origin and eras);
- the shape of the present-day layers under `data/present/` and of control points that cite them;
- links between features from different sources (`same_as`) and how linked features are dated;
- a TypeScript library in `web/src/evidence/` that is the single implementation of the date logic
  and the honesty rules;
- a Python validator in `pipeline/` that checks every contract file against the schema and the
  cross-file rules.

Rules come from `.kiro/steering/evidence.md`, `product.md`, `structure.md` and `tech.md`. Where this
spec and the concept brief differ, the steering docs win.

## Glossary

- **Schema**: `data/schema/evidence.schema.json`, JSON Schema draft 2020-12.
- **Contract file**: any file under `data/` that the Schema describes: evidence files, the source
  registry, the project file, control point files, alignment records, tile sidecars and
  present-day layers.
- **Evidence file**: `data/evidence/<origin source id>.geojson`, one GeoJSON FeatureCollection.
- **Validator**: the Python command `buried validate` in `pipeline/buried_pipeline/validate/`.
- **Evidence Library**: the TypeScript modules in `web/src/evidence/`.
- **Clear presence / clear absence**: an observation with `visibility: clear` and `present: true`
  or `present: false`.
- **P, A**: a feature's clear presences and clear absences.
- **Evidence window, Built by, Last seen, Gone by, Not yet built at, conflict**: as defined in
  `evidence.md`, "Date logic".
- **Era**: an id, a label and a year range (`year_from`, `year_to`), stored in the project file.
- **Lot**: a polygon in EPSG:26917 with its own position error. Lots come from the
  `present_toronto_property_boundaries_2026` layer; the lot's position error is set by the Report
  spec. This spec only takes a lot as input.
- **Present layer**: `data/present/<source id>.geojson`, a clipped present-day City of Toronto
  layer in EPSG:26917. Not evidence.
- **Linked set**: a connected group of published features joined by `same_as` links. A feature
  with no links is a set of one.
- **Method**: how an observation was made: `origin`, `match_auto` or `person`.
- **Out-of-sample RMSE (B)**: the RMSE of the chosen transform at control points it was not fitted
  to (spec 02 requirement 6.6).

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

1.7 THE Schema SHALL also define, under `$defs`, `link`, `coverageArea`, `presentLayer` and
`presentFeature` (requirements 17, 19 and 21).

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

2.5 THE Schema SHALL allow only the optional attributes `use` (string), `material` (string),
`storeys` (integer, at least 1) and, from schema 1.1.0, `street_number` (string, as printed), and
SHALL reject any other attribute key.

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

5.4 THE Validator SHALL reject a feature whose `position_error_m` is less than R, where R is the
root-sum-square of the `alignment_error_m` in its origin source's alignment record and the
feature's `provenance.digitising_error_m`, rounded up to the next 0.1 m; and SHALL reject a
feature whose `provenance.alignment_error_m` differs from the alignment record's
`alignment_error_m`.

5.5 THE Validator SHALL reject a feature whose `confirmed_at` is later than the time of
validation.

5.6 THE Schema SHALL require `provenance.digitising_error_m` (a number greater than 0), and THE
Validator SHALL reject a feature whose `digitising_error_m` is less than 2 times the
`source_pixel_size_m` in its origin source's alignment record.

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

6.7 THE registry SHALL record `rights_checked_on` as 2026-11-10 for the four showcase plates and
2026-11-12 for each 1947 aerial and each present-day source, with the licence notes and
attribution lines in `sources.md`, and `attribution_status: confirmed` for all of them. The two
1935 plates SHALL carry the 1935 attribution line and licence note from `sources.md` ("The 1935
edition"), and `year_from: 1931`, `year_to: 1935`.

6.8 THE registry SHALL hold the four present-day sources named in `sources.md` with type
`present_day_reference`; their `year_from` is the year of the dataset's last refresh and their
`year_to` is the retrieval year (checked by spec 02's `buried present`).

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
(label "1935", 1931 to 1935, because the plates read "January 1931, revised to May 1935"),
`1947` (1947 to 1947) and `today`.

7.5 THE Validator SHALL reject a contract file with any coordinate outside the project `bounds`,
except present layers (requirement 21.4).

7.6 THE project `bounds` SHALL be the union of the four showcase plates' EPSG:26917 bounds,
expanded by 250 m on every side and then rounded outward to multiples of 100 m. The origin rule in
7.2 is unchanged.

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

8.8 THE Validator SHALL check `data/present/*.geojson` as `presentLayer`.

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
"safe", "safer", "safest", "clean", "cleaner", "cleanest" and the phrase "will flood" as whole
words, case-insensitive, with any run of whitespace inside "will flood". A word counts as whole
when no letter comes directly before or after it, so "safety" is allowed and "clean-up" is
caught.

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

## Requirement 16: How each observation was made

**User story:** As a reviewer, I want to know whether an observation came from the source the
feature was read from, from a geometry rule, or from a named person, so that I can trust "Gone by"
and trace every claim.

### Acceptance criteria

16.1 THE Schema SHALL require every observation to carry `method`: `origin`, `match_auto` or
`person`.

16.2 WHEN `method` is `person`, THE Schema SHALL require `confirmed_by` (non-empty) and
`confirmed_at` (RFC 3339 date-time).

16.3 WHEN `method` is `match_auto` and `present` is true, THE Schema SHALL require
`matched_feature` (a feature id).

16.4 THE Validator SHALL reject an observation with `method: origin` whose source is not the
feature's origin source, and a feature whose origin-source observation does not have
`method: origin`.

16.5 THE Validator SHALL reject an observation from an `aerial_photograph` source with visibility
`clear` or `obscured` unless its `method` is `person`, or unless it is the origin observation of a
feature a person traced from that aerial (requirement 27).

16.6 THE Validator SHALL reject a `match_auto` presence whose `matched_feature` does not exist, is
not published, is not in this feature's `same_as`, or has an origin source different from the
observation's source.

## Requirement 17: Linked features

**User story:** As a researcher, I want a building drawn on both the 1911 and 1935 plates to be
recognised as one building without losing either plate's provenance.

### Acceptance criteria

17.1 THE Schema SHALL allow an optional `same_as` on a feature: an array of links, each with
`feature` (a feature id), `method` (`match_auto` or `person`) and, when `method` is `person`,
`confirmed_by` and `confirmed_at`.

17.2 THE Validator SHALL reject a link to a feature that does not exist, to the feature itself,
to a feature of a different `kind`, or to a feature that is not published, and a link that is not
mirrored by a link back from the target with the same `method`.

17.3 THE Validator SHALL reject a linked set that contains two members with the same origin source,
because two features on one source are a merge, not a link.

17.4 Linking SHALL NOT change any member's id, geometry, attributes, confidence, provenance or
status.

## Requirement 18: Dates and eras for linked sets

**User story:** As a viewer, I want a building seen on two plates dated from both, drawn once per
era, and never given a longer life than the sources show.

### Acceptance criteria

18.1 THE Evidence Library SHALL compute one DateSummary per linked set from the union of its
members' observations, taking each source once, and SHALL give every member that summary.

18.2 IF two members of a linked set carry observations from the same source that differ in
`present` or `visibility`, THEN THE Evidence Library SHALL mark the set as conflicted and list both
observations in `conflicts`.

18.3 THE Evidence Library SHALL NOT let linking widen a set's evidence window beyond the minimum
`year_from` and the maximum `year_to` over the clear presences in the union of its members'
observations.

18.4 THE per-era feature list SHALL contain at most one entry per linked set. The entry SHALL carry
the geometry, attributes, confidence and position error of one member, chosen in this order: the
member whose origin source's year range contains the era's range; else the member whose origin
source has the greatest `year_to` that is not after the era's `year_from`; else the member whose
origin source has the smallest `year_from`; ties broken by the smallest feature id.

18.5 THE per-era entry SHALL list every member id in `linkedIds`, sorted, and its `sourceIds` SHALL
include every source cited by any member.

18.6 WHILE a linked set is conflicted, THE Evidence Library SHALL leave it out of every per-era
feature list and SHALL list every member id in `needsReview`.

18.7 THE result SHALL NOT depend on the order of features, links or observations.

## Requirement 19: Coverage of an evidence file

**User story:** As the matching step, I want to know where a plate draws the ground and where a
person has checked that every building on it was published, so that absence is only read where
the record is complete.

### Acceptance criteria

19.1 THE Schema SHALL allow on a `featureCollection` an optional `mapped_area` and an optional
`reviewed_areas` array, each a `coverageArea`: a `Polygon` or `MultiPolygon` in EPSG:26917 with a
`method`.

19.2 THE `mapped_area` SHALL have `method` `neatline` or `raster_footprint`. Each reviewed area
SHALL have `method: person`, `confirmed_by`, `confirmed_at` and `pixel_polygon` (integer pixel
vertices on the origin source).

19.3 A reviewed area SHALL mean that the person named attests that every building the origin source
draws inside it is published in this file.

19.4 THE Validator SHALL reject a reviewed area that is not inside the file's `mapped_area`
(allowing 0.01 m for rounding), or a file with reviewed areas and no `mapped_area`.

## Requirement 20: Position error composition and wording

**User story:** As a reader, I want the position error to mean the same thing everywhere and be
worded so it is not mistaken for a guarantee.

### Acceptance criteria

20.1 THE Validator SHALL reject an alignment record whose `alignment_error_m` is not
`max(error_rule.floor_m, error_rule.multiplier × error_basis_m)` rounded up to the next
`error_rule.round_up_to_m`, or whose rule constants are not `floor_m: 2.0`, `multiplier: 2.0` and
`round_up_to_m: 0.1`.

20.2 THE Validator SHALL reject an alignment record whose `error_basis_m` is not the stored
supplied RMSE when `chosen` is `supplied`, or the stored refined leave-one-out RMSE when `chosen`
is `refined`.

20.3 THE Evidence Library SHALL provide `positionPhrase(positionErrorM)` returning
"Positioned within about X m", with X written with one decimal place.

20.4 THE Evidence Library SHALL be the only place that words a position error; it SHALL NOT produce
"±", "exactly" or "guaranteed" in any position wording.

## Requirement 21: Present-day layers

**User story:** As the shell and the pipeline, I want the present-day City of Toronto layers in the
same coordinates and with the same checks as everything else.

### Acceptance criteria

21.1 THE Schema SHALL define `presentLayer` as a GeoJSON-shaped FeatureCollection with
`schema_version`, `crs` (`EPSG:26917`), `source` (a source id), `ckan_package_id`,
`ckan_resource_id`, `resource_url`, `retrieved_at`, `last_refreshed`, `source_sha256`,
`id_field`, `clip_bounds`, `attribution_line` and `features`.

21.2 THE Schema SHALL define `presentFeature` with a string `id` (the dataset's own feature id), a
`Point`, `Polygon` or `MultiPolygon` geometry made of `position`s, and `properties` whose values are
strings, numbers, booleans or null.

21.3 THE Validator SHALL reject a present layer whose source is not registered as
`present_day_reference` with `attribution_status: confirmed`, or that has two features with the
same `id`.

21.4 THE Validator SHALL reject a present layer feature that does not intersect the project
`bounds`. Coordinates of a feature that crosses the bounds may lie outside them.

21.5 THE Evidence Library and every consumer SHALL NOT treat present layer features as evidence
features: they carry no observations and never pass through the date logic.

## Requirement 22: Control points that cite present-day features

**User story:** As the maintainer, I want every control point to name the present-day feature it
was taken from, so that a reviewer can check it and the alignment can be remeasured.

### Acceptance criteria

22.1 THE Schema SHALL require each control point to carry `reference_source`, `reference_kind`
(`intersection` or `building_corner`) and `reference_feature_id`, and SHALL require
`reference_vertex` (`polygon` and `vertex` indexes into the exterior rings) when `reference_kind`
is `building_corner`.

22.2 THE Validator SHALL reject a control point whose `reference_source` has no present layer under
`data/present/`, whose `reference_feature_id` is not in that layer, or whose `reference` coordinate
is more than 0.001 m from the cited intersection point or building vertex.

22.3 THE Validator SHALL reject a control point whose `reference_source` is not listed for its
`reference_kind` in the reference table in design.md (intersections layers for `intersection`,
building outline layers for `building_corner`).

## Requirement 23: Schema 1.1.0

**User story:** As the maintainer, I want the changes from Kiro sessions 005 and 007 made as one
reviewed schema version, so that every contract file says which rules it follows.

The real plates showed three things the 1.0.0 schema did not allow for: greyscale scans (no colour
classes, so a material can only come from lettering), a 1935 edition that is really 1931 revised to
1935 and held by a second archive, and plate photographs whose margins hold archive labels and a
ruler. Session 005 also listed changes the Studio needs.

### Acceptance criteria

23.1 THE Schema SHALL move to `schema_version` `1.1.0`, and THE same change SHALL set `1.1.0` in
every committed contract file (requirement 1.5).

23.2 Every addition in requirements 24 to 31 SHALL be optional or have a stated default, so that a
1.0.0 file differs from a valid 1.1.0 file only in its `schema_version`, except where a
requirement below says otherwise.

23.3 THE conformance fixtures SHALL gain a valid and an invalid file for each rule added in
requirements 24 to 31, and both validators SHALL give the same verdict on them (requirement 9.3).

## Requirement 24: Source years for display, and the 1935 edition

**User story:** As a viewer, I want the evidence card to say "1931, revised to 1935" where a plate
says so, while the era is still called "1935".

### Acceptance criteria

24.1 THE Schema SHALL allow an optional `years_label` string on a `source`, used for display only.
THE date logic SHALL NOT read it.

24.2 THE Validator SHALL reject a `years_label` that does not contain both `year_from` and
`year_to` as four-digit numbers (one of them when they are equal), so the label can never state a
year the record does not.

24.3 THE registry SHALL record `fip_v3_1911_229` and `fip_v3_1911_232` with
`years_label: "1911, revised to 1914"`, and `fip_v3_1935_229` and `fip_v3_1935_232` with
`year_from: 1931`, `year_to: 1935` and `years_label: "1931, revised to 1935"`.

24.4 THE Schema SHALL allow an optional `holding` string on a `source` naming the institution that
holds the original when it differs from the distributor. THE 1935 plates SHALL have
`holding: "Library and Archives Canada, National Map Collection, NMC-0013999"`.

## Requirement 25: Attributes read from a source, with their crop

**User story:** As a reviewer, I want every material, storey count, use and street number to say
where on the plate it was read and by whom, so that a grey tone is never passed off as a material.

### Acceptance criteria

25.1 THE Schema SHALL allow on `provenance` an optional `attribute_reads` array. Each read SHALL
have `attribute` (`use`, `material`, `storeys` or `street_number`), `crop_px` (integer pixel
rectangle on the origin source), `read_by` (`person` or `label_assist`), `confirmed_by` and
`confirmed_at`; and, when `read_by` is `label_assist`, `provider` and `model_id`.

25.2 THE Validator SHALL reject a feature that has `attributes.material` and no `attribute_reads`
entry for `material`, and a feature with more than one read for the same attribute.

25.3 THE Validator SHALL reject an `attribute_reads` entry for an attribute the feature does not
have.

25.4 THE Schema SHALL allow on `provenance` an optional `tone_class` (`light`, `mid`, `dark`,
`hatched` or `mixed`): the fill tone extraction observed on the scan. It is a fact about the
image, not an attribute, and no consumer SHALL present it as a material.

## Requirement 26: Alignment records without supplied georeferencing

**User story:** As a Studio visitor with an un-georeferenced scan, I want an alignment record from my
own control points alone.

### Acceptance criteria

26.1 THE Schema SHALL make `alignmentRecord.supplied` optional WHEN `chosen` is `refined`, and
SHALL require it WHEN `chosen` is `supplied`.

26.2 WHEN `supplied` is absent, THE Validator SHALL require `error_basis: refined_loo_rmse`.

## Requirement 27: Features a person traced from an aerial photograph

**User story:** As a reviewer, I want to trace a building that only the 1947 aerial shows.

### Acceptance criteria

27.1 THE Validator SHALL accept an observation with `method: origin`, `present: true` and
`visibility: clear` from an `aerial_photograph` source WHEN that source is the feature's origin
source.

27.2 THE Schema SHALL NOT allow `method: origin` with `present: false`, and THE Validator SHALL
keep rejecting `match_auto` aerial observations other than `not_covered`.

## Requirement 28: What a reviewed area attests

**User story:** As the Report, I want to know when a person has checked an area for water as well as
for buildings, so that "Nothing found" can be said for water where it is true.

### Acceptance criteria

28.1 THE Schema SHALL allow an optional `covers` array on a reviewed area, with unique items from
`building`, `water` and `land_use`, at least one item.

28.2 A reviewed area without `covers` SHALL mean `["building"]`, and every consumer SHALL read it
that way.

28.3 A reviewed area with `covers` containing a kind SHALL mean that the person named attests that
every feature of that kind the origin source draws inside it is published in this file.

## Requirement 29: Map area of a plate

**User story:** As the maintainer, I want the part of each plate image that is map content set once
by a person, so that margins, title blocks, archive labels and rulers never become buildings,
tiles or coverage.

### Acceptance criteria

29.1 THE Schema SHALL define `mapArea` for `data/control/map_area/<source id>.json`: `schema_version`,
`source`, `pixel_convention` (`gdal_corner`), `pixel_polygon` (integer vertices, at least 4, one
simple polygon), `excluded` (a non-empty description of what lies outside it, for example "margin,
title block, archive labels, ruler"), an optional `fold_lines` array (integer pixel polylines a
person marked where the paper was folded), `confirmed_by` and `confirmed_at`.

29.2 THE Validator SHALL map `data/control/map_area/*.json` to `mapArea`, and SHALL reject a map
area whose source is not registered, whose file name is not its source id, or whose polygon is
invalid. (Whether the polygon lies inside the raster is checked by the pipeline, which has the
raster; requirement 16 of spec 02.)

29.3 THE Schema SHALL add `map_area` to the `method` values of `mapped_area`. A `mapped_area` with
`method: map_area` is the map area polygon through the source's chosen transform.

29.4 WHEN a plate has a map area file, THE Validator SHALL reject that plate's evidence file if its
`mapped_area` method is not `map_area`.

## Requirement 30: Where the alignment was measured

**User story:** As a reviewer, I want to know where on a plate its error figure was measured, so
that I am warned when a building lies where no control point reached.

### Acceptance criteria

30.1 THE Schema SHALL allow on `alignmentRecord` an optional `control_hull`: a `Polygon` in
EPSG:26917, the convex hull of the control points' `reference` positions, with
`control_hull_area_m2`.

30.2 THE Validator SHALL reject a `control_hull` that is not the convex hull of the record's
control points within 0.01 m.

30.3 `control_hull` SHALL be required in every alignment record written by `align-check` after this
change; the Validator SHALL accept a record without it only while its `schema_version` is `1.0.0`.

## Requirement 31: Tiles that show the map area, and the full photograph

**User story:** As a viewer, I want the draped plate to show map content only, and the Sources page
to show the whole photograph with its archive labels, so that nothing about its origin is hidden.

### Acceptance criteria

31.1 THE Schema SHALL allow on `tileSidecar` an optional `crop_px` (the full-resolution pixel
rectangle the tile covers) and `map_area` (the map area polygon in EPSG:26917); both SHALL be
present when the source has a map area file.

31.2 THE Schema SHALL allow on `tileSidecar` an optional `full_image` (file name next to the
sidecar) with `full_width_px` and `full_height_px`: a downsampled copy of the whole raster for the
Sources page, never draped.

31.3 THE Validator SHALL reject a sidecar whose corners are not the chosen transform applied to the
corners of `crop_px` (within 0.01 m) when `crop_px` is present.
