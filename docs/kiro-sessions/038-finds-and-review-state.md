# Session 038: finds file, review state, MCP finds (builder, pipeline lane)

Agent: `builder`. You are in the pipeline worktree (`lane/pipeline`). Group P of spec 06.

## Read first, and only these

- `.kiro/specs/06-first-visit/requirements.md`: requirements 8 and 9.
- `.kiro/specs/06-first-visit/design.md`: "The finds file", "Review state", "Properties" P1 and P3.
- `.kiro/specs/06-first-visit/tasks.md`: group P.
- `data/schema/evidence.schema.json`: the `provenance` and `feature` definitions.
- `pipeline/buried_pipeline/validate/` (how a check is registered), `pipeline/buried_pipeline/mcp/`
  (how `find_places` is built), `pipeline/buried_pipeline/publish/build.py` (where a published
  feature's provenance is written).

Do not read other specs.

## What already happened (data, by hand, before this session)

A maintainer traced the named buildings the rule-based extraction missed, straight into the
evidence files, as drafts. `buried validate` passes and `buried match` linked each pair.

| Tag | 1911 feature | 1935 feature |
|---|---|---|
| Overall factory | `bld_fip_v3_1911_229_0101` | `bld_fip_v3_1935_229_0064` |
| Bank | `bld_fip_v3_1911_229_0001` | (none traced yet) |
| Machine shop | `bld_fip_v3_1911_229_0102` | `bld_fip_v3_1935_229_0065` |
| Coal shed (inside the yard) | `bld_fip_v3_1911_229_0103` | `bld_fip_v3_1935_229_0066` |
| Cork factory | `bld_fip_v3_1911_229_0104` | `bld_fip_v3_1935_229_0067` |
| Mission hall | `bld_fip_v3_1911_229_0105` | `bld_fip_v3_1935_229_0068` |
| Coal yard (area) | `use_fip_v3_1911_229_0001` | `use_fip_v3_1935_229_0001` |

Eight rule-drawn fragments that sat inside those outlines now have `status: merged`.

## Tasks

Do them in this order. Commit each on its own with
`git commit -m "<message>" -- <paths>` (paths listed, never a bare commit). No Co-Authored-By line.

### P2 first: evidence schema 1.2.0 with `provenance.review`

As design.md "Review state". The migration (`pipeline/buried_pipeline/migrate/review_state.py`,
idempotent, with tests) sets:

- `draft_hand` for the bank and for the twelve features in the table above (every feature whose
  `confirmed_by` contains "tracing by hand" or "gate draft"),
- `draft_rule` for everything else, merged fragments included.

Run it over `data/evidence/*.geojson`, bump `schema_version` wherever the Validator requires it,
make `buried publish` write `reviewed` with the reviewer and date from the decisions file, and
regenerate `web/src/evidence/types.generated.ts` with the existing `npm run gen:types`.
`buried validate` must pass.

The web side must keep compiling. Run `npm --prefix web run typecheck` and
`npm --prefix web test -- src/evidence`. Where a web test fixture or sample file needs the new
field, add it (mechanical edits to fixture and test data only). Do not edit web components or
their wording: another session owns `web/src/` outside `web/src/evidence/*.generated.ts` and
fixture data. If something else in `web/` breaks, list it in your notes and leave it.

Add one short paragraph on `provenance.review` to `.kiro/steering/evidence.md` (what the three
states mean, and that `confirmed_by` is the publishing record and is never printed as a status).

### P1: finds schema and validation

As design.md "The finds file" and tasks P1. Use the evidence schema's `cropPx` object shape
(`x`, `y`, `width`, `height`, full-resolution source pixels) for `crop_px`, not an array.

### P3: `data/finds.json`

Write it from this table. Transcriptions are exactly as given here; do not tidy them. `read_by`
is `"Buried maintainers (draft reading, not yet reviewed)"` and `read_on` is `2026-11-13` for
every reading; a maintainer replaces these after review (task M1).

| order | slug | tag | noun | kind | source | feature | lettered (first line is the title) | crop_px x, y, width, height |
|---|---|---|---|---|---|---|---|---|
| 1 | overall-factory | Overall factory | factory | building | fip_v3_1911_229 | bld_fip_v3_1911_229_0101 | "Glove & Overall Factory"; "Hamilton Carhartt Mfr. Ltd." | 3393, 1422, 552, 425 |
| 1 | | | | | fip_v3_1935_229 | bld_fip_v3_1935_229_0064 | "Glove & Overall Fac."; "Carhartt Hamilton" | 1947, 805, 270, 360 |
| 2 | bank | Bank | bank | building | fip_v3_1911_229 | bld_fip_v3_1911_229_0001 | "Bank of Nova Scotia"; "Off. 2nd" | 3640, 1288, 276, 262 |
| 3 | coal-yard | Coal yard | yard | area | fip_v3_1911_229 | use_fip_v3_1911_229_0001 | "Coal & Wood Yard"; "J. W. Corson & Co." | 774, 3885, 468, 135 |
| 3 | | | | | fip_v3_1935_229 | use_fip_v3_1935_229_0001 | "Coal & Wood Yard"; "Northern Fuels Co." | 732, 2050, 255, 60 |
| 4 | machine-shop | Machine shop | shop | building | fip_v3_1911_229 | bld_fip_v3_1911_229_0102 | "Machine Shop"; "Wm. R. Perrin & Co. Limited" | 2918, 1790, 560, 687 |
| 4 | | | | | fip_v3_1935_229 | bld_fip_v3_1935_229_0065 | "Machine Shop"; "Wm. R. Perrin & Co. Limited" | 1752, 1030, 275, 325 |
| 5 | cork-factory | Cork factory | factory | building | fip_v3_1911_229 | bld_fip_v3_1911_229_0104 | "Cork Fac."; "Freyseng Cork Co. Ltd." | 753, 1309, 630, 284 |
| 5 | | | | | fip_v3_1935_229 | bld_fip_v3_1935_229_0067 | "Freyseng Cork Co. Ltd."; "Cork Fac." | 692, 840, 300, 55 |
| 6 | mission-hall | Mission hall | hall | building | fip_v3_1911_229 | bld_fip_v3_1911_229_0105 | "Baptist Mission Hall" | 3308, 5838, 163, 284 |
| 6 | | | | | fip_v3_1935_229 | bld_fip_v3_1935_229_0068 | "Baptist Mission Hall" | 1982, 2950, 90, 75 |

`buried validate` must pass with the file in place. If a crop fails "inside the map area", report
the numbers in your notes; do not move a crop yourself.

### P4: MCP `find_places` returns finds

As tasks P4. Keep results paged and under the 20 KB cap.

### One failing property test to settle

`pipeline/tests/publish/test_land_use.py::test_published_areas_never_reach_outside_the_map_area`
fails today, before any of your changes, with the Hypothesis example `x0=557, y0=10, w=2, h=2`
(a 2 by 2 pixel area at the edge of the map area). Find out which side is wrong: the code
publishing something it should refuse, or the property's idea of "inside". Fix that side, keep
the counterexample as an explicit `@example`, and say what it was in your notes. Do not loosen
the property to make it pass.

## Test while you work

Narrow runs: `uv run pytest tests/validate tests/migrate tests/mcp tests/publish -q` from
`pipeline/`. At the end run `uv run pytest -q` once (it takes several minutes), `uv run ruff
check .`, and `uv run buried validate`.

## Notes file

Write `docs/kiro-sessions/038-notes.md`: what you built, the property-test finding, anything in
`web/` you had to leave, and anything the spec got wrong.
