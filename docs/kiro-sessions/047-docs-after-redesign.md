# Session 047: README, write-up, demo script and steering after the redesign (architect)

Agent: `architect`. You write Markdown only: `README.md`, `docs/submission/`, `.kiro/steering/`,
`.kiro/specs/06-first-visit/`. No code, no commands.

## Why

On Nov 13 the first visit was rebuilt (sessions 037 to 046). The README, the Kiro write-up and
the demo script still describe the old journey (a search field, the place page, the Studio in
the header). Two steering lines are also out of date.

## Read first, and only these

- `docs/kiro-sessions/037-first-visit-redesign.md` (the decision), and the notes files
  `038-notes.md`, `039-notes.md`, `040-notes.md`, `041-notes.md`, `042-notes.md`,
  `043-notes.md`, `044-notes.md`, `045-notes.md`.
- `docs/research/gpt-what-it-takes-to-win-2026-11-13.md` (short; section E is a video outline).
- `README.md`, `docs/submission/kiro-writeup.md`, `docs/submission/demo-script.md`.
- `.kiro/steering/product.md`, `.kiro/steering/design.md`, and in `.kiro/steering/tech.md` only
  the "Commands" section.
- `.kiro/specs/06-first-visit/` (three short files), `data/finds.json`.

## Facts you cannot check yourself (from the maintainer's own runs, Nov 13)

- Live site: `https://buried.pages.dev` serves the new first visit since the afternoon of Nov 13.
  The Studio service is still not deployed.
- On the merged build: 1,032 Vitest tests pass; `playwright.block.config.ts` (the first visit
  against the real Player) 9 of 9; `playwright.blockflat.config.ts` (no WebGL) 5 of 5; the
  hosting config 17 of 17; Unity EditMode 218 of 218; `buried validate` OK on 18 files and 175
  features; the pipeline pytest suite passes.
- At that point five older browser tests failed: three were expectations the redesign changed,
  one was the same land-use failure seen from the Studio suite, and one was real (the confidence
  line patterns in the 3D scene no longer differed after the look pass). Sessions 045 and 046
  were assigned them. Session 045 reports the land-use and cardsync tests fixed; session 046 was
  still running when this brief was written. Write "in progress" for 046 and do not claim its
  result.
- Evidence now: 175 features in two files. 13 are draft by hand (the bank and twelve tracings of
  the named places on both plans), 162 are draft by rule, none is reviewed. Eight rule-drawn
  fragments were merged into the hand tracings.
- Six finds in `data/finds.json` with eleven readings.
- The named buildings were missing from the scene before Nov 13 because the rule-based
  extraction had not produced them; a maintainer traced them by hand as drafts.
- Kiro credits used at the last check: 3,089 of 4,000.

## Write

### 1. `README.md`

- Replace the opening picture caption and the "Works today" rows so they describe the first
  visit: land, "Raise the past", finds with a catalogue card, the era ruler, the Lantern lens,
  share links at `/find/<slug>`, the no-WebGL flat sheet. The place page, the Report and the
  Sources page still exist; say where they sit now.
- Keep the picture line pointing at `docs/progress/first-visit-raised.png` (the maintainer will
  put the file there); alt text describes the raised scene with the factory's card.
- Update the Draft rows (the counts above; the six finds are draft readings), the Not built rows
  (land-use tracing exists now; the Studio service is still not deployed; 1947 still not shown),
  the "Built with Kiro" section (six specs now, sessions numbered to 047, the bridge at 0.8.0,
  evidence schema 1.2.0, the finds file), and the run instructions (the Block configs; the Still
  render commands as `040-notes.md` and `043-notes.md` give them).
- Keep everything true as of the facts above. No superlatives.

### 2. `docs/submission/kiro-writeup.md`

Keep its eight headings and its plain voice. Fold in what Nov 13 afternoon adds, and stay under
1,700 words by cutting older detail where needed:

- Spec-driven development: a sixth spec written after an outside review and the maintainer's own
  verdict that the journey was unclear; steering rewritten first, then one short spec (345
  lines) split into three task groups built at the same time in three worktrees (web, pipeline,
  Unity); the order rule (bridge and finds types land before the web tasks that read them) and
  how the web lane worked ahead of it by building pure modules and props-only components first.
- Agents: the architect made decisions the brief left open (fonts, token names, two contrast
  pairs that fail and how to avoid them); the builder in the Unity lane was told to render
  stills, look at them and iterate against numbered visual targets.
- Property-based testing: add the land-use property whose generator, not the code, was wrong
  (`038-notes.md`), and the new properties (tag layout never overlaps the card; a draft never
  prints "Confirmed"; the raise state never loses a press).
- Hooks and steering: the honesty fix that came out of it (review state in the schema; the
  write-up's own "what we would do differently" asked for this).
- MCP: `find_places` now returns finds with their review state.
- What went wrong: the first Unity render looked nothing like the concept; the Lantern never
  drew at a plan stop because the Player ignored it there; a test id collided with newly
  committed data; five older browser tests failed after the merge.
- Do not say who directed the sessions beyond "we" and "the maintainer". Do not mention any
  assistant other than Kiro.

### 3. `docs/submission/demo-script.md`

Rewrite it for the new journey, target 2:50, in the same table form. Follow the outline in the
research file's section E, adapted to what exists:

- 0:00 the live landing, press "Raise the past", ghosts rise.
- The factory's card: the name as lettered, the crop, "Status: draft, not yet reviewed" said
  plainly in the voice-over.
- The era ruler to 1935 and the one line it adds; the coal yard find (J. W. Corson & Co. on the
  1911 plan, Northern Fuels Co. on the 1931-35 plan).
- The Lantern lens; the phone view; a share link opening straight on a find.
- "Full record" to the report and its one-page print.
- Three short Kiro proofs with readable artefacts: spec 06 tasks split in three groups; a
  property-based test catch (pick the clearest one from the write-up); the held-out hook
  refusing a write.
- End on the live URL. Everything is recorded on the live site except the hook shot.
- Mark anything you cannot confirm from the files with "(to confirm)", and keep the "Before
  recording" section accurate for the new journey.

### 4. Steering and spec, small corrections only

- `design.md` (three places) and `product.md` (one): after the raise today's buildings sink flat
  and remain as a thin `--block` outline at about 35 percent, not as 1 m plinths (session 043).
- `.kiro/specs/06-first-visit/requirements.md` 3.1 and `design.md` "Bridge 0.7.0": the same
  correction; the bridge is 0.8.0; the Player's additions from `040-notes.md` (`held` on
  `scene/loadEra`, `scene/selectFeature`, snake_case names); requirement 4.2 says "Positioned
  within about X m", matching the existing wording function.
- `tech.md` "Commands" only: add the commands the notes files say are missing (the Still render,
  `gen:still-scene`, the Block Playwright configs, the review-state migration). Touch nothing
  else in `tech.md`.

## Report

List the files you changed with word or line counts, and anything in the notes files that
contradicts the facts given above.
