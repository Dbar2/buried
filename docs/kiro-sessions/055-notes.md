# Session 055: notes (builder)

Real aerial photographs and imagined views in the lot check. Unit tests: 1,258 pass, 1 todo (139 files). `tsc` and `vite build` pass. Lot check config (lotcheck, night, photos): 52 pass. Hosting config: 8 pass, 9 skipped (the retired specs). Each numbered item is its own commit, except that the dig thumbnail (3) and the Landing line (4) share `night.css`, so item 3's commit holds both CSS hunks and item 4's commit holds the page and its test.

## What I built

- **0. Written down.** `product.md` "Pictures" (the five rules), `sources.md` (two rows for the City's 2025 orthophoto and 1939 aerial with the City's caveat, and a note that imagined views are not sources; ids `present_toronto_orthophoto_2025` and `aerial_toronto_1939`), spec 08 requirements 11 and 12, properties P11 to P13, tasks 18 to 23. The three spec files are 387 lines.
- **1. Compare layers.** `photos.ts` (pure: the two index parsers, `photoPlacement`, `layerChoices`, `layerCaption`, `viewsOnLot`), `usePictures.ts`, `CompareView.tsx`, `compare.ts` (`frameHolding`). Then: plans, "1939 photo", "Imagined, about 1911" (when the lot has one). Now: "Today, photo" (default), "Today, outlines". Radio groups with native radios (arrow keys work), 44 px, announced politely. The lot outline and "where it stood" are drawn last in each layer; on a photograph "where it stood" is parchment over an ink casing. After the divider sweep the Now side fades from outlines to the photograph (0.6 s, opacity). Under reduced motion it shows the photograph at once.
- **2. "As it may have looked".** `Postcard.tsx`: heading, the street picture, the index caption plus "Imagined from the 1911 plan. Not a photograph.", a native `<dialog>` for the larger picture (Escape closes, focus returns), a 1 degree tilt that straightens on hover, none under reduced motion.
- **3. Dig.** `DigSlip.featureId`, `streetViewForSlip`; the 1911 slip for 2A Percy St carries a 96 px thumbnail labelled "imagined" (a CSS label, so the slip's words are unchanged).
- **4. Landing.** "Each dig shows the old plan, a 1939 aerial photograph, and a photograph of what stands there today." under the map caption.
- **5. Sources.** "Aerial photographs" (each: year, dataset, licence, credit, date, resolution, address, a 320 by 180 crop around the coal yard, and the City's 1939 caveat) and "Imagined views" (what they are, how they were made, the nine sites).

## Weights (Brotli quality 5 for text, as the existing measure does)

| | Before (session 053/054) | Now | Limit |
|---|---|---|---|
| Landing before the visitor acts | 861,782 B | 866,370 B | 950 KB |
| Result before the first tile request | 693,515 B | 701,184 B | 700 KB (716,800 B) |
| Result before the first picture is requested | not measured | 4,532,487 B (the two plan tiles, 3.6 MB, are in it) | none |
| Result with today's photograph and the postcard | not measured | 5,535,734 B | none |
| How | 507,993 B | 509,041 B | none |

The photographs: `today-2025.jpg` 730,461 B, requested after the text and after the plan tile; `aerial-1939.jpg` 204,977 B and an imagined top-down view only when the visitor chooses them; the street picture 272,786 B, lazy, so only when the postcard scrolls into view. The Landing requests no picture and no index (a test checks it); the two small indexes (about 7 KB) are read on the Result, and the imagined index is read when a dig starts. I did not raise requirement 1.4: the Result's figure stays 700 KB and is met; the requirement says that pictures after the text and the tile are not counted in it. The extra 7.7 KB before the tile is the two indexes and the code.

## Departures from the brief, and why

1. **The postcard is under the record sheet and its provenance strip, not on the sheet.** On the sheet it pushed the provenance strip 500 px below the compare view and the one-page record button 424 px below it on a phone, which two existing tests (session 052) hold to 120 and 200 px. I kept those tests and moved the postcard. On the dark page it has a parchment margin, as the brief describes. Requirement 12.2 is reworded.
2. **`.lc-main` is no longer sticky.** With the postcard it is taller than a window, and a sticky column taller than the window hides its lower half until the page ends.
3. **Layer controls are native radios, not `aria-pressed` buttons.** The brief says radio groups. The old plan-switch test and the 44 px selector in `lotcheck.spec.ts` now name the radios; `design.md` (steering) says "checked radio".
4. **An imagined Then layer widens the frame to hold the whole picture** (`frameHolding`), so the "IMAGINED" mark is never cropped. The lot then looks smaller and the two sides re-frame together when the visitor switches. The divider can still be dragged over the picture's corner, which is the visitor's choice.
5. **The dig thumbnail's label is "imagined" only**, as item 3 says; the long caption is in its alt text. The thumbnail downloads the full 273 KB street picture (I may not resize the files).
6. **A Then photograph or imagined view that has not loaded shows "Loading the picture." on the paper**, not the outlines; the Now side does show outlines until its photograph loads, as the brief says.
7. **Imagined top-down choice requires the lot's middle inside the picture's bounds; a photograph requires the whole lot inside.** 161 of 168 lots are held by both photographs (7 are at the edge of the block and get no photograph choice).
8. **The photographs are not in `data/sources.json`** (I may not touch `data/`); the Sources page reads them from `aerial.json`.
9. **Captions are built with the sentence builder** (years in the pack) and checked for banned words in tests; the street caption from the index is printed only if it passes the banned-word check.
10. **`lc-compare-note` text changed** from "The plan is the scan as digitized, laid on paper." to the layer caption.

## Not done, or not verified

- No real touch device; the phone pass is Chromium at 390 px. Unity-backed specs were not run.
- The 1939 photograph is blurry at the frame's zoom (about 0.3 m per pixel across a 50 m frame). That is the data.
- I did not check the imagined pictures against the plan outlines; the index says that was done by eye.

## What still looks wrong

- 1939 photograph: very soft at close range, so it reads as a texture more than a place.
- Imagined top-down view: it is rotated with the plan tile, so its edges are slanted in the frame and the parchment shows in the corners.
- The layer controls wrap to two rows at the Result's column width at 1440, with "Imagined, about 1911" alone on the second row.
- The postcard sits below the fold on most screens, so a visitor may not find it. The first-screen view is the plan against the photograph.
