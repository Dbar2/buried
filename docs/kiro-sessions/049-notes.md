# Session 049 notes: the walk test

## What was built

- `/walk`: one corner (Queen Street East at River Street, 1911) walked in first person at night, with a hand lantern. Not
  linked from anywhere. Nothing on the Block page, the Explorer or the place page changed (the existing Block Playwright
  config passes, 13 of 13).
- Spec `.kiro/specs/07-walk-test/` (110 lines), and "The walk (a test)" in `product.md` and `design.md`.
- Bridge 0.9.0: nine `walk/*` messages (schema, C# parser and writer, generated TypeScript types, 50 samples per type,
  valid and invalid fixtures). The Player's `WalkMode` handles them; `SceneController` ignores them.
- Player (`unity/Assets/Buried/Runtime/Walk/`): `WalkMath` (pure), `WalkPlacement`, `WalkWorld` (night, lamps, lantern, wet
  road, volume, probe), `WalkController` (capsule walker), `WalkMode` (bridge). Editor: `WalkSetup` (records a prefab and a
  `WalkAsset` from the glb and the manifest), `WalkInspect`, `WalkStill`.
- Shell (`web/src/walk/`): state reducer, messages, exhibit view model (reuses `findCardView` and `FindCard`), the page.
- Tests: Unity EditMode 243 passed (placement within 2 cm, colliders, bounds property, step maths, plaque cone, bridge
  parsing); Vitest 1093 passed; Playwright `walk.spec.ts` 2 of 2 (walks 7.2 m in 3 s, reads "Glove & Overall Factory",
  goes back to walking).

## Numbers

- Frame rate, GPU Chromium (ANGLE Metal), 1440 by 900, walking forward for 5 s: 60.1 fps, p95 16.7 ms, worst 16.8 ms. That
  is the maintainer's machine; a software-rendered or integrated GPU will be slower and was not measured.
- WebGL build, `unity.data.unityweb`: 1,908,965 bytes before, 75,489,565 bytes after. The whole `Build/` folder went from
  about 7.9 MB to 81.5 MB. The wasm grew from 5.80 to 5.84 MB. The cause is the glb's textures: glTFast imports them
  uncompressed and the project does not recompress them, so the model is about 70 MB of the data file. A texture
  compression pass (or a smaller texture set) is the first thing to do if the test is kept. A first visit over a normal
  connection would not load this.

## What looks wrong to me in the five stills (`data/work/walk/`)

- The hand lantern reads blown out: the glass and the base are near white with a yellow rim. I put it on its own layer so
  its own light skips it and cut its emission to 35 per cent; neither changed it, so the white probably comes from its base
  colour or the bloom. Not solved.
- The sky and the fog are close to black with a teal cast. They read as night, not as the deep blue-green of the brief. I
  raised them once; a second step would help ("see about 60 m" is true, but the far end of the road falls to near black).
- The window glow shows no halo. Bloom is on (threshold 0.75) but the emissive values in the glb are probably not above 1,
  so there is little to bloom. A model-side `KHR_materials_emissive_strength` would fix it.
- The plaque glow (a small point light in front of each plaque) is too strong close up: the board turns cream-white
  (`walk-plaque.png`). Lower `intensity` in `WalkWorld.SetPlaqueGlow`.
- The editor stills and the Player differ. The Player shows a cobbled road with tram rails and shimmering puddles; the
  stills show a brick road. The glb was replaced on disk while I worked (new cobble textures appeared), and the stills
  were rendered from earlier imports. Run `Buried.Editor.Setup.Run` then `WalkStill.Render` again before judging them.
- The wet road works in the Player (lamps leave streaks and the puddles reflect) but I could not tell from the stills.
- The first still at the spawn point has the bank's side lit by one lamp and the rest of the street dark. With six lamps in
  14 m range over a 150 m street, that is the design; a visitor will find the lamps by walking.

## Things I found and fixed on the way

- The Block camera has a near clip of several metres. In the walk the bottom fifth of the frame was cut off until
  `WalkWorld` set its own near (0.05 m) and far (260 m) planes and put them back on exit.
- The model's meshes are in world coordinates with every node at (0, 0, 0). The hand lantern's mesh was nowhere near its
  node, so the lantern is placed by the middle of its bounds.
- A Player-side boundary test forbids numbers of 100000 or more, so the `walk/teleport` and `walk/state` ranges are plus or
  minus 50000 m, not 100000.

## Choices that differ from the brief

- Lantern: right 0.28 m, down 0.17 m, forward 0.62 m, at 0.75 scale (brief: 0.32, 0.30, 0.55). At the brief's numbers a
  lantern 0.39 m tall hung out of the bottom of the view.
- The Shell asks for the pointer lock itself (`canvas.requestPointerLock()` in the "Step inside" click and in the "Back to
  the street" click), because that is a user gesture and Unity WebGL only locks on its own after the next click on the
  canvas. The Player still reports `walk/pointerLock` from `Cursor.lockState`, and the page also listens to the browser's
  `pointerlockchange`, so Esc pauses at once.
- A second URP renderer (Forward+) is selected on `walk/enter`. Shadows are now supported in the pipeline asset (the Block
  sun still casts none).
- `?debug=1` on `/walk` shows a small teleport box and pose read-out, which the Playwright test uses. No global is exposed.

## What could not be built or checked as written

- Mouse look: the sensitivity (0.12 degrees per Input Manager axis unit, assuming a default axis sensitivity of 0.1) is a
  guess. The test moves with keys and teleports; it never turns with the mouse. Try it with a real mouse first.
- Shift to run, head bob, lantern sway, the flicker and the reduced-motion switch-offs are built but not exercised by the
  Playwright test. The EditMode tests cover the speeds.
- The reflection probe is rendered once after the model loads. I saw no warning, but did not check that it takes effect on
  WebGL.
- Soft shadows to 45 m are configured; I did not check them by eye in the Player.
- `unity/Assets/Buried/Walk/corner_1911.glb` and its `.meta` are not committed, and the prefab and `WalkAsset` under
  `Walk/Generated/` are gitignored. On a fresh checkout `Setup.Run` warns that it records nothing, `/walk` answers
  `walk/enter` with an error, and the EditMode asset tests fail, which is what the brief asked for. Commit the glb to fix it.
- `Bootstrap.unity` is modified (its fog setting and the `walk` reference) and was not committed.
- Not in my commits: `tools/blender/corner_1911.py` (modified on disk), `tools/blender/make_windows.py`, the new Poly Haven
  textures under `assets/walk/textures/`, and `docs/progress/walk-blender-*.jpg`. They were there already.
