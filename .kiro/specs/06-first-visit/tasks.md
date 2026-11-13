# Tasks: 06 First visit

Three groups that touch different files and can run at the same time. (video) marks what the
demo video needs. Order across groups: U1, P1 and P2 land before the W tasks that read their
generated types; W1 lands before U2.

## W: web (no file under `data/schema/`, no `*.generated.ts`)

- [x] W1 (video) Tokens and fonts. Rename and add tokens per design.md "Palette tokens" in
  `web/src/styles/tokens.css` and every `var(--...)` use; self-host Libre Baskerville and Source
  Sans 3, remove Fraunces and Inter files and `@font-face` rules; `web/src/styles/contrast.test.ts`
  checks every listed pair against its floor. R1, design.md.
- [x] W2 (video) Routes and header. `web/src/App.tsx`, `web/src/place/placeLink.ts` (+ test):
  `block`, `/find/<slug>`, `search` at `/place`, old `/?era=` links. `web/src/shell/Header.tsx`:
  wordmark and "Sources" only. `web/src/sources/SourcesPage.tsx`: the workshop link. R1.3, R7.3,
  R11.4.
- [ ] W3 (video) Block page, Still and Raise button. `web/src/block/BlockPage.tsx`,
  `StillPicture.tsx`, `RaiseButton.tsx`, `raiseState.ts` (+ P5 test); send and receive
  `scene/raise`, `scene/raised` in the existing bridge module. R1, R2, R3, R11.2.
- [ ] W4 (video) Finds loader and find wording. `web/src/block/finds.ts` (loads and checks
  `data/finds.json`), `web/src/evidence/findText.ts` (+ test). R4.2, R4.3, R4.5, R5.3.
- [ ] W5 (video) Tags and leader line. `web/src/block/tagLayout.ts` (+ P2 test),
  `FindTags.tsx`, `LeaderLine.tsx`; `scene/setAnchors`, `scene/anchors`, `scene/frameFeature` in
  the bridge module. R1.2, R4.1, R5.1, R5.4.
- [ ] W6 (video) The card and the phone sheet. `web/src/block/FindCard.tsx`, `BottomSheet.tsx`;
  "Show the original sheet", "Full record". R4, R11.1.
- [ ] W7 (video) Era ruler. `web/src/block/EraRuler.tsx`: three stops, Left/Right keys, the
  announcement. R5.2, R5.3.
- [ ] W8 (video) Lantern lens. `web/src/block/LanternLens.tsx`, `lensDrag.ts` (+ test). R6.
- [ ] W9 (video) Share and `/find/<slug>`. `web/src/block/share.ts`, `web/src/shell/pageTitle.ts`
  (+ test). R7.1, R7.2.
- [ ] W10 (video) The two honesty fixes in text. `web/src/evidence/review.ts` (+ P3 test); the
  core-sample row text in `web/src/place/` and its Evidence Library wording (+ P4 test); replace
  the "Confirmed by" line on the place page and in `web/src/report/`. R9.2, R10.
- [ ] W11 No-WebGL fallback. `web/src/block/FlatSheet.tsx`, `sheetTransform.ts` (+ P6 test).
  R11.3.
- [ ] W12 Browser tests. `web/e2e/block.spec.ts` (landing, 2 s button, raise, first find, ruler
  line, share route), `block-phone.spec.ts` (390 px), `block-flat.spec.ts` (WebGL off); add
  `/find/overall-factory` to the routes in `playwright.hosting.config.ts`. R12.

## U: Unity and the bridge schema (the only group that edits `bridge.schema.json`)

- [x] U1 (video) Bridge 0.7.0. `data/schema/bridge.schema.json`: the five messages in design.md;
  `npm run gen:bridge-types` and `gen:bridge-samples` (U owns the generated TS and C# files);
  EditMode parsing tests. R3, R5.4. (Session 040: bridge 0.8.0, plus the optional `held` flag of `scene/loadEra` and
  `scene/selectFeature`; see `docs/kiro-sessions/040-notes.md`.)
- [x] U2 (video) Lamp light, table and fog. Rerun `Buried.Editor.Setup.Run` for the palette
  asset (after W1); one warm key light from the upper left, the `--soot` table, `--haze` ground
  and distance fog. design.md "How the Unity scene looks". (Session 043: lamp from the upper left of the opening view, soot
  table with fog at each pixel, a pool of light on the Queen and River corner.)
- [x] U3 (video) The sheet: tone curve toward `--parchment` and `--ink`, plate border, brighten
  on raise (session 043: the whole tile as a page with 0.4 m of paper edge, an ink rule inside it and a contact shadow).
  U4 (video) Soot blocks: `--block` volumes that sink on raise (+
  EditMode mesh test) (done; session 043: they sink flat to a thin `--block` outline at 35 per cent, not to 1 m plinths).
  U5 (video) Ghosts: `--parchment` translucent fill, `--copper` shade tint,
  `--ink` edges and storey lines, confidence styles kept. R3.1. (done)
- [x] U6 (video) Raise animation and `scene/raised`; stagger by distance from the first find (+
  EditMode order test); reduced motion and `animate: false` cut. R3, R11.2.
- [x] U7 (video) Selection: `--lantern` edges, thicker, faint emission. R4.1.
- [x] U8 (video) Anchors: `scene/setAnchors`, `scene/anchors` on the rules in design.md, and
  `scene/frameFeature` (+ EditMode projection test). R1.2, R5.4.
- [x] U9 (video) `Buried.Editor.Still.Render`: the two Stills and `block.json` into
  `web/public/still/` from `BlockCamera`. Record the command in `tech.md` "Commands" once the
  other session's `tech.md` edit has landed. R2.1. (The `tech.md` line has not landed yet: see the notes.)

## P: pipeline and data contract

- [x] P1 (video) Finds schema and validation. `data/schema/finds.schema.json`,
  `pipeline/buried_pipeline/validate/finds.py` in `buried validate` (+ P1 Hypothesis test,
  fixtures in `pipeline/tests/fixtures/finds/`); extend `npm run gen:types` to write
  `web/src/evidence/finds.types.generated.ts` (P owns that script change). R8.
- [x] P2 (video) Evidence schema 1.2.0 with `provenance.review` and its Validator rules;
  `pipeline/buried_pipeline/migrate/review_state.py` run once over `data/evidence/*.geojson`;
  `buried publish` writes `reviewed`; regenerate `web/src/evidence/types.generated.ts`. R9.1,
  R9.3.
- [x] P3 (video) `data/finds.json` with the overall factory, the bank and the coal yard: crops on
  `fip_v3_1911_229`, lettering transcribed as lettered, checked by the maintainer, whose name goes
  in `read_by`. The coal yard needs a published `use_` or `bld_` feature; until one exists it
  waits and the page shows the finds that resolve. R8.
- [x] P4 (video, Kiro proof) MCP `find_places` returns matching finds (slug, tag, readings,
  review state), paged under the 20 KB cap (+ test in `pipeline/tests/mcp`). R8.

## Maintainer

- [ ] M1 (video) Review the three finds' features in person, by a reviewed hand edit, so the
  first card can read "Status: reviewed by NAME, DATE". Until then it reads "draft".
