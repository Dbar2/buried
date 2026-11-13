# Session 040: the scene for "Raise the past" (builder, main checkout: Unity and the bridge)

Agent: `builder`. Group U of spec 06. You are the only session allowed to edit
`data/schema/bridge.schema.json` and the generated bridge files (TypeScript and C#).

## Read first, and only these

- `.kiro/steering/design.md` (loaded for you): "How the Unity scene looks", "Motion", "Palette
  tokens".
- `.kiro/specs/06-first-visit/requirements.md`: requirements 1.2, 2, 3, 4.1, 5.4, 11.2.
- `.kiro/specs/06-first-visit/design.md`: "Bridge 0.7.0", "The Still", "Load states".
- `.kiro/specs/06-first-visit/tasks.md`: group U.
- `data/schema/bridge.schema.json`; `unity/Assets/Buried/Runtime/Scene/` (`SceneController.cs`,
  `EraLayer.cs`, `GhostMaterials.cs`), `unity/Assets/Buried/Runtime/Look/`,
  `unity/Assets/Buried/Editor/` (`Setup.cs`, `TokensCss.cs`, `Build.cs`),
  `unity/Assets/Buried/Runtime/Bridge/`.

Do not read other specs. Do not edit anything under `web/src/` except the generated bridge files
and the bridge parse tests and samples that the generators and the bridge hook require; another
session owns the rest of `web/src/`. Do not edit `pipeline/` or `data/evidence/`.

## Order

Commit each task on its own with `git commit -m "<message>" -- <paths>` (paths listed, never a
bare commit). No Co-Authored-By line. Never add `unity/Assets/Buried/Scenes/Bootstrap.unity` to a
commit: it changes ids on every Unity run.

1. **U1 first, and commit it before anything else**, so the web session can pick up the types:
   the five messages in design.md "Bridge 0.7.0". Session 034 already took 0.7.0 for land-use areas in the scene, so this bump is 0.8.0; keep everything 034 added, generated TypeScript and C#,
   samples, parse tests on both sides.
2. **U6** the raise: the Player owns the animation and sends `scene/raised`. Stagger by distance
   from `first_feature_id`. Reduced motion or `animate: false` goes straight to the end state.
   EditMode test for the order.
3. **U8** anchors and `scene/frameFeature`, with the EditMode projection test. The anchor for a
   land-use area is its ground centroid.
4. **U9** `Buried.Editor.Still.Render` and the `BlockCamera` constant (below).
5. **The look: U2, U3, U4, U5, U7.** These read the new palette from `web/src/styles/tokens.css`
   through the existing palette asset. The web session is renaming the tokens right now. Before
   starting this step, check that `tokens.css` contains `--parchment` and `--soot`. If it does,
   rerun `tools/unity.sh exec Buried.Editor.Setup.Run` and go on. If it does not, do not edit
   `tokens.css` yourself: stop here, say so in your notes, and finish with step 6.
   Session 039 reported that `BuriedPalette.cs`, `Setup` and `PaletteTests` still read the old
   names (`night`, `fog`, `present`, `text`, `muted`): move them to the new names as design.md
   "Palette tokens" maps them. That is part of U2.
6. Once at the end: `tools/unity.sh test`, then `tools/unity.sh build`, then
   `tools/unity.sh exec Buried.Editor.Still.Render` (if built), then `npm --prefix web test --
   src/bridge` and `npm --prefix web run typecheck`.

## The opening camera (`BlockCamera`)

A low oblique view of the sheet lying on the table, looking roughly north-west, with the corner
of Queen Street East and River Street (the bank `bld_fip_v3_1911_229_0001` and the factory
`bld_fip_v3_1911_229_0101`, when it is in the data) in the right two thirds of a 16:10 frame. The
left third stays darker and emptier: a headline sits over it. The whole plate should read as a
sheet of paper with an edge, not as an endless ground. The tall pose for phones puts the same
corner in the upper 60 percent of a 39:80 frame. The raise does not move the camera.

## The look, in short (steering has the full text)

One warm key light from the upper left and low cool ambient; a `--soot` table; the plate tile
toned to `--parchment` with `--ink` lines inside a thin plate border; thin `--haze` ground fog and
distance fog, no particles; today's buildings as matte `--block` volumes that sink to 1 m plinths
on raise; ghosts as plain translucent `--parchment` volumes with `--copper` in shade, crisp
`--ink` edges and one storey line per documented storey; the selected feature in `--lantern`,
thicker, with faint emission. No windows, roofs, bloom on anything but lantern, or camera shake.
A land-use area (session 034 drew these) keeps its ground outline and gets the same selection
treatment.

## Frame time

The Dig budget in the existing end-to-end tests still holds. If the fog or the ghost fill costs
frames in WebGL, drop the fog quality first, and say what you measured.

## Notes file

`docs/kiro-sessions/040-notes.md`: what you built, what you measured, which tasks you skipped
and why, and any place where the spec could not be built as written.
