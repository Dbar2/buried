# Kiro session 002b: settle the open questions from session 002

Agent: architect (claude-opus-5.5).

Session 002 wrote specs 01 and 02 and raised eight open questions plus several decisions to check.
This session records the answers and updates the steering docs and both specs to match. Keep
existing requirement and task numbers stable: add new numbers at the end rather than renumbering.

## Answers

1. **Control-point reference source: decided.** The City of Toronto "Intersection File - City of
   Toronto" (CKAN package `intersection-file-city-of-toronto`), Open Government Licence - Toronto.
   A control point pairs a street centreline intersection on the plate (pixel) with that
   intersection's coordinate reprojected to EPSG:26917. Corners of buildings that still stand,
   taken from the City's building outlines, are also allowed as control points; each control point
   records which reference it used and the reference feature's id.
2. **1947 aerial index: recorded.** Feature layer
   `https://services1.arcgis.com/9NvE8jKNWWlDGsUJ/arcgis/rest/services/Toronto_Aerial_Photographs_1947_Index/FeatureServer/0`.
   Fields: `Name` (record id, for example `s0012_fl1947_it0001h`), `url` (JPEG), `zip_url`
   (georeferenced download), `thumbnail_url`. Geometry is each photo's footprint.
   Plate index layers on the same server: `vol3_19111914` (fields `Name`, `Plan_`, `URL`, `zip_url`)
   and `vol3_1935` (fields `Name`, `url`, `zip_url`).
3. **1947 aerial rights: confirmed Nov 12, 2026** from the U of T Map & Data Library collection page
   (`https://mdl.library.utoronto.ca/collections/geospatial-data/toronto-aerial-photographs-1947-black-and-white-and-colourized`):
   "Require permission to use: None. Require acknowledgement to use: None. Cost for use: None.
   Restrictions: Public." Publisher: City of Toronto. Originals held at the City of Toronto
   Archives. We credit anyway. Attribution line: "1947 aerial photographs: City of Toronto
   Archives. Georeferenced by the University of Toronto Map & Data Library." The aerials may now be
   tiled and cited. Set `rights_checked_on` to 2026-11-12 for the aerials, and to 2026-11-10 for the
   four plates (checked in the earlier research session; see `docs/concept-brief.md` section 9).
4. **Layout.** Add `data/control/`, `data/alignment/`, `data/present/` and `data/project.json` to
   `structure.md`.
5. **What the error means: decided.** RMSE alone is not what we show people. A plate's published
   alignment error is `max(2.0, 2 x leave-one-out RMSE)` metres, rounded up to 0.1 m: a
   conservative "about 95 in 100 points fall within this" figure with a 2 m floor. A feature's
   `position_error_m` is the root-sum-square of that figure and a digitising term (default 1.0 m,
   and never less than 2 plate pixels). The reviewer may raise it, never lower it. UI and Report
   wording is "Positioned within about X m", never an absolute bound. Record the raw in-sample and
   leave-one-out RMSE too, so the number can be recomputed.
6. **Matching across editions: add it to spec 02** as a new command, `buried match`, with its own
   requirement and tasks. For each published building it adds observations from every other source
   that covers the spot:
   - Another plate: `present: true, clear` when a footprint on that plate overlaps the feature by
     more than both position errors allow for chance (state the exact test: intersection area over
     the smaller footprint's area, after shrinking by the combined error, above a threshold);
     `present: false, clear` when the spot lies inside that plate's mapped area and no footprint is
     within the combined error; otherwise `not_covered`. When the overlap is partial or two
     footprints compete, record nothing and put the pair in a review list. Code never guesses.
   - The 1947 aerial: the pipeline never decides presence from a photograph. It writes
     `not_covered` or leaves a pending item; a person sets present / absent and clear / obscured in
     the Studio review. This keeps "Gone by" honest.
   When two features on different plates match, they are linked (`same_as`) rather than merged, so
   each keeps its own provenance; the date logic in spec 01 treats a linked set as one feature for
   windows. Add that to spec 01 as new requirements with a property: linking never widens a window
   beyond what the union of clear observations supports.
7. **Round-trip property:** your reading is accepted.
8. **Banned words:** whole-word, case-insensitive match on "contaminated", "unsafe", "safe",
   "clean" and the phrase "will flood", plus the inflections "safer", "safest", "cleaner",
   "cleanest". "safety" is allowed.

Decisions from session 002 that are accepted as written: `data/project.json` created by spec 01
with the origin from `buried inspect --propose-origin`; era ranges (1911 = 1911 to 1914, 1935,
1947, today = 2026); conflicted features are not drawn and go to `needs_review`; the refined
affine is used only when its leave-one-out RMSE is lower; tiles are JPEG.

## Present-day data: decided

Checked on the City of Toronto Open Data portal (CKAN,
`https://ckan0.cf.opendata.inter.prod-toronto.ca`) on Nov 12, 2026. All are published under the
Open Government Licence - Toronto. Attribution line: "Contains information licensed under the Open
Government Licence - Toronto." Add them to `sources.md` and resolve the matching "not decided yet"
items in `tech.md`.

| Use | CKAN package id | Formats |
|---|---|---|
| Present-day building footprints | `topographic-mapping-building-outlines` | GeoJSON, GPKG, SHP |
| Lots for the Report and the pinned lot | `property-boundaries` | GeoJSON, GPKG, SHP |
| Address search inside the coverage area | `address-points-municipal-toronto-one-address-repository` | GeoJSON, GPKG, CSV |
| Street intersections (control references) | `intersection-file-city-of-toronto` | GeoJSON, GPKG, CSV |

`3d-massing` (SHP, refreshed Dec 2025) may supply present-day building heights; optional, with a
fixed storey height as the fallback.

Add a command to spec 02, `buried present`, that downloads each dataset through the CKAN API,
clips it to the showcase bounds plus a margin, reprojects to EPSG:26917 and writes small files
under `data/present/` with the retrieval date and licence. Nothing citywide is committed. Order the
new tasks so that the intersection clip can run right after `buried inspect`, because the alignment
gate needs it.

## Rules for this session

- You may edit `.kiro/steering/`, `.kiro/specs/01-evidence-model/` and `.kiro/specs/02-pipeline/`.
- No implementation code. Plain, direct English. No emoji.
- Reply with a list of what changed, by file, and anything still open.
