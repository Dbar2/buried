# Kiro session 034: wording for areas, the Lantern and Show Evidence on the place page, areas in the scene

Agent: builder (claude-sonnet-5.5). Checkout: the main working copy (all lanes are merged; no
other builder is running). Lane: `web/`, `unity/`, `data/schema/bridge*`, the spec `tasks.md`
files for ticks, `.kiro/steering/tech.md` for commands. Commit with `git commit -m ... -- <paths>`.
Never commit `Bootstrap.unity` for id-only changes.

Read only: this brief; `.kiro/steering/product.md` decisions 4 and 5 and the honesty rules;
`web/src/evidence/plainWords.ts`, `sentences.ts` and the date-wording code they use;
`web/src/place/`, `web/src/explorer/useLantern.ts`, `showEvidence.ts`; the bridge schema;
`docs/kiro-sessions/028-notes.md` and `023-notes.md`.

## 1. Wording

- A land-use area's row reads "Built by 1914. Last seen 1911". Areas are not built. Give areas
  their own wording from the same windows: "Lettered on the 1911 plan" (and "Still lettered on the
  1931-35 plan" when a later observation exists; "Not lettered on the 1931-35 plan" only for a
  clear absence). Do this in the Evidence Library with property tests alongside the building
  wording, not in a component.
- The area card says "traced by a person from fip_v3_1911_229". No ids in sentences: "traced
  from the 1911 plan"; and who traced it comes only from the record's "Confirmed by" line.
- Sweep the place page, card, list and Report for any other source id, plate number or raw
  timestamp inside a sentence, on the committed data plus a workspace with one area. Add a test
  that renders them and fails on an id pattern outside the sources block, `title` text and mono
  footnotes.

## 2. The Lantern and Show Evidence where people will find them

- Place page at Today: the Lantern control sits by the gauge with its label ("Lantern: 1931-35
  plan"), works with Space, L, long-press and the button, and has one line of help the first time.
- Evidence card: a "Show the scan under this building" toggle that sends `scene/showEvidence`
  (and its off), next to "View original scan". Both reset when the card closes.
- Leaving a place page sends `scene/clearLot`.

## 3. Land-use areas in the scene

Send areas to the Player with the era's features and draw them on the ground: a hatched `ink`
fill at low opacity with a thin outline, no height, under ghosts, clickable (opens the area's
card). Bridge change as needed (version bump, schema, fixtures, both parsers, generated files).
Pattern must be visible in a greyscale screenshot. Keep 60 fps.

## 4. Housekeeping

Record `npm run test:e2e:landuse` and the isolated Playwright config in `tech.md`; tick spec 04
task 19.1 and spec 03 task 17.3 if their tests pass.

## Checks

Unit, typecheck, `tools/unity.sh test`, a Unity build, then the browser suites one at a time
(the machine is quiet now): the main suite, the Studio suite, the land-use suite. Screenshots
`place-lantern.png`, `place-evidence-toggle.png`, `scene-area.png`.

Never weaken a test. Commit per item. Do not push. Short final report.
