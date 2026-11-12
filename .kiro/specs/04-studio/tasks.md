# Tasks: 04 Reconstruction Studio

Property-based test tasks are marked **[PBT]** and name the correctness property from `design.md`
they implement. A task is done only when its tests pass. Do not weaken a property to make it pass.

Dependencies:
- Spec 01: tasks 1 to 9 and 12 to 14 (Schema, registry, web package, Validator, date logic, era
  lists, lot relation, findings, `positionPhrase`).
- Spec 02: tasks 1 to 3 (align), 6 (tile), 7 (extract), 8 (publish), 10.5 (all present layers) and
  11 (match).
- Spec 03: tasks 1.2 (data plugin), 9.1 (search, lots, coverage), 11.1 (`edge.ts`, `MapView2D`),
  12.1 (`applyEvidenceUpdate`), and group 2 (full bridge catalogue).
- Spec 05: task 6.1 (the Explorer deep link `/?era=&lot=`), for "View in Explorer" in task 13.4.
- Session 007: spec 01 tasks 16 to 19 (schema 1.1.0) and spec 02 tasks 14 and 15 (map areas,
  control hull) before task 2 and tasks 19 to 22 here.

Do not open, crop, sample or commit anything for the held-out plate `fip_v3_1935_232` in any task.
It goes through the Studio live, in the demo, and nowhere else.

Run order: 1, 2, 3, 4, 5, 6, 7, 8 (Service), then 9 to 16 (Studio) with 19 to 22 alongside the
steps they extend, then 17 and 18.

- [ ] 1. The Service API Schema and the data version
  - [ ] 1.1 Write `data/schema/studio_api.schema.json` (draft 2020-12): request and response bodies
    for every endpoint in design.md "Endpoints", the proposal file (from spec 02 design "Proposal
    file"), `decisionsV2`, `labelRead`, the workspace state, the error body, and `api_version`
    `1.0.0`; `$ref` to `evidence.schema.json` for `source`, `controlPoints`, `alignmentRecord`,
    `featureCollection`, `tileSidecar`, `position`, `sourceId`, `featureId`. Write valid and invalid
    fixtures (one reason per invalid file, named after it).
    Files: `data/schema/studio_api.schema.json`, `data/schema/studio_api_fixtures/valid/**`,
    `data/schema/studio_api_fixtures/invalid/**`.
    Requirements: 2.1, 2.5.
  - [ ] 1.2 Implement the data version rule in Python and TypeScript, with a shared fixture tree and
    its expected hash; extend the Vite data plugin to write `data_version` into `/data/index.json`.
    Files: `pipeline/buried_pipeline/service/data_version.py`, `web/src/workspace/dataVersion.ts`,
    `web/vite/dataPlugin.ts`, `data/schema/studio_api_fixtures/data_version/**`,
    `pipeline/tests/service/test_data_version.py`, `web/src/workspace/dataVersion.test.ts`.
    Requirements: 2.6.
  - [ ] 1.3 Conformance tests in both suites over `studio_api_fixtures/`; generate
    `web/src/studio/service/types.generated.ts` with a regeneration test.
    Files: `pipeline/tests/service/test_contract_conformance.py`,
    `web/src/studio/service/conformance.test.ts`, `web/scripts/genStudioApiTypes.ts`,
    `web/src/studio/service/types.generated.ts`, `web/src/studio/service/types.test.ts`.
    Requirements: 2.3, 2.4, 22.3.

- [ ] 2. Extend spec 02's publish and extract
  - [ ] 2.1 Implement `publish/decisions_v2.py` (parse v2 and spec 02's v1 file, review item ids,
    one-decision-per-proposal check) and extend `publish/build.py`: merge, split, trace, water
    features (`wtr_`), land-use features (`use_`, task 19), the shared sequence across kinds,
    `tone_class` and attribute-read rules (no material without a read), `crop_px` rules, the
    confidence defaults, `mapped_area` from the map area intersected with the project bounds,
    reviewed-area `covers`, and the undecided-proposal check for
    reviewed areas. Make `buried publish` read a v2 file when present. Example tests for each
    decision type, both file versions and every refusal.
    Files: `pipeline/buried_pipeline/publish/decisions_v2.py`, `pipeline/buried_pipeline/publish/build.py`,
    `pipeline/buried_pipeline/publish/run.py`, `pipeline/tests/publish/test_decisions_v2.py`,
    `pipeline/tests/publish/test_build_v2.py`.
    Requirements: 9.8, 13.3, 23.1 to 23.4, 23.6, 23.7, 24.1, 24.2, 27.2.
  - [ ] 2.2 **[PBT] S1** Publish never emits a feature the validator rejects (extend spec 02's
    publish strategies with v2 decisions, water and lines).
    Files: `pipeline/tests/publish/test_publish_v2_properties.py`, `pipeline/tests/publish/strategies.py`.
    Requirements: 13.4, 13.5, 23.1 to 23.4.
  - [ ] 2.3 **[PBT] S2** Decisions are consumed exactly once.
    Files: `pipeline/tests/publish/test_publish_v2_properties.py`.
    Requirements: 9.8, 23.1 to 23.3.
  - [ ] 2.4 **[PBT] S11** Mapped areas stay inside the bounds.
    Files: `pipeline/tests/publish/test_publish_v2_properties.py`.
    Requirements: 23.4.
  - [ ] 2.5 Implement `extract/region.py`: region crop at the working pixel size and border drop,
    inside the map area (spec 02 task 14.1's reader). No neatline detection and no
    `neatline_pixel_size_m` (session 007: the map area is set by a person). The held-out guard
    (spec 02 task 7.2) must still pass.
    Files: `pipeline/buried_pipeline/extract/region.py`, `pipeline/tests/extract/test_region.py`.
    Requirements: 8.2, 23.5, 25.1.
  - [ ] 2.6 **[PBT] S10** Regions do not change interior proposals (synthetic plates).
    Files: `pipeline/tests/extract/test_region_properties.py`.
    Requirements: 8.5, 23.5.

- [ ] 3. Service skeleton, safety and the held-out guard
  - [ ] 3.1 Add the `service` optional dependency group and `pathspec` as a dev dependency. Implement
    `app.py` (routes wired to stubs, CORS from `BURIED_ALLOWED_ORIGINS`, 10 MB JSON body limit, the
    error body), `config.py`, `contract.py` (request validation, 422 with errors; `api_version` and
    `data_version` checks with 409), `snapshot.py` and `GET /v1/health`. Add `pipeline/.env.example`
    with the variable names in design.md "Configuration" and no values. Test-mode startup refusal
    unless `BURIED_TEST_MODE=1`.
    Files: `pipeline/pyproject.toml`, `pipeline/uv.lock`, `pipeline/buried_pipeline/service/__init__.py`,
    `pipeline/buried_pipeline/service/app.py`, `pipeline/buried_pipeline/service/config.py`,
    `pipeline/buried_pipeline/service/contract.py`, `pipeline/buried_pipeline/service/snapshot.py`,
    `pipeline/.env.example`, `pipeline/tests/service/test_app.py`.
    Requirements: 1.1, 1.4, 2.2, 2.5, 2.6, 3.4, 3.5, 3.9.
  - [ ] 3.2 Implement `limits.py` (per-address hourly limits, the extraction concurrency limit and the
    daily label cap) with 429 and a retry time. Tests with an injected clock.
    Files: `pipeline/buried_pipeline/service/limits.py`, `pipeline/tests/service/test_limits.py`.
    Requirements: 1.4, 3.6.
  - [ ] 3.3 Add a logging filter and a test that request bodies, uploaded bytes, crops, label text
    and credential values never reach the log output.
    Files: `pipeline/buried_pipeline/service/app.py`, `pipeline/tests/service/test_logging.py`.
    Requirements: 3.8.
  - [ ] 3.4 Write `pipeline/Dockerfile` (Python 3.12 slim, `uv sync --extra service --frozen`,
    uvicorn) and `pipeline/.dockerignore` with the include list in design.md "Hosting". Write the
    held-out guard over the build context, and the test that the extract endpoint has no stored-result
    path (spy on spec 02's extraction entry point, two calls, two runs).
    Files: `pipeline/Dockerfile`, `pipeline/.dockerignore`,
    `pipeline/tests/service/test_held_out_service.py`.
    Requirements: 1.5, 17.1 to 17.3, 19.1.
  - [ ] 3.5 Record in `.kiro/steering/tech.md`: `uv sync --extra service`,
    `uv run uvicorn buried_pipeline.service.app:create_app --factory --reload` (dev server, from
    `pipeline/`), and `docker build -f pipeline/Dockerfile .` (from the repository root).
    Files: `.kiro/steering/tech.md`.
    Requirements: 22.4.

- [ ] 4. Plates: index, fetch, uploads, images
  - [ ] 4.1 Implement `plates.py`: index query on the two layers (24 h in-memory cache), `in_bounds`,
    source id check, URL building with spec 02's `fetch/plates.py` URL function, host allowlist,
    download through spec 02's HTTP client and `zipsafe`, inspect with spec 02's functions. Endpoints
    `GET /v1/plates/index` and `POST /v1/plates/fetch`. Tests with fake index and zip responses.
    Files: `pipeline/buried_pipeline/service/plates.py`, `pipeline/buried_pipeline/service/app.py`,
    `pipeline/tests/service/test_plates.py`, `pipeline/tests/fixtures/service/**`.
    Requirements: 3.1, 3.2, 4.1 to 4.4.
  - [ ] 4.2 **[PBT] S9** Only allowlisted downloads.
    Files: `pipeline/tests/service/test_plates_properties.py`.
    Requirements: 3.1, 3.2, 4.3.
  - [ ] 4.3 Implement `raster_cache.py` (plate refs, URL map, LRU for index plates, 2 h TTL and
    startup clearing for uploads, no result storage) and `uploads.py` (formats, byte and pixel
    limits read from headers, `zipsafe`, GDAL driver restriction, no georeferencing allowed).
    Endpoints `POST /v1/uploads` and `DELETE /v1/uploads/{plate_ref}`. Tests for each refusal and
    for TTL expiry with an injected clock.
    Files: `pipeline/buried_pipeline/service/raster_cache.py`, `pipeline/buried_pipeline/service/uploads.py`,
    `pipeline/buried_pipeline/service/app.py`, `pipeline/tests/service/test_uploads.py`,
    `pipeline/tests/service/test_raster_cache.py`.
    Requirements: 1.5, 3.3, 3.7, 5.1, 5.5.
  - [ ] 4.4 Implement `images.py` and the image and crop endpoints, using spec 02's tile downsample
    rules (area averaging, quality 85, no colour change). Test that pixel values are unchanged apart
    from averaging on a synthetic patch image.
    Files: `pipeline/buried_pipeline/service/images.py`, `pipeline/buried_pipeline/service/app.py`,
    `pipeline/tests/service/test_images.py`.
    Requirements: 4.3, 12.5.

- [ ] 5. Align endpoint
  - [ ] 5.1 Implement `POST /v1/align` per design.md "Align": reference check against canon present
    layers, spec 02 align functions, refined-only for plates without georeferencing, the digitising
    term and smallest feature error from `publish/build.py`'s function, tile corners and the bilinear
    check, canonical texts. Tests for 3 points, 4+ points, collinear points, no georeferencing and a
    bad reference.
    Files: `pipeline/buried_pipeline/service/app.py`, `pipeline/buried_pipeline/service/align.py`,
    `pipeline/tests/service/test_align.py`.
    Requirements: 1.3, 5.3, 7.4, 7.6.
  - [ ] 5.2 **[PBT] S4** (Python half) The align endpoint's figures equal spec 02's functions on the
    same inputs.
    Files: `pipeline/tests/service/test_align_properties.py`.
    Requirements: 7.4, 7.7.

- [ ] 6. Extract endpoint
  - [ ] 6.1 Implement `POST /v1/extract`: refuse without an alignment record (request or canon),
    check the region size (300 m a side), run `extract/region.py` with the committed parameter set,
    drop proposals outside the project bounds, return the proposal file text and dropped counts.
    Files: `pipeline/buried_pipeline/service/app.py`, `pipeline/buried_pipeline/service/extract.py`,
    `pipeline/tests/service/test_extract.py`.
    Requirements: 8.1, 8.2, 8.4.

- [ ] 7. Label assist in the Service
  - [ ] 7.1 Implement `labels/provider.py` (protocol, result, per-field parsing), `labels/none.py`,
    `labels/prompt.py`, `labels/bedrock.py` (Converse API, temperature 0, 64 tokens, 10 s timeout,
    no retry), the label crop in `images.py`, and `POST /v1/labels` with the consent rule for uploads
    and the daily cap. Tests with a fake Bedrock client: proposed, not legible, malformed reply,
    timeout, no credentials, over cap, upload without consent.
    Files: `pipeline/buried_pipeline/service/labels/*.py`, `pipeline/buried_pipeline/service/app.py`,
    `pipeline/tests/service/test_labels.py`.
    Requirements: 11.1, 11.2, 11.4 to 11.6.
  - [ ] 7.2 **[PBT] S8** (Python half) Every provider reply parses to `proposed` with text matching
    the field's pattern, or to `not_legible`.
    Files: `pipeline/tests/service/test_labels_properties.py`.
    Requirements: 11.4.

- [ ] 8. Overlay, publish and match endpoints
  - [ ] 8.1 Implement `overlay.py` (would-be `data/` state; the three refusals in design.md) and
    `POST /v1/publish` with `dry_run`, errors carrying review item ids. Tests: dry run, success,
    validation failure, overlay refusals, undecided proposals inside a reviewed area.
    Files: `pipeline/buried_pipeline/service/overlay.py`, `pipeline/buried_pipeline/service/app.py`,
    `pipeline/tests/service/test_publish_endpoint.py`.
    Requirements: 1.3, 1.7, 13.3 to 13.7.
  - [ ] 8.2 Implement `workspace_match.py` and `POST /v1/match`.
    Files: `pipeline/buried_pipeline/service/workspace_match.py`, `pipeline/buried_pipeline/service/app.py`,
    `pipeline/tests/service/test_match_endpoint.py`.
    Requirements: 12.3, 12.4.
  - [ ] 8.3 **[PBT] S13** Workspace match never changes canon.
    Files: `pipeline/tests/service/test_match_properties.py`.
    Requirements: 12.3, 12.4.
  - [ ] 8.4 **[PBT] S12** (Python) Export reproduces publish, including after the upload id rewrite
    (implement the rewrite as a pure function in `buried_pipeline/service/rewrite.py` used by the
    test as the oracle for the TypeScript rewrite fixtures in task 14.1).
    Files: `pipeline/buried_pipeline/service/rewrite.py`, `pipeline/tests/service/test_export_properties.py`.
    Requirements: 16.2, 16.3.

- [ ] 9. Studio client and the workspace
  - [ ] 9.1 Implement `service/client.ts` (the only caller of the Service; `api_version` and data
    version on every request; 5 s health timeout; per-endpoint timeouts; Ajv on every response;
    error mapping to the messages in design.md "Error handling").
    Files: `web/src/studio/service/client.ts`, `web/src/studio/service/client.test.ts`.
    Requirements: 2.3, 2.5, 2.6, 3.10, 19.3.
  - [ ] 9.2 Implement `workspace/db.ts` (stores in design.md, with `idb`), `load.ts` (Ajv, the three
    conflict rules, problems list) and `merge.ts` (`mergeForDisplay`, `originOf`). Tests with
    `fake-indexeddb`, including IndexedDB unavailable.
    Files: `web/src/workspace/db.ts`, `web/src/workspace/load.ts`, `web/src/workspace/merge.ts`,
    `web/src/workspace/*.test.ts`, `web/package.json`.
    Requirements: 14.1 to 14.3, 14.6.
  - [ ] 9.3 Implement `import/studioSources.ts` (canon, index and upload records; the Volume 3 licence
    note and attribution line as constants, tested equal to the canon showcase plate records;
    `rights_checked_on: null` for unregistered index plates; refusing an id registered in canon).
    Files: `web/src/studio/import/studioSources.ts`, `web/src/studio/import/studioSources.test.ts`.
    Requirements: 6.1 to 6.4.

- [ ] 10. Import and Align in the Studio
  - [ ] 10.1 Implement `StudioPage.tsx` (route `/studio`, step bar, health check), `PlatePicker.tsx`
    (in-bounds plates, unavailable reason, canon status, read-only for published plates, canon
    alignment reuse) and `UploadForm.tsx` (source record fields, statement, notices, delete on leave).
    Files: `web/src/studio/StudioPage.tsx`, `web/src/studio/import/PlatePicker.tsx`,
    `web/src/studio/import/UploadForm.tsx`, `web/src/App.tsx`, `web/src/studio/import/*.test.tsx`.
    Requirements: 4.1, 4.2, 4.5, 4.6, 5.1, 5.2, 5.4, 5.5.
  - [ ] 10.2 Implement `web/src/map/presentLayers.ts` (layers and looks in design.md "Today's map"),
    `MapPane.tsx` and `PlatePane.tsx` with `plateView.ts`; switch spec 03's `MapView2D` to
    `presentLayers.ts`. Test that every generated style has no URL outside `/data/`, no glyphs, no
    sprite and no symbol layer.
    Files: `web/src/map/presentLayers.ts`, `web/src/map/presentLayers.test.ts`,
    `web/src/studio/map/MapPane.tsx`, `web/src/studio/plate/PlatePane.tsx`,
    `web/src/studio/plate/plateView.ts`, `web/src/studio/plate/plateView.test.ts`,
    `web/src/map/MapView2D.tsx`.
    Requirements: 7.1, 18.1 to 18.4.
  - [ ] 10.3 Implement `snapping.ts`, `controlPoints.ts`, `AlignView.tsx` and `ErrorPanel.tsx`
    (keyboard placement, descriptions, debounced align calls with newest-wins, labelled figures,
    "Use this alignment", discard prompt when points change after extraction).
    Files: `web/src/studio/align/*.ts`, `web/src/studio/align/*.tsx`, `web/src/studio/align/*.test.ts`.
    Requirements: 7.2 to 7.8.
  - [ ] 10.4 **[PBT] S5** References are copied, never computed.
    Files: `web/src/studio/align/snapping.property.test.ts`.
    Requirements: 7.2, 7.3.
  - [ ] 10.5 **[PBT] S4** (TypeScript half) The displayed figure is `positionPhrase` of the response
    value.
    Files: `web/src/studio/align/errorPanel.property.test.ts`.
    Requirements: 7.5, 7.7.

- [ ] 11. Extract and Review in the Studio
  - [ ] 11.1 Implement `ExtractView.tsx` and `region.ts` (size in metres, 300 m limit, sequenced draw
    with the reduced-motion path, dropped counts).
    Files: `web/src/studio/extract/ExtractView.tsx`, `web/src/studio/extract/region.ts`,
    `web/src/studio/extract/*.test.ts`.
    Requirements: 8.1, 8.3, 20.5.
  - [ ] 11.2 Implement `geometryOps.ts` (nudge, insert, delete, merge, split in integer pixels).
    Files: `web/src/studio/review/geometryOps.ts`, `web/src/studio/review/geometryOps.test.ts`.
    Requirements: 9.1, 9.3.
  - [ ] 11.3 **[PBT] S6** Pixel edits stay valid and integer.
    Files: `web/src/studio/review/geometryOps.property.test.ts`.
    Requirements: 9.1, 9.3.
  - [ ] 11.4 Implement `reviewModel.ts` (actions, undo and redo, decisions file v2, confidence
    defaults), `keymap.ts`, `ReviewView.tsx`, `ReviewList.tsx` and `AttributeForm.tsx` (review states
    drawn and named per requirement 9.2, no `lantern`).
    Files: `web/src/studio/review/*.ts`, `web/src/studio/review/*.tsx`, `web/src/studio/review/*.test.ts*`.
    Requirements: 9.1, 9.2, 9.4 to 9.7.
  - [ ] 11.5 **[PBT] S7** The review reducer keeps one decision per proposal.
    Files: `web/src/studio/review/reviewModel.property.test.ts`.
    Requirements: 9.5, 9.6, 9.8.

- [ ] 12. Tracing, label assist and the aerial check
  - [ ] 12.1 Implement `TraceTool.tsx` (water lines and polygons, building polygons, keyboard
    cursor; plates only) feeding the review model.
    Files: `web/src/studio/trace/TraceTool.tsx`, `web/src/studio/trace/TraceTool.test.tsx`,
    `web/src/studio/review/reviewModel.ts`.
    Requirements: 10.1 to 10.5.
  - [ ] 12.2 Implement `LabelAssist.tsx` (field choice, crop, plain-text proposal, Confirm and Edit,
    banned-word warning, unavailable message, upload consent) and label reads and street numbers in
    the review model.
    Files: `web/src/studio/labels/LabelAssist.tsx`, `web/src/studio/labels/LabelAssist.test.tsx`,
    `web/src/studio/review/reviewModel.ts`.
    Requirements: 11.2, 11.3, 11.5 to 11.8.
  - [ ] 12.3 **[PBT] S8** (TypeScript half) A label read changes nothing until confirmed, and then
    only its one attribute.
    Files: `web/src/studio/review/labels.property.test.ts`.
    Requirements: 11.3, 11.4.
  - [ ] 12.4 Implement `AerialCheck.tsx` (pending items, aerial at original colours, form, match
    endpoint for workspace features, match decisions for canon features).
    Files: `web/src/studio/aerial/AerialCheck.tsx`, `web/src/studio/aerial/AerialCheck.test.tsx`.
    Requirements: 4.5, 12.1 to 12.5.

- [ ] 13. Publish and the Explorer
  - [ ] 13.1 Implement `PublishView.tsx` (reviewer name, reviewed areas with the statement, dry run on
    entry and on change, errors next to items, publish, store the returned texts and tile unchanged).
    Files: `web/src/studio/publish/PublishView.tsx`, `web/src/studio/publish/PublishView.test.tsx`.
    Requirements: 13.1 to 13.7.
  - [ ] 13.2 Bridge version `1.1.0`: change the drape `url` pattern to allow `blob:` URLs, update the
    fixtures, the C# parser pattern and `BridgeVersion`, and rerun spec 03's E1 and E2. Add an
    end-to-end test that the Player loads a drape from a `blob:` URL.
    Files: `data/schema/bridge.schema.json`, `data/schema/bridge_fixtures/**`,
    `web/src/bridge/types.generated.ts`, `unity/Assets/Buried/Runtime/Bridge/*.cs`,
    `web/e2e/blobDrape.spec.ts`.
    Requirements: 15.5.
  - [ ] 13.3 Wire the workspace into the Shell: Explorer, 2D map and coverage over the merged
    collections; workspace drapes; `cardModel`, `FeatureList` and `HoverLabel` taking `originOf` and
    showing the workspace label; the Explorer status line for workspace problems; the Sources page
    "Your workspace" section.
    Files: `web/src/explorer/Explorer.tsx`, `web/src/explorer/cardModel.ts`,
    `web/src/explorer/FeatureList.tsx`, `web/src/explorer/HoverLabel.tsx`,
    `web/src/explorer/drapes.ts`, `web/src/explorer/coverage.ts`, `web/src/map/MapView2D.tsx`,
    `web/src/sources/SourcesPage.tsx`, and their tests.
    Requirements: 6.5, 6.6, 14.4, 15.1, 15.4, 15.5.
  - [ ] 13.4 Implement `seen.ts` and the rise on Explorer mount; "View in Explorer" with the era
    rule and the "No Explorer era" message.
    Files: `web/src/workspace/seen.ts`, `web/src/workspace/seen.test.ts`,
    `web/src/explorer/Explorer.tsx`, `web/src/studio/publish/PublishView.tsx`.
    Requirements: 15.2, 15.3.
  - [ ] 13.5 **[PBT] S3** A workspace feature never appears as canon.
    Files: `web/src/workspace/merge.property.test.ts`.
    Requirements: 6.4, 6.5, 14.3 to 14.5, 15.5.

- [ ] 14. Export
  - [ ] 14.1 Implement `exportBundle.ts` (bundle layout and README from design.md "Export bundle",
    verbatim texts, upload id rewrite) with fixtures checked against the Python rewrite from task 8.4.
    Files: `web/src/workspace/exportBundle.ts`, `web/src/workspace/exportBundle.test.ts`,
    `web/src/workspace/testing/rewrite_fixtures/**`.
    Requirements: 16.1 to 16.4.

- [ ] 15. Hosting and the Service being unavailable
  - [ ] 15.1 Add `web/public/_headers`, the unavailable state in `StudioPage.tsx`, and the walkthrough
    player (captions, transcript link). Test that the Explorer, Report and Sources routes render
    with the Service unreachable.
    Files: `web/public/_headers`, `web/src/studio/StudioPage.tsx`,
    `web/src/studio/Walkthrough.tsx`, `web/e2e/serviceDown.spec.ts`.
    Requirements: 19.2, 19.3, 19.4.
  - [ ] 15.2 Deploy (maintainer): the site to Cloudflare Pages with `VITE_STUDIO_SERVICE_URL`, the
    Service to Railway from `pipeline/Dockerfile` with the environment variables set as Railway
    variables and secrets, both from the same commit. Record the deploy steps under "Commands" in
    `.kiro/steering/tech.md` and the URLs in `docs/kiro-sessions/` notes.
    Files: `.kiro/steering/tech.md`, `docs/kiro-sessions/<NNN>-deploy.md`.
    Requirements: 19.1, 19.5, 22.4.
  - [ ] 15.3 Record the walkthrough (maintainer) from a real Studio session, with WebVTT captions and
    an HTML transcript, no third-party logos or footage.
    Files: `web/public/walkthrough/**`.
    Requirements: 19.4.

- [ ] 16. Accessibility and end-to-end
  - [ ] 16.1 Live region announcements, DOM lists for both panes, focus rings, reduced motion.
    Files: `web/src/studio/**`.
    Requirements: 20.1 to 20.5.
  - [ ] 16.2 End-to-end tests against a local Service in test mode (design.md "Testing strategy"):
    the full flow with keys only, Service errors, axe scan with no serious or critical violations.
    Record `npm run test:e2e:studio` in `.kiro/steering/tech.md`.
    Files: `web/e2e/studio.spec.ts`, `web/e2e/studioKeyboard.spec.ts`, `web/playwright.config.ts`,
    `web/e2e/fixtures/studio_plates/**`, `.kiro/steering/tech.md`.
    Requirements: 20.1, 20.4, 22.2, 22.4.

- [ ] 17. Studio budget and demo readiness (maintainer)
  - [ ] 17.1 Measure the four response times against the deployed Service on a tuning plate
    (`fip_v3_1911_229` or `fip_v3_1935_229`) and record them with the date, Railway plan, plate and
    region. If extraction exceeds 30 s at 300 m a side, lower `MAX_REGION_SIDE_M` in design.md and
    the code in one change, and record why.
    Files: `docs/kiro-sessions/<NNN>-studio-budget.md`.
    Requirements: 21.1 to 21.5.
  - [ ] 17.2 Before the demo: run the held-out guard, confirm the deployed Service health shows the
    site's data version and `label_provider` as intended, optionally pre-warm the raster cache with
    plate 232's download (input only), and confirm no workspace in the demo browser holds anything
    for `fip_v3_1935_232`. Record the checks in `docs/kiro-sessions/` notes.
    Files: `docs/kiro-sessions/<NNN>-demo-readiness.md`.
    Requirements: 17.1 to 17.4.

- [ ] 18. Final check
  - [ ] 18.1 Run `uv run ruff check .` and `uv run pytest` in `pipeline/`, and `npm test`,
    `npm run typecheck` and `npm run test:e2e:studio` in `web/`. All pass. Confirm every property S1
    to S14 has a passing test and both held-out tests pass.
    Files: none.
    Requirements: 22.1 to 22.3.

- [ ] 19. Land-use areas (session 007)
  - [ ] 19.1 Add `land_use` to the trace tool, the review model, the decisions file v2 and the
    Service API Schema; require a `use` with an attribute read (crop over the lettering); default
    confidence per design.md; banned-word warning. Example tests, including refusal without a use
    or without a crop.
    Files: `web/src/studio/TraceTool.tsx`, `web/src/studio/reviewModel.ts`,
    `data/schema/studio_api.schema.json`, `pipeline/buried_pipeline/publish/decisions_v2.py`,
    `pipeline/buried_pipeline/publish/build.py`, `web/src/studio/reviewModel.test.ts`,
    `pipeline/tests/publish/test_build_v2.py`.
    Requirements: 24.1 to 24.5.

- [ ] 20. The map area step (session 007; needs spec 02 task 14.1)
  - [ ] 20.1 Implement `MapAreaStep.tsx`: canon map area read-only when present; otherwise the
    starting rectangle as a suggestion, vertex editing by mouse and keys, `excluded` text, fold
    lines, reviewer name; store a `mapArea` in the workspace; dim outside it by opacity; send it
    with extract, dry-run and publish; include it in the export bundle. The Service checks it with
    spec 02's reader and refuses extract and publish without one.
    Files: `web/src/studio/MapAreaStep.tsx`, `web/src/studio/MapAreaStep.test.tsx`,
    `web/src/workspace/exportBundle.ts`, `pipeline/buried_pipeline/service/extract.py`,
    `pipeline/buried_pipeline/service/publish.py`, `pipeline/tests/service/test_map_area.py`.
    Requirements: 25.1 to 25.5, 16.1.

- [ ] 21. Control hull, covers and the 1931-35 edition (session 007; needs spec 02 task 15.1)
  - [ ] 21.1 Return `control_hull`, `control_hull_area_m2` and `map_area_inside_hull` from the align
    endpoint and `outside_control_hull` per item from extract and dry run; draw the hull on both
    panes; show the warning per item and in the list; suggest more points when the share is low.
    Files: `pipeline/buried_pipeline/service/align.py`, `pipeline/buried_pipeline/service/extract.py`,
    `data/schema/studio_api.schema.json`, `web/src/studio/AlignView.tsx`,
    `web/src/studio/ReviewList.tsx`, `pipeline/tests/service/test_align.py`.
    Requirements: 26.1 to 26.3.
  - [ ] 21.2 Add the `covers` statements to the reviewed-area dialog and the decisions file v2.
    Files: `web/src/studio/PublishView.tsx`, `data/schema/studio_api.schema.json`.
    Requirements: 27.1 to 27.3.
  - [ ] 21.3 Set the edition years, `years_label` and the 1935 licence note and attribution line in
    `studioSources.ts`, and extend its test that the Volume 3 constants equal the canon records
    (separately for the 1911 and 1935 editions).
    Files: `web/src/studio/studioSources.ts`, `web/src/studio/studioSources.test.ts`.
    Requirements: 28.1.
  - [ ] 21.4 Show tone class and weakness flags as text in the review list, labelled "Tone on the
    scan"; no colour per tone. Document `BURIED_LABEL_MODEL_ID` in `pipeline/.env.example` and the
    Service README.
    Files: `web/src/studio/ReviewList.tsx`, `pipeline/.env.example`,
    `pipeline/buried_pipeline/service/README.md`.
    Requirements: 9.7, 28.2, 28.3.

- [ ] 22. Session 007 property
  - [ ] 22.1 **[PBT] S14** Attributes come from reads, never from tones; land use always has a use;
    nothing outside the map area.
    Files: `pipeline/tests/publish/test_publish_v2_properties.py`.
    Requirements: 9.4, 24.1, 24.2, 25.1.
