# Session 056: README, write-up and demo script for the lot check (architect)

Agent: `architect`. Markdown only: `README.md` (write the full text to
`docs/submission/readme-draft.md`; the maintainer moves it into place, as in session 047),
`docs/submission/kiro-writeup.md`, `docs/submission/demo-script.md`. No code, no commands.

## Why

The product changed again and the three documents still describe "Raise the past". What is live
at `https://buried.pages.dev` since Nov 25 is the **lot check**: type an address, a lantern is
lowered through the earth (the dig), and the record shows what the old fire-insurance plans
letter on that lot, against a real aerial photograph of today. The judges have said what they
look for:

- "Bring me something wickedly creative that actually works. Show me how you used specs, steering
  and hooks to get there, not just the final result. Bonus points if Kiro surprised you."
- "Simple, focused solutions that tackle a real problem. A clean interface and an intuitive user
  experience."
- "Technological implementation and presentation ... breadth of knowledge across the Kiro
  surfaces and capabilities ... a strong demo video that articulates the problem, and a
  functioning solution that solves the problem."

## Read first, and only these

- `docs/kiro-sessions/050-lot-check-steering-and-spec.md`, `051-notes.md`, `052-notes.md`,
  `053-the-night-dig.md`, `053-notes.md`, `054-notes.md`, `055-photos-and-imagined-views.md`,
  `055-notes.md`.
- `.kiro/steering/product.md` ("The lot check"), `.kiro/specs/08-lot-check/` (three files).
- `README.md`, `docs/submission/kiro-writeup.md`, `docs/submission/demo-script.md` as they stand.
- `.kiro/hooks/README.md`.

## Facts from the maintainer's own runs (Nov 25, on the deployed build)

- Vitest 1,258 pass; the lot-check browser config 52 pass (desktop, 390 px, reduced motion, no
  WebGL); pipeline pytest passes; `buried validate` OK on 18 files and 178 features.
- The live site was walked in a browser after each deploy: landing, suggestions, Enter and the
  Dig button, the dig, the result, the layer switches, Sources, How. No console errors, no
  request leaves the origin, no `/unity/` request.
- Evidence: 178 features; none is reviewed by a named person yet (every record says "draft, not
  yet reviewed"). The industrial word list also says "Reviewed by: not yet".
- Across the block's 168 lots (session 051's count): 11 "Past industrial use recorded", 83 next
  to one, 73 not covered, 1 other lettered use.
- "On this block, six addresses stand on a former coal and wood yard" is computed from the data.
- Aerial photographs: City of Toronto, 2025 and 1939, Open Government Licence - Toronto. The
  1939 photograph is shown as placed approximately, on the City's own caveat.
- Imagined views: made with an image model from the plans, marked IMAGINED in the picture and
  captioned "Not a photograph"; one top-down view that did not match its plan was dropped.
- The 3D block and the walk test are parked: not linked from the site. The Unity Player is not
  deployed. Say so plainly; do not present them as features.
- Kiro: eight specs, 56 logged sessions in `docs/kiro-sessions/`, six agents, seven hook files,
  the `buried-evidence` MCP server. All sessions ran through the CLI. The hackathon credit pool
  (4,000) was used up on Nov 25; later sessions ran on plan credits.
- Things Kiro did that were not asked for and turned out right (use the two or three that the
  notes support best, quoting the notes): the architect refusing lantern-on-parchment for the lot
  outline because the pair measures 1.6:1 and specifying a dark casing instead (session 050); the
  builder finding that the landing count held at six after shrinking each area by its own error;
  the builder noticing "No industrial use lettered" would claim more than the review attests and
  never printing it on the committed data (051); finding that the "two vertical lines" in a
  screenshot were a focus ring, not a bug in the divider (052).
- A bug the maintainer found by using the live site, not by tests: pressing Enter chose the
  address and skipped the dig in the same key press (fixed in 054 with tests that would have
  caught it).

## Write

### 1. `docs/submission/readme-draft.md` (the new README, whole)

- Opening: one sentence saying what it is and who it is for (someone about to buy, dig or plant
  on a lot). The live link. Three pictures: `docs/progress/lot-check-landing.png`,
  `docs/progress/lot-check-dig.png`, `docs/progress/lot-check-result.png`, each with real alt
  text.
- "Try it" in four lines: an address to type, what happens, what to switch, what to download.
- "What it tells you, and what it does not": the verdict rules, the coverage (one block, two
  plans), and that it screens and does not certify.
- "Where it stands": works today, draft, parked, not built. Honest and short.
- "Built with Kiro": specs, steering, hooks, agents, MCP, property-based tests, with one concrete
  example each, and where to look in the repo.
- Run it locally (web only is enough for the lot check; the pipeline and Unity commands stay but
  move lower).
- Sources and credits: the plans, the City's present-day layers and aerial photographs with the
  licence line, the illustrations and imagined views as image-model work, fonts. Licence.
- Under 230 lines.

### 2. `docs/submission/kiro-writeup.md`

Keep the plain voice and stay under 1,800 words. Restructure it around what the judges asked:

- Open with three sentences: what was built, and that the product changed direction three times
  and the specs and steering are what made that affordable.
- Keep the eight Kiro headings (IDE/CLI/Web/Crew; agents; hooks; specs; steering; MCP;
  property-based testing; powers), each with its best one or two concrete stories. Cut older
  detail to make room for spec 08.
- A new short section, "Where Kiro surprised us", from the facts above.
- A new short section, "Changing direction": first visit (spec 06), the walk test (spec 07,
  parked), the lot check (spec 08). What each cost and what carried over (the evidence model, the
  honesty rules and their tests, the sheet transform, the report). This is the AI development
  strategy: steering first, one short spec, pure modules with properties before pages, then a
  builder that compares its own screenshots with target pictures.
- Keep "What we would do differently", updated.
- Say plainly: every session ran through the CLI; the IDE, Web and Crew were not used for the
  build. Do not claim otherwise. Do not mention any assistant other than Kiro; use "we" and "the
  maintainer".

### 3. `docs/submission/demo-script.md`

Target 2:45, table form, recorded on the live site. Order:

- 0:00 to 0:15, the problem in one breath over the landing: you are about to buy or dig, and
  nobody tells you a coal yard stood there.
- 0:15 to 0:55: type "2a p", pick the suggestion, the dig plays, the record: "HERE STOOD / Coal &
  Wood Yard", the stamp. Say "draft, not yet reviewed" aloud if it is still true when recorded.
- 0:55 to 1:25: the slider, plan against today's photograph; switch to the 1939 photograph;
  switch to the imagined view and say what it is; the postcard.
- 1:25 to 1:40: "dig somewhere at random" to a second lot, and a lot with nothing lettered or not
  covered, to show it does not cry wolf.
- 1:40 to 1:50: the one-page record.
- 1:50 to 2:30: three Kiro proofs with readable artefacts on screen: spec 08's requirements and a
  `[PBT]` property; a hook file and what it guards; the honesty rules in steering and the test
  that enforces one. One sentence on "where Kiro surprised us".
- 2:30 to 2:45: phone view, the URL.
- "Before recording" checklist, and "(to confirm)" on anything you cannot verify from the files.

## Report

Word counts, and anything in the notes that contradicts the facts above.
