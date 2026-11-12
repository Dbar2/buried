# Design: 01 Evidence model

## Overview

Three pieces share one schema:

```
                 data/schema/evidence.schema.json  (draft 2020-12, one file, $defs per shape)
                    │                       │
     ┌──────────────┘                       └───────────────┐
     ▼                                                      ▼
pipeline/buried_pipeline/validate/               web/src/evidence/
  jsonschema + shapely + cross-file checks         Ajv validation on load
  `uv run buried validate`                         generated types
  (gate for everything written to data/)           date logic, eras, lot relation,
                                                   findings, banned words
                                                   (single implementation)
                                                            │
                                                            ▼
                                             per-era feature lists ──bridge──► Unity
                                             findings ─────────────────────► Report (later spec)
```

- The pipeline writes contract files and validates them. It never computes dates.
- The Evidence Library reads contract files, validates them on load (trust boundary) and computes
  every derived fact. Unity and the Report consume its outputs.
- Unity reads nothing from `data/` directly for dates or confidence. It receives per-era lists
  over the bridge (the bridge schema is spec 03's).

## Files

| Path | Contents |
|---|---|
| `data/schema/evidence.schema.json` | The Schema |
| `data/schema/fixtures/valid/*.json`, `invalid/*.json` | Conformance fixtures. The file name says what each one tests. Read by both test suites. |
| `data/sources.json` | Source registry |
| `data/project.json` | Origin, bounds, eras |
| `data/evidence/<origin source id>.geojson` | Evidence files (written by spec 02's publish) |
| `data/control/<source id>.json`, `data/alignment/<source id>.json`, `data/tiles/<source id>.json` | Shapes defined here, written by spec 02 |
| `web/package.json`, `web/tsconfig.json`, `web/vitest.config.ts` | Minimal web package so the library can be built and tested before the shell exists. Spec 03 adds Vite and React to the same package. |
| `web/src/evidence/*.ts` | The Evidence Library (modules below) |
| `pipeline/buried_pipeline/validate/` | The Validator. The package itself is created by spec 02 task 1. |

## Data models

All shapes live under `$defs` in the one Schema. `additionalProperties: false` everywhere unless
noted, so a typo is an error.

### Common

- `schemaVersion`: string, pattern `^\d+\.\d+\.\d+$`. Starts at `1.0.0`.
- `sourceId`: pattern `^[a-z0-9]+(_[a-z0-9]+)*$`.
- `featureId`: pattern `^(bld|wtr|use)_[a-z0-9]+(_[a-z0-9]+)*_\d{4}$`.
- `position`: array, `prefixItems: [easting, northing]`, `minItems: 2`, `maxItems: 2`;
  easting 166000 to 834000, northing 0 to 9400000. Description: "EPSG:26917 metres, easting then
  northing. Never lon/lat." A pair like `[-79.35, 43.65]` fails the easting minimum.
- `date`: string, `format: date`. `dateTime`: string, `format: date-time`. Both validators enable
  format checking (Ajv with `ajv-formats`; `jsonschema` with its `FormatChecker`).

### featureCollection (root)

```
{
  "type": "FeatureCollection",
  "schema_version": "1.0.0",
  "crs": "EPSG:26917",              // const
  "origin_source": "<sourceId>",
  "features": [ feature, ... ]
}
```

RFC 7946 GeoJSON assumes WGS84 and has no `crs` member. Buried's files are GeoJSON-shaped but in
EPSG:26917. The `crs` foreign member and the position ranges make that explicit, and consumers must
not hand these files to a library that assumes WGS84.

### feature

```
{
  "type": "Feature",
  "id": "bld_fip_v3_1911_229_0001",
  "geometry": { "type": "Polygon", "coordinates": [[ position, ... ]] },
  "properties": {
    "kind": "building" | "water" | "land_use",
    "position_error_m": number > 0,
    "attributes": { "use"?: string, "material"?: string, "storeys"?: integer >= 1 },
    "observations": [ observation, ... ]   // minItems 1
    "confidence": "documented" | "estimated" | "unknown",
    "confidence_reason": string (minLength 1),
    "provenance": provenance,
    "status": "published" | "rejected" | "merged",
    "status_reason"?: string,              // required when rejected
    "merged_into"?: featureId              // required when merged
  }
}
```

`if/then` blocks enforce: id prefix matches kind; geometry type allowed for kind (lines only for
water); `storeys` required when a building is `documented`; `status_reason` and `merged_into` per
status.

`proposed` is not a status in evidence files. Proposals live in `data/work/` (spec 02) until a
person accepts them, so an evidence file only ever holds features a person has confirmed.

### observation

```
{ "source": sourceId, "present": boolean, "visibility": "clear" | "obscured" | "not_covered",
  "note"?: string }
```

No year field. The year range comes from the source record, so a source's dates are stated once.
The task brief listed `year` on observations; this follows `evidence.md` instead.

### provenance

```
{
  "origin_source": sourceId,
  "crop_px": { "x": int >= 0, "y": int >= 0, "width": int >= 1, "height": int >= 1 },
  "alignment_error_m": number > 0,
  "confirmed_by": string (minLength 1),
  "confirmed_at": dateTime,
  "proposal_id"?: string,
  "extraction_params_id"?: string
}
```

Pixel coordinates use the GDAL convention: (0, 0) is the top-left corner of the top-left pixel,
x to the right, y down, in the full-resolution source raster.

### source and sourceRegistry

```
{ "schema_version": "1.0.0", "sources": [ source, ... ] }

source = {
  "id": sourceId,
  "type": "fire_insurance_plan" | "aerial_photograph" | "present_day_reference" | "historical_map",
  "title": string,
  "year_from": integer, "year_to": integer,
  "url": string (uri),
  "licence_note": string,
  "attribution_line": string,
  "attribution_status": "confirmed" | "to_be_confirmed",
  "rights_checked_on": date | null,
  "held_out": boolean
}
```

The four plates are entered with the values in `sources.md`: `fip_v3_1911_229` and
`fip_v3_1911_232` with `year_from: 1911, year_to: 1914`; `fip_v3_1935_229` and `fip_v3_1935_232`
with 1935 to 1935; attribution "Digitized and georeferenced by the University of Toronto Map & Data
Library."; `attribution_status: confirmed`; `held_out: true` only on `fip_v3_1935_232`. URLs follow
the download patterns in `sources.md`. Aerial records are added only after their ids are agreed in
`sources.md`, and stay `to_be_confirmed` until their attribution line is.

### project and era

```
{
  "schema_version": "1.0.0",
  "crs": "EPSG:26917",
  "origin": { "easting": number, "northing": number },
  "origin_note": string,
  "bounds": { "min_e": number, "min_n": number, "max_e": number, "max_n": number },
  "eras": [ { "id": string, "label": string, "year_from": integer, "year_to": integer }, ... ]
}
```

- Path: `data/project.json`. This spec creates it, so it sets the path (as `tech.md` requires).
  Spec 03 reads the origin from here and sends it over the bridge.
- Origin value: the centre of the union of the four showcase plates' EPSG:26917 bounds from
  `buried inspect`, each coordinate rounded down to a multiple of 100 m. This puts the origin
  inside the showcase area, keeps Unity coordinates within a few hundred metres of zero, and is
  reproducible. `buried inspect --propose-origin` (spec 02) prints the value.
- Bounds: the same union, expanded outward to multiples of 100 m. Used to reject stray coordinates.
- Eras:

| id | label | year_from | year_to |
|---|---|---|---|
| `1911` | 1911 (revised to 1914) | 1911 | 1914 |
| `1935` | 1935 | 1935 | 1935 |
| `1947` | 1947 | 1947 | 1947 |
| `today` | Today | 2026 | 2026 |

  `today` uses 2026 until the present-day building source is chosen. That spec sets the range to
  match its source's year. Nothing is drawn in `today` from evidence until then.

### controlPoints

```
{
  "schema_version": "1.0.0",
  "source": sourceId,                     // the raster being checked
  "reference_source": sourceId,           // where the present-day coordinates came from
  "pixel_convention": "gdal_corner",
  "points": [ { "id": string, "description": string,
                "pixel": [x, y], "reference": position }, ... ]   // minItems 3
}
```

### alignmentRecord

```
{
  "schema_version": "1.0.0",
  "source": sourceId,
  "reference_source": sourceId,
  "control_file": string, "control_sha256": string,
  "measured_at": dateTime, "tool_version": string,
  "status": "measured",                   // const in 1.0.0; align-check writes no record otherwise
  "supplied": { "crs": string, "operation": string, "residuals": [residual],
                "rmse_m": number, "max_residual_m": number },
  "refined"?: { "affine": [a, b, c, d, e, f], "residuals": [residual],
                "rmse_in_sample_m": number, "rmse_loo_m": number, "max_residual_m": number },
  "chosen": "supplied" | "refined",
  "alignment_error_m": number > 0,
  "outliers": [ point id, ... ]
}
residual = { "id": string, "dx_m": number, "dy_m": number, "r_m": number }
```

The fields are explained in spec 02's design.

### tileSidecar

```
{
  "schema_version": "1.0.0",
  "source": sourceId,
  "image": string,                        // file name next to the sidecar
  "width_px": int, "height_px": int,
  "corners": { "top_left": position, "top_right": position,
               "bottom_right": position, "bottom_left": position },
  "transform": "supplied" | "refined",
  "alignment_error_m": number > 0,
  "source_pixel_size_m": number, "tile_pixel_size_m": number,
  "attribution_line": string
}
```

## Validator (Python)

Package: `pipeline/buried_pipeline/validate/`

| Module | Role |
|---|---|
| `schema.py` | Loads the Schema once, builds a `Draft202012Validator` per `$defs` entry with a format checker, maps file path to `$defs` entry (requirement 8.2). |
| `checks.py` | Cross-file checks as pure functions over already-parsed data: registry ids, origin source, alignment floor, duplicate ids, project bounds, attribution status, merged targets, geometry validity (shapely). Each returns a list of `ValidationError(path, feature_id, pointer, reason)`. |
| `run.py` | Walks `data/`, reads files, calls schema then checks, prints and sets the exit code. The only module that does file I/O. |

Order: schema errors first; cross-file checks run only on files that passed the schema, so one
mistake is not reported ten times.

Cross-file checks, each tied to a requirement: 2.7, 3.3, 3.4, 3.5, 5.2, 5.3, 5.4, 5.5, 6.2, 6.3,
7.5, 8.3, 8.4, and `merged_into` must name an existing feature.

`buried validate` is registered in spec 02's CLI. The Validator must not import the date logic (it
has none) or reimplement it (requirement 8.7).

## Evidence Library (TypeScript)

Pure functions, no I/O except `load.ts`. Geometry uses JSTS (planar JTS port), because Turf's
buffers and distances assume degrees. Every coordinate stays in EPSG:26917.

| Module | Exports |
|---|---|
| `types.generated.ts` | Types from the Schema via `json-schema-to-typescript`. Never hand-edited. |
| `schema.ts` | Ajv 2020 instance with `ajv-formats`; `validate(defName, value)`. |
| `load.ts` | `parseEvidenceFile`, `parseSourceRegistry`, `parseProject`: JSON text in, validated typed value out, or an `EvidenceLoadError` with Ajv errors. |
| `sources.ts` | `indexSources(registry): SourceIndex` (map by id; throws on duplicates). |
| `dates.ts` | `summariseDates(feature, sources): DateSummary`; `datePhrases(summary): string[]`. |
| `eras.ts` | `isDrawnInEra(summary, era)`; `featuresForEra(collections, sources, era): EraFeatureList`. |
| `lot.ts` | `lotRelation(feature, lot): LotRelation`. |
| `findings.ts` | `createFinding`, `createNothingFound`, `statusLabel`, `checkedRecordsText`. |
| `text.ts` | `BANNED_WORDS`, `findBannedWords(text)`, `HonestyError`. |
| `index.ts` | Public exports. |
| `testing/arbitraries.ts` | fast-check generators shared by tests (sources, observations, features, rectangles, lots). |

### DateSummary

```ts
type ObservationRef = { source: string; yearFrom: number; yearTo: number;
                        present: boolean; visibility: 'clear' | 'obscured' | 'not_covered' };

type DateSummary =
  | { kind: 'no_presence'; checked: ObservationRef[] }
  | { kind: 'dated';
      builtBy: number;                 // min yearTo over P
      lastSeen: number;                // max yearFrom over P
      window: { from: number; to: number };   // min yearFrom over P .. max yearTo over P
      notYetBuiltAt: number | null;    // max yearFrom over before-absences
      goneBy: number | null;           // min yearTo over after-absences
      conflicts: ObservationRef[];     // clear absences inside the window
      presences: ObservationRef[]; beforeAbsences: ObservationRef[];
      afterAbsences: ObservationRef[];
      notCounted: ObservationRef[] };  // obscured and not_covered
```

All arrays are sorted by (yearFrom, source) so the output does not depend on input order.

`datePhrases` returns, in order: "Not yet built at Y" if `notYetBuiltAt`; "Built by Y";
"Gone by Y" if `goneBy`, else "Last seen Y". For `no_presence` it returns `[]`. The shell composes
these with its own separators. A conflicted summary still has phrases; the shell decides how to show
"needs review" (spec 03 / Report spec).

### Eras

`isDrawnInEra(s, era)` is true only when `s.kind === 'dated'`, `s.conflicts.length === 0`,
`era.year_from >= s.window.from` and `era.year_to <= s.window.to`.

```ts
type EraFeature = {
  id: string; kind: 'building' | 'water' | 'land_use';
  geometry: Geometry;                 // EPSG:26917, unchanged from the file
  positionErrorM: number;
  confidence: 'documented' | 'estimated' | 'unknown'; confidenceReason: string;
  attributes: { use?: string; material?: string; storeys?: number };
  dates: DateSummary & { kind: 'dated' }; phrases: string[];
  sourceIds: string[];                // origin source first, then the rest sorted
};
type EraFeatureList = { eraId: string; yearFrom: number; yearTo: number;
                        features: EraFeature[];     // sorted by id
                        needsReview: string[] };    // conflicted published ids, sorted
```

Only `status: published` features are considered. This type is what spec 03's `scene/loadEra`
carries. Spec 03's bridge schema must reference or mirror it, checked by test.

### Lot relation

```ts
type Lot = { geometry: Polygon | MultiPolygon; positionErrorM: number };  // >= 0
type LotRelation = { kind: 'on' } | { kind: 'near'; withinM: number };   // integer metres
```

Steps, all in metres:

1. `e = feature.positionErrorM + lot.positionErrorM`.
2. `shrunk = buffer(lot, -e * k)`, where `k = 1 / cos(π / (4q))` and `q` is JSTS's quadrant
   segment count (default 8). With round joins, JSTS approximates each arc by chords, which sit
   inside the true arc. For an inward buffer the arcs appear at the lot's reflex corners, and chords
   make the shrunk lot slightly too large there. Scaling the distance by `k` makes the chord polygon
   contain the true circle, so the computed shrunk lot is never larger than the exact one
   (requirement 13.5).
3. If `shrunk` is empty, go to step 5.
4. `i = intersection(feature, shrunk)`. Polygonal feature: `on` if `area(i) > 0`. Line feature:
   `on` if `length(i) > 0`.
5. `near` with `withinM = ceil(distance(feature, lot) + e)`.

Floating-point: no epsilon is added. A feature exactly tangent to the shrunk lot has zero-area
intersection and is "near". That errs toward "near", which is the safe side.

### Findings

```ts
type FindingStatus = 'documented' | 'estimated' | 'nothing_found' | 'not_covered';
type CheckedRecord = { sourceId: string; yearFrom: number; yearTo: number;
                       visibility: 'clear' | 'obscured' | 'not_covered' };
type Finding =
  | { status: 'documented' | 'estimated'; text: string;
      sourceIds: [string, ...string[]]; featureIds: string[]; relation: LotRelation }
  | { status: 'nothing_found' | 'not_covered'; text: string;
      sourceIds: [string, ...string[]]; checked: [CheckedRecord, ...CheckedRecord[]] };
```

- `createFinding(input, sources)` throws `HonestyError` if `sourceIds` is empty, any id is not in
  the index, or `findBannedWords(text)` is non-empty.
- `createNothingFound(text, checked, sources)` and the `not_covered` variant require at least one
  checked record; `sourceIds` is derived from `checked`, so it cannot be missing. Year ranges are
  copied from the source index, not from the caller.
- `checkedRecordsText(finding)` returns one line per checked record:
  `<source id> (<year_from>–<year_to>, <visibility>)`, with a single year when they are equal.
- Which findings a Report contains, and its wording, is the Report spec's job. This module only
  guarantees the invariants. Checking generated sentences for numbers and sources absent from the
  evidence (product rule 10) also belongs in this module, added by the Report spec.

### Banned words

`BANNED_WORDS = ['contaminated', 'unsafe', 'safe', 'clean', 'will flood']`. Matching: lower-case
the text, then test each entry with a regex where letters must not be preceded or followed by a
letter (`(?<![a-z])` / `(?![a-z])`), and the space in "will flood" is `\s+`. So "Safe", "clean-up"
and "will\nflood" match; "safety" and "Cleanview" do not. The rule targets words, not substrings.
Product may later decide that "safety" should also fail; that is a one-line change.

## Error handling

| Situation | Behaviour |
|---|---|
| Contract file fails the Schema (TS) | `load.ts` throws `EvidenceLoadError` with file name and Ajv errors. The shell shows "This evidence file could not be read" and logs the errors; it does not draw partial data from that file. |
| Contract file fails (Python) | One line per error, exit code 1 (requirement 8.5). |
| Observation cites an unknown source (TS) | `summariseDates` throws `EvidenceLoadError`. The Validator should have caught it first. |
| Conflict | Not an error. Feature goes to `needsReview` (requirement 11.3). |
| Feature with no clear presence | `no_presence` summary; never drawn. |
| Finding without source or with banned word | `HonestyError`; the caller must not catch and continue silently. |
| Invalid lot geometry | `lotRelation` throws; the Report spec decides the message. |

## Correctness properties

Each property is universally quantified over values produced by the generators in
`web/src/evidence/testing/arbitraries.ts` (TS) or Hypothesis strategies (Python). Generated sources
have `1800 <= year_from <= year_to <= 2030`. Generated features have 1 to 8 observations with
random `present` and `visibility`.

**P1. Never drawn outside the evidence window.** For every feature F and era E: if
`isDrawnInEra(summariseDates(F), E)` then F has a clear presence, `E.year_from >= window.from` and
`E.year_to <= window.to`. *(tech.md property 1; req 12.1)*

**P2. A vanish window is only closed by a clear absence.** For every feature F: if
`goneBy !== null`, then F has an observation with `present: false`, `visibility: clear`, whose
source `year_from` is greater than `window.to` and whose `year_to` equals `goneBy`. And for every F,
replacing the visibility of all absences with `obscured` or `not_covered` gives `goneBy === null`.
*(tech.md property 2; req 10.5, 10.6)*

**P3. Unclear observations never change dates.** For every F and every observation O with
visibility `obscured` or `not_covered`: `summariseDates(F + O)` equals `summariseDates(F)` except
that `notCounted` gains O. *(req 10.6)*

**P4. Order independence.** For every F and every permutation of its observations, the summary is
identical. *(req 10.9)*

**P5. Conflicts are flagged, never resolved.** For every F with at least one clear presence and
every clear absence O whose source range overlaps F's window: `summariseDates(F + O)` lists O in
`conflicts`, has the same `builtBy`, `lastSeen` and `window` as `summariseDates(F)`, and F is in
`needsReview` and not in `features` of every era list. *(req 11.1, 11.2, 11.3)*

**P6. Phrases never say "Built in".** For every F, no string in `datePhrases(summariseDates(F))`
contains "built in" (case-insensitive), and every year in the phrases is a `year_from` or `year_to`
of a cited source. *(req 10.8; product rule 11)*

**P7. "On this lot" survives any displacement within the error.** For every polygon feature F,
lot L, and every translation vector t with `|t| <= e`: if `lotRelation(F, L)` is `on`, then
`area(intersection(translate(F, t), L)) > 0`. *(tech.md property 3; req 13.2, 13.5)*

**P8. "On this lot" never appears when the overlap is smaller than the error.** For every F and L:
if F does not intersect L shrunk by `e` (computed exactly for axis-aligned rectangles in the test
oracle as the rectangle inset by `e` on each side), the result is `near`. In particular, if F does
not intersect L at all, the result is `near`. *(tech.md property 3; req 13.2, 13.4)*

**P9. "Near" distance is honest.** For every F and L with result `near(X)`: X is an integer and
`distance(F, L) + e <= X < distance(F, L) + e + 1`. *(req 13.3)*

**P10. Every finding has a source; no banned word reaches a finding.** For every input to
`createFinding` or `createNothingFound`: either it throws `HonestyError`, or the result has at
least one source id, every source id is in the index, and `findBannedWords(text)` is empty.
For every string S that contains a banned word as a whole word (generated by inserting a banned
word with random case and surrounding non-letters into random text), `findBannedWords(S)` is
non-empty. *(tech.md property 5; req 14.2, 14.4, 14.5)*

**P11. "Nothing found" lists the records and years checked.** For every non-empty list of checked
observations C: the `nothing_found` finding's `checked` has one entry per source in C with that
source's `year_from`, `year_to` and visibility, and `checkedRecordsText` contains every source id
and year range in C. *(tech.md property 6; req 14.3)*

**P12. Era lists are well-formed.** For every set of collections and era E: `featuresForEra` returns
only `published` features, only features for which P1's condition holds, no duplicate ids, sorted
by id, and every conflicted published feature's id is in `needsReview`. *(req 2.8, 12.2, 12.4)*

**P13. Validator rejects missing evidence (Python, Hypothesis).** For every valid generated feature,
removing `position_error_m`, setting it to 0 or less, emptying `observations`, or replacing an
observation's source with an id not in the registry makes the Validator report an error for that
feature id. *(req 2.4, 2.7, 3.3)*

**P14. Validator rejects lon/lat (Python, Hypothesis).** For every valid feature, replacing any
position with a pair where the first value is in [-180, 180] and the second in [-90, 90] makes the
Validator report an error. *(req 1.6)*

**P15. Position error floor (Python, Hypothesis).** For every feature and alignment record:
the Validator accepts the feature only if `position_error_m >= alignment_error_m`. *(req 5.4)*

The tech.md property "An alignment transform round-trips control points within the reported error"
belongs to the alignment maths and is specified in spec 02 (property A5, with A1 to A7 around it).

## Testing strategy

- Vitest + fast-check in `web/src/evidence/*.test.ts`, at least 200 runs per property (fast-check
  default is 100; raise `numRuns` for P5, P7, P8).
- P7 and P8 generate axis-aligned rectangles and simple convex polygons with integer-metre
  coordinates near the origin, so the oracle is exact. Lots include L-shapes to exercise reflex
  corners for requirement 13.5.
- Example tests cover each phrase form and the four-era table with a 1911-only feature, a 1935-only
  feature, a 1911 + 1935 feature with a clear 1947 absence, and one with an obscured 1947
  observation ("Last seen 1935"). Source ids in examples are the real plate ids; geometry is
  synthetic. No example states what stood on a real block.
- pytest + Hypothesis in `pipeline/tests/validate/`.
- Conformance: both suites load every file in `data/schema/fixtures/` and assert valid files pass
  and invalid files fail (requirement 9.3). Each invalid fixture fails for exactly one reason,
  named in its file name (for example `invalid/feature_no_position_error.json`). The Schema stays
  strict, so fixtures carry no comment fields. Each fixture also states which `$defs` entry it
  targets through its directory: `fixtures/valid/<def name>/` and `fixtures/invalid/<def name>/`.

## Decisions and reasons

- **One schema file with `$defs`** instead of one file per shape: `tech.md` asks for one JSON
  Schema, and shared definitions (positions, ids) stay in one place.
- **No year on observations:** avoids two copies of a source's dates that could disagree.
- **Lines allowed for water only:** creeks and shorelines are lines. The task brief says polygons;
  `evidence.md` already handles lines in the lot test. Buildings and land use stay polygons.
- **Conflicted features are not drawn:** drawing them would mean choosing the presences over the
  absence, which is resolving the conflict. They are listed for review instead.
- **JSTS over Turf:** planar maths in metres, with real negative buffers.
- **Ajv on load in TS, jsonschema in Python:** both are mature draft 2020-12 implementations; the
  shared fixtures catch disagreement.
