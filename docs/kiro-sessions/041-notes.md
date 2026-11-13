# Session 041 notes: the Block page's parts

Branch `lane/web`. Nothing here touches `data/schema/`, `*.generated.ts`, `web/src/bridge/`, `unity/` or
`pipeline/`, and nothing imports from the bridge module. `BlockPage.tsx` is unchanged (still the W2
placeholder); the parts are not wired to anything yet.

## Built

Pure modules in `web/src/block/`, each with a test (P2, P5 and P6 are the properties of spec 06 design):

- `raiseState.ts`: reducer `still/waiting/ready/raising/raised/flat`, events `press/ready/raised/failed/timeout`.
  `raiseLabel`, `sendsRaise` (true on the one transition into `raising`), `flatShouldRaise`, `PLAYER_TIMEOUT_MS`.
- `tagLayout.ts`: `layoutTags` (above 40 to 160 px, then left, then right), plus `leaderLine` (the anchor to the card's
  left edge; null on a phone, off screen, under the card, or past its left edge) and `estimateTagSize`.
- `sheetTransform.ts`: sidecar corners to tile pixels and back, `ringsToPath`, `ringCentrePx`. P6 also runs on the
  committed `fip_v3_1911_229` sidecar, bottom-right corner included.
- `lensDrag.ts`: `isInsideLens`, `beginLensDrag` (null means the camera takes the drag), `moveLensDrag`.
- `share.ts`: `findLink`, `copyLink` (`copied` or `refused`), `LINK_COPIED`.
- `stillAnchors.ts`: `coverFit`, `visibleImageRect`, `anchorInViewport`, `stillKindFor`.

Components (props in, events out, no data loading): `StillPicture`, `RaiseButton`, `FindTags` (`mode="pinned"` or
`"row"`), `LeaderLine`, `FindCard` (with the exported `CardViewModel`), `BottomSheet`, `EraRuler`, `LanternLens`,
`FlatSheet`. `sample.ts` holds the sample find (real readings) for tests and the preview only.

`block.css` holds the look. `blockPreview.css`, `BlockPreview.tsx` (route `/block-preview`, hooked in `App.tsx` before
`routeFor`, not in `routeFor`), `e2e/block-preview.spec.ts` and `playwright.blockpreview.config.ts` (port 4175, never
reuses a server). The spec writes `block-preview-wide.png`, `block-preview-phone.png`, and also
`block-preview-phone-open.png`, `block-preview-landing-wide.png` and `block-preview-landing-phone.png`
(`?state=landing` shows the landing). Run: `npm --prefix web run build`, then
`cd web && npx playwright test -c playwright.blockpreview.config.ts`.

## Decided here (the spec left it open)

- **Lens radius** is a parameter (`radius`, a share of the canvas height). I did not import `LENS_RADIUS` from
  `explorer/lantern.ts` because that module imports the bridge. Part three passes 0.18 from there.
- **Card wording.** The card renders the view model's strings as given. It only splits the first `": "` of the "Seen on" and
  "Status" lines so the label can be set in bold. "Show on the map", "Copy this link:" and the three action names are the
  card's own fixed labels. The share note reuses `LINK_COPIED` from `share.ts`.
- **Position line** reads "Positioned within about X m" (the steering's wording, as the brief said), not "Placed within".
- **Bottom sheet.** The peek takes `{kicker, title, status}` separately, because the card puts the status after the crop.
  The peek and the open card never show at once. Dragging 48 px or more up opens, down closes; a tap or Enter toggles. There is no
  live follow of the finger while dragging. The card inside the sheet is `hidden` while closed, so its crop image (lazy) is not
  fetched until the sheet opens.
- **Flat sheet "draws on".** Each outline is revealed along its length by an SVG mask, so its dash pattern (the confidence mark)
  is kept; then its fill fades in. The stagger is 0.02 s per footprint, less when there are many, so the last one starts by
  1.5 s and finishes by 2.2 s (tested). With reduced motion, or `reducedMotion` true, there is no mask and no animation.
- **Tag height** is 44 px everywhere (touch target), so pinned tags are a little taller than the concept pictures.
- **Era ruler** is a `radiogroup` with a roving tabindex, not a `slider`; Left, Right, Home and End work and stop at the ends.
  It takes `stops` with their own announcement text.
- **Selected edge** is a 1 px border plus a 2 px inset ring in `--lantern` (and bold text), never an `outline`, so the focus
  ring still shows on a selected tag.
- **Preview crop wait.** The Playwright helper decodes the visible images before a screenshot. The 2 MB tile decodes off the
  main thread, and a screenshot taken before that showed an empty crop frame.

## Not done, or left for part three

- The Flat sheet has no lens and no tile swap: it takes one tile, the footprints, optional present outlines and a `dimmed`
  flag. Part three picks the tile per ruler stop and draws the other layer inside the lens (a circular clip).
  Land-use areas are not hatched yet (`FlatFootprint` has no kind).
- No "List" control, no close button on the card, no margin caption in the preview.
- `FlatSheet` does not report anchors. Part three can use `ringCentrePx` and `sheetTransform` with the SVG's
  fit (`meet`) to turn footprint centroids into viewport anchors for `layoutTags` and `leaderLine`.
- The Still files (`web/public/still/`) and `block.json` do not exist yet; `StillPicture` takes its sources as props.

## Part three must wire

1. `BlockPage` to `raiseReducer`: `ready` and `failed` from the Player, `timeout` after `PLAYER_TIMEOUT_MS` from first paint,
   send `scene/raise` when `sendsRaise(prev, next)` is true, `raised` from `scene/raised`. The failed line (requirement 2.4)
   and the Flat sheet when `phase === 'flat'`, raising it when `flatShouldRaise`.
2. `StillPicture` with `stillKindFor(viewport)` and `anchorsInViewport` from `block.json`; fade on the Player's first frame.
3. Real anchors from `scene/anchors` (or the Flat sheet's) into `layoutTags` with the keep-outs: header, card, ruler, Lantern
   control, top tag row, and the headline block before the raise. Measure tag sizes (or keep `estimateTagSize`).
4. `findText.ts` and `data/finds.json` into `CardViewModel`; the banned-word check before quoting a lettered line.
5. `copyLink` and `findLink` behind "Share this find", feeding `shareOutcome`; set `shareLink` for the refused path.
6. `EraRuler` stops from the project's era ids; the ruler line (R5.3); `LanternLens` with `useLantern` and `lanternLabel`.
7. Under 720 px: `BottomSheet` with `peek` from the same view model, no `LeaderLine`.
8. Remove `BlockPreview.tsx`, `blockPreview.css`, `e2e/block-preview.spec.ts`, `playwright.blockpreview.config.ts` and the
   `/block-preview` branch in `App.tsx`.
