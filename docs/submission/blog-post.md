# Blog post draft (Bonus Blog Prize)

For a third-party platform such as dev.to, Medium or Hashnode. It has to be public, published during the submission period, about Kiro and the project, and say it was written for the hackathon. Facts are from `kiro-writeup.md`. Edit the voice to your own before publishing.

---

**Title:** Three products in two weeks: what Kiro's steering and specs let me throw away

*I wrote this as part of the Kiroween 2026 hackathon.*

My entry is [Buried](https://buried.pages.dev). You type an address, a lantern goes down through century-old fire-insurance plans, and the page shows what stood on that land, with the scan that proves it. On the one block of Toronto it covers, six present-day addresses stand on a former coal and wood yard.

That is the third product I built for this hackathon. The first was a raised 3D block of old buildings. The second was a street-level walk through a modelled corner. Both looked like something, and neither gave a visitor a reason to care. Each time I dropped the product and kept going. This post is about why that was affordable.

## Steering held the rules, so the product could change

Before any code, I wrote the project's honesty rules into a Kiro steering file. There are seventeen of them. Never use words like "contaminated". Say "on this lot" only when the geometry supports it, otherwise "near". Never name a business the plan does not letter. Never invent an exact year.

Every Kiro session loads that file. So when the product changed from a 3D block to an address search, I did not have to explain the rules again. The new spec could say "follow rule 12" and the builder already knew it. The rules also have tests, so a sentence with a banned word fails the build no matter which product generated it.

## One short spec, with properties before pages

The lot check has one spec: 12 requirements, 13 correctness properties, 23 tasks. The task order matters more than the length. The first four tasks are pure modules with their property-based tests: the word list that decides "industrial", the verdict, the count on the landing page, the compare model. The pages come after.

One property says a "Past industrial use recorded" stamp always has a trigger whose lettering holds a word from the list. Another says the landing page's count equals an independent count done a different way. With those in place, a builder session built eleven tasks in one run and I could trust the result, because the things that must never be wrong were already pinned down.

## Hooks and narrow agents

Seven hooks guard the rules. They validate evidence files on save, check source rights and untick a spec task whose tests fail. One refuses any agent write that puts my held-out test plate into a tuning file, so I cannot quietly overfit to it.

Six custom agents each have a narrow job. The architect writes specs and steering and cannot run commands. The builder writes code and can run only an allowlist. Two reader agents can question the evidence through my own MCP server and can never write it.

## Where Kiro surprised me

- I asked for a lantern-yellow outline on parchment. The architect measured the pair at 1.6 to 1 contrast and banned it in steering. The outline now sits inside a dark casing.
- The builder flagged that one of my verdict labels, "No industrial use lettered on these plans", would claim slightly more than my reviewed data supports. On the real data that label now appears for none of the 168 lots.
- I reported two stray lines at the compare divider as a bug. The builder showed they were the focus ring on a wide element and reshaped the ring.

## What I would do differently

Name the visitor's first action before writing a spec. I built a pipeline and a report first, and found the product people can actually use on the third try. And I would have a named person review the records earlier: every record on the site still says "draft, not yet reviewed", because that is true.

Try it at [buried.pages.dev](https://buried.pages.dev). The code, the specs, the steering and all 56 session briefs are at [github.com/Dbar2/buried](https://github.com/Dbar2/buried).
