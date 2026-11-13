# Session 042: the Block page, wired (builder, web lane, part three)

Agent: `builder`. You are in the web worktree (`lane/web`). Group W of spec 06: W3, W4, W5, W6,
W7, W8, W9, the rest of W10, W11, W12.

The parts exist (session 041, see `docs/kiro-sessions/041-notes.md` "what part three must wire").
The finds file, the finds types and the review state are in this branch now (session 038). The
bridge has the five new messages (session 040 U1; check `web/src/bridge/types.generated.ts` for
`scene/raise`, `scene/raised`, `scene/setAnchors`, `scene/anchors`, `scene/frameFeature`).

The Unity side of those messages is being built in another checkout right now, and so are the
Still pictures. So: wire everything, test it against a fake Player in unit tests, and make the
Block page degrade to the Flat sheet when the Player does not answer. The maintainer runs the
Unity-backed browser suites after the lanes are merged.

## Read first, and only these

- `docs/kiro-sessions/041-notes.md`.
- `docs/kiro-sessions/040-notes.md`: what the Player actually does. Three things differ from
  design.md and the Player's version wins: the first `scene/loadEra` on the Block page must carry
  `held: true` (the landing state: sheet dim, ghosts down, `BlockCamera` applied) until
  `scene/raise`; selection is a new message `scene/selectFeature` (optional `feature_id`, absent
  clears); the new messages use snake_case property names.
- `.kiro/specs/06-first-visit/requirements.md` (whole, 129 lines).
- `.kiro/specs/06-first-visit/design.md` (whole, 134 lines).
- `.kiro/specs/06-first-visit/tasks.md`: group W.
- `web/src/block/`, `web/src/bridge/` (how a message is sent and received today),
  `web/src/explorer/UnityView.tsx` and `Explorer.tsx` (how the Player is mounted and how
  selection and Show Evidence work today), `web/src/evidence/` (wording functions, the banned-word
  check, `types.generated.ts`, `finds.types.generated.ts`), `data/finds.json`.

Do not edit `data/schema/`, generated files, `unity/` or `pipeline/`.

## Build, in this order

Commit each on its own with `git commit -m "<message>" -- <paths>`. No Co-Authored-By line.

1. **Merge leftovers.** Four unit tests fail on this branch after the three lanes were merged;
   fix them first:
   - Stale colour names: `web/src/explorer/Fallback2D.tsx` (two uses of `--night`) and
     `web/src/report/report.css` (one). Map them as design.md "Palette tokens" says.
   - `web/src/place/plainSweep.test.tsx` (3 failures): its workspace area uses the id
     `use_fip_v3_1911_229_0001`, which is now also the committed coal yard in
     `data/evidence/fip_v3_1911_229.geojson`. Give the test's workspace area an id that cannot
     collide with committed data, and check that a real workspace publish cannot collide either
     (if it can, say so in your notes; do not change the pipeline).
   - `web/src/explorer/presentBuildings.test.ts` (1 failure): "scene/init /payload/bridgeVersion
     must be equal to constant". Something still says 0.7.0; the bridge is 0.8.0.
2. **W4** finds loader and find wording (`finds.ts`, `evidence/findText.ts`): kicker, lettered
   lines with the banned-word check, "Seen on", the position line through the existing wording
   function, the ruler line of requirement 5.3, and the unnamed-ghost title of requirement 4.5.
3. **W10, the rest**: `evidence/review.ts` with property P3. "Status: reviewed by <by>, <on>" or
   "Status: draft, not yet reviewed". Replace every printed "Confirmed by" on the place page, the
   card panel and the Report with the status line. `confirmed_by` is never printed as a status.
4. **W3, W5, W6, W7, W8, W9** the Block page for real at `/` and `/find/<slug>`:
   - The Still shows at once (sources `web/public/still/block-wide.jpg`, `block-tall.jpg` and
     `block.json`; they may not exist yet in this branch: when they are missing, show the
     `--soot` to `--haze` backdrop and place no tags until the Player reports anchors). The Unity
     loader starts after first paint and is not in the Block page's first chunk.
   - "Raise the past" follows `raiseState`. It sends `scene/raise` with the 1911 era, the first
     find's 1911 feature id, and `animate` false under reduced motion. On `scene/raised` it
     selects the first find and sets the ruler to 1911.
   - Tags from `scene/anchors` through `tagLayout`; the top row after the raise; selecting a find
     sends the existing selection message and `scene/frameFeature` only from "Show on the map".
   - The card for a find and for any clicked ghost (requirement 4), the bottom sheet under 720 px,
     a close control, "Show the original sheet" (the existing Show Evidence path and the untouched
     tile), "Full record" (the report for the feature's lot), "Share this find".
   - The era ruler drives the existing era and depth messages; the ruler line appears on the card.
   - The Lantern lens with pointer and touch drag over the existing lens messages, and the
     visible "Lantern" control; Space, `L` and the arrows keep working.
   - `/find/<slug>` opens raised without animation on that find; unknown slug goes to `/` with
     "No find by that name."; page title and description as design.md says.
   - A small "List" control opens the accessible feature list that exists today.
   - The margin caption names the block ("Queen Street East at River Street, Toronto. Two
     fire-insurance plans, 1911 and 1931-35.") and links "Look up an address" to `/place`.
5. **W11** the Flat sheet as the no-WebGL and Player-timeout view, with the same tags, card,
   ruler, lens and share; Today shows present outlines over the dimmed 1911 tile.
6. **Remove** `/block-preview`, `BlockPreview.tsx`, `blockPreview.css`, its spec and config.
7. **W12** browser tests on isolated configs and ports (copy `playwright.hosting.config.ts`):
   - `block-flat.spec.ts` with WebGL off: landing, press Raise, outlines draw on, first find's
     card opens with "Glove & Overall Factory", ruler to 1935 shows the 1931-35 line, share copies
     `/find/overall-factory`, `/find/coal-yard` opens on the yard. Screenshots at 1440 by 900 and
     390 by 844 into `web/e2e/output/`.
   - `block.spec.ts` and `block-phone.spec.ts` for the real Player: write them, tag them so they
     run only in the main suite (which needs the Unity build), and do not run them here.
   - Update specs that assumed the old landing at `/`.

## Layout notes from looking at the preview

- The scene is full-bleed behind everything. No frame around it, no inset box.
- Before the raise: the headline and button sit over the darker left third; nothing else on the
  page but the wordmark, "Sources", the three first tags and the margin caption.
- After the raise the headline and button leave; tags, card, ruler and Lantern control appear.
- The card's crop is the untouched scan. Give it a hairline ink rule and let it sit on the
  parchment card without a white mat around it.

## Test

`npm --prefix web test -- src/block src/evidence src/place src/report` while you work. Once at the
end: `npm --prefix web test`, `npm --prefix web run typecheck`, `npm --prefix web run build`, the
hosting spec, and `block-flat.spec.ts`.

## Notes file

`docs/kiro-sessions/042-notes.md`: what is wired, what you could not test without the Player, the
specs whose expectations you changed, and anything in the spec that could not be built as written.
Tick the W tasks you finished in `tasks.md`.
