# Session 046: scene look pass, round two (builder, main checkout, Unity only)

Agent: `builder`. Session 043 got the scene most of the way: the page, the lamp, the camera, the
empty table. This round closes the gap between `docs/progress/043-raised.jpg` and
`docs/brand/concept-f-raised.jpg`. Open both before you start.

## Read first, and only these

- `docs/kiro-sessions/043-notes.md`.
- `.kiro/steering/design.md` (loaded for you): "How the Unity scene looks".
- `unity/Assets/Buried/Runtime/Look/` (shaders included), `unity/Assets/Buried/Runtime/Scene/`,
  `unity/Assets/Buried/Editor/Still.cs`, `BlockCamera.cs`.

Do not edit `web/src/`, `pipeline/`, `data/schema/` or `data/evidence/`. Another session is
working in `web/src/`.

## How to work

As in session 043: change, run `tools/unity.sh exec Buried.Editor.Still.Render`, open the three
pictures, judge, repeat. At most eight rounds. Copy the finals to `docs/progress/046-landing.jpg`
and `docs/progress/046-raised.jpg` (use `uv run python` with `shutil`; `cp` is refused). Commit
with `git commit -m "<message>" -- <paths>`; never commit `Bootstrap.unity`. No Co-Authored-By
line.

## Two browser tests fail since the look pass. Fix these first.

Run them from `web/` after `tools/unity.sh build` and `npm run build`:
`npx playwright test e2e/art.spec.ts e2e/look.spec.ts`.

- `e2e/art.spec.ts` "art: documented, estimated and unknown ghosts differ in their edge
  pattern". The confidence line styles (solid, dashed, dotted) are an honesty rule, not
  decoration: a visitor must be able to tell a documented outline from an estimated one in the
  scene. If the look pass removed or blurred the difference, restore it. Do not relax the test.
- `e2e/look.spec.ts` "26.2 / (c) night at the top...": the top rows are 7 away from `--soot` on
  one channel, and the limit is 6. Find what tints the top of the frame (the vignette, the haze,
  tone mapping) and bring it back inside the limit. If the test describes the old dusk sky and no
  longer matches steering ("How the Unity scene looks": an empty `--soot` table, no horizon
  glow), say so in your notes and change only the parts of the test that steering has
  superseded.

## What is still wrong, and the target

1. **Ghosts read as wire boxes.** The side faces are nearly clear, so a ghost is its edges and
   little else. Target: a ghost is a pale solid first and an outline second. Top face clearly
   lighter than the lit paper around it; the two side faces toward the camera visibly filled, the
   one away from the lamp shaded toward `--copper`; about 70 percent opaque for documented
   features, 45 for estimated ones. The plan's lettering may show through only faintly.
2. **The selected find is small and its glow is thin.** Target: the selected factory is the
   first thing the eye lands on in the raised picture. Stronger `--lantern` on its side faces, a
   wider soft pool of `--lantern` light on the paper (about twice the building's width), and the
   lamp falloff elsewhere a little darker so the pool stands out.
3. **The far and lower parts of the page go dull olive.** Target: the page stays recognisably
   warm parchment everywhere it is lit, and falls to shadow, not to khaki. Check the tone curve
   and the ambient colour: shadows lean cool and dark, lit paper stays near `--parchment`.
4. **The small draft houses look like scribbles** at this distance: many tiny boxes with edges
   and dashes on top of each other. Target: estimated features under about 60 square metres draw
   as a pale filled volume with no edge lines beyond their top outline; dashes only when the
   feature is larger than about 12 px on screen.
5. **Heights are timid.** One storey reads as a slab. Use 3.6 m per storey and 4.5 m for a
   feature with no storeys read, so the raise has some stature. Storey lines stay one per
   documented storey.
6. **The landing (before the raise):** today's blocks are good. Add the waiting 1911 outlines
   more clearly: thin `--copper` lines on the paper wherever a 1911 feature's footprint is not
   under a present-day block, at about 70 percent opacity, so a careful eye sees something is
   there.
7. **The camera** can come about 15 percent closer on the wide pose, keeping the top and right
   paper edges in frame.

## Checks at the end

- `tools/unity.sh test` passes; update a look test only where this brief changes its number.
- `tools/unity.sh build`, then from `web/`:
  `npx playwright test e2e/art.spec.ts -g "frame times"` passes. Report the numbers.
- `web/public/still/` re-rendered and committed.

## Notes file

`docs/kiro-sessions/046-notes.md`: per numbered item, what you changed and whether the final
picture meets the target in your judgement; camera numbers; frame times.
