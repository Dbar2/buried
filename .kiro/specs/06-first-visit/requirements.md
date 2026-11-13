# Requirements: 06 First visit

The first visit is rebuilt around a **find** (an entry in `data/finds.json`: one thing the plans
letter on the block, with its **readings**: per source, the name as lettered, the evidence feature
id and the lettering crop). Decided in session 037; brand and layout in
`.kiro/steering/design.md`, the journey in `.kiro/steering/product.md`. It supersedes parts of
spec 03 (listed at the top of its requirements). **Block page**: `/` and `/find/<slug>`. **Card**:
the catalogue card. **Anchor**: a find's screen position, reported by the Player. **Still**: the
committed picture of the opening scene. **Flat sheet**: the no-WebGL view drawn by the Shell.

## Requirement 1: Land

1.1 WHEN `/` is opened, THE Shell SHALL show the Still, the headline "Something used to stand
here.", one primary button "Raise the past" and the line "Every ghost comes with the map that
proves it."
1.2 THE Block page SHALL show one paper tag per find that resolves (R8), with its `tag` text,
pinned by a string to its anchor.
1.3 THE header SHALL hold only the wordmark (a link to `/`) and "Sources". THE Block page SHALL
NOT show a search field; a margin caption SHALL name the block and link "Look up an address" to
`/place`.
1.4 THE Block page SHALL NOT show "Buried screens; it doesn't certify." before a card is open.

## Requirement 2: Load behaviour

2.1 THE Still and the button SHALL NOT depend on the Unity loader. The button SHALL be usable
within 2 s of first paint on the `firstload.spec.ts` machine without throttling.
2.2 WHEN the button is pressed before the Player is ready, THE button SHALL read "Lighting the
lamp", announced politely, and THE raise SHALL play when the Player is ready.
2.3 WHEN the Player draws its first frame, THE Shell SHALL fade the Still out over 300 ms.
2.4 IF the Player fails, or is not ready 20 s after first paint, THEN THE Shell SHALL show the
Flat sheet with one line saying the 3D view did not start, and SHALL play a pending raise there.

## Requirement 3: Raise

3.1 WHEN "Raise the past" is pressed, THE Shell SHALL send one raise message; THE Player SHALL
sink today's buildings flat, leaving a thin `--block` outline at about 35 per cent (session 043),
brighten the sheet and raise the 1911 plan's published features
as ghosts, staggered nearest the first find first, settled within 2.2 s. The camera SHALL NOT move.
3.2 WHEN the raise ends, THE Player SHALL report it, and THE Shell SHALL select the find with the
lowest `order` and set the era ruler to 1911.

## Requirement 4: The card

4.1 WHEN a find is selected, THE Player SHALL draw its edges in `--lantern`, and THE Shell SHALL
open the card and draw a leader line from the anchor to it.
4.2 THE card for a find SHALL show, in order: "LETTERED ON THE <PLAN> PLAN"; every lettered line,
quoted as lettered; the untouched lettering crop; "Seen on: <plan>, sheet <N>"; "Positioned within
about X m" (the existing wording function, as built in sessions 041 and 042); "Status: ..." (R9); "Show the original sheet"; "Share this find"; "Full record".
4.3 IF a lettered line contains a banned word, THEN THE card SHALL NOT quote it and SHALL say
"Lettering shown in the crop".
4.4 "Show the original sheet" SHALL turn on Show Evidence for the feature and offer the untouched
tile. "Full record" SHALL open `/report` for the feature's lot by the existing lot relation.
4.5 WHEN a ghost that is no find's feature is selected, THE same card SHALL open with "DRAWN ON THE
<PLAN> PLAN", the provenance crop, and the title the record supports: "<N>-storey building" in
words for 1 to 6 when storeys are read, else "Building on the <plan> plan" ("Area on the <plan>
plan" for a land-use area). It SHALL NOT offer "Share this find".

## Requirement 5: Look around

5.1 AFTER the raise, find tags SHALL sit in a row along the top; pressing one, or clicking any
ghost, SHALL select it. A small "List" control SHALL open the accessible list (spec 03 req 17).
5.2 THE era ruler SHALL have three stops: Today, 1935, 1911. 1947 SHALL NOT appear on it.
5.3 WHEN the ruler moves while a find is selected, THE card SHALL add one line: "On the <plan>
this <noun> is lettered “<name>”." when the find has a reading there; "No lettering recorded here
from <plan>." when the source is loaded without a reading; "No record loaded for this date." when
no source for the era is loaded.
5.4 IF the selected find's anchor is off screen, THEN THE leader line SHALL be hidden and THE card
SHALL offer "Show on the map", which frames the find.

## Requirement 6: The Lantern

6.1 THE Lantern SHALL be a round lens showing the other layer inside it (Today at a plan, the 1911
plan at Today). A pointer or one-finger drag that starts inside it SHALL move it; one that starts
outside SHALL move the camera.
6.2 A visible "Lantern" control SHALL toggle it; Space, `L` and the arrows SHALL keep working.

## Requirement 7: Keep it, and routes

7.1 "Share this find" SHALL copy `<origin>/find/<slug>` and announce "Link copied."; IF the
clipboard is refused, THEN it SHALL show the link selected in a field.
7.2 `/find/<slug>` SHALL open raised, without the animation, on that find; the page title and
description SHALL name the find as lettered and its plan. An unknown slug SHALL open `/` with
"No find by that name."
7.3 `/place?lot=`, `/place` (address search), `/report`, `/sources`, `/studio` and `/explorer`
SHALL keep working, and `/` with an Explorer query (`era`, `lot`, `debug`, `lanternEra`,
`showEvidence`, `markers`) SHALL open the Explorer as before.

## Requirement 8: The finds file

8.1 Each find SHALL have `id`, `slug`, `kind` (`building` or `area`), `order`, `tag`, `noun` and
one or more readings with `source`, `lettered` (lines as lettered), `feature_id`, `crop_px`,
`read_by` and `read_on`.
8.2 `buried validate` SHALL reject the file IF a `feature_id` is not a published feature of its
registered `source`, IF a crop is not inside the source's map area, IF a find has no reading with
a crop, or IF an `id`, `slug` or `order` repeats.

## Requirement 9: Review state (honesty fix)

9.1 THE evidence schema SHALL be 1.2.0; every feature's provenance SHALL carry `review.state`
`reviewed`, `draft_rule` or `draft_hand`; `reviewed` SHALL require `by` and `on`, drafts SHALL
forbid them.
9.2 THE card, the place page and the Report SHALL print "Status: reviewed by <by>, <on>" or
"Status: draft, not yet reviewed", and SHALL NOT print "Confirmed" for a draft.
9.3 THE existing files SHALL be migrated: the bank `draft_hand`, the 162 rule-drawn features
`draft_rule`, none `reviewed`. `buried publish` SHALL write `reviewed` with the decision's
reviewer and date.

## Requirement 10: Core sample attribution (honesty fix)

10.1 A core-sample row for plan X SHALL say what plan X shows. A feature whose origin is plan Y
SHALL appear in it only as "First drawn on the <Y> plan; drawn again on the <X> plan.", and only
when plan X has a clear presence for it.

## Requirement 11: Phone, reduced motion, no WebGL, demotions

11.1 UNDER 720 px wide, THE scene SHALL fill the top, the tags SHALL scroll in one row, the ruler
SHALL sit on the scene's lower edge, and THE card SHALL be a bottom sheet that peeks at kicker,
name and status. No leader line. Touch targets SHALL be at least 44 by 44 px.
11.2 WITH `prefers-reduced-motion`, the raise, era changes, the Still fade and "Show on the map"
SHALL cut to their end state.
11.3 WITHOUT WebGL, THE Block page SHALL show the Flat sheet: the plate tile with published
footprints in the confidence line styles, and the same tags, card, ruler, lens and share link.
Raise SHALL draw the outlines on (at once under reduced motion).
11.4 No header SHALL link the Studio; THE Sources page SHALL link `/studio` as "The workshop (runs
on a maintainer's machine)". "List the features" SHALL NOT be a primary control.

## Requirement 12: Tests

12.1 THE properties marked [PBT] in design.md SHALL pass. Browser tests SHALL cover R1 to R3,
R5.3, R7.2 and R11, with screenshots in `web/e2e/output/`.
