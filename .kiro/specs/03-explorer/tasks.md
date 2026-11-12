# Tasks: 03 Explorer

Property-based test tasks are marked **[PBT]** and name the correctness property from `design.md`
they implement. A task is done only when its tests pass. Do not weaken a property to make it pass.

**Gate (due Nov 14): task group 1 only.** It reaches this checkpoint and nothing more: the WebGL
build loads inside the Shell, draws one plate draped on the ground and at least one extruded
footprint from a real evidence file at the correct position, shows its provenance in a DOM card on
click, and switches between two eras without the alignment moving. Task 1.12 verifies it. Do not
start group 2 or later before 1.12 passes or the gate is called off.

Dependencies of group 1:
- Spec 01: tasks 1 (Schema), 2 (registry), 3 (web package, types, loading), 5 and 6 (dates and era
  lists), 9 (public API), 10 (`data/project.json`), 14 (`positionPhrase`).
- Spec 02: tasks 1 to 3 and 10.1 to 10.4 (alignment) for **both** `fip_v3_1911_229` and
  `fip_v3_1935_229`, and task 6 (tile) for both.
- One published building in `data/evidence/fip_v3_1911_229.geojson` (task 1.11).

Use plate 229 only for the gate. Do not use the held-out plate `fip_v3_1935_232` for any gate data.

- [ ] 1. Gate: one plate, one building, two eras, in the browser
  - [ ] 1.1 Add Vite and React to the existing `web/` package (spec 01 task 3.1), the app entry and
    routes (`/` Explorer, `/sources`), the palette tokens as CSS custom properties, and the
    self-hosted fonts with their licence files. Scripts: `dev`, `build`, `preview`. Add
    `web/public/unity/` and `web/e2e/output/` to `.gitignore`.
    Files: `web/package.json`, `web/index.html`, `web/vite.config.ts`, `web/src/main.tsx`,
    `web/src/App.tsx`, `web/src/styles/tokens.css`, `web/src/styles/fonts.css`, `web/public/fonts/**`,
    `.gitignore`.
    Requirements: 1.3, 20.1.
  - [ ] 1.2 Implement the Vite data plugin (allowed paths only, `/data/index.json`, copy at build)
    and `loadData.ts` using spec 01's loaders and `validate()`. Test the plugin's path allow-list
    (refuses `raw/`, `work/`, `..`) and `loadData` on a synthetic `data/` tree; a file that fails
    validation is left out and reported.
    Files: `web/vite/dataPlugin.ts`, `web/vite/dataPlugin.test.ts`, `web/src/data/loadData.ts`,
    `web/src/data/loadData.test.ts`, `web/src/explorer/testing/fixtures/**`.
    Requirements: 6.6, 21.1.
  - [ ] 1.3 Write `data/schema/bridge.schema.json` at bridge version `0.1.0` with the Envelope, the
    common definitions and the gate messages only (`scene/init`, `scene/loadEra`, `scene/setDepth`,
    `debug/markers`, `ready`, `eraLoaded`, `featureClicked`, `cameraChanged`, `error`), exactly as in
    design.md "Bridge". Write valid and invalid fixtures for each.
    Files: `data/schema/bridge.schema.json`, `data/schema/bridge_fixtures/valid/**`,
    `data/schema/bridge_fixtures/invalid/**`.
    Requirements: 4.1, 4.2, 5.1, 5.2 (gate subset).
  - [ ] 1.4 Generate `web/src/bridge/types.generated.ts` with a regeneration test; implement
    `bridge.ts` (validate outgoing and throw, validate incoming and drop, `window.buriedBridge`,
    typed events) and the fast-check arbitraries for the gate messages; generate the samples into
    `bridge_fixtures/generated/` with a regeneration test. Add the bridge boundary test.
    Files: `web/scripts/genBridgeTypes.ts`, `web/scripts/genBridgeSamples.ts`,
    `web/src/bridge/bridge.schema.ts`, `web/src/bridge/types.generated.ts`, `web/src/bridge/bridge.ts`,
    `web/src/bridge/bridge.test.ts`, `web/src/bridge/testing/arbitraries.ts`,
    `web/src/bridge/boundary.test.ts`, `data/schema/bridge_fixtures/generated/**`.
    Requirements: 4.3, 4.4, 4.6, 4.7, 4.9.
  - [ ] 1.5 **[PBT] E1** Every bridge message parses on the Shell side (gate subset).
    Files: `web/src/bridge/bridge.property.test.ts`.
    Requirements: 4.4, 4.6, 4.7.
  - [ ] 1.6 Create the Unity project: Unity 6000.3.26f1, URP, packages
    (`com.unity.nuget.newtonsoft-json`, `com.unity.test-framework`), Linear colour space, WebGL 2
    only, the asmdefs (`Buried.Runtime` without UI or TextMeshPro, `Buried.Editor`,
    `Buried.Tests.EditMode`), the `Bootstrap` scene with one root `Bridge` GameObject, `link.xml`,
    and `Buried.Editor.Build.WebGL` with the settings in design.md "Build settings". Add EditMode
    tests for the scene contents and asmdef references. Record in `.kiro/steering/tech.md`:
    `Unity -batchmode -quit -projectPath unity -executeMethod Buried.Editor.Build.WebGL` and
    `Unity -batchmode -projectPath unity -runTests -testPlatform EditMode -testResults unity/TestResults/editmode.xml`.
    Files: `unity/Packages/manifest.json`, `unity/ProjectSettings/**`,
    `unity/Assets/Buried/Scenes/Bootstrap.unity`, `unity/Assets/Buried/Runtime/Buried.Runtime.asmdef`,
    `unity/Assets/Buried/Editor/Buried.Editor.asmdef`, `unity/Assets/Buried/Editor/Build.cs`,
    `unity/Assets/Buried/Tests/EditMode/Buried.Tests.EditMode.asmdef`,
    `unity/Assets/Buried/Tests/EditMode/BootstrapSceneTests.cs`, `unity/Assets/link.xml`,
    `.gitignore` (add `unity/TestResults/`), `.kiro/steering/tech.md`.
    Requirements: 1.1 to 1.5, 2.1, 2.5.
  - [ ] 1.7 Implement the Player side of the bridge for the gate messages: `.jslib`, `JsBridge`,
    `Bridge.Receive`, `BridgeParser` (hand reading over `JToken`, unknown fields rejected),
    `BridgeWriter`, one DTO per payload, `BridgeVersion`. EditMode tests: fixture conformance,
    DTO-vs-schema reflection, version equals the schema `const`.
    Files: `unity/Assets/Buried/Runtime/Plugins/WebGL/BuriedBridge.jslib`,
    `unity/Assets/Buried/Runtime/Bridge/*.cs`, `unity/Assets/Buried/Tests/EditMode/BridgeTests.cs`,
    `unity/Assets/Buried/Tests/EditMode/BridgeSchemaReflectionTests.cs`,
    `unity/Assets/Buried/Tests/EditMode/PropertyRunner.cs`.
    Requirements: 4.2, 4.3, 4.5, 4.6, 4.8.
  - [ ] 1.8 **[PBT] E2** Every bridge message parses on the Player side (gate subset, valid,
    generated and invalid fixtures).
    Files: `unity/Assets/Buried/Tests/EditMode/BridgeConformanceTests.cs`.
    Requirements: 4.5, 4.6, 4.8.
  - [ ] 1.9 Implement `ProjectFrame` and the meshing needed for the gate: `PolygonPrep`,
    `Triangulator` (vendor LibTessDotNet with its licence), `Extruder`, `DrapeMeshBuilder`. Example
    EditMode tests for each, including an L-shaped polygon, a polygon with a hole, a MultiPolygon and
    a rotated parallelogram drape.
    Files: `unity/Assets/Buried/Runtime/Geo/*.cs`, `unity/Assets/Buried/Runtime/Meshing/PolygonPrep.cs`,
    `unity/Assets/Buried/Runtime/Meshing/Triangulator.cs`, `unity/Assets/Buried/Runtime/Meshing/Extruder.cs`,
    `unity/Assets/Buried/Runtime/Meshing/DrapeMeshBuilder.cs`, `unity/Assets/ThirdParty/LibTessDotNet/**`,
    `unity/Assets/Buried/Tests/EditMode/ProjectFrameTests.cs`,
    `unity/Assets/Buried/Tests/EditMode/MeshingTests.cs`.
    Requirements: 2.3, 3.1, 3.2, 3.4, 3.5, 8.3, 8.5.
    - [ ] 1.9.1 **[PBT] E3** World and data round-trip within 1 mm.
      Files: `unity/Assets/Buried/Tests/EditMode/ProjectFramePropertyTests.cs`.
      Requirements: 3.1, 3.2, 3.4.
    - [ ] 1.9.2 **[PBT] E4** Extrusion never produces degenerate triangles.
      Files: `unity/Assets/Buried/Tests/EditMode/ExtrusionPropertyTests.cs`.
      Requirements: 2.3, 8.5.
    - [ ] 1.9.3 **[PBT] E9** Drape meshes follow the corners.
      Files: `unity/Assets/Buried/Tests/EditMode/DrapePropertyTests.cs`.
      Requirements: 8.3.
  - [ ] 1.10 Build the gate scene at runtime: `SceneBootstrap` (camera, sun, ground, plain fog),
    `SceneController` handling `scene/init`, `scene/loadEra`, `scene/setDepth` (integer depths shown
    as a hard switch; transitions come in group 3), `debug/markers`; `EraLayer` with one plain
    ghost material (confidence treatments come in group 4); `DrapeLayer` and `TextureCache`
    (`Buried/Drape` shader, unlit, no fog colour); `Picker` sending `featureClicked`; `CameraRig`
    with drag pan and `+`/`-` zoom and the default pose; `cameraChanged`; `eraLoaded`; `ready`
    after the first frame; `DebugMarkers`. Palette asset with the eight tokens.
    Files: `unity/Assets/Buried/Runtime/Scene/SceneBootstrap.cs`,
    `unity/Assets/Buried/Runtime/Scene/SceneController.cs`, `unity/Assets/Buried/Runtime/Scene/EraLayer.cs`,
    `unity/Assets/Buried/Runtime/Scene/DrapeLayer.cs`, `unity/Assets/Buried/Runtime/Scene/TextureCache.cs`,
    `unity/Assets/Buried/Runtime/Scene/Picker.cs`, `unity/Assets/Buried/Runtime/Scene/CameraRig.cs`,
    `unity/Assets/Buried/Runtime/Scene/DebugMarkers.cs`, `unity/Assets/Buried/Runtime/Meshing/MeshChunk.cs`,
    `unity/Assets/Buried/Runtime/Look/BuriedPalette.cs`, `unity/Assets/Buried/Runtime/Look/Palette.asset`,
    `unity/Assets/Buried/Runtime/Look/Shaders/Ghost.shader`, `unity/Assets/Buried/Runtime/Look/Shaders/Drape.shader`,
    `unity/Assets/Buried/Runtime/Look/Shaders/Marker.shader`.
    Requirements: 2.2, 2.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 8.3, 8.5, 11.1 (feature click only).
  - [ ] 1.11 Prepare the gate data (maintainer, with the builder's help). Control files and
    `align-check` for `fip_v3_1911_229` and `fip_v3_1935_229` (spec 02 task 3.12, run for both),
    `buried tile` for both, and one building on `fip_v3_1911_229` published with `buried publish`
    (spec 02 tasks 7 and 8). If spec 02 task 8 is not done by Nov 13, the evidence file may instead be
    a reviewed hand edit (`structure.md` allows it): the maintainer traces one building's pixel
    polygon, converts it with the chosen transform using the pipeline's pure affine `apply`
    function, writes the feature with full provenance and the position error rule from spec 01, and
    the file must pass `uv run buried validate`. No other evidence is written by hand. A hand-edited
    feature is gate-only: write it without `provenance.proposal_id` and
    `provenance.extraction_params_id`, record its id in the `docs/kiro-sessions/` gate notes, and
    replace it before any demo (task 15.1).
    Files: `data/control/fip_v3_1911_229.json`, `data/control/fip_v3_1935_229.json`,
    `data/alignment/*.json`, `data/tiles/fip_v3_1911_229.*`, `data/tiles/fip_v3_1935_229.*`,
    `data/evidence/fip_v3_1911_229.geojson`.
    Requirements: 24.1, 24.2, 24.5.
  - [ ] 1.12 Shell gate UI and verification. `UnityView` (lazy, `createUnityInstance`, 30 s
    `ready` timeout, version check, init, load both gate eras), a minimal era switch (two buttons;
    the full gauge comes in group 3), a gate evidence card (feature id, origin source,
    `positionPhrase`, `confirmed_by`, `confirmed_at`, attribution line), attribution lines for the
    visible drapes, the Sources page, and `toSceneFeature` and `drapesForEra`. Then the Playwright
    gate test in design.md "Gate verification", and `npm run test:e2e`. Record `npm run dev`,
    `npm run build`, `npm run preview` and `npm run test:e2e` in `.kiro/steering/tech.md`. Run the
    Unity build and the test; record the result and the screenshots' check in
    `docs/kiro-sessions/` notes.
    Files: `web/src/explorer/UnityView.tsx`, `web/src/explorer/Explorer.tsx`,
    `web/src/explorer/EvidenceCard.tsx`, `web/src/explorer/Attribution.tsx`,
    `web/src/explorer/eraOrder.ts`, `web/src/explorer/sceneFeatures.ts`, `web/src/explorer/drapes.ts`,
    `web/src/explorer/*.test.ts`, `web/src/sources/SourcesPage.tsx`, `web/playwright.config.ts`,
    `web/e2e/gate.spec.ts`, `.kiro/steering/tech.md`.
    Requirements: 6.3, 6.4, 8.1, 8.2, 21.1, 21.2, 21.3, 24.1 to 24.4.

- [ ] 2. Full bridge catalogue (bridge version 1.0.0)
  - [ ] 2.1 Add the remaining messages to the Bridge Schema (`scene/focusLot`,
    `scene/selectFeature`, `scene/setLantern`, `scene/showEvidence`, `scene/addFeatures`,
    `scene/setReducedMotion`, `scene/setWaterRemembers`, `featureHovered`, `groundClicked`), set the
    bridge version to `1.0.0`, and add their fixtures, arbitraries, generated samples, DTOs, parser
    and writer code. Regenerate types.
    Files: `data/schema/bridge.schema.json`, `data/schema/bridge_fixtures/**`,
    `web/src/bridge/types.generated.ts`, `web/src/bridge/testing/arbitraries.ts`,
    `unity/Assets/Buried/Runtime/Bridge/*.cs`.
    Requirements: 4.1, 4.2, 5.1, 5.2.
  - [ ] 2.2 Rerun **[PBT] E1** and **[PBT] E2** on the full catalogue; both must pass with every
    message type covered by valid, generated and invalid fixtures.
    Files: `web/src/bridge/bridge.property.test.ts`,
    `unity/Assets/Buried/Tests/EditMode/BridgeConformanceTests.cs`.
    Requirements: 4.4 to 4.8.

- [ ] 3. Dig
  - [ ] 3.1 Implement `depth.ts` (tween, wheel notches, drag, nearest era, `erasToKeep`) and
    `DepthGauge.tsx` (slider role, ARIA values, Up/Down/Home/End, drag), the capture-phase wheel
    listener on the 3D view, and the `aria-live` era announcement.
    Files: `web/src/explorer/depth.ts`, `web/src/explorer/depth.test.ts`,
    `web/src/explorer/DepthGauge.tsx`, `web/src/explorer/DepthGauge.test.tsx`,
    `web/src/explorer/UnityView.tsx`.
    Requirements: 10.1, 10.2, 10.3, 10.7, 10.8, 16.5, 17.1, 17.2.
  - [ ] 3.2 **[PBT] E7** Depth stays in range and lands on eras.
    Files: `web/src/explorer/depth.property.test.ts`.
    Requirements: 10.3.
  - [ ] 3.3 Implement `DepthBlend` and wire it: era weights, present drain (fill to wireframe to
    faint outline), ghost rise in the vertex shader, drape opacity, both motion modes. Add
    `EdgeMeshBuilder` and the `Buried/Edge` and `Buried/Present` shaders. EditMode tests for
    `DepthBlend` at d = 0, 0.25, 0.5, 0.75, 1, 2.5 in both modes.
    Files: `unity/Assets/Buried/Runtime/Scene/DepthBlend.cs`, `unity/Assets/Buried/Runtime/Scene/EraLayer.cs`,
    `unity/Assets/Buried/Runtime/Scene/PresentLayer.cs`, `unity/Assets/Buried/Runtime/Meshing/EdgeMeshBuilder.cs`,
    `unity/Assets/Buried/Runtime/Look/Shaders/Edge.shader`, `unity/Assets/Buried/Runtime/Look/Shaders/Present.shader`,
    `unity/Assets/Buried/Runtime/Look/Shaders/Ghost.shader`,
    `unity/Assets/Buried/Tests/EditMode/DepthBlendTests.cs`.
    Requirements: 10.4, 10.5, 10.6, 10.9, 18.2.
  - [ ] 3.4 Send the present buildings in `scene/init` (`presentBuildings.ts`, fixed height) and
    draw them in chunks. Show their attribution line while visible.
    Files: `web/src/explorer/presentBuildings.ts`, `web/src/explorer/presentBuildings.test.ts`,
    `unity/Assets/Buried/Runtime/Scene/PresentLayer.cs`, `web/src/explorer/Attribution.tsx`.
    Requirements: 8.4, 20.3, 21.2.
  - [ ] 3.5 Implement `sceneModel.ts` (what the Player holds per era, messages to send, loading
    adjacent eras) and replace the gate's direct sends with it.
    Files: `web/src/explorer/sceneModel.ts`, `web/src/explorer/sceneModel.test.ts`,
    `web/src/explorer/UnityView.tsx`.
    Requirements: 6.2, 6.3, 8.7, 10.8.
  - [ ] 3.6 **[PBT] E6** Scene features mirror Era list entries.
    Files: `web/src/explorer/sceneFeatures.property.test.ts`.
    Requirements: 6.4, 6.5.
  - [ ] 3.7 End-to-end: Dig through all four eras with the gauge and keys; announcements; camera
    unchanged across depth changes (`cameraChanged` not sent).
    Files: `web/e2e/dig.spec.ts`.
    Requirements: 10.2, 10.7, 10.9.

- [ ] 4. Ghost treatments and look
  - [ ] 4.1 Implement the three confidence treatments (solid edges and fill, dashed edges and
    lighter fill, fog volume with the "?" image), the selected treatment (brighter, thicker `ink`
    edges; never `lantern`), and water glow with `RibbonBuilder`. EditMode tests: dash distance
    along edges, ribbon width, which meshes each class gets (unknown has no edge mesh), and that no
    material other than the lot outline and lot light reads the `lantern` palette entry.
    Files: `unity/Assets/Buried/Runtime/Scene/EraLayer.cs`, `unity/Assets/Buried/Runtime/Meshing/RibbonBuilder.cs`,
    `unity/Assets/Buried/Runtime/Look/Shaders/FogVolume.shader`,
    `unity/Assets/Buried/Runtime/Look/Shaders/WaterGlow.shader`,
    `unity/Assets/Buried/Runtime/Look/Textures/QuestionMark.png`,
    `unity/Assets/Buried/Tests/EditMode/TreatmentTests.cs`.
    Requirements: 8.6, 9.1 to 9.4, 11.4, 11.7, 20.4.
  - [ ] 4.2 Implement the look: sky gradient, sun, ambient, fog density rule, extended ground,
    tonemapping off, bloom limited to emission above 1, no other post effects. EditMode test that
    the palette asset equals `web/src/styles/tokens.css`.
    Files: `unity/Assets/Buried/Runtime/Look/LookSettings.cs`, `unity/Assets/Buried/Runtime/Look/Shaders/Sky.shader`,
    `unity/Assets/Buried/Runtime/Scene/SceneBootstrap.cs`,
    `unity/Assets/Buried/Tests/EditMode/PaletteTests.cs`.
    Requirements: 20.1, 20.2, 20.5, 20.6.
  - [ ] 4.3 End-to-end raster fidelity: drape the synthetic colour-patch tile at full opacity,
    top-down, and check rendered pixels within ±2 per channel of the source.
    Files: `web/e2e/rasterFidelity.spec.ts`, `web/e2e/fixtures/patch_tile.*`.
    Requirements: 8.3, 20.5.
  - [ ] 4.4 Run a WCAG contrast check on the token pairs used for text and UI outlines (4.5:1 body,
    3:1 large text and outlines) as a Vitest test, and record the results in
    `.kiro/steering/design.md` as that file asks. If a pair fails, report it; do not change a token
    without the maintainer.
    Files: `web/src/styles/contrast.test.ts`, `.kiro/steering/design.md`.
    Requirements: 17.6, 20.1.

- [ ] 5. Selection, hover and the evidence card
  - [ ] 5.1 Implement `cardModel.ts` and the full `EvidenceCard` (requirement 11.3), selection
    through `scene/selectFeature`, Escape to close, `HoverLabel` from `featureHovered`, and the
    Player's hover picking.
    Files: `web/src/explorer/cardModel.ts`, `web/src/explorer/cardModel.test.ts`,
    `web/src/explorer/EvidenceCard.tsx`, `web/src/explorer/HoverLabel.tsx`,
    `unity/Assets/Buried/Runtime/Scene/Picker.cs`, `unity/Assets/Buried/Runtime/Scene/SceneController.cs`.
    Requirements: 7.1, 7.2, 7.3, 9.5, 11.1 to 11.6.
  - [ ] 5.2 Implement `sourceCrop.ts` and the crop in the card.
    Files: `web/src/explorer/sourceCrop.ts`, `web/src/explorer/sourceCrop.test.ts`,
    `web/src/explorer/EvidenceCard.tsx`.
    Requirements: 11.3.
  - [ ] 5.3 **[PBT] E10** Source crops invert the corner mapping.
    Files: `web/src/explorer/sourceCrop.property.test.ts`.
    Requirements: 11.3.
  - [ ] 5.4 **[PBT] E12** Explorer text never contains a banned word.
    Files: `web/src/explorer/text.property.test.ts`.
    Requirements: 7.4.

- [ ] 6. Show Evidence
  - [ ] 6.1 Shell: Show Evidence button, `drapeForSource`, turning it off on selection or depth
    change. Player: near-transparent selected ghost, the given drape at full opacity, other drapes
    hidden, restore on off. End-to-end test that the camera does not move.
    Files: `web/src/explorer/EvidenceCard.tsx`, `web/src/explorer/drapes.ts`,
    `web/src/explorer/sceneModel.ts`, `unity/Assets/Buried/Runtime/Scene/SceneController.cs`,
    `unity/Assets/Buried/Runtime/Scene/DrapeLayer.cs`, `web/e2e/showEvidence.spec.ts`.
    Requirements: 12.1 to 12.4.

- [ ] 7. The Lantern
  - [ ] 7.1 Implement `LanternMask` and `LanternController` (lens uniforms, inside-only and
    outside-only layers, rim) and lens-aware picking. EditMode example tests.
    Files: `unity/Assets/Buried/Runtime/Scene/LanternMask.cs`,
    `unity/Assets/Buried/Runtime/Scene/LanternController.cs`, `unity/Assets/Buried/Runtime/Scene/Picker.cs`,
    `unity/Assets/Buried/Tests/EditMode/LanternTests.cs`.
    Requirements: 13.2, 13.3.
  - [ ] 7.2 **[PBT] E11** The lens decides picking and drawing alike.
    Files: `unity/Assets/Buried/Tests/EditMode/LanternPropertyTests.cs`.
    Requirements: 13.2, 13.3.
  - [ ] 7.3 Shell: Space hold, long-press, pointer tracking, arrow keys, `LanternControl` era
    select, the "works from Today" status line, loading the Lantern era. Component and end-to-end
    tests.
    Files: `web/src/explorer/LanternControl.tsx`, `web/src/explorer/LanternControl.test.tsx`,
    `web/src/explorer/StatusLine.tsx`, `web/src/explorer/sceneModel.ts`, `web/e2e/lantern.spec.ts`.
    Requirements: 13.1, 13.4 to 13.7, 17.1.

- [ ] 8. Water remembers
  - [ ] 8.1 Shell `WaterControl` and Player handling of `scene/setWaterRemembers`; DOM text naming
    the eras, the "No documented water in these records" case with the eras checked, off when the
    depth leaves 0. Tested on synthetic water features.
    Files: `web/src/explorer/WaterControl.tsx`, `web/src/explorer/WaterControl.test.tsx`,
    `web/src/explorer/sceneModel.ts`, `unity/Assets/Buried/Runtime/Scene/SceneController.cs`,
    `unity/Assets/Buried/Runtime/Scene/EraLayer.cs`.
    Requirements: 14.1 to 14.5.

- [ ] 9. Search, pinned lot and fly-to
  - [ ] 9.1 Implement `search.ts`, `lots.ts`, `coverage.ts` and `SearchBox.tsx` (`/` to focus,
    results list by keyboard), "Not reconstructed yet." for no match or no coverage, and
    `groundClicked` handling.
    Files: `web/src/explorer/search.ts`, `web/src/explorer/lots.ts`, `web/src/explorer/coverage.ts`,
    `web/src/explorer/search.test.ts`, `web/src/explorer/lots.test.ts`,
    `web/src/explorer/coverage.test.ts`, `web/src/explorer/SearchBox.tsx`,
    `web/src/explorer/SearchBox.test.tsx`.
    Requirements: 15.1 to 15.4, 15.6, 15.7, 17.1.
  - [ ] 9.2 Player: `LotMarker` (outline, warm light excluded from the Present rendering layer) and
    `CameraFlight` (eased 1500 ms, cut under reduced motion); camera limits and the remaining
    inputs (right-drag rotate and tilt, two-finger, pinch, Ctrl/Shift+wheel). EditMode tests for
    the flight end pose and the limits.
    Files: `unity/Assets/Buried/Runtime/Scene/LotMarker.cs`, `unity/Assets/Buried/Runtime/Scene/CameraFlight.cs`,
    `unity/Assets/Buried/Runtime/Scene/CameraRig.cs`, `unity/Assets/Buried/Tests/EditMode/CameraTests.cs`.
    Requirements: 15.5, 16.1 to 16.4, 18.3.
  - [ ] 9.3 End-to-end: search a synthetic address inside coverage (flies, lot pinned across
    eras), one outside ("Not reconstructed yet.", camera unchanged).
    Files: `web/e2e/search.spec.ts`.
    Requirements: 15.3, 15.4, 15.7.

- [ ] 10. Keyboard paths, list view, reduced motion
  - [ ] 10.1 Implement `FeatureList.tsx` (every drawn feature with use or kind, date phrases,
    confidence label, position phrase, sources; the needs-review count; Enter selects; "Show in
    scene" flies), visible focus rings, and the reduced-motion path (`scene/init` flag,
    `scene/setReducedMotion` on change, Player crossfade-only mode, no idle animation).
    Files: `web/src/explorer/FeatureList.tsx`, `web/src/explorer/FeatureList.test.tsx`,
    `web/src/styles/tokens.css`, `web/src/explorer/UnityView.tsx`,
    `unity/Assets/Buried/Runtime/Scene/SceneController.cs`, `unity/Assets/Buried/Runtime/Scene/RiseAnimator.cs`.
    Requirements: 17.1 to 17.6, 18.1 to 18.4.
  - [ ] 10.2 End-to-end axe scan of the Explorer and the 2D map (no serious or critical
    violations), and a keyboard-only walk: search, gauge, list select, Show Evidence, Lantern.
    Files: `web/e2e/accessibility.spec.ts`.
    Requirements: 17.1, 17.7.

- [ ] 11. 2D fallback and Report independence
  - [ ] 11.1 Implement `edge.ts` and `MapView2D.tsx` (no basemap, confidence patterns, the selected
    feature's thicker `ink` outline, `lantern` for the pinned lot only, drapes as image sources,
    same card, list, gauge, search and attribution), `webgl.ts`, the fallback messages, the 30 s
    `ready` timeout path, and the 3D/2D switch.
    Files: `web/src/map/edge.ts`, `web/src/map/edge.test.ts`, `web/src/map/MapView2D.tsx`,
    `web/src/explorer/webgl.ts`, `web/src/explorer/Explorer.tsx`, `web/src/explorer/UnityView.tsx`.
    Requirements: 3.6, 11.7, 19.1 to 19.5.
  - [ ] 11.2 **[PBT] E8** The map edge round-trips within 1 mm.
    Files: `web/src/map/edge.property.test.ts`.
    Requirements: 3.6, 19.5.
  - [ ] 11.3 End-to-end: WebGL 2 unavailable gives the 2D map with its message; a missing build
    gives the 2D map with its message. Extend the boundary test so the Report route (when its spec
    adds it) cannot import `UnityView` or `bridge`.
    Files: `web/e2e/fallback.spec.ts`, `web/src/bridge/boundary.test.ts`.
    Requirements: 19.1, 19.2, 19.6.

- [ ] 12. Studio publish into the scene
  - [ ] 12.1 Implement `applyEvidenceUpdate` in `sceneModel.ts` and the Player's
    `scene/addFeatures` with `RiseAnimator` (900 ms rise, fade only under reduced motion). Test with
    a synthetic collection gaining features, and one losing a feature (full reload).
    Files: `web/src/explorer/sceneModel.ts`, `web/src/explorer/sceneModel.test.ts`,
    `unity/Assets/Buried/Runtime/Scene/RiseAnimator.cs`,
    `unity/Assets/Buried/Runtime/Scene/SceneController.cs`.
    Requirements: 22.1, 22.2.
  - [ ] 12.2 **[PBT] E5** A feature is never drawn outside its evidence window.
    Files: `web/src/explorer/sceneModel.property.test.ts`.
    Requirements: 6.2, 6.3, 22.1.

- [ ] 13. Budget
  - [ ] 13.1 Implement `checkUnitySize.ts` (`npm run check:unity-size`) and `web/e2e/budget.spec.ts`
    (first interactive frame, frame intervals, the scripted run, fast connection profile, and the
    `reference` and `midrange` profiles with 4× CPU throttling). Record `npm run check:unity-size`
    and `npm run test:budget` in `.kiro/steering/tech.md`.
    Files: `web/scripts/checkUnitySize.ts`, `web/e2e/budget.spec.ts`, `web/package.json`,
    `.kiro/steering/tech.md`.
    Requirements: 23.1 to 23.3, 23.5, 25.4.
  - [ ] 13.2 Run the budget on the maintainer's M3 Pro (reference machine) and again on the
    mid-range profile, and record machine, browser version, profile, commit, date and the three
    results for each in `docs/kiro-sessions/` notes, with the GPU caveat next to the frame-rate
    results. The verdict comes from the mid-range profile. If a budget fails, report the numbers and
    the largest contributors; do not lower the budget.
    Files: `docs/kiro-sessions/<NNN>-explorer-budget.md`.
    Requirements: 23.4, 23.5.

- [ ] 14. Final check
  - [ ] 14.1 Run `npm test`, `npm run typecheck` and `npm run test:e2e` in `web/`, the Unity
    EditMode tests and the Unity build. All pass. Confirm every property E1 to E12 has a passing
    test, the boundary test passes, and the gate test still passes.
    Files: none.
    Requirements: 25.1, 25.2, 25.3.

- [ ] 15. Demo readiness (run before any demo or recording)
  - [ ] 15.1 Implement `web/scripts/checkDemoReady.ts` (`npm run check:demo`): fail, naming each
    feature, if any `published` feature in `data/evidence/*.geojson` has no
    `provenance.proposal_id`. Test it on a synthetic `data/` tree. If the gate used a hand-edited
    footprint, set it to `rejected` with the `status_reason` in design.md, publish its replacement
    with `buried publish`, run `uv run buried validate`, then `npm run check:demo`, and record the
    result in `docs/kiro-sessions/` notes. Record `npm run check:demo` in `.kiro/steering/tech.md`.
    Files: `web/scripts/checkDemoReady.ts`, `web/scripts/checkDemoReady.test.ts`, `web/package.json`,
    `data/evidence/fip_v3_1911_229.geojson`, `.kiro/steering/tech.md`.
    Requirements: 24.5, 25.4.
