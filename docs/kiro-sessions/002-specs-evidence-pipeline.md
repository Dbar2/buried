# Kiro session 002: specs for the evidence model and the pipeline

Model: claude-opus-5.5 (Kiro CLI). Tools: file read and write only.

## Task

Read every file in `.kiro/steering/` and `docs/concept-brief.md`. Then write two Kiro specs, each as
the standard three files (`requirements.md`, `design.md`, `tasks.md`):

- `.kiro/specs/01-evidence-model/`
- `.kiro/specs/02-pipeline/`

Use the normal Kiro spec format: requirements as user stories with numbered EARS acceptance criteria
(WHEN / IF / WHILE ... THE SYSTEM SHALL ...); a design doc with architecture, data models, error
handling and a **Correctness Properties** section; and tasks as a numbered checkbox list where every
task names the files it touches and the requirement numbers it satisfies. Mark property-based test
tasks clearly and tie each one to a named correctness property.

## Spec 01: evidence model

The contract every other part reads. Scope:

- One JSON Schema (draft 2020-12) at `data/schema/evidence.schema.json` for features (buildings,
  water, land-use areas), observations (source, year, present, visibility: clear | obscured |
  not_covered), position error in metres, confidence (documented | estimated | unknown) with a
  reason, provenance (plate, crop rectangle in plate pixels, alignment error, confirmed_by,
  confirmed_at) and a source registry (`data/sources.json`) with licence and attribution lines.
- A TypeScript library at `web/src/evidence/` that is the **single implementation** of the date
  logic in the brief's section 8.3 and the honesty rules in 5.2: existence window, appeared window,
  vanished window (closed only by a clear absence), "drawn in era" test, "on this lot" vs "near this
  lot" using overlap against position error, and the per-era feature list the Explorer renders.
  Unity never re-implements this; it receives the computed per-era lists over the bridge.
- A Python validator in `pipeline/` that checks every evidence file against the same schema and
  rejects features with no source or no position error.
- Correctness properties, at minimum those listed in the brief's section 10.6. State each as a
  universally quantified property, then give it a fast-check or Hypothesis task.

Geometry is GeoJSON polygons in EPSG:26917 metres (not lon/lat). The schema must say so.

## Spec 02: pipeline

Python 3.12, managed with `uv`, package at `pipeline/buried_pipeline/`, CLI entry point `buried`.
Scope, in the order the tasks should run:

1. `buried fetch`: download the showcase plates and the 1947 aerial tiles that cover them into
   `data/raw/`, from the patterns in `.kiro/steering/sources.md`, recording URL, size, SHA-256 and
   retrieval date in `data/raw/manifest.json`. Idempotent. Never bulk-download a collection.
2. `buried inspect`: read each raster's georeferencing (GeoTIFF tags or world file), report CRS,
   pixel size in metres and bounds in EPSG:26917, and fail loudly if a plate has none.
3. `buried align-check`: measure a plate's real alignment error. Input is a small file of control
   points per plate (`data/control/<plate>.json`): pixel coordinates on the plate paired with
   present-day EPSG:26917 coordinates of the same street corner. Output is the residual per point,
   RMSE in metres, and an optional refined affine transform when 4 or more points are given. The
   RMSE becomes the plate's `position_error_m`. The transform maths must be pure functions.
4. `buried tile`: write web- and Unity-ready rasters for each plate and aerial: a downsampled
   JPEG/WebP plus a sidecar JSON with its four corner coordinates in EPSG:26917, under `data/tiles/`.
5. `buried extract`: propose building footprints from a plate using deterministic image processing
   only (colour classes from the plate legend: brick, wood, stone, etc.; black outline closing;
   polygon simplification). Output proposals as GeoJSON in EPSG:26917 with material class, pixel
   crop and a per-proposal quality score. No LLM in this step. Label reading is a later spec.
6. `buried publish`: turn accepted proposals into evidence files that pass the spec 01 validator.

Design constraints: geometry, coordinates and dates are code, never an LLM. Plate 232 (1935) is the
held-out plate: the extraction tasks must name the plates they may be tuned on (229, both editions)
and a test must fail if tuning fixtures reference plate 232. The first three tasks in `tasks.md`
must be enough, on their own, to align one plate and report its error in metres: that is a go/no-go
gate due Nov 14.

## Rules for this session

- Write only inside `.kiro/specs/01-evidence-model/` and `.kiro/specs/02-pipeline/`.
- Do not write implementation code in this session.
- Plain, direct English. No marketing language, no emoji.
- Do not invent facts about what stood on the showcase blocks.
- Reply with the files written and any open question you could not settle from the docs.

## Also in this session

- You flagged that `fileMatchPattern: "{web,unity}/**"` may not be supported. Change the two
  steering docs that use a brace pattern to the array form, for example
  `fileMatchPattern: ["web/**", "unity/**"]`.
- The rules you added to `evidence.md` (shrink-the-lot test with both errors, conflicts flagged and
  never resolved by code, position error never below the plate's measured alignment error) are
  accepted. Treat them as requirements in spec 01.
- This session runs as the `architect` agent, so the header line above about tools is superseded:
  you may write under `.kiro/steering/`, `.kiro/specs/` and `docs/` only.
