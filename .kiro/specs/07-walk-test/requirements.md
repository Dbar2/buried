# 07 Walk test: requirements

A test, not the product. One street corner (Queen Street East at River Street, 1911) that a visitor
walks in first person, at night, with a lantern. If the maintainer likes walking it, it gets a proper
spec. If not, it is removed. It is a separate mode at `/walk`; no existing page changes.

## 1. The model on disk
1.1 The corner is `unity/Assets/Buried/Walk/corner_1911.glb` with its manifest `corner_1911.json`
(positions `[east, up, north]`, project-local metres). The glb is replaced while this work goes on and
is never committed by the builder. Code depends on node names and the manifest only.
1.2 Node prefixes: `ground_`, `bld_`, `fence_` (mesh collider); `prop_lamp_N`, `prop_pole_N`,
`prop_hydrant_N` and `plaque_<slug>` (capsule collider); `sign_`, `rail_` (no collider);
`hand_lantern` (goes to the camera); `marker_*` (read, never drawn).

## 2. Placing
2.1 The importer's axes are not assumed. The three `marker_ref_*` nodes are compared with the
manifest's `refs`; the rigid transform found (a turn about the vertical, a translation, a mirror if
needed) is applied to the model's root.
2.2 After placement every `marker_ref_*`, `marker_lamp_*`, `marker_plaque_*` and `marker_spawn` node is
within 2 cm of its manifest position.

## 3. Walking
3.1 Capsule radius 0.3 m, eye height 1.62 m, walk 2.4 m/s, Shift 4.6 m/s, step height 0.3 m, gravity, no jump.
3.2 W A S D and arrow keys move; the mouse looks under pointer lock (click to lock, Esc to unlock);
unlocked, nothing moves. Pitch within plus or minus 80 degrees.
3.3 The visitor never leaves the manifest's `walk_bounds` polygon; at the edge they slide, never stick.
3.4 A slight head bob while walking, none under reduced motion. Start at `spawn.pos` looking at `spawn.look_at`.

## 4. Night
4.1 Deep blue-green sky and exponential-squared fog of one colour (darker than `--haze`, cooler than
`--soot`); about 60 m visible, nothing past about 70 m; no horizon line.
4.2 One dim cool directional moon, soft shadows to 45 m. A warm point light (about 14 m) at each
`marker_lamp_*`. Emissive surfaces get restrained bloom.
4.3 The lantern hangs at the lower right of the view, sways while walking, carries a warm point light
(about 11 m) with a slight flicker (none under reduced motion).
4.4 The road is wet (high smoothness). Tone mapping, bloom and a vignette only: no grain, no chromatic
aberration, no camera shake.

## 5. Exhibits
5.1 Within 3.2 m of a `plaque_<slug>` and looking within 25 degrees of it, the plaque brightens and the
Player reports which one. A click (locked) or `E` opens it: the Player releases the pointer, stops
moving and reports the slug; the Shell sends resume when the panel closes.
5.2 The panel is the catalogue card: kicker "EXHIBIT. LETTERED ON THE 1911 PLAN", the lettered lines
as lettered, the crop, "Seen on", the position line, the status line (the record's own), then "From the
plan: the outline, <storeys in words>, the name." and "Imagined: the brick, the windows, the sign
paint.", then "Back to the street".

## 6. Bridge 0.9.0
6.1 Shell to Player: `walk/enter` (`reduced_motion`), `walk/resume`, `walk/exit`, `walk/teleport`
(`east`, `north`, `yaw_deg`; tests only). Player to Shell: `walk/ready`, `walk/state` (`east`, `north`,
`yaw_deg`, at most four a second), `walk/nearPlaque` (`slug` or null), `walk/exhibit` (`slug`),
`walk/pointerLock` (`locked`). Schema, generated types, samples and parse tests on both sides.

## 7. The page `/walk`
7.1 Not linked from anywhere. Intro overlay (kicker, "1911", the line, one button "Step inside", which
reads "Lighting the lamp" while the Player loads), walking hints, exhibit panel, paused state with
"Leave" to `/`, and a no-WebGL sentence with a link to `/`.

## 8. Honesty
8.1 The walk is a labelled reconstruction. Names are the plate's lettering, the status is the record's,
no banned words. The panel says what comes from the plan and what is imagined.
