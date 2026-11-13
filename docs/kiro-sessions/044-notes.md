# Session 044 notes: Block page punch list

Branch `lane/web`, builder. Web only: nothing in `unity/`, `pipeline/`, `data/schema/` or a generated file changed. One commit per item.

## What was done

1. **Empty landing.** The Still was never shown at first paint: `BlockStage` drew it only once `block.json` (the anchors) had loaded. It now shows at once; only the pinned tags wait for `block.json`. It also faded on `player.running`; it now fades when the held era (1911) is in `eraLoaded` with `running`, plus two animation frames. `data-held-loaded` on the stage says when. Tests in `block.spec.ts`: Still visible with `naturalWidth > 0` while `block.json` is held back 3 s; a `MutationObserver` records any moment the Still is faded before `data-held-loaded` is true (none). `BlockPage.test.tsx` changed: the Still is in the first-paint markup.
2. **Card crop.** `loading="eager"`. `e2e/support/cropLoaded.ts` waits for the crop (and `stillLoaded` for the Still) to be visible, complete, `naturalWidth > 0` and **decoded** before a screenshot. Complete alone was not enough: the 390 px card screenshot still came out blank until `decode()` was awaited.
3. **Lantern test.** The test passed here in four runs, so I could not reproduce the `waiting` phase. I did find a real fault: the Player ignores `scene/setLantern` with `on: true` when the depth is above 0 (`SceneController.HandleSetLantern`, "the Lantern works from Today"). At the 1911 stop after Raise, the lens was therefore never drawn. Now, on the Player path, turning the lens on at a plan stop moves the ruler to Today, shows that plan inside the lens, and sends `on: true` only once `depth === 0`. Turning it off puts the ruler back. The Flat sheet is unchanged (it can show Today inside a lens over a plan). The test now checks the ruler goes to Today and back, the control says "1911", and the console shows no "setLantern ignored" warning. Screenshot `block-lantern-1440.png` shows the 1911 plan inside the lens.
4. **Ruler.** Box removed. A `--soot` gradient on the scene's lower edge (`.block-scene::after`, 15 rem; 7 rem on a phone) keeps the labels readable. The Lantern and List controls are transparent with a hairline rule and parchment text; the Lantern's "on" state is a heavier rule and an underlined label.
5. **Phone.** After the raise the scene's box reaches from the tag row to the sheet's peek (`blockLayout().scene`, which the Player's canvas and the Flat sheet fill). Lantern ("Lantern", full name in `aria-label`), List and the ruler share one line directly over the caption. The caption on a phone is the link only (the block's name is visually hidden). The lens ring now sits in its own area (`.lens-area`) matching the scene's box, and tag anchors are offset by it.
6. **Flat sheet.** The scan is multiplied over a `--parchment` rect (`mix-blend-mode`), untouched for "Show the original sheet" (`toned={false}`); the crop on the card is untouched. Outlines and today's footprints are clipped to the tile (`clipPath`). The no-3D line is in the caption bar, in place of the block's name while it shows; the bar is taller where it wraps (`captionHeight`).
7. **Tags.** `selectedKeepOut` adds a 72 px square around the selected find's anchor and the first 120 px of its leader line to the keep-outs. Property test in `tagLayout.test.ts` (no placed tag meets either), and a test that without the keep-out a tag does land on the find.

## Tests

- `npm --prefix web test`: 115 files, 1032 tests. One failure on the full run, `bridge/samples.test.ts` ("regenerating changes nothing"), was a 5 s timeout under load; it passes alone in 0.5 s.
- `npm --prefix web run typecheck` and `npm --prefix web run build`: clean.
- `playwright.block.config.ts` (with the Unity build): 9 of 9. `playwright.blockflat.config.ts`: 5 of 5.
- `playwright.hosting.config.ts` runs the hosting, cardsync, polish and report specs: 16 of 17 on the first run; `cardsync` "the gauge and the core sample follow each other" failed once ("the today band is in view") and passed when run alone. It is on the place page, which none of these files touch.

## Decisions to check

- **`PHONE_SHEET_FAR_EDGE = 0.22`** in `blockLayout.ts`. The empty band in item 5 is the dark table above the sheet's far edge in the Player's own tall pose; resizing the canvas does not remove it (tried). I measured that edge at 21 to 23 per cent of the canvas height and make the scene's box reach up under the tag row by the amount that puts it at the tag row's foot. If the camera pose changes, this number is wrong. A proper fix is a camera pose for the raised phone view, which is Unity's.
- On a phone the scene's box changes at the raise (full stage before, tag row to sheet after), so the canvas resizes at that moment. The camera is not asked to move, but the framing changes with the aspect. Not looked at in motion.
- The Lantern at a plan stop now moves the ruler to Today (the Player's rule). A visitor who presses it on 1911 sees the ruler jump. The alternative is a Player change to draw the lens at any depth.
- The no-3D line replaces the block's name in the caption while it shows. The name is the only text the Flat sheet landing loses.
- The stage gradient contradicts "no gradient fills" in design.md; item 4 asked for it, and the exception is written in `block.css`.

## What still looks wrong to me

- Pinned tags at 1440 sit over ghosts: "Cork factory" over the cork factory's volume and "Machine shop" beside the selected factory. The keep-out protects only the selected find, as asked.
- The leader line crosses the Bank tag and a ghost on its way to the card.
- Ruler labels "Today" and "1935" are italic `--parchment-dim` over a still-bright plan at the left; legible but thin. A longer or stronger fade would fix it, at the cost of hiding more of the sheet.
- Phone landing: no pinned tag shows (the headline's keep-out covers the sheet), so the landing has no hint that the tags exist until the raise.
- Phone Flat sheet after the raise still shows the pinned tags over the plan beside the tag row (they do not hide on raise); on the desktop Player view the same tags remain too. Not in the list; left.
- Landing screenshot timing: the Still's decode can finish after the first paint on a slow machine, so a very early screenshot can still be dark for a moment. A `<link rel="preload">` for the Still would shorten it; it would load on every route, so I did not add it.

## Commands

No new command. The specs added: `e2e/support/cropLoaded.ts` (`cropLoaded`, `stillLoaded`).
