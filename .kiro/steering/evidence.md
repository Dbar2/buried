---
inclusion: fileMatch
fileMatchPattern: ["data/**", "pipeline/**"]
---

# Evidence

The evidence files are the contract. The schema itself is defined by the evidence model spec.
This file states the rules the schema and the code must follow.

## The model

- **Source.** One archival item, registered once with: `id` (see `structure.md`), type, title,
  `year_from`, `year_to`, download URL, licence note, attribution line. A single-year source has
  `year_from == year_to`. The 1911 edition revised to 1914 has `year_from: 1911`, `year_to: 1914`.
- **Feature.** One building (`bld`), water feature (`wtr`) or land-use area (`use`), with:
  - geometry in **EPSG:26917 metres**, never lon/lat;
  - `position_error_m` (required, greater than 0);
  - attributes read from the source (use, material, storeys), each optional, never guessed;
  - observations (at least one);
  - confidence (`documented`, `estimated`, `unknown`) and `confidence_reason`;
  - provenance: origin source, crop rectangle in source pixels, alignment error of that source,
    `confirmed_by`, `confirmed_at`;
  - status (for example proposed, published, rejected, merged). Only published features are shown.
- **Observation.** What one source shows at the feature's location: `source`, `present`
  (true or false) and `visibility`.

A feature with no observation, no source or no position error is invalid. The validator rejects it.

## Visibility

| Value | Meaning |
|---|---|
| `clear` | The source covers the spot and it can be read. |
| `obscured` | The source covers the spot but it cannot be read (shadow, tree, cloud, damage, a fold, a label over it). |
| `not_covered` | The source does not cover the spot. |

- Only `clear` observations count as evidence, for presence or absence.
- `present: false` with `clear` is a **clear absence**: the spot is visibly empty, or a different
  building stands there.
- `obscured` and `not_covered` observations say nothing about the feature. They are kept so the
  Report can list what was checked.

## Date logic

All of this is pure code in one implementation (TypeScript, see `tech.md`). For each feature,
let **P** be its clear presences and **A** its clear absences. Each observation takes
`year_from` and `year_to` from its source.

Rules for one observation:
- A presence supports **"Built by `year_to`"** and **"Last seen `year_from`"**.
- A clear absence after the feature supports **"Gone by `year_to`"**.
- A clear absence before the feature supports **"Not yet built at `year_from`"**.

Combined:
1. **Built by** = the minimum `year_to` over P.
2. **Last seen** = the maximum `year_from` over P.
3. **Evidence window** = from the minimum `year_from` over P to the maximum `year_to` over P.
4. **Before-absences** are absences whose `year_to` is less than the minimum `year_from` over P.
   **After-absences** are absences whose `year_from` is greater than the maximum `year_to` over P.
5. **Appeared** = after the maximum `year_from` over before-absences, and by "Built by".
   With no before-absence, the start is open: only "Built by" is stated.
6. **Vanished** = after "Last seen", and by the minimum `year_to` over after-absences
   ("Gone by"). With no after-absence the window stays open and the text is
   **"Last seen [year]"**. Obscured or not-covered sources never close it.
7. **Conflict.** An absence that overlaps the evidence window (neither before nor after) is a
   conflict. The feature is flagged for review. The logic never resolves it by picking a side.
8. **Drawn in era.** An era has a year range. A feature is drawn in an era only if the era's
   range lies inside the evidence window. A feature is never drawn outside its evidence window.
9. **No invented years.** Text uses "Built by", "Gone by", "Last seen". "Built in" only when a
   source states the year, and that source is cited.

## Position error

- Every feature carries `position_error_m`: how far, in metres, its true position may be from
  where it is drawn.
- It is never less than the alignment error (RMSE, in metres) of its origin source as measured by
  the pipeline's alignment check. A source with no measured alignment error cannot publish
  features. The georeferencing supplied with a plate is not a measurement.
- A source's alignment error is stored on the source's alignment record with its control points,
  so it can be recomputed.

## On this lot vs near this lot

Computed in EPSG:26917. Let `e` = the feature's `position_error_m` plus the lot's position error.

- **On this lot** if the feature intersects the lot shrunk inward by `e` (negative buffer),
  with positive area for polygons or positive length for lines. This means the feature still
  touches the lot however its error is resolved.
- Otherwise, **near this lot (within X m)**, where X = distance from feature to lot plus `e`,
  rounded up to the next whole metre.
- If the shrunk lot is empty (the lot is smaller than its error allows), nothing is "on this lot".

## Findings

- Each finding has a status: Documented, Estimated, Nothing found in these records, Not covered.
- Each finding lists its source ids. "Nothing found" lists every source and year range checked,
  including `obscured` and `not_covered` ones, with their visibility.

## Plate 232 (1935)

`fip_v3_1935_232` is held out. No extraction fixture, threshold or parameter set may be derived
from it. Its features are produced live through the Studio and published like any other.
