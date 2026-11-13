# Kiro session 028: mesher fix, the Lantern, Show Evidence (scene lane)

Agent: builder (claude-sonnet-5.5). Checkout: the main working copy. Lane: `unity/`,
`data/schema/bridge*`, `web/src/bridge/**`, generated bridge files, the e2e specs you add, and the
smallest possible edits in `web/src/explorer/**` to send a new message. The web lane is working in
its own worktree on shell components; keep out of `web/src/report/`, `web/src/place/`,
`web/src/studio/`. Commit with `git commit -m ... -- <paths>`. Never commit `Bootstrap.unity` for
id-only changes.

Read only: this brief; your notes `docs/kiro-sessions/023-notes.md`; `.kiro/steering/design.md`
(scene sections); spec 03 `design.md` sections for the Lantern and Show Evidence and their
requirements (search the headings).

## 1. Fix the mesher (a property test found a real failure)

`E15_TriangulationAndExtrusionHoldOnEveryCommittedPolygon` fails on `bld_fip_v3_1935_229_0009`
(39 vertices): "wall triangle 23 faces into the solid". Find the cause in `PolygonPrep`,
`Triangulator` or `Extruder` and fix the code. Change the test so it checks every polygon and
reports all failures at once instead of stopping at the first. Add the failing polygon as a named
regression case. Do not exclude any polygon from the test.

## 2. The pinned lot's lamp

In `art-1911-pinned.png` the lamp is a flat yellow marker. Remove the visible marker. Keep the
`lantern` outline and a small warm light pool on the ground at the lot; nothing else.

## 3. The Lantern (the signature interaction)

While Space is held (or a toggle is on, for touch and for people who cannot hold a key), a
circular lens follows the pointer: inside the lens the scene shows the selected past era (lit
plate and ghosts), outside it shows Today. The lens edge is a thin `ink` ring; no glass effects.
It works only at Today, as the spec says. Bridge message as specified (`scene/setLantern`: on or
off, screen position, radius, era). Reduced motion: the lens appears and disappears without
easing. Add the minimal Shell wiring: Space held and pointer move send the message; Escape turns
it off. Measure frame time with the lens on.

## 4. Show Evidence

For a selected ghost (`scene/showEvidence`): the ghost goes transparent with its outline kept, and
the untouched scan (not the lit display) appears beneath its footprint and a few metres around it.
Off restores the lit sheet.

## Checks

`web/e2e/output/lantern-today.png` (lens over the bank's lot showing 1911 inside, Today outside),
`evidence-bank.png`. Assert: outside the lens no drape pixel is visible; inside it the plate is;
with Show Evidence on, the patch under the ghost matches the untouched tile (normalised
cross-correlation at least 0.9) and the rest of the sheet still has the lit tone.

Never weaken a test. Narrow tests while iterating, full Unity and e2e suites once at the end.
Commit per item. List new bridge messages in your final report. Do not push. Short final report
with numbers and screenshot paths.
