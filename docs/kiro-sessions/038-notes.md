# Session 038 notes (builder, pipeline lane)

## What I built

**P2, evidence schema 1.2.0 (`provenance.review`).**
- `evidence.schema.json`: a `reviewState` definition, required in `provenance`. `reviewed` needs
  `by` and `on`; a draft forbids both.
- The Validator also rejects an evidence file stamped below 1.2.0 and a `reviewed` day in the
  future (`validate/evidence_checks.py`).
- `migrate/review_state.py`, idempotent. Run over `data/evidence/*.geojson`: 13 features
  `draft_hand` (every feature whose `confirmed_by` has "tracing by hand" or "gate draft"), 162
  `draft_rule`, none `reviewed`. Run it with
  `uv --directory pipeline run python -m buried_pipeline.migrate.review_state [--dry-run]`.
- `buried publish` writes `reviewed` with `by` = the decision's reviewer and `on` = the date part of
  its `confirmed_at`, for buildings and traced land-use areas.
- New fixtures for `reviewState`, and `review` added to the existing schema fixtures.
- Steering paragraph added to `.kiro/steering/evidence.md`.
- `npm run gen:types` regenerated `types.generated.ts`.

**P1, finds schema and validation.**
- `data/schema/finds.schema.json` (own file, 1.0.0, `crop_px` is the `cropPx` object).
- `validate/finds.py` runs in `buried validate`. It checks unique `id`, `slug` and `order`, a
  registered source, a published feature of the right kind (`bld` for a building, `use` or `bld`
  for an area) and its own source, a crop wholly inside the map area, and at least one reading.
- `SchemaSet` now takes optional own schemas, and `load_schema` loads `finds.schema.json` if it is there.
- Tests: `tests/validate/test_finds.py` (fixtures in `tests/fixtures/finds/`). It includes P1 as a
  Hypothesis property: a file is accepted exactly when each reading resolves to a published
  feature with its crop inside the map area, and ids, slugs and orders are unique.
- `gen:types` also writes `web/src/evidence/finds.types.generated.ts`, with a freshness test
  (`web/src/evidence/findsTypes.test.ts`, a new file).

**P3, `data/finds.json`.** Six finds, 11 readings, from your table, transcribed as given. Find ids
are `find_0001` to `find_0006` in order (the table gave none). `buried validate` passes: every
crop is inside its map area, nothing to report.

**P4, MCP `find_places`.** It now returns `finds` before `addresses`, under one cursor. A find
matches when every query word is in its slug, tag, noun or any lettered line. Each reading carries
the lettering, crop, reader, date, the feature's status and the feature's `provenance.review` as
stored. A missing feature gives `null`, never a made-up state. Tests are in
`tests/mcp/test_finds.py`, including 60 finds paged under 20 KB. When no find matches, the result
is the old one plus `finds: []` and `find_matches: 0`.

## The failing property test

`test_published_areas_never_reach_outside_the_map_area`, example `x0=557, y0=10, w=2, h=2`. The
code was right and the property's generator was wrong. The area (557 to 559, 10 to 12) is inside the
map area (10 to 590 by 10 to 510), so the property expected a publish. Publish refused it for a
different cause: the test's `trace()` attaches a fixed 40 by 12 px lettering crop 4 px in from the
corner, which reaches x = 601 on a 600 px plate. A crop the use was read from must lie on the plate,
and there is already a test for that. Fix: the property now builds a crop equal to the area
(`trace_with_crop_in`), and the counterexample is kept as `@example`. The property itself is
unchanged: published exactly when inside, and then inside `mapped_area`.

## Schema version stamp (decision for you)

The Validator pins no stamp, so I first re-stamped everything 1.2.0, as `schema_version.py` said to.
That made `buried match` fail: a control file's SHA-256 is pinned in its alignment record, so any
change to a control file makes the record stale (and, one step on, every proposal made from it).
I reverted every non-evidence file to 1.1.0. Now `SCHEMA_VERSION` stays `1.1.0` (control, map area,
alignment, tiles, present, sources, project) and `EVIDENCE_SCHEMA_VERSION = "1.2.0"` is what
evidence files, `publish` and the migration use. The docstring says why. If you want every file at
1.2.0, `buried align-check` must be run again for both plates, and then `buried extract`.

## Left in `web/`

- Only mechanical edits: `review` in `web/src/evidence/testing/fixtures.ts` and in the three
  `web/src/explorer/testing/fixtures/data/evidence/synthetic_*.geojson` files; the generated types;
  `scripts/genTypes.ts`; one new test file.
- `npm --prefix web run typecheck` passes. `npm --prefix web test` has 3 failures, all in
  `src/place/plainSweep.test.tsx`, none from my changes. The test builds a workspace area with id
  `use_fip_v3_1911_229_0001`, which is now also the committed hand-traced coal yard. The two ids
  collide, so the test sees the committed area (the wording "Area traced by hand along the yard
  boundary..." and no 1935 sentence). The test needs a different workspace id or a fixture-only
  setup; that is the other session's file.
- `web/src/report/reviewClaims.test.tsx` still passes while printing "Confirmed by" from the
  record. W10 replaces that.

## What the spec got wrong or left open

- design.md "The finds file" shows `crop_px` as an array and `data/finds.json` ids absent; the
  session brief fixed the first, and I chose the ids.
- requirements 9.3 says "162 rule-drawn features `draft_rule`, the bank `draft_hand`". The real
  counts are 162 and 13 (the bank plus 12 traced), as the brief says.
- `read_by` for every reading is the draft wording from the brief; M1 replaces it.
- The spec does not say whether `schema_version` should rise on non-evidence files. See above.

## Sources hook

`data/sources.json` was saved twice (by my re-stamp and its revert). The hook found one gap, not
caused by this session: the two 1947 aerial ids have only the pattern row `aerial_1947_<id>` in
`sources.md`, so check 2 fails for `aerial_1947_s0012_fl1947_it0018h` and `..._it0022d`. Every
other entry passes.

## Commands

All from the repository root: `uv --directory pipeline run pytest -q` (all pass), `uv --directory
pipeline run ruff check .` (clean), `uv --directory pipeline run buried validate` (OK: 18 files,
175 features), `npm --prefix web run typecheck` (clean), `npm --prefix web test` (3 failures,
above). Not run: Unity tests, Playwright.
