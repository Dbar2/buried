# Session 049: the walk test (builder, main checkout: Unity, bridge and web)

Agent: `builder`. One session, both sides, because the bridge changes.

## Why

The maintainer used the live first visit and rejected it: "I click something, wow, I see some old
paper map, who cares." He is right that it gives a stranger no reason to care. His direction, in
his words: "it would be better if it was like a 3D museum you could walk through ... people could
walk through and explore old Toronto." He approved testing one corner first.

So this session builds a **test**: one street corner you can walk in first person, at night, with
a lantern. If the maintainer likes walking it, it becomes the product and gets a proper spec and
steering. If not, it is removed. Build it as a clean, separate mode. Do not change the existing
pages.

## What is already on disk (made outside this session)

- `unity/Assets/Buried/Walk/corner_1911.glb`: the corner of Queen Street East and River Street as
  the 1911 plan draws it, built in Blender by `tools/blender/corner_1911.py`. It is on disk and
  **not committed yet** because it is still being improved: it will be replaced several times
  while you work. Do not commit it, and do not depend on its vertex counts, mesh count or
  materials. Depend only on node names and the manifest.
- `unity/Assets/Buried/Walk/corner_1911.json`: the manifest. Read it. Positions are
  `[east, up, north]` in project-local metres, the same frame Unity already uses.

Node names in the model:

| Prefix | What | Needs |
|---|---|---|
| `ground_*` | road, yard, sidewalks | mesh collider |
| `bld_*` | buildings | mesh collider |
| `fence_*` | board fence | mesh collider |
| `prop_lamp_N`, `prop_pole_N`, `prop_hydrant_N` | street furniture | a capsule collider around the post |
| `plaque_<slug>` | a brass exhibit label on a post; the slug is a find's slug in `data/finds.json` | capsule collider; interaction |
| `sign_*`, `rail_*` | painted signs (alpha blended), streetcar rails | no collider |
| `hand_lantern` | the visitor's lantern, modelled hanging below its own origin | re-parent to the camera |
| `marker_spawn`, `marker_lamp_N`, `marker_plaque_<slug>`, `marker_ref_*` | empties | read, do not draw |

## Read first, and only these

- `.kiro/steering/tech.md`: "Unity scene rules", "Coordinate systems", "Shell-to-Unity bridge
  rule", "Testing rules", and the Commands you need.
- `unity/Assets/Buried/Walk/corner_1911.json`.
- `unity/Assets/Buried/Runtime/Scene/SceneBootstrap.cs`, `SceneController.cs`, `CameraRig.cs`,
  `unity/Assets/Buried/Runtime/Bridge/`, `unity/Assets/Buried/Editor/Setup.cs`, `Still.cs`,
  `unity/Packages/manifest.json`.
- `web/src/explorer/UnityView.tsx`, `web/src/bridge/`, `web/src/block/FindCard.tsx`,
  `web/src/block/finds.ts`, `web/src/evidence/findText.ts`, `web/src/App.tsx`,
  `web/src/place/placeLink.ts`.

Do not read the other specs.

## One rule that differs from steering, for this test only

Steering says ghosts have no windows because no source gives them. A walkable street needs walls,
windows and signs, so the walk shows a **labelled reconstruction**, the way a museum does: every
exhibit panel says what comes from the plan (the outline, the storeys, the name) and what is
imagined (the brick, the windows, the sign paint). All other honesty rules hold: names are the
plate's lettering, the status line is the record's own, no banned words. Add a short section
"The walk (a test)" at the end of `.kiro/steering/product.md` and `design.md` saying exactly
this, so later sessions do not "fix" it.

## Build

Write a short spec first: `.kiro/specs/07-walk-test/` with `requirements.md`, `design.md` and
`tasks.md`, 180 lines in total at most, from this brief. Then build it. Commit each task on its
own with `git commit -m "<message>" -- <paths>`. No Co-Authored-By line. Never commit
`Bootstrap.unity` or `corner_1911.glb`.

### 1. Import

Add glTFast (`com.unity.cloud.gltfast`) so the editor imports the `.glb` with URP materials.
`Buried.Editor.Setup` records the imported model and the manifest in one asset the Player can
load (a ScriptableObject, or Resources). An EditMode test fails if either is missing.

### 2. Placing the model

The model was exported from Blender (Z up, x east, y north) as glTF. Do not assume which way the
importer flips axes. Find the three `marker_ref_*` nodes in the imported model, compare them with
the manifest's `refs`, and compute the rigid transform (a rotation about the vertical axis and a
translation, with a mirror if the importer needs one) that puts them on the manifest's positions.
Apply it to the model's root. EditMode test: after placement every `marker_ref_*`,
`marker_lamp_*`, `marker_plaque_*` and `marker_spawn` node is within 2 cm of its manifest
position. Add colliders as the table above says.

### 3. Walking

- A first-person controller: capsule radius 0.3 m, eye height 1.62 m, walk 2.4 m/s, Shift 4.6
  m/s, step height 0.3 m, gravity, no jumping.
- W A S D and the arrow keys move. The mouse looks, with pointer lock: a click on the canvas
  locks, Esc unlocks. While unlocked nothing moves. Pitch limited to plus or minus 80 degrees.
- The visitor stays inside the manifest's `walk_bounds` polygon (slide along the edge, never
  stick). Property test: for any start inside and any move, the end is inside.
- A slight head bob while walking; none under reduced motion (the Shell says so on enter).
- Start at `spawn.pos`, looking at `spawn.look_at`.

### 4. Night, lamps, lantern, fog

This is where the test succeeds or fails, so spend your care here. The target is a quiet,
slightly eerie night street: you see about 60 metres, the rest is fog.

- Sky and fog: a deep blue-green night (darker than `--haze`, cooler than `--soot`), exponential
  squared fog in the same colour so buildings beyond about 70 m dissolve. No horizon line.
- A dim, cool moon as the one directional light, with soft shadows out to 45 m.
- A warm point light at every `marker_lamp_*` (about 14 m range). The lamp heads and the lit
  windows are emissive in the model; give emissive surfaces a restrained bloom.
- The lantern: re-parent `hand_lantern` to the camera so it hangs at the lower right of the view
  (about 0.32 m right, 0.30 m down, 0.55 m forward), swaying a little as you walk. A warm point
  light at the lantern (about 11 m range) with a slight flicker, off under reduced motion. The
  lantern light is what reveals walls and signs as you approach them.
- The road should look wet: raise the road material's smoothness so lamps and the lantern leave
  streaks of light on it. Render one reflection probe after the model loads if WebGL allows it.
- Tone mapping, a vignette, and nothing else: no film grain, no chromatic aberration, no camera
  shake.

### 5. Exhibits

When the visitor is within 3.2 m of a `plaque_<slug>` and looking within 25 degrees of it, the
plaque brightens and the Player tells the Shell which one. A click (while locked) or `E` opens
it: the Player releases the pointer, stops moving, and sends the slug. The Shell shows the
exhibit panel and sends resume when it is closed.

### 6. Bridge 0.9.0

Shell to Player: `walk/enter` (`reduced_motion`), `walk/resume`, `walk/exit`, and for tests only
`walk/teleport` (`east`, `north`, `yaw_deg`). Player to Shell: `walk/ready`, `walk/state`
(`east`, `north`, `yaw_deg`, at most four a second), `walk/nearPlaque` (`slug` or null),
`walk/exhibit` (`slug`), `walk/pointerLock` (`locked`). Schema, generated types on both sides,
samples, parse tests, as the bridge rule says.

### 7. The page: `/walk`

Not linked from anywhere yet.

- The canvas fills the window. Before entering: a dark overlay with the kicker "Queen Street East
  at River Street", the title "1911", the line "Rebuilt from a fire-insurance plan. Walk it.",
  and one button, "Step inside". While the Player loads it reads "Lighting the lamp". Pressing it
  enters and locks the pointer.
- While walking: a small centre dot; a hint at the lower left, "W A S D to walk. Mouse to look.
  Esc to pause.", that fades after the first few steps; when near a plaque, "Read the plaque:
  click or E".
- The exhibit panel reuses the catalogue card (`FindCard` and the find wording): kicker "EXHIBIT.
  LETTERED ON THE 1911 PLAN", the lettered lines, the crop, "Seen on", the position line, the
  status line; then two lines, "From the plan: the outline, <storeys in words>, the name." and
  "Imagined: the brick, the windows, the sign paint."; then one button, "Back to the street".
- When the pointer is released without an exhibit open: "Paused. Click to keep walking." and a
  link "Leave" to `/`.
- Without WebGL: one plain sentence saying the walk needs 3D graphics turned on in the browser,
  how to turn it on, and a link to `/`.
- Brand: Libre Baskerville for the title, parchment on soot, one lantern-coloured button.

### 8. Stills and tests

- `Buried.Editor.WalkStill.Render` (headless, like `Still.Render`): renders five fixed views of
  the walk to `data/work/walk/` as JPEGs at 1600 by 1000: the spawn view; the bank's corner from
  the middle of the junction; the factory's north wall from the sidewalk; looking west along
  Queen from the corner; the machine shop from King Street. The maintainer will judge the look
  from these, so run it and **look at the pictures yourself** after each lighting change.
- EditMode: placement, bounds property, controller step maths, plaque selection cone.
- Vitest: bridge messages, the page's state (intro, walking, exhibit, paused), the exhibit view
  model for `overall-factory` reading "Glove & Overall Factory".
- Playwright `walk.spec.ts` on its own config and port, in GPU Chromium: open `/walk`, Step
  inside, wait for ready, hold W for three seconds and check `walk/state` moved more than 4 m;
  teleport beside the overall-factory plaque, see the prompt, press E, read "Glove & Overall
  Factory" on the panel, go back; save `walk-start.png`, `walk-factory.png`, `walk-corner.png`,
  `walk-plaque.png` to `web/e2e/output/`; and a frame-time check at 1440 by 900 (report the
  number; under 50 fps is a finding, not a test failure, on this first pass).

## At the end, once

`tools/unity.sh exec Buried.Editor.Setup.Run`, `tools/unity.sh test`, `tools/unity.sh build`,
`npm --prefix web test`, `npm --prefix web run typecheck`, `npm --prefix web run build`, the walk
spec, and the existing Block config (`playwright.block.config.ts`) to show nothing else broke.
Report the size of the WebGL build's data file before and after.

## Notes file

`docs/kiro-sessions/049-notes.md`: what you built, frame rate and build size, what looks wrong
to you in the five stills, and anything in this brief that could not be built as written.
