# Session 042 notes: the Block page, wired

Branch `lane/web`, builder. Spec 06 group W: W3 to W12. No file under `data/schema/`, no `*.generated.ts`, nothing in `unity/` or `pipeline/`.

## What is wired

- **Merge leftovers.** `--night` is `--soot` in `Fallback2D.tsx` and `report.css`; `presentBuildings.test.ts` says bridge 0.8.0; `plainSweep.test.tsx` uses sequence 9001 for its workspace area (`use_fip_v3_1911_229_9001`).
  *Collision check:* `mergeForDisplay` drops a workspace feature whose id is a canon id (canon wins), so a collision cannot show a wrong feature. A real Studio publish numbers from the canon file's highest sequence (`prepare_publish` reads the committed file), so it does not collide at the moment it is made. It can collide later, if canon gains a feature with that number after the visitor published; the merge then hides the workspace one. I changed no pipeline code.
- **W4.** `evidence/findText.ts` (kicker, lettered lines with the banned-word check, "Seen on", position line, ghost title, ruler line), `evidence/findsFile.ts` (Ajv against `finds.schema.json`), `block/finds.ts` (load, resolve against the loaded data, crop in tile pixels). `web/vite/dataPlugin.ts` now serves `finds.json` (root allow-list; it is not part of the data version, which is unchanged).
- **W10.** `evidence/review.ts` and P3. "Status: reviewed by <by>, <on>" or "Status: draft, not yet reviewed" replace every printed "Confirmed by" / "Confirmed at": place card (`key: 'status'`), Explorer card, feature list (`row.status`), Report findings and core sample (`report/reviewStatus.ts` replaces `report/confirmed.ts`). `confirmed_by` is printed nowhere. A `reviewed` state with no name or day reads as a draft.
- **W3, W5 to W9, W11.** `block/BlockStage.tsx` (state and layout), `BlockPage.tsx` (loading), `blockModel.ts` (card view models, ruler, tags), `blockLayout.ts` (one set of rectangles for the DOM and the tag keep-outs), `flatModel.ts`, `playerMessages.ts`, `useBlockData.ts`, `useBlockLens.ts`, `useStageSize.ts`.
  - `UnityView` gets an optional `block` binding (hold era, anchor ids, raise, selection, frame, `scene/anchors` and `scene/raised` callbacks). The Explorer and place page do not pass it. `buildLoadEra` takes `held`; the 1911 era carries `held: true`.
  - Raise: `raiseReducer`; `scene/raise` once on the transition into `raising`; `scene/raised` selects the first find (or the share link's find), sets the ruler to 1911 and jumps the depth there (no tween through 1947 and 1935).
  - The Player is its own chunk, mounted after first paint and after the records load. The Still shows only if `/still/block.json` loads.
  - Flat sheet: Today is the 1911 tile dimmed under today's outlines; plan stops show that plan's tile; the Lantern is a circular clip of the other layer; Raise draws the outlines on, and the card opens when they settle (at once under reduced motion or on a share link).
  - `/find/<slug>` presses Raise itself with `animate: false`; an unknown slug rewrites the address to `/` and shows "No find by that name."
  - Title and description for a share link: `findTitleFor`, `findDescriptionFor` in `shell/pageTitle.ts`.
  - "List" is the existing `FeatureList` with a `closedLabel`.
- **Removed:** `/block-preview`, `BlockPreview.tsx`, `blockPreview.css`, `e2e/block-preview.spec.ts`, `playwright.blockpreview.config.ts`.

## Tested, and what was not

- `npm --prefix web test`: 115 files, 1025 tests pass. `npm run typecheck` and `npm run build` pass.
- Fake Player: `src/bridge/blockPlayer.test.ts` (it lives in `bridge/` because the boundary test allows `SendMessage` there only). It checks that every message the page sends is a valid 0.8.0 message, that `held` is carried only when asked, that `scene/anchors` and `scene/raised` replies parse, and that `scene/raise` goes out at most once for any event order.
- Browser, here: `npx playwright test -c playwright.blockflat.config.ts` (port 4175, no Unity needed): 5 pass. Landing, Raise, outlines draw on, first card "Glove & Overall Factory", ruler to 1935 shows the 1931-35 line, share copies `/find/overall-factory`, `/find/coal-yard`, unknown slug, lens clip and List, at 1440 by 900 and 390 by 844. Screenshots: `web/e2e/output/block-flat-*.png`. `playwright.hosting.config.ts` with `hosting.spec.ts`: 4 pass.
- **Not run (needs the Player):** `e2e/block.spec.ts` and `e2e/block-phone.spec.ts`, tagged `@unity`, config `playwright.block.config.ts` (port 4176). Also not verified against the real Player: the `held` landing, `scene/anchors` positions (the Shell maps them by share of the Player's own `width`/`height`), `scene/selectFeature` after the raise, `scene/frameFeature`, and the Lantern at a plan stop (see below).
- Specs changed: `cardsync`, `gate`, `look`, `polish` (card and Report show the status line, not Confirmed by/at). Other specs already used `/place` for the old landing or `/?query` for the Explorer.

## Decisions and things the spec could not say

1. **Position line** reads "Positioned within about X m" (the existing function), but requirement 4.2 and design.md "Type" say the card's line is "Placed within about X m". Session 041 made the same choice. One word change in `evidence/position.ts` would fix it for the card only if the function took a context; left for the maintainer.
2. **Caption** is the brief's text ("Queen Street East at River Street, Toronto. Two fire-insurance plans, 1911 and 1931-35."); product.md still says "Eastern Avenue at the Don River".
3. **Lantern at a plan stop** sends `scene/setLantern` with `eraId: 'today'`. Nothing in the 040 notes says the Player draws Today inside a lens over a plan; if it refuses, it answers with an `error` message and the ring still shows.
4. **Ruler line at Today** is not shown (Today has no plan, so none of the three wordings of 5.3 is true); the card adds nothing.
5. **Ruler line text** when the other plan's lettering holds a banned word: "On the <plan> this <noun> is lettered; the words are shown in the original sheet." (the Evidence Library, `rulerLine`).
6. **A phone's flat landing** hides most pinned tags, because the headline's keep-out covers most of the sheet. After the raise the tags are in the top row. The test does not require a pinned tag at 390.
7. **"Show the original sheet"** turns on Show Evidence and `scene/setDrapeMode: original` in the Player; on the Flat sheet it draws the bare tile (no outlines, no dimming).
8. **"Full record"** uses `lotForPoint` on the middle of the feature's bounding box; the geometry library loads after first paint, so the link appears a moment after the card.
9. The ghost card has no "Seen on" place for a land-use area's use (4.5 asks for the building/area title only).
10. `block.json` has one anchor today (the bank). The other finds' tags appear on the Still after the maintainer reruns `gen:still-scene` and `Still.Render`.

## Commands to record in `tech.md` once its other edit lands

- `npx playwright test -c playwright.blockflat.config.ts` after `npm run build` (no Unity build needed).
- `npx playwright test -c playwright.block.config.ts` after `npm run build`, with the Unity build in `web/public/unity/` (the `@unity` specs).
- Removed: `playwright.blockpreview.config.ts` and the `/block-preview` route.
