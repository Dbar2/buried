# Requirements: 08 Lot check

The lot check is the product (product.md "The lot check"). It reuses spec 05's `Report`, spec 06's
sheet transform and the Evidence Library. It changes no schema, pipeline command or evidence file.

**Glossary.** *Landing*, *Result*, *How page*: `/`, `/lot/<lot id>`, `/how`. *Trigger*: a feature on
or near the lot whose lettered use contains an entry of the *Industrial list* (the one reviewed list
in the Evidence Library). *Coverage area*: lots for which `buildReport` does not answer
`not_reconstructed`.

## Requirement 1: Routes and weight

1.1 THE Shell SHALL show the Landing at `/` (no query) and at `/place` without `lot`; the Result at
    `/lot/<lot id>` and `/place?lot=<lot id>`; the How page at `/how`; the Block page at `/block`
    and `/find/<slug>`. `/report`, `/studio`, `/sources` and `/explorer` stay as they are.
1.2 THE Shell SHALL NOT route `/walk`, and no page SHALL link to it.
1.3 THE Landing, Result and How page SHALL NOT request a URL under `/unity/`, load the bridge or
    create a WebGL context.
1.4 THE Landing SHALL transfer at most 600 KB (compressed HTML, script, CSS, fonts, images) before
    the visitor acts. THE Result SHALL transfer at most 400 KB before the plan tile is requested,
    and SHALL request the tile only after its text is on screen.

## Requirement 2: The Landing

2.1 THE Landing SHALL show, in order: header, kicker, headline, one sentence, the address field and
    "Check this address", "Try:" with examples, the computed fact, the coverage line and the plan
    picture, with the texts in product.md.
2.2 WHEN the address typed matches an address point inside the coverage area, THE Landing SHALL
    open that lot's Result. WHEN it matches none, THE Landing SHALL say "Not reconstructed yet." and
    nothing else. It SHALL reuse the existing address search.
2.3 THE examples SHALL come from `pickExamples`: up to three distinct lots whose tag is "Past
    industrial use recorded", preferring distinct lettering, ordered by address text.
2.4 THE fact SHALL come from `landingFact`, built with the sentence builder and checked. WHEN its
    count is 0 THE Landing SHALL omit it. [PBT: the count equals the address points inside areas
    lettered with that use]
2.5 THE coverage line SHALL take its years from the source registry. THE plan picture SHALL be the untouched scan with the fact's yard outlined from evidence
    geometry, not a drawn shape.

## Requirement 3: The Result

3.1 THE Result SHALL show, in order: title, tag, sentence, compare view, "What the plans show",
    "What this does not tell you", actions, provenance strip.
3.2 THE title SHALL be `Report.place.heading`. THE tag SHALL be one of the five in 4.2 to 4.7, decided by
    `buildLotCheck` (requirement 4).
3.3 THE page SHALL print one sentence under the tag (session 052), about the use that covers the most
    of the lot (an area before a building when they cover the same; then the earlier plan), quoting
    its lettering with every plan that letters it in those words ("The 1911 and 1931-35 plans letter
    this lot “Coal & Wood Yard”."). The other uses are rows under "What the plans show".
3.4 "What the plans show" SHALL have one row per plan covering the lot and one for today. A plan row
    shows its lettering crop and a line from the record. A plan that letters nothing here says what
    that plan shows and states no finding.
3.5 "What this does not tell you" SHALL use the Report's `cannotTell` and `beforeYouDig` text and
    link, and begin with "Buried screens; it doesn't certify."
3.6 THE actions SHALL be "Download the one-page record" (the Report for this lot; the one primary
    button), "Share this check" (copies `/lot/<id>`, with the data version as spec 05 does) and
    "See this block in 3D" (to `/block`; removed by task 10 if the Player is too large).
3.7 WHEN the lot is outside the coverage area, THE Result SHALL show the tag "Not covered yet", the
    sentence "Not reconstructed yet." and the coverage line, and nothing else.
3.8 THE provenance strip SHALL give, from the triggers' records (or the covering plans if none): the
    attribution line, "Positioned within about X m" (largest error), how the outline was traced and
    its review state (spec 05 `statusSentences`).

## Requirement 4: The verdict

4.1 THE Industrial list SHALL hold the entries in product.md rule 13 and nothing else, matched
    whole-word and case-insensitive on `lettering(use)` of buildings and areas. [PBT: only list
    entries trigger]
4.2 WHEN a trigger's relation is "on", THE tag SHALL be "Past industrial use recorded".
4.3 WHEN no trigger is on the lot and one is near it, THE tag SHALL be "Industrial use recorded next
    to this lot" and the sentence SHALL give "within X m" from the relation.
4.4 WHEN at least one plan is reviewed for the lot, no trigger exists and no use is lettered on the
    lot (4.7), THE tag SHALL be "No industrial use lettered on these plans", with "This is not a
    clearance. It says nothing about the land today." beside it.
4.5 WHEN no plan is reviewed for the lot (and 4.2, 4.3 and 4.7 do not apply), THE tag SHALL be "Not
    covered yet" with the Report's coverage sentence.
4.6 THE tags in 4.2 and 4.3 SHALL NOT appear without at least one trigger shown with its lettering
    and crop. WHEN the lettering has a banned word, THE page SHALL show the crop and name the plan,
    and not quote the words. [PBT]
4.7 (session 051, decision 1) WHEN no trigger exists and a use is lettered on the lot that matches no
    entry of the Industrial list, THE tag SHALL be "A past use is lettered on these plans" and the
    sentence SHALL quote that lettering. "Street cleaning" is not on the list, so a City works yard
    gets this tag and not 4.2. THE rows under "What the plans show" SHALL list every lettered use on
    or near the lot (within the Report's 30 m use radius), matched or not.

## Requirement 5: The compare view

5.1 THE view SHALL draw the selected plan's untouched tile left of the divider, and today's building
    outlines and lot lines right of it, in one viewBox from one `SheetTransform`.
5.2 THE lot outline SHALL be the same on both sides, and the divider position SHALL NOT change the
    outline, the viewBox or which lot is outlined. [PBT]
5.3 THE view SHALL frame the lot's bounding box plus 15 m on each side, with the lot centred, and
    SHALL NOT draw evidence footprints on the scan. WHERE the frame reaches past the sheet's map
    area, THE view SHALL show parchment there and the note "edge of sheet <number>", not white.
5.4 THE plan switch SHALL list each plan covering the lot, earliest first. Choosing one changes the
    tile and the label only, and is announced to screen readers.
5.5 THE divider SHALL work by pointer, touch and keyboard, start at 50 per cent and clamp to 0..100.
    WHILE the tile loads, THE view SHALL show the frame, today's side and "Loading the plan."
5.6 THE divider SHALL be one line with one round handle, and the lot outline SHALL be a 4 px
    `--lantern` stroke inside a 6 px `--ink` casing, the same on both sides. EACH corner label
    ("1911 plan", "Today") SHALL stay on its own side of the divider and SHALL be hidden when the
    divider leaves it no room, so no label touches the divider or the other label.

## Requirement 6: How it works

6.1 THE How page SHALL show four steps (a plan is read; a person marks the outline; the outline is
    placed on today's map with a stated error; the lettering is checked against a reviewed word
    list), one picture each from committed scans, then "Built with Kiro" in at most five sentences.

## Requirement 7: Phone, keyboard and honesty

7.1 UNDER 720 px, THE pages SHALL use the single-column layout in design.md, with no sideways
    scroll at 320 px and touch targets of 44 px or more.
7.2 EVERY control SHALL work by keyboard with a visible focus ring.
7.3 NO text on the three pages SHALL contain a banned word or call a record "confirmed" that no
    named person reviewed, and every sentence SHALL pass `checkSentence`. [PBT]
7.4 "Buried screens; it doesn't certify." SHALL NOT be on the Landing. THE Studio SHALL be linked
    only from the Sources page.
