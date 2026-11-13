# Session 041: the Block page's parts (builder, web lane, part two)

Agent: `builder`. You are in the web worktree (`lane/web`). Group W of spec 06.

The bridge messages (group U) and the finds types (group P) have not landed in this branch yet.
So this session builds every part of the Block page that needs neither: the pure modules with
their properties, and the components as plain props-in, events-out pieces. Part three wires them
to the Player and to `data/finds.json`.

## Read first, and only these

- `.kiro/steering/design.md` (loaded for you): Identity, Palette tokens, Type, Motion, Controls,
  "The raised scene and the card".
- `.kiro/specs/06-first-visit/requirements.md`: requirements 1, 2, 4.2, 5, 6, 7.1, 11.
- `.kiro/specs/06-first-visit/design.md`: "Load states", "The Still", "Tags and the leader line",
  "The card", "Lantern lens, Flat sheet, share", properties P2, P5, P6.
- `.kiro/specs/06-first-visit/tasks.md`: group W.
- `web/src/block/` (what session 039 left), `web/src/explorer/useLantern.ts` and `lantern.ts`
  (the existing lens messages), `web/src/explorer/Fallback2D.tsx` (how the tile and outlines are
  drawn today), `data/tiles/fip_v3_1911_229.json` (the sidecar shape).
- `docs/brand/concept-f-raised.jpg`, `concept-g-phone.jpg`, `concept-h-theatre.jpg` if you can
  read images: layout targets for the card, the phone sheet and the landing. The lamp and books
  in them are not part of the product, and our ghosts have no windows.

Do not touch `data/schema/`, any `*.generated.ts`, `web/src/bridge/`, `unity/` or `pipeline/`.
Do not import from the bridge module in anything you write here.

## Build

Commit each numbered item on its own with `git commit -m "<message>" -- <paths>`. No
Co-Authored-By line.

1. **Pure modules, each with its test:**
   - `web/src/block/raiseState.ts` and property P5.
   - `web/src/block/tagLayout.ts` and property P2.
   - `web/src/block/sheetTransform.ts` and property P6.
   - `web/src/block/lensDrag.ts` (is a pointer start inside the lens; moves to lens positions).
   - `web/src/block/share.ts` (the link for a slug; clipboard with the refused-clipboard path).
   - `web/src/block/stillAnchors.ts`: image-pixel anchors through object-fit cover arithmetic to
     viewport positions, with a property that an anchor inside the visible part of the image
     lands inside the viewport.
2. **Components, props in and events out, no data loading, each with a render test:**
   - `StillPicture.tsx` (wide and tall sources by aspect ratio, fades out on a prop).
   - `RaiseButton.tsx` (reads "Raise the past", or "Lighting the lamp" when told it is waiting,
     announced politely).
   - `FindTags.tsx` (pinned paper tags on strings from `tagLayout` rectangles, and the top row
     after the raise) and `LeaderLine.tsx`.
   - `FindCard.tsx`: takes a plain view model (kicker, lettered lines, crop image source and
     rectangle, "Seen on" line, position line, status line, the extra ruler line, which actions to
     offer) and renders the catalogue card of requirement 4.2. It builds no sentences itself.
   - `BottomSheet.tsx` for under 720 px: peeks at kicker, name and status; drags open; 44 px
     targets.
   - `EraRuler.tsx`: three stops (Today, 1935, 1911), Left and Right keys, a polite announcement.
     It looks like a surveyor's scale bar, not a slider widget.
   - `LanternLens.tsx`: the ring, and a visible "Lantern" control.
   - `FlatSheet.tsx`: the plate tile with an SVG layer of footprints in the confidence line
     styles, placed with `sheetTransform`; draws the outlines on when told to raise, at once under
     reduced motion.
3. **`block.css`:** the look. Parchment card with a hairline ink rule and registration crosses in
   the corners; paper tags with a string; the headline in Libre Baskerville over the dark left
   third; one lantern-coloured button and nothing else lantern except the selected find and focus
   on dark. No rounded cards, no pills, no shadows heavier than a paper edge, no gradients.
   `prefers-reduced-motion` cuts every transition.
4. **`web/src/block/BlockPreview.tsx` at the route `/block-preview`** (not linked from anywhere):
   a static composition of all the parts over `docs/brand`-free stand-ins: a flat `--soot` to
   `--haze` backdrop where the scene will be, three tags, the card open with the sample view model
   below, the ruler, the lens control. This is for looking at the design before the Player is
   wired; part three removes it. Add a Playwright spec `web/e2e/block-preview.spec.ts` on its own
   config and port (copy how `playwright.hosting.config.ts` isolates itself) that saves
   `block-preview-wide.png` (1440 by 900) and `block-preview-phone.png` (390 by 844) to
   `web/e2e/output/`.

Sample view model for the preview and the tests (real readings from the 1911 plan):

- kicker "LETTERED ON THE 1911 PLAN"; lines "Glove & Overall Factory", "Hamilton Carhartt Mfr.
  Ltd."; crop from the tile `data/tiles/fip_v3_1911_229.jpg` at tile pixels x 2090, y 440, width
  390, height 300; "Seen on: 1911 plan, sheet 229"; "Positioned within about 4.5 m"; "Status:
  draft, not yet reviewed"; ruler line "On the 1931-35 plan this factory is lettered “Glove &
  Overall Fac.”."; actions "Show the original sheet", "Share this find", "Full record".
- tags "Overall factory", "Bank", "Coal yard".

Use the steering's existing position wording ("Positioned within about X m") on the card, not
"Placed within".

## Test

`npm --prefix web test -- src/block` while you work. Once at the end: `npm --prefix web test`,
`npm --prefix web run typecheck`, `npm --prefix web run build`, and the preview spec.

## Notes file

`docs/kiro-sessions/041-notes.md`: what you built, anything the spec left open that you decided,
and what part three must wire.
