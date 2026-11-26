# How we used Kiro to build Buried

We built a lot check: type a Toronto address and see what the 1911-14 and 1931-35 fire-insurance plans lettered on that lot, with the scan it was read from. The product changed direction three times in two weeks (a raised 3D block, a walk-through test, then the lot check). The specs and steering made that affordable, because the evidence model and the honesty rules carried over each time.

## 1. Kiro IDE, CLI, Web, Crew

Every session ran through Kiro CLI 3.1.0, non-interactively, from one written brief. The briefs are in `docs/kiro-sessions/` (001 to 056), with `*-notes.md` files where a builder recorded findings. We installed the IDE (1.4.154) but did not use it, Kiro Web or Crew for the build, so we have no comparison between surfaces. The hackathon credit pool (4,000) was used up on Nov 25. Later sessions ran on plan credits.

A command outside an agent's allowlist is refused before it starts, so briefs name the command shapes that work. From session 023, parallel sessions ran in separate git worktrees, after one commit swept another builder's staged files in under the wrong message (`015-notes.md`).

## 2. Custom agents

Six agents in `.kiro/agents/`, each with narrow permissions:

| Agent | May | May not |
|---|---|---|
| architect | Write steering, specs, hooks, `docs/` | Run commands, write code |
| builder | Write files; run `uv`, `npm`, `npx`, `tools/unity.sh`, `git add/commit` | `git push/reset/checkout/clean`, `rm -rf`, `curl` |
| coder, mechanic | Write files; mechanic edits `*.md` only | Run commands |
| archivist, plate-qa | Read through the MCP server; write notes | Write `data/` or `.kiro/`; publish |

A unit test cannot judge a page's look. From the first visit onward, builders compared their screenshots with target pictures in `docs/brand/` and ended each notes file with what still looked wrong: "the 1939 photograph is very soft at close range" (session 055). The archivist has not been run.

## 3. Agent hooks

Seven files in `.kiro/hooks/`, explained in its `README.md`. They validate evidence on save, check source rights, run the banned-word tests, regenerate the bridge types, and untick a spec task whose suites fail. One refuses an agent write that puts plate 232 (1935, the held-out plate) in an extraction parameter file, a fixture or `data/control/map_area/`. We tested its script by hand: exit 2 with a refusal for a write naming plate 232, exit 0 otherwise. No agent has tripped it in a real session, so we cannot say it changed anything.

Kiro refused the architect's writes under `.kiro/hooks/` (session 012) and the builder's write to `.kiro/settings/mcp.json` (session 025), though the permission rules allowed both. We moved the files in by hand.

## 4. Spec-driven development

Eight specs: evidence model, pipeline, Explorer, Studio, Report, first visit, walk test, lot check. Each has numbered EARS requirements, a design with Correctness Properties, and tasks that name files and requirements. Property tasks are marked [PBT]. A task is ticked only when its tests pass.

Spec 08 has 12 requirements, 13 properties and 23 tasks. Its task order is the point: tasks 1 to 4 are pure modules with their properties (the Industrial word list, the verdict, the landing fact, the compare model), and the pages come after. Session 051 built tasks 1 to 11 in one run, and 1,172 unit tests passed.

The spec was wrong once in a way the builder caught. It said `buildLotCheck` takes the Report and the address points. The Report holds sentences, not geometry or crops, so the builder added the lot geometry, tile sidecars and source index and listed the departure in its notes. We did not build both ways, so we cannot say whether specs beat vibe coding. They gave builders a stopping rule. Each brief since session 015 names the sections to read, because sessions that read every spec wasted credits.

## 5. Steering docs

Six files in `.kiro/steering/`: `product`, `tech`, `structure` and `sources` (always loaded), `evidence` (for `data/**`, `pipeline/**`) and `design` (for `web/**`, `unity/**`).

- **Seventeen numbered honesty rules** in `product.md`: banned words, "on this lot" versus "near", no invented years, a find's name is the plate's lettering, "industrial" is decided by code from one list, the dig is presentation. The file says each is enforced in code and tests.
- **"The spec that needs a decision makes it."** `tech.md` lists what is decided. The rest stays open.

Steering changed before code each time. Session 053 wrote the night theme, its motion rules and a new colour token with its contrast pair into `design.md` first. Session 055 wrote five rules for photographs and imagined views into `product.md` first: an imagined view says "Not a photograph" every time it is on screen, and no finding is ever taken from a picture.

## 6. MCP

`buried-evidence` is a local, read-only stdio server over the committed files. Tools: `find_places`, `features_near`, `plate_features`, `list_sources`, `plate_alignment`, `plate_work`. Results are paged and under 20 KB. It never derives dates or "on this lot", because the date logic has one implementation, in TypeScript. plate-qa's first real run failed: `features_near` returned 163 features as 199 KB with no paging (session 030). We added paging.

## 7. Property-based testing

- **Alignment at UTM scale** (session 008). Hypothesis broke "leave-one-out error is never optimistic" at northings near 4.8e6 m, where residuals resolve only to about 1e-9 m. We fit relative to a local origin and scaled the tolerance. The claim was not weakened.
- **A generator that was wrong** (session 038). "Published areas never reach outside the map area" failed on a 2 px area. `publish` was right to refuse it: the test's helper attached a lettering crop that reached x = 601 on a 600 px plate. We fixed the generator and kept the counterexample as an `@example`.
- **The lot check.** P4: the landing's count equals an independent count of address points inside the areas, each shrunk by its own error. P1: a "Past industrial use recorded" tag always has a trigger whose lettering holds a list word. P3: no generated sentence holds a banned word. P6: "No industrial use lettered" always carries its not-a-clearance line.

## 8. Kiro powers

We used none.

## Where Kiro surprised us

- **A contrast pair.** In the first-visit redesign (session 037) the architect measured nine colour pairs, found lantern on parchment at 1.6 to 1 and copper on parchment at 3.0, and banned both in steering. The lot outline is a lantern stroke inside an ink casing because of it.
- **A count that held.** The landing says six addresses stand on a former coal and wood yard. The builder reran the count after shrinking each area by its own position error. It stayed six: 2A to 2D Percy St, 37 Sumach St and 549 King St E (session 051).
- **A tag it flagged.** "No industrial use lettered on these plans" would claim a little more than the review attests, because the reviewed areas cover buildings only. The builder said so, and on the committed data the tag appears for none of the 168 lots. The stricter test is one condition, left for us to decide.
- **A bug that was not a bug.** We read two vertical lines at the compare divider as a defect. The builder showed they were a focus ring on a 44 px element and reshaped the ring (session 052).

One bug came from the maintainer using the live site. Pressing Enter on a suggestion chose the address and skipped the dig in the same key press, because the Enter was still travelling up to `window` when the overlay added its key listener (session 054). The fix ignores a key within 600 ms of the overlay mounting, with browser tests. The notes say the builder did not run them against the old code to see them fail.

## Changing direction

1. **First visit (spec 06, sessions 037 to 046).** A raised 3D block. Ten sessions, three parallel worktrees, a Unity Player of about 81 MB.
2. **Walk test (spec 07, session 049).** A street-level walk through a Blender model. We parked it on Nov 25.
3. **Lot check (spec 08, sessions 050 to 055).** One address, one answer, no WebGL. Six sessions from the decision to the live site.

Carried over: the evidence model and date logic, the honesty rules and their tests, the sheet transform that places a plan under today's outlines, and `buildReport`. The 3D block and the Studio stay in the repository. Nothing links to the block and the Player is not deployed. We have no credit figure per product, only the session counts.

The strategy: steering first, then one short spec whose task order puts pure modules and their properties before pages, then a builder that compares its own screenshots with target pictures and records every departure from the brief.

## What we would do differently

- Run real data through each pipeline stage before specifying the next.
- Keep `tech.md` smaller. It loads every session and its command list grew with each one.
- Name a visitor's first action before writing a spec. We built the pipeline and the Report first and found the lot check on the third product.
- Have a named person review the records before the demo. None of the 178 features is reviewed.
- Run a new regression test against the old code to see it fail, and use the live site by hand after each deploy from the start.
- Use worktrees from the first parallel session.
