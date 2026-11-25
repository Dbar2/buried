# Session 053: notes (builder)

The night dig: suggestions, the Landing at night, the dig, the reveal. Unit tests: 1,220 pass, 1 todo (136 files). `tsc` and `vite build` pass. Lot check browser run (lotcheck.spec + night.spec, 33 tests): all pass. Hosting config: 8 pass, 9 skipped (the retired specs). The Report spec in that run passes (one page on Letter and A4); the Report is not themed.

## What I built

- **Item 0.** Steering `design.md` (the night page, motion, `--stamp`, its contrast pair), `product.md` (the dig, rule 17), spec 08 requirements 8 to 10, P7 to P10, tasks 12 to 17 (329 lines for the three files). `--stamp: #8e3b2e` in `tokens.css` (5.48 : 1 on parchment; the contrast test has the pair). `tech.md` has the new commands.
- **Item 1.** `suggest.ts` (matching by token, ranking, defaults, random), `AddressCombobox.tsx` (ARIA combobox, arrows, Enter, Escape, "Try one of these", "We have not dug there yet. Try one of these:"). `industrialLots` now also returns the lead use's lettering and the plans that letter it.
- **Item 2.** `LandingPage.tsx`, `night.css`, `night.tsx`, `useIdle.ts`. The plan on the paper art with the lantern, the light spreading, the recorded lots glowing in turn and pulsing, a tag on hover or focus, a pool of light that follows the pointer, fog, skyline, spade.
- **Item 3.** `digTimeline.ts`, `DigOverlay.tsx`, `computeLotCheck.ts` (the Result and the Landing build the check with one function).
- **Item 4.** `verdict.inscription` in `buildLotCheck`, `RecordSheet.tsx` (stamp and inscription), `LotPage.tsx` rewritten, the divider sweep and the "where it stood" outlines in `CompareView`.
- **Item 5.** How page at night with the dig line and the lantern, Sources "Illustrations", the nudge on "Dig", the glowing mark, a soot `<style>` in `index.html` so no page change flashes white.

## Timings and weights

| | Figure | Limit |
|---|---|---|
| Dig, two plans (the 2A Percy St lot) | 4,500 ms by the timeline; 4,819 to 4,847 ms measured from the overlay appearing to the Result URL (it includes about 300 ms of "Lighting the lamp…" while the check is built) | 7,000 ms (a timer also opens the Result at 7 s) |
| Dig, five plans or more | scaled down so the total stays at 7,000 ms or less (tested) | |
| Landing before the visitor acts | 861,782 B | 950 KB |
| Result before the first tile request | 693,515 B | 700 KB (716,800 B) |
| How | 507,993 B | none |

Entrance on the Landing: lantern flicker 0.9 s, light spreading 0.35 to 1.55 s, the lots from 0.9 s, 80 ms apart. Reveal: sheet rises 0.6 s, stamp lands at 1.0 s (0.3 s), nudge at 1.12 s, divider sweep at 1.3 s for 1.1 s, rows from 1.3 s, 120 ms apart.

## Departures from the brief, and why

1. **The skyline, the spade and the earth cross-section load once the Landing is idle** (1.5 s after the load event, then idle). With them in the first load the Landing was about 1.07 MB. The Result's lantern is requested after its text, for the same reason (777 KB with it, 693 KB without).
2. **"Where it stood" is drawn in `--ink-soft`, not parchment.** The Today side of the compare view is parchment, so a parchment line cannot be seen. design.md says so now.
3. **The scan on the Landing is not toned.** It is the untouched image; the lantern light is a darkening layer over it (requirement 2.5 says untouched). The white of the scan shows through; I judged that better than a blend mode.
4. **The caption says "11 lots on this block have something recorded. 6 of them are on this plan. Click one."** The plan crop holds six of the eleven. The other five are reached from the list or "dig somewhere at random".
5. **"Something recorded" means a lot where the tag would be "Past industrial use recorded"** (`industrialLots`, 11 lots), not any lettered use. The one "past use" lot (street cleaning) is not in the list.
6. **The "Try:" examples are gone** from the Landing; the focus list ("Try one of these") replaces them. `pickExamples` is still in `landing.ts` and tested, unused by the page.
7. **The dig does not play for a lot whose tag is "Not covered yet"** (it goes straight to "NOT DUG YET"). The lantern waits at the ground line with "Lighting the lamp…" while the check is built, which is a real wait (about 300 ms).
8. **The reveal plays on every Result visit**, not only after a dig; only the dig is skipped on a direct visit. Reduced motion shows the end state.
9. **The divider sweep moves `clip-path` and `left` from a `requestAnimationFrame` loop**, not `transform`. The divider already works that way; it is the one exception to "transform and opacity only" (design.md says so). A CSS test checks that every keyframe names only `opacity` and `transform`.
10. **The stamp's filter** is a displacement plus a speckle mask, applied once, never animated.
11. **The lot-check functional spec runs under reduced motion**; `night.spec.ts` runs the motion. In the provenance-strip test the window is 1400 px tall (was 1100), because the sheet now starts with the inscription.
12. **Test hook:** `window.__buriedDigHold = <mark index>` freezes the dig inside that mark's pause (the 7 s timer is off while it is set). It is in production code because the browser specs run against the production build.
13. **`index.html` holds one hex colour** (the soot ground, in a comment-marked `<style>`), outside `tokens.css`, so the first paint is dark. The boundary test only scans `src/`.
14. **Contrast tests changed to match the design:** the lantern is allowed on the lit lots, the light, the pool, the glow, the focus ring and the field's focus border (listed by selector); copper on the registration crosses; `--stamp` only on the stamp. No pair's floor was lowered.
15. **Playwright's browser:** the installed Chromium no longer matched `@playwright/test` 1.65.0 part-way through, so I ran `npm exec -- playwright install chromium` (Chromium 158, revision 1254). Rendering may differ a little from the earlier runs.
16. **Spec text:** requirement 2.1 and 2.3 were edited to match the Landing; the three spec files are 329 lines.

## Not done, or not verified

- The browser print dialog and the other retired specs (see 052) were not run. Unity-backed specs were not run.
- No real touch device: the phone passes are Chromium at 390 and 320 px.
- Frame times of the animations were not measured. Everything animated is `transform` or `opacity`, except the one sweep.
- The headline, sentence and button wording changed from product.md's first version; `index.html` and the page title still say "what was on this land?" (the description is still true). Say if you want them changed.

## What still looks wrong in the final screenshots

- **Dig:** the earth is still dark; the strata art is dim and the light pool is small next to the concept. The Today slip fades to 60% once the lantern passes, so its ink text is grey on grey. The skyline sits above the ground line only before the pan moves it off screen.
- **Landing:** the white scan against the paper is the brightest thing on the page. The lantern covers the top-right corner of the plan. On a phone the skyline is a thin faint strip behind the kicker.
- **Result:** the sheet is tall, so the compare view starts below the first screen at 1440 by 900; the right column is longer than the left. The stamp's speckle makes its small capitals a little hard to read at 0.875 rem. The lantern beside the sheet overlaps its left edge at widths near 900 px.
- **Not covered:** the spade art is pale green on the paper.
- The suggestion list covers the fact line while open (it sits over it, by design).
