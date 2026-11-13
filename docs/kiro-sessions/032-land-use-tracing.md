# Kiro session 032: land-use areas in the Studio and on the place page (web lane)

Agent: builder (claude-sonnet-5.5). Checkout: the `lane/web` worktree (main is merged in: the
service now publishes land-use areas from `trace` decisions with `kind: land_use`, and the API
schema and generated types include them). Lane: `web/` only. No bridge changes. Commit with
`git commit -m ... -- <paths>`.

Read only: this brief; `data/schema/studio_api.schema.json` (the trace decision and its land-use
fields) and the four land-use fixtures under `data/schema/studio_api_fixtures/`; spec 04
`tasks.md` group 19 and requirements 24.1 to 24.5; `.kiro/steering/product.md` decision 5 and the
honesty rules; your Studio review code and `web/src/report/` findings code.

## Why

"What the land was used for" is the part of Buried a buyer, renovator or neighbour would act on.
The plates letter it plainly (yards, works, factories, stables, shops). A person must be able to
record it in under a minute per area.

## Build

1. **Trace tool in the Studio's Review step.** A "Trace an area" mode: click to place vertices on
   the plate, Enter or double-click closes, Escape cancels, Backspace removes the last vertex,
   vertices can be dragged before saving. Then a small form: "Use as lettered on the plate"
   (required, typed exactly as printed), and a crop the reviewer drags around the lettering it was
   read from (required; the form shows the crop). Saved areas draw as a hatched `ink` outline with
   their lettered use as a label, appear in the review list under "Areas", and can be edited or
   deleted before publishing. Keyboard path for every step.
2. **Checks before publish.** Mirror the service's refusals in the UI so nothing fails late: no
   lettered text or no crop, an area not wholly inside the map area, a self-crossing outline. If
   the lettered text contains a banned word, warn that the Report will refer to the source instead
   of quoting it (requirement 24.5); do not block.
3. **Publish and workspace.** Areas go in the same publish request as building decisions, come
   back as `use_` features, are stored in the workspace and exported in the bundle.
4. **Place page and Report.** `use_` features drive "What the land was used for": on the lot or
   near it (the same lot-relation rule), quoted once as "lettered on the 1911 plan as '...'", with
   the crop of the lettering shown in the evidence card. In the 2D fallback and the core-sample
   crops, areas draw hatched. The scene itself does not draw areas yet; say so in your report.
5. Validate the four land-use API fixtures with the TypeScript validator in the conformance test
   (the pipeline lane only ran the Python side).

## Checks

Playwright (with the service started through `webServer`, never plate 232): trace one area on
`fip_v3_1911_229` over the yard lettered "COAL & WOOD YARD" near Sumach St, type the use as
lettered, set its crop, publish as a test reviewer with a reviewed area, open the place page of a
lot it touches, and assert the land-use sentence and the crop. Screenshots
`landuse-studio.png`, `landuse-place.png`. Property tests where real: a saved area always passes
the service's own validation; an area never yields a land-use sentence for a lot it neither
overlaps nor nears under the lot-relation rule.

Never weaken a test. Narrow tests while iterating, full suites once at the end. Commit per item.
Do not push. Short final report.
