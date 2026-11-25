# Session 050: the lot check, steering and spec (architect)

Agent: `architect`. Steering and one short spec. No code, no commands.

## Why

Nine days to the deadline. The maintainer looked at where the project stands and said plainly it
is not good enough: three half-finished experiences (the place page, the raised block, the walk
test) and no single thing a stranger can use. The judges have now said what they want:

- "Simple, focused solutions that tackle a real problem. A clean interface and an intuitive user
  experience."
- "Show me how you used specs, steering and hooks to get there, not just the final result."
- "A strong demo video that articulates the problem, and a functioning solution that solves the
  problem."

The decision (made by the maintainer on Nov 25; write it down, do not reopen it): **finish one
product, the lot check.** Type an address, and find out what the old fire-insurance plans recorded
on that land, with the proof. It is the idea the project started from, and the report already
computes the answer; it is just buried under walls of text and a 3D scene that some browsers
cannot run.

The stake is in our own data. A coal and wood yard is lettered behind Percy Street on both the
1911 plan (J. W. Corson & Co.) and the 1931-35 plan (Northern Fuels Co.). Six present-day
addresses stand on it: 2A, 2B, 2C and 2D Percy St, 549 King St E, 37 Sumach St.

## The product, in one screen each

Target pictures (generated, direction only): `docs/brand/concept-l-lotcheck-landing.jpg`,
`concept-m-lotcheck-result.jpg`, `concept-n-lotcheck-phone.jpg`. Look at them if you can read
images; they are close to what should be built, because this is page layout over real scans.

**Landing (`/`).** Parchment page, slim soot header ("Buried"; links "How it works", "Sources").
Kicker "A LOT CHECK FROM OLD FIRE-INSURANCE PLANS". Headline "What was on this land?". One
sentence: "Before you buy, dig or plant, see what the old plans recorded on your lot." One address
field and one lantern button, "Check this address". "Try:" and three example addresses that each
lead to a lot with a recorded use. One fact, computed from the data, not typed in: "On this block,
six addresses stand on a former coal and wood yard." Beside it, the plan itself with that yard
outlined. A coverage line: "Covered so far: one block of Toronto. Plans of 1911-14 and 1931-35."

**Result (`/lot/<lot id>`; `/place?lot=` keeps working and shows the same page).**

1. The address as the title, a plain tag, and one sentence. The tag is one of: "Past industrial
   use recorded", "Industrial use recorded next to this lot", "No industrial use lettered on these
   plans", "Not covered yet". The sentence quotes the plan: "The 1911 and 1931-35 plans letter
   this lot “Coal & Wood Yard”."
2. A compare view: one map with a draggable divider. Old plan on the left (the untouched scan,
   the lot outlined in lantern), today on the right (the City's building outlines and lot lines as
   thin ink lines, the same lot outline). A switch between the two plans. Keyboard and touch work.
3. "What the plans show": one row per plan and one for today, each with the lettering crop and a
   line ("1911: Coal & Wood Yard, J. W. Corson & Co.").
4. "What this does not tell you": it does not say what is in the soil today; Buried screens, it
   does not certify; where to go next (Ontario One Call before digging).
5. One primary action, "Download the one-page record" (the existing print report), and "Share
   this check".
6. A provenance strip: plan scanned by whom, placed within about X m, outline traced, review
   status. Every figure comes from the record.

**How it works (`/how`).** Four short steps with one picture each, then "Built with Kiro" in a few
plain lines (agents propose, a person confirms, hooks stop bad writes). Short.

It needs no WebGL. The first load does not fetch the Unity Player.

## What leaves the visitor's path

- The raised block moves to `/block` and is linked once, from the result page, as "See this block
  in 3D". It is not the front door. If it cannot ship in a small download, the link goes.
- The walk test stays out: not linked, not built into the site. Spec 07 gets a one-line note
  saying it is parked.
- The Studio is not linked from any public page except Sources.
- The long report page stays as the printable record only.

## Rules for the verdict (honesty)

- "Industrial" is decided by code from the plan's lettering, using one reviewed word list in the
  Evidence Library (coal, wood yard, lumber, factory, machine shop, foundry, cork, mill, works,
  oil, gas, garage, auto, laundry, dye, paint, tannery, storage of fuel, and the like). The tag
  always appears with the lettering that triggered it. No word outside the list triggers it.
- "On this lot" and "next to this lot (within X m)" follow the existing lot relation rules.
- "No industrial use lettered on these plans" is not a clearance and says so beside it; the
  existing absence and coverage rules hold.
- No banned words. Names are the plan's lettering, quoted. Status lines are the record's own.

## Read first, and only these

- `.kiro/steering/product.md` and `.kiro/steering/design.md`, whole.
- `.kiro/specs/05-report/requirements.md`: headings only, to cite what the lot check reuses.
- `web/src/report/buildReport.ts` (the `Report` type and what `buildReport` returns),
  `web/src/report/findings.ts` (the land-use findings), `web/src/block/FlatSheet.tsx` and
  `sheetTransform.ts` (the 2D sheet that exists), `web/src/App.tsx`, `web/src/place/placeLink.ts`.

## Write

1. **`.kiro/steering/product.md`**: replace "The first visit and the find" with "The lot check"
   (the screens above, who it is for: someone about to buy, dig or plant; and where the block, the
   walk, the Studio and the Report now sit). Update "Scope at submission". Keep every honesty rule
   and add the verdict rules above. Under 180 lines.
2. **`.kiro/steering/design.md`**: the page is now light. Parchment background, ink text, soot
   only for the slim header and the 3D pages, copper for secondary marks, lantern for the one
   primary button, the lot outline and focus. Rewrite Identity, the token table's "used for"
   column, the contrast pairs (give the pairs that must pass AA on parchment), Controls, and
   replace "The raised scene and the card" with "The lot check pages". Keep Type, Confidence
   encoding, Accessibility. Say what it must not look like: a dashboard, a card grid, a poster.
   Under 210 lines.
3. **`.kiro/specs/08-lot-check/`** (`requirements.md`, `design.md`, `tasks.md`), 230 lines in
   total at most. EARS requirements for the three pages, the verdict, the compare view, the
   computed fact on the landing, the examples (chosen by code: lots with a recorded use), phone
   layout, keyboard use, and load weight. Design: the view model (one pure function from the
   existing `Report` plus the address points to what the page prints), the word list and its
   tests, the compare view on the existing sheet transform, routes. Properties, marked `[PBT]`:
   the tag never appears without its triggering lettering; no page text contains a banned word;
   the landing's count equals the number of address points inside areas lettered with that use;
   the divider position never changes which lot is outlined. Tasks for one builder session, in
   build order, each naming its files, with the ones the demo video needs marked.
4. **`.kiro/specs/07-walk-test/tasks.md`**: one line at the top, "Parked on Nov 25: not linked,
   not shipped."

## Report

Files and line counts, and any decision this brief left to you.
