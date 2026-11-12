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
  The 1935 edition (the plates read "January 1931, revised to May 1935") has `year_from: 1931`,
  `year_to: 1935`. A source may carry a `years_label` for display ("1931, revised to 1935").
- **Feature.** One building (`bld`), water feature (`wtr`) or land-use area (`use`), with:
  - geometry in **EPSG:26917 metres**, never lon/lat;
  - `position_error_m` (required, greater than 0);
  - attributes read from the source (use, material, storeys, street number), each optional, never
    guessed. `material` is set only when a person, or label reading confirmed by a person, reads
    it from the plate's lettering or legend, and the feature then records the crop it was read
    from. A grey tone on a greyscale scan is never a material;
  - observations (at least one);
  - confidence (`documented`, `estimated`, `unknown`) and `confidence_reason`;
  - provenance: origin source, crop rectangle in source pixels, alignment error of that source,
    digitising error, `confirmed_by`, `confirmed_at`;
  - status (for example proposed, published, rejected, merged). Only published features are shown;
  - optional `same_as` links to features from other sources that show the same thing.
- **Observation.** What one source shows at the feature's location: `source`, `present`
  (true or false), `visibility`, and `method`: `origin` (the source the feature was read from),
  `match_auto` (computed by `buried match` from geometry) or `person` (set by a named person, with
  `confirmed_by` and `confirmed_at`).
- **Coverage of an evidence file.** Its `mapped_area` (where the source draws the ground) and its
  `reviewed_areas` (where a person attests that every building the source draws is published).
  Absence can only be read inside a reviewed area. A reviewed area says which kinds it attests
  (`covers`: buildings, and optionally water and land use); without `covers` it attests buildings
  only.
- **Map area of a plate.** The part of a plate image that is map content, as a pixel polygon set
  once by a person (in the Studio or in `data/control/map_area/<source id>.json`). Margins, title
  blocks, scale bars, north arrows, archive labels and rulers are outside it. Extraction, tiling
  and `mapped_area` work inside it. Code never detects it silently.

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
- Code never decides presence or readability from a photograph. For a 1947 aerial, the pipeline
  may only write `not_covered` (the photo's footprint misses the spot). `clear` and `obscured`
  aerial observations are always `method: person`. The one exception is a feature a person traced
  from an aerial in the Studio: its origin observation is from that aerial with `method: origin`,
  and its provenance names the person who traced it.

## Date logic

All of this is pure code in one implementation (TypeScript, see `tech.md`). For each feature,
let **P** be its clear presences and **A** its clear absences. Each observation takes
`year_from` and `year_to` from its source.

Linked features are dated together. A **linked set** is a connected group of published features
joined by `same_as`; a feature with no links is a set of one. P and A are taken over the union of
the set's observations, each source once. If two members disagree about the same source, the set
is a conflict (rule 7). Linking never widens a window beyond what that union of clear observations
supports.

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

- Every feature carries `position_error_m`: about how far, in metres, its true position may be
  from where it is drawn. It is a conservative figure (about 95 in 100 points fall within it),
  not an absolute bound. UI and Report wording is "Positioned within about X m".
- **A source's alignment error** is `max(2.0, 2 × B)` metres, rounded up to the next 0.1 m, where
  B is the out-of-sample RMSE of the transform the pipeline's alignment check chose: the RMSE of
  the supplied georeferencing at independent control points, or the leave-one-out RMSE of the
  refined fit. The 2 m floor stays even when the points fit better.
- **A feature's position error** is the root-sum-square of its source's alignment error and a
  digitising term, rounded up to the next 0.1 m. The digitising term defaults to 1.0 m and is
  never less than 2 source pixels. A reviewer may raise a feature's position error, never lower
  it.
- A source with no measured alignment error cannot publish features. The georeferencing supplied
  with a plate is not a measurement.
- A source's alignment record stores its control points, the in-sample and leave-one-out RMSE,
  the basis B and the rule constants, so every number can be recomputed.
- The alignment record also states the convex hull of its control points in EPSG:26917. The error
  figure is measured inside that hull. Outside it the figure is an extrapolation, so the Studio
  warns when a feature lies outside the hull. (On plate 229 all six points lie in the northern
  two-thirds, because the southern street crossings no longer exist.)

## Matching across sources

`buried match` (pipeline) adds observations to published buildings from every other source that
covers the spot. All tests are in EPSG:26917 metres. Let `e` be the combined position error of the
two footprints compared (for an absence, the feature's error plus the other plate's smallest
possible feature error).

- **Another plate, present.** One footprint on that plate clearly overlaps the feature: take the
  smaller of the two footprints, shrink it inward by `e`, and divide its intersection with the
  larger by its shrunk area. Exactly one footprint scores at least the match threshold and no
  other scores at least the competing threshold (both set once in spec 02), and the same holds
  from the other footprint's side. The result is `present: true, clear`, and the two features are
  linked (`same_as`).
- **Another plate, absent.** The feature, grown by `e`, lies inside that plate's reviewed area,
  and no footprint on that plate touches the feature shrunk inward by `e`. The result is
  `present: false, clear`.
- **Another plate, not covered.** The feature does not touch that plate's mapped area. The result
  is `not_covered`.
- **Anything else** (partial overlap, competing footprints, a feature too small to shrink, a spot
  on the plate but outside its reviewed area): no observation. The case goes on a review list and a
  person decides. Code never guesses.
- **A 1947 aerial.** `not_covered` when the photo's footprint misses the feature; otherwise a
  pending item for a person to set present or absent, clear or obscured.
- Person decisions are never changed by `match`. Automatic results are recomputed on every run.
- A different building standing on the spot is a clear absence (see Visibility), but code cannot
  tell it from the same building redrawn. It is always a person's call.

## On this lot vs near this lot

Computed in EPSG:26917. Let `e` = the feature's `position_error_m` plus the lot's position error.

- **On this lot** if the feature intersects the lot shrunk inward by `e` (negative buffer),
  with positive area for polygons or positive length for lines. This means the feature still
  touches the lot however its error is resolved.
- Otherwise, **near this lot (within X m)**, where X = distance from feature to lot plus `e`,
  rounded up to the next whole metre.
- If the shrunk lot is empty (the lot is smaller than its error allows), nothing is "on this lot".
- A lot from the City property boundaries layer has a position error of 2.0 m unless the dataset
  states its own figure. The parcel layer is a mapping product, not a survey.

## Findings

- Each finding has a status: Documented, Estimated, Nothing found in these records, Not covered.
- Each finding lists its source ids. "Nothing found" lists every source and year range checked,
  including `obscured` and `not_covered` ones, with their visibility.
- If text printed on a source contains a banned word, the Report does not quote it. It names the
  source and the crop instead.

## Plate 232 (1935)

`fip_v3_1935_232` is held out. No extraction fixture, threshold or parameter set may be derived
from it. Its features are produced live through the Studio and published like any other.
