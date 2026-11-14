# 07 Walk test: design

## Player (unity/Assets/Buried/Runtime/Walk/, namespace Buried.Walk)
- `WalkManifest`: reads the manifest (Newtonsoft). `WalkAsset` (ScriptableObject): the imported model
  and the manifest text, written by `Buried.Editor.Setup`, referenced from `SceneBootstrap`, so the
  Player loads it with no Resources call.
- `WalkMath` (pure, EditMode and property tested): point in polygon, `Slide` (the end of a move kept
  inside `walk_bounds`, sliding along the edge), the rigid fit of three reference points
  (rotation about up, translation, optional mirror), the walking step, the plaque cone.
- `WalkPlacement`: finds the `marker_ref_*` nodes, fits, applies the transform to the root, adds the
  colliders of requirement 1.2.
- `WalkWorld`: builds the night (fog, moon, lamps, volume, wet road, probe). `WalkController`: input,
  `CharacterController`, head bob, lantern sway. `WalkMode`: the one component that handles `walk/*`.
  `SceneController` ignores `walk/*`; `WalkMode` ignores everything else.
- Renderer: a second URP renderer (Forward+) selected for the camera on `walk/enter`, so many point
  lights are per pixel; the Block look keeps the first renderer.
- Keyboard: `WebGLInput.captureAllKeyboardInput` is on only while walking.
- Pointer lock: the Shell calls `requestPointerLock()` on the canvas in the click that enters (a user
  gesture); the Player reads `Cursor.lockState` and reports changes with `walk/pointerLock`.

## Shell (web/src/walk/)
- `walkState.ts`: a reducer for intro, loading, walking, exhibit, paused. `exhibit.ts`: the exhibit
  view model from `findCardView`, with the kicker and the two plan/imagined lines.
- `WalkPage.tsx`: the page; `walkBridge.ts` builds the messages. `walk.css` uses the palette tokens.
- Route `walk` in `routeFor`; no header link.

## Bridge 0.9.0
Adds the nine messages of requirement 6.1 to `data/schema/bridge.schema.json`. The bridge version
constant is 0.9.0 in the schema (`scene/init`, `ready`), `BridgeVersion.cs` and the Shell.
`walk/ready` carries `bridgeVersion`. Types are generated; samples are 50 per type from fast-check.

## Tests
- EditMode: asset and manifest exist, placement within 2 cm, bounds property, step maths, plaque cone.
- Vitest: messages, the page reducer, the exhibit view model for `overall-factory`.
- Playwright `walk.spec.ts` (own config, port 4177, GPU Chromium): walk, teleport, exhibit, four
  screenshots, a frame-time number.
- `Buried.Editor.WalkStill.Render`: five 1600 by 1000 stills to `data/work/walk/`.
