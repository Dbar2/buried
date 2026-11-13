# Session 043: make the scene look like the concept (builder, main checkout, Unity only)

Agent: `builder`. Spec 06 tasks U2, U3 and a look pass over U4, U5, U7 and the opening camera.

## Why

Session 040 built the mechanics and they work. The pictures do not yet look like the product.
Open these and compare:

- `web/public/still/block-wide.jpg` and `data/work/still/block-wide-raised.jpg` (what we have).
- `docs/brand/concept-h-theatre.jpg` and `docs/brand/concept-f-raised.jpg` (the target mood and
  composition; ignore the lamp, the books, and the windows on the ghosts).

What is wrong today, by eye:

1. The camera is too far away. The sheet is a small bright wedge in a large dark frame, the
   lettering runs at odd angles, and the selected building is a few pixels of amber.
2. Hundreds of today's buildings outside the sheet are drawn as grey patches all over the table.
   The table should be empty and dark so the sheet reads as one piece of paper.
3. The sheet is cut to the irregular map-area polygon, so it looks like a cut-out, not a page.
4. The sheet is cold grey-white. There is no warm lamp, no falloff.
5. After the raise the ghosts read as dark striped noise: edges and storey lines are too heavy at
   this distance, and the fill does not read as a pale volume.
6. After the raise today's buildings are still big dark slabs that hide the plan.

## Read first, and only these

- `.kiro/steering/design.md` (loaded for you): "How the Unity scene looks", "Palette tokens".
- `docs/kiro-sessions/040-notes.md`.
- `unity/Assets/Buried/Runtime/Scene/`, `unity/Assets/Buried/Runtime/Look/` (shaders included),
  `unity/Assets/Buried/Editor/Still.cs`, and the file that holds `BlockCamera`.
- `data/tiles/fip_v3_1911_229.json` (the sidecar: `corners` are the full rectangular tile,
  `map_area` is the polygon inside it).

Do not edit anything under `web/src/`, `pipeline/`, `data/schema/` or `data/evidence/`: another
session is working in `web/src/` right now. You may write `web/public/still/` (through
`Still.Render`) and `docs/progress/`.

## How to work

Change, render, look, repeat. After each change run
`npm --prefix web run gen:still-scene` (once, if the scene input is stale) and
`tools/unity.sh exec Buried.Editor.Still.Render`, then open
`web/public/still/block-wide.jpg`, `block-tall.jpg` and `data/work/still/block-wide-raised.jpg`
and judge them against the targets below. Do at most eight render rounds. Copy the final wide
landing and wide raised pictures to `docs/progress/043-landing.jpg` and
`docs/progress/043-raised.jpg`. Commit with `git commit -m "<message>" -- <paths>`; never commit
`Bootstrap.unity` or `ProjectSettings`. No Co-Authored-By line.

## Targets

### Camera (`BlockCamera`, wide and tall)

- Closer and lower, with a longer lens (field of view about 30 to 35 degrees) so the block reads
  as a miniature on a desk.
- Look along the plate's own "up" direction (from the sheet's bottom edge toward its top edge),
  turned by no more than 25 degrees, so the plate's lettering reads the right way up: "QUEEN"
  along the top, running left to right.
- Wide (16:10): the corner of Queen Street East and River Street, with the bank
  (`bld_fip_v3_1911_229_0001`), the overall factory (`..._0101`) and the machine shop (`..._0102`),
  sits in the right-centre of the frame, large: the factory's footprint should be at least 120 px
  across in the 1600 px picture. The sheet's top edge and right edge are both in frame with dark
  table beyond them. The left third of the frame is the sheet running off into shadow: a headline
  sits there, so keep it dark and quiet.
- Tall (39:80): the same corner in the upper 55 percent; the lower part is sheet in shadow.

### The sheet

- Drape the whole rectangular tile (the sidecar's four `corners`), not the map-area polygon. It
  is the real page, with its margins, sheet numbers and compass rose.
- Give it a paper edge: about 0.4 m of thickness, a thin ink rule just inside the edge, and a
  soft contact shadow on the table.
- Tone it to `--parchment` with `--ink` lines. Warm, not grey.

### Light and air

- One warm key light from the upper left with visible falloff: the part of the sheet near the
  Queen and River corner is the brightest thing in the frame, and the sheet fades toward the
  lower left and the far edges. Low cool ambient so shadows lean toward `--copper`.
- The table is `--soot`, empty. A vignette darkens the frame's corners.
- Thin `--haze` near the ground at the far edge only. If it costs frames, leave it out.

### Today's buildings

- On the Block page draw only the present-day buildings whose footprint lies inside the sheet's
  rectangle. Nothing outside the sheet is drawn at all.
- Before the raise they stand as matte `--block` volumes, lit by the lamp so their tops catch a
  little warm light and their shadows fall to the lower right.
- After the raise they do not stay as slabs. They sink flat and remain only as a thin `--block`
  footprint outline on the paper at about 35 percent opacity, so the plan and the ghosts read.
  (This replaces the 1 m plinth. Say so in your notes; steering will be updated to match.)

### Before the raise (the held state)

- The 1911 features show as faint `--copper` outlines on the paper, under and between today's
  blocks, as if waiting. No fill, no height.

### Ghosts, after the raise

- Each ghost is a pale solid: top face a little lighter than the lit paper, side faces shaded
  toward `--copper` on the side away from the lamp, about 60 percent opaque so the plan's
  lettering shows through faintly. They must read as light volumes on the paper, never as dark
  hatching.
- Edges: thin `--ink`, at most about 1.5 px on screen at the opening distance, on the outline of
  each face only. Storey lines: one hairline per documented storey at about 40 percent opacity.
  If lines alias into noise at this distance, fade them out with distance.
- The 162 draft-by-rule buildings (confidence "estimated") are quieter than the hand-traced ones
  ("documented"): lower fill opacity and the dashed edge they already have.
- Land-use areas keep a ground outline in `--copper` with a faint hatch, no height.

### The selected find

- Edges in `--lantern`, clearly thicker, side faces warmed toward `--lantern`, and a soft pool of
  `--lantern` light on the paper around its foot. In the raised picture the selected factory must
  be the first thing the eye lands on.

## Checks at the end

- `tools/unity.sh test` (EditMode) passes.
- `tools/unity.sh build`, then from `web/`:
  `npx playwright test e2e/art.spec.ts -g "frame times"` still passes. Report the numbers.
- `web/public/still/block.json` has an anchor for every find in `data/finds.json` whose 1911
  feature is on screen (the scene input should take its anchor list from `data/finds.json`, not a
  fixed pair).

## Notes file

`docs/kiro-sessions/043-notes.md`: for each numbered problem above, what you changed and whether
the final picture meets the target in your own judgement; the camera numbers; frame times; and
anything you could not get right.
