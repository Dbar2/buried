# Session 052: lot check punch list (builder)

Agent: `builder`. The lot check works and its tests pass (the maintainer reran them: 1,172 unit,
11 browser). This is what looking at `web/e2e/output/lotcheck-result.png`,
`lotcheck-landing.png` and `lotcheck-phone-result.png` beside
`docs/brand/concept-m-lotcheck-result.jpg` showed. Open those four pictures first.

## Read first, and only these

- `docs/kiro-sessions/051-notes.md`.
- `web/src/lotcheck/` and `web/src/styles/lotcheck.css`, `web/e2e/lotcheck.spec.ts`.
- `.kiro/specs/08-lot-check/requirements.md` where an item below changes a requirement.

Do not touch `unity/`, `pipeline/`, `data/` or the hooks. Commit each numbered item on its own
with `git commit -m "<message>" -- <paths>`. No Co-Authored-By line. After items 1 and 2, and at
the end, run the lot-check browser spec and look at the screenshots again.

## The list

1. **The compare view is the centrepiece and it reads wrong.** In the result screenshot the old
   plan is a narrow strip at the left, the divider sits at about a quarter of the width, two
   vertical lines show, and the lot is a small shape in a wide, mostly empty frame.
   - Zoom in: the lot's bounding box plus about 15 m, not 40 m, with the lot centred. If the plan
     does not cover part of the frame (this lot is at the sheet's west edge), that part shows
     parchment with a small note "edge of sheet 229", not white.
   - The divider starts at 50 percent. One line, with one round handle on it.
   - The frame is about 4:3 on desktop and takes the left column's full width; on a phone it is
     square.
   - The lot outline must read at a glance on both sides: keep the ink casing, make the lantern
     stroke 4 px.
   - "1911 plan" and "Today" labels sit at the top corners inside the frame, and each follows its
     side of the divider (they must not overlap the divider or each other).
   - Add to the browser spec: at first paint the divider is within 2 percent of the middle, and
     the lot outline's bounding box is at least 35 percent of the frame's width or height.
2. **One sentence at the top, not two.** The page prints "…letter this lot “Coal & Wood Yard”."
   and then "…letter this lot “Coal Shed”." Print one: the use that covers the most of the lot
   (an area before a building inside it; ties by plan order). The rest are in "What the plans
   show". Update the spec's requirement and the property that covers the sentence.
3. **"What the plans show" rows.** Keep the crop, the lettering and "On this lot" or "Near this
   lot (within N m)". Change "Industrial list: coal" to a plain line a stranger understands:
   "Counts as industrial use (matched: coal)". For Today, print the addresses: "Today: 2A, 2B, 2C
   and 2D Percy St, 6 building outlines." Cap the crop at 200 px wide on desktop and 60 percent
   of the column on a phone, so the rows read as a list, not as a gallery.
4. **"What this does not tell you" is nine lines.** Show three: "Buried screens; it doesn't
   certify." "It does not say what is in the soil, water or structures today." "It is not a
   utility locate. Before you dig, request locates through Ontario Dig Authority." (with the
   link). The other lines stay in the one-page record, word for word. Check the spec's
   requirement allows this and edit it if it does not.
5. **Order on a phone:** title, tag, sentence, the compare view, the button "Download the
   one-page record", then the rows, then the three lines. The button must be reachable without
   scrolling through every crop.
6. **The provenance strip** (plan scanned by, positioned within about X m, outline traced,
   status) should be visible on the desktop result without scrolling past the right column: put
   it directly under the compare view.
7. **Industrial list:** add `fac` (the 1931-35 plan letters "Glove & Overall Fac."; it is the
   surveyors' abbreviation of factory). This is the maintainer's decision. Keep "Reviewed by: not
   yet". Update the list's tests.
8. **Result weight.** The limit in requirement 1.4 was the architect's own figure. Set it to
   550 KB, say why in the spec in one line (the page validates the evidence files against the
   schema before it prints anything, and that validator is most of the weight), and remove the
   `test.fail` mark so the test asserts the new figure.
9. **Old specs that test unrouted pages** (`cardsync`, `polish`, `placecontrols`, `phone`,
   `firstload`, `brand`, `studio-landuse`, and `dig` and `look` if they open `/`): for each, either
   point it at the route that still shows what it tests (`/?era=...` still opens the Explorer;
   `/report` still exists) or, where the page it tested is no longer reachable, mark the spec
   skipped with a one-line reason naming spec 08. Do not delete them. Do not run the Unity-backed
   ones; list which you changed.

## At the end, once

`npm --prefix web test`, `npm --prefix web run typecheck`, `npm --prefix web run build`, the
lot-check spec and the hosting spec.

## Notes file

`docs/kiro-sessions/052-notes.md`: what changed, and what still looks wrong to you.
