# Kiro session 015: look review fixes, map-area clip, drape placement check

Agent: builder (claude-sonnet-5.5). Lane: `unity/`, `web/` (not `web/src/evidence/`),
`data/schema/bridge*`, `.kiro/specs/03-explorer/`. Another builder is working in `pipeline/` at the
same time; do not touch it. Retry git commands that hit `index.lock`.

Read only: this brief; spec 03 `tasks.md` tasks 17.1, 17.4 and 17.6; `design.md` sections
"Initial view", "Drape mask" and "Drape placement check"; requirement 26; your own notes in
`docs/kiro-sessions/014-look-pass.md`. Search for the headings; do not read the specs end to end.

## 1. The maintainer's review of the look pass (do these first)

The look pass is a real step: cold present buildings, the fading plate edge, the ink-edged ghost,
the gauge and the card all read correctly. Four things fall short.

1. **No dusk.** The sky is never on screen, so the scene reads as "dark", not "dusk". Decision:
   the default view shows the horizon. Default pitch about 32 degrees below horizontal, vertical
   field of view about 50 degrees, so a band of sky fills roughly the top 15 to 20 per cent of the
   canvas at the default view, graded from `night` at the top to a dim grey-blue at the horizon,
   with distant buildings dissolving into fog before they reach it. Minimum pitch stays 20 degrees.
   Fog returns to the `fog` colour as the spec says; drop the darken-to-`night` workaround.
   Requirement 26.2 changes accordingly: rewrite it and its test as "the top rows are within a
   small distance of `night`; the horizon row lies between 12 and 22 per cent of the canvas height
   at the default view; the row just above the horizon is lighter and bluer than the top row; no
   building silhouette crosses the horizon with more than low contrast". This is a maintainer
   decision, not a weakened check: update the requirement text and say so in your notes.
2. **Today is flat.** Present buildings and ground are too close in value. Keep them matte, cold
   and untextured, but light them from the low west sun so roofs read one step lighter than walls
   and walls facing the sun one step lighter than those facing away. State the measured contrast
   ratio between roof and ground in the look test (at least 1.35:1) and keep it below ghosts.
3. **Default framing.** The opening view is cropped tight with no focal point. Frame the map area
   of the showcase plates with about 15 per cent margin, centred, looking north-north-east so
   Queen St E runs across the upper part of the view.
4. **Evidence card.** Its title is clipped under the header in `look-card-1911.png` (the card
   starts at "Feature"). Fix the layout so the title is always visible, and show the confirmation
   time as `12 Nov 2026, 21:32 UTC` with the ISO string in the element's `title` attribute. Add a
   look-test assertion that the card's heading is inside the viewport and not covered.

Rebuild, run the look test, and read the new screenshots before moving on.

## 2. Tasks 17.1 (clip the drape to the map area), 17.4 (drape placement check), 17.6
(triangulator on every real polygon in `data/evidence/` and `data/present/`)

As specified. For 17.4 report the measured correlation and offset at each control point for both
editions.

## Rules

Never weaken a test or threshold other than the 26.2 rewrite above. Narrow tests while iterating,
full suites once at the end. Wait for `web/public/unity/Build/` to stop changing after a Unity
build before building the site. Commit per item; tick tasks only when their tests pass. Do not
push. Short final report: what changed, results, screenshots written, anything unfinished.
