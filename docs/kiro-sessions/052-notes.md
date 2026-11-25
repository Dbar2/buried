# Session 052: notes (builder)

Lot check punch list, items 1 to 9. Unit tests: 1,177 pass (132 files). `tsc` and `vite build` pass. Lot check browser spec: 15 pass. Hosting config: 8 pass, 9 skipped (the retired specs). Unity-backed specs were not run.

## What changed

1. **Compare view.** Frame is the lot plus 15 m with the lot centred (the slide back onto the sheet is gone). The scan is clipped to the sidecar's `map_area`, so what lies outside it is parchment, with the note "edge of sheet 229" at the middle of the uncovered part. The divider starts at 50 per cent. The "two vertical lines" in the old screenshot were the focus ring of the 44 px divider element after the drag test; the ring now goes round the handle only, so the divider is one line with one handle. Lot outline is a 4 px lantern stroke in a 6 px ink casing in the compare frame. The corner labels hide when the divider leaves them no room (`chipsFit`). The result screenshot is now taken at first paint. New browser test: divider within 2 per cent of the middle, outline at least 35 per cent of the frame, frame about 4:3, labels on their own sides.
2. **One sentence.** `leadUse`: most overlap with the lot (JSTS intersection area, rounded to 0.1 m2), then nearer (for uses only near the lot), then an area before a building, then the earlier plan, then the id. The sentence names every plan that letters those same words. Other uses stay in the rows.
3. **Rows.** "Counts as industrial use (matched: coal)". The Today row reads "2A, 2B, 2C and 2D Percy St, 6 building outlines." (the count is now `Band.buildingCount`, set in `coreSample.ts`). Crops are at most 200 px wide, 60 per cent of the column under 720 px.
4. **Three lines** under "What this does not tell you". The Report's longer lines are unchanged and stay in the one-page record.
5 and 6. **Layout.** Provenance strip is in the left column under the compare view. Under 900 px the order is compare view, button, rows, limits, provenance (CSS `order` on `display: contents` columns). Items 5 and 6 are one commit because they rewrite the same JSX and CSS.
7. **`fac`** added to the Industrial list. "Reviewed by: not yet" is kept. The tag counts on the committed data did not change (73 / 83 / 11 / 1).
8. **Weight limit 550 KB**, `test.fail` removed. Measured 522,794 bytes.
9. **Retired specs** (`test.skip` with a reason naming spec 08, not deleted): `cardsync`, `placecontrols`, `phone`, `firstload`, `studio-landuse` (whole files); `polish` (landing and place page tests; the Sources test still runs and passes); `brand` (landing, example, two place page tests; the `/report` test still runs and passes). `dig` and `look` open `/?debug=1&markers=0`, `/explorer` and `/?era=` (all still the Explorer), so I left them alone. Not run: they need Unity.

Spec edits: requirements 1.4, 3.1, 3.3, 3.4, 3.5, 4.1, 5.3 and a new 5.6; design.md "Compare view" and P1.

## What still looks wrong

- Tab order on a phone differs from the visual order: the "Ontario Dig Authority" link comes in the tab order before the download button, because the button is moved up with CSS `order`. Fixing it needs the DOM in phone order and a different desktop layout.
- On a phone the provenance strip is last, not under the compare view (item 5 did not list it). Say if you want it first.
- The "edge of sheet 229" note on 2A Percy St straddles the parchment strip and the scan next to it (it is centred on the uncovered part, which is narrow), so it also covers a little of the plan. The scan inside the map area has a white margin west of Sumach St, so a parchment band and a white band sit side by side.
- `design.md` (steering) still says "3 px lantern inside 5 px ink casing" and "4:3 desktop"; the spec now says 4 px inside 6 px. I did not edit steering.
- The lot's 4:3 frame is about 640 px wide at 1440, so the lot is about 40 per cent of the frame. A small lot (6 m wide) would be under 35 per cent; the browser test checks only 2A Percy St.
- On desktop the left column still ends under the provenance strip while the right column runs on (the compare frame is sticky, so it stays in view).
- The lot check keeps "Industrial list" wording only inside the How page list, which now shows `fac` without a gloss.
- `requirements.md` 3.6 still says the share link carries the data version; the page does not (as in session 051).
