# Devpost submission text

Copy for each field of the Kiroween 2026 submission form, in the form's order. Facts are from `README.md` and `kiro-writeup.md` as of Nov 25. Fields that only the submitter can answer are marked "yours".

## Project overview

**Project name**

Buried

**Elevator pitch** (200 characters max)

Type an address and dig down through century-old fire-insurance plans to see what stood on that land, with the scan that proves it. Forgotten maps, rebuilt with proof.

**Thumbnail:** `docs/submission/media/devpost-thumbnail.jpg`

## Project details

**About the project**

```markdown
## Inspiration

People buy houses, dig gardens and plant on old city lots without knowing what stood there before. Often somebody wrote it down. Fire-insurance plans from the early 1900s lettered every coal yard, machine shop and factory, lot by lot. The scans are public, but nobody opens a 1911 atlas sheet before buying a house. The plans are a dead technology with a live use.

## What it does

Buried is a lot check. Type a Toronto address, or click a lit lot, and a lantern is lowered through the plans, year by year. Then the record opens:

- **What stood there**, in the plan's own lettering: "Here stood: Coal & Wood Yard, recorded on the plans of 1911 and 1931-35."
- **A verdict stamp** decided by code from one short word list, never shown without the lettering that triggered it and the crop of the scan it was read from.
- **A compare view**: drag a divider between the 1911 plan, the 1931-35 plan or the City's 1939 aerial photograph and a 2025 aerial photograph of what stands there now.
- **An imagined view** of how the lot may have looked, made with an image model from the plan. It is never the default, never evidence, and always captioned "Not a photograph".
- **A one-page record** to print or share.

On the block we cover, six present-day addresses stand on a former coal and wood yard.

Buried screens; it doesn't certify. It says nothing about soil today. Every record says "draft, not yet reviewed" until a named person reviews it, and where the plans don't reach the page says "Not dug yet" instead of guessing.

## How we built it

Every build session ran through Kiro CLI from a written brief (56 sessions, all in the repository).

- **Steering first.** Seventeen numbered honesty rules live in `.kiro/steering/product.md`: banned words, "on this lot" versus "near", names are the plan's lettering. Every session reads them and tests enforce them.
- **One short spec per product.** Spec 08, the lot check, has 12 requirements, 13 correctness properties and 23 tasks. Pure modules and their properties come before any page.
- **Property-based tests** with fast-check and Hypothesis. One example: a "Past industrial use recorded" stamp always has a trigger whose lettering holds a word from the list.
- **Seven hooks** validate evidence on save, check source rights, run the banned-word tests and untick a task whose tests fail. One refuses any agent write that puts our held-out test plate into a tuning file.
- **Six custom agents** with narrow permissions: an architect that writes specs and runs nothing, a builder that writes code and runs an allowlist, readers that can question the evidence but never write it.
- **Our own MCP server**, `buried-evidence`, so agents can query the committed evidence.

The site is React and TypeScript on Cloudflare Pages. A Python pipeline aligns the plan scans to today's map and publishes the evidence files. The lot check needs no WebGL and works on a phone.

## Challenges we ran into

We changed direction three times in two weeks: a raised 3D block, a street-level walk, then the lot check. The first two looked impressive and gave a visitor no reason to care. What made the changes affordable was that the evidence model, the honesty rules and their tests carried over each time.

Old plans do not line up with today's map on their own. Each plate is aligned from control points, and every outline carries its own position error, which decides whether the page may say "on this lot" or only "next to".

## Accomplishments that we're proud of

- A page that shows its proof: the stamp, the lettering and the scan sit together.
- 1,258 unit and property tests and 52 browser tests pass on the deployed build.
- Kiro caught things we missed. It measured a colour pairing we asked for at 1.6 to 1 contrast and banned it. It flagged a label that would have claimed more than our data supports.

## What we learned

Name the visitor's first action before writing a spec. Write the rules down once, in steering, and let every session inherit them. A spec whose task order puts properties before pages gives an agent a stopping rule.

## What's next

A named person reviewing the records so they stop saying "draft". More blocks of Toronto, then other cities: most old North American cities have plans like these.
```

**Built with** (tags)

kiro, typescript, react, vite, python, cloudflare-pages, fast-check, hypothesis, vitest, playwright, opencv, rasterio, shapely, mcp

**"Try it out" links**

- https://buried.pages.dev
- https://github.com/Dbar2/buried

**Image gallery:** `docs/progress/lot-check-landing.png`, `lot-check-dig.png`, `lot-check-result.png`

**Demo video URL:** the YouTube link, once the video is uploaded.

## YouTube

**Title**

Buried: what is buried under your address? (Kiroween 2026)

**Description**

```
Type an address and dig down through century-old fire-insurance plans to see what stood on that land, with the scan that proves it.

Try it: https://buried.pages.dev
Code: https://github.com/Dbar2/buried

Buried is a lot check for one block of Toronto, built with Kiro for Kiroween 2026. It screens; it doesn't certify.

0:00 What was there first?
0:13 Type an address
0:22 The dig
0:30 The record and its proof
0:43 Then and now: plans, aerial photographs, an imagined view
1:02 Honest by design
1:16 Built with Kiro: steering, specs, property tests, hooks, agents, MCP
2:08 Every old city has plans like these

Plans: University of Toronto Map & Data Library; Library and Archives Canada. Aerial photographs: City of Toronto, Open Government Licence - Toronto. Imagined views are made with an image model and labelled on screen. Narration and music generated with ElevenLabs.
```

Settings: visibility Public, "No, it's not made for kids", category Science & Technology. Thumbnail: `docs/submission/media/youtube-thumbnail.jpg`.

## Additional info

**Sponsor / Special Prizes:** yours. See "Bonus prizes" below.

**Submitter country of residence, age of majority, eligible jurisdiction:** yours.

**Category**

Resurrection (recommended). The dead technology is the fire-insurance atlas, brought back as something you can ask a question of. Costume Contest is the alternative if the night dig is the stronger claim.

**Public GitHub repo URL**

https://github.com/Dbar2/buried

**Working demo URL**

https://buried.pages.dev

**Testing instructions**

```
No login needed. Works in any current browser, on a phone too, without WebGL.
1. Open https://buried.pages.dev, type "2a p" and choose "2A Percy St".
2. Let the dig play (about 4.5 seconds; Skip or Escape ends it).
3. On the record, drag the divider and switch the layers under it: 1911 plan, 1931-35 plan, 1939 photo, Imagined, Today photo, Today outlines.
4. Scroll down for the provenance strip and the "As it may have looked" postcard. "Download the one-page record" opens the printable page.
Coverage is one block of Toronto. An address outside it shows "Not dug yet".
```

**How the project meets the main technology requirement**

```
Buried was built with Kiro CLI 3.1.0. Every build session ran non-interactively from a written brief; all 56 briefs are in docs/kiro-sessions/.

- Custom agents (.kiro/agents/, six): architect writes steering, specs and hooks and runs no commands; builder writes code and runs an allowlist of commands; coder and mechanic write files only; archivist and plate-qa read evidence through MCP and never write it.
- Hooks (.kiro/hooks/, seven): validate evidence on save, check source rights, run the banned-word tests, regenerate bridge types, untick a spec task whose tests fail, and refuse any agent write that puts the held-out plate into a tuning file.
- Specs (.kiro/specs/, eight): EARS requirements, a design with correctness properties, and tasks that name files and requirements. Spec 08 (the lot check) has 12 requirements, 13 properties and 23 tasks.
- Steering (.kiro/steering/, six files): seventeen numbered honesty rules, the tech decisions, the source rights table, the evidence rules and the design tokens with measured contrast pairs.
- MCP: our own local, read-only server, buried-evidence, with six tools over the committed evidence files.
- Property-based testing: fast-check in the web package and Hypothesis in the pipeline, for the properties marked [PBT] in the specs.
- Kiro powers: none used. Kiro IDE, Web and Crew: not used for the build.

The full write-up is docs/submission/kiro-writeup.md in the repository.
```

**Pre-existing code or work**

```
No pre-existing code. The project was started during the submission period.
Outside material, all listed with its rights on the site's Sources page: fire-insurance plan scans (University of Toronto Map & Data Library; Library and Archives Canada), City of Toronto open data (address points, property boundaries, building outlines, 2025 and 1939 aerial photographs; Open Government Licence - Toronto), open-source libraries and fonts.
Illustrations and the "imagined" views were generated with an image model during the hackathon and are labelled as such. The demo video's narration and music were generated with ElevenLabs.
```

**Bonus prizes**

- Best Demo: automatic.
- Social Blitz: needs a public post that starts with the hashtag. Draft below.
- Bonus Blog: needs a public post on a third-party platform. Draft in `blog-post.md`.
- Ghost of Kiroween Past: only if you registered for Kiroween 2025. Yours.
- Startup, Student, Kiro Crew: not entered.

**Social post draft**

```
#KiroweenHackathon26 My favourite thing about Kiro: steering. I wrote the honesty rules for my project once ("never name a use the old plan doesn't letter") and every session inherited them, with tests to hold them. That let me change direction three times in two weeks without starting over.

Buried: type an address, dig down through century-old fire-insurance plans, see what stood on that land, with the scan that proves it.
https://buried.pages.dev
```

**Registered for Kiroween 2025, submitter type, AWS employee, the two survey questions:** yours. Submitter type is Individual unless a teammate is added.
