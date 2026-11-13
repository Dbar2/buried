# How we used Kiro to build Buried

## 1. Kiro IDE, CLI, Web, Crew

We installed Kiro IDE 1.4.154 and Kiro CLI 3.1.0 on Nov 10. Every session ran through the CLI, non-interactively, with one written task brief. The briefs are in `docs/kiro-sessions/` (001 to 047), with `*-notes.md` files where a builder recorded findings. We did not use the IDE, Kiro Web or Crew for the build, so we have no measured comparison between surfaces. At the last check we had used 3,089 of 4,000 credits.

A command outside an agent's allowlist is refused before it starts, so briefs name the command shapes that work. From session 023, parallel sessions ran in separate git worktrees. Before that, two builders shared one checkout, and one commit swept the other's staged files in under the wrong message (`015-notes.md`).

## 2. Custom agents

Six agents live in `.kiro/agents/`. None can write that folder, so we edit the files ourselves.

| Agent | Model | May | May not |
|---|---|---|---|
| architect | claude-sonnet-5.5 (001 to 012: claude-opus-5.5) | Write steering, specs, hooks, `docs/` | Run commands, write code |
| builder | claude-sonnet-5.5 | Write files; run `uv`, `npm`, `npx`, `tools/unity.sh`, `git add/commit` | `git push/reset/checkout/clean`, `rm -rf`, `curl`, `sudo` |
| coder | claude-sonnet-5.5 | Write files | Run any command |
| mechanic | claude-haiku-5.5 | Edit `*.md`, specs, `docs/` | Run commands, make design calls |
| archivist | claude-sonnet-5.5 | Read, fetch web pages, use MCP; write `docs/sources/` | Write `data/` or `.kiro/`; infer a licence |
| plate-qa | claude-sonnet-5.5 | Use MCP; write `docs/qa/` | Write `data/` or `.kiro/`; accept, reject or publish |

The archivist has not been run yet, so `docs/sources/` does not exist.

**architect.** In the first-visit redesign (session 037) it decided what the brief left open: Libre Baskerville and Source Sans 3 in place of Fraunces and Inter, a name and hex for every colour token with a rename table, and nine contrast pairs with floors. Two pairs fail (`--lantern` on `--parchment` at 1.6, `--copper` on `--parchment` at 3.0), so the steering bans them and says what to use instead. A test measures every pair.

**builder, Unity lane.** A unit test cannot judge a scene's look. The builders rendered stills, looked at them and iterated against numbered visual targets. Session 043 fixed six named problems in six render rounds.

**plate-qa.** Its first real run failed: `features_near` returned 163 features as 199 KB with no paging (session 030). We added paging and a compact mode.

## 3. Agent hooks

Seven files in `.kiro/hooks/`, explained in its `README.md`. They validate evidence on save, check source rights, run the banned-word tests, regenerate and test the bridge, and untick a spec task whose suites fail. One guards the held-out plate.

The held-out guard runs before an agent write and exits 2 when the write targets extraction parameters, extraction fixtures or `data/control/map_area/` and names plate 232 (1935). A pytest guard covers files written by shell commands. We tested the script by hand: exit 2 with its refusal message for a write naming plate 232, exit 0 for an ordinary write. No agent has tripped it in a real session.

Kiro refused the architect's writes under `.kiro/hooks/` (session 012) and the builder's write to `.kiro/settings/mcp.json` (session 025), though the permission rules allowed both. We moved those files in by hand.

## 4. Spec-driven development

Six specs: evidence model, pipeline, Explorer, Studio, Report, first visit. Each has numbered EARS requirements, a design with Correctness Properties, and tasks that name files and requirements. Property tasks are marked [PBT]. A task is ticked only when its tests pass.

**The sixth spec.** An outside review of the live site and the maintainer's own verdict agreed: the journey was unclear, a search field with no reason to type. Session 037 rewrote `product.md` and `design.md` first, then wrote one short spec, 345 lines across three files. Its tasks split into three groups that touch different files: W (web), U (Unity and the bridge schema) and P (pipeline and data contract). We built them at the same time in three worktrees. One order rule held them together: the bridge and finds types land before the web tasks that read them. The web lane did not wait. Session 041 built the pure modules (tag layout, raise state, sheet transform, lens drag) and props-only components first, and session 042 wired them once the types existed.

**Catches before code.** A plate "revised to" a later year cannot have one year, so sources carry `year_from` and `year_to`. Absence is readable only inside a reviewed area that a person attests.

**Misses.** Spec 02's matching rule shrank footprints by the plates' combined errors, which erased a typical 20 m² footprint, so the first real `buried match` sent every pair to review. The place page said "Checked by a person" for a record marked "gate draft, unreviewed" (session 027).

We did not build both ways, so we cannot say whether specs were faster than vibe coding. They gave builders a stopping rule and gave us one place to settle questions. Sessions that read all of them wasted credits, so each brief since session 015 names the sections to read.

## 5. Steering docs

Six files in `.kiro/steering/`: `product`, `tech`, `structure` and `sources` (always loaded), `evidence` (for `data/**`, `pipeline/**`) and `design` (for `web/**`, `unity/**`). Three choices mattered:

- **Hard honesty rules.** `product.md` numbers twelve, including banned words, "on this lot" versus "near", no invented years, and that a find's name is the plate's lettering. Each has a test.
- **One coordinate system.** EPSG:26917 for storage, maths and Unity, with one origin.
- **"The spec that needs a decision makes it."** `tech.md` lists what is decided. The rest stays open.

The redesign changed steering before code, and one change came from this document's own list of regrets. The first version said to put "who reviewed this" in the schema, because 162 of 163 buildings were accepted by rule and the page had no field to say so. Evidence schema 1.2.0 now has `provenance.review`: `reviewed` (a named person and a day), `draft_rule` or `draft_hand`. The card prints "Status: reviewed by NAME, DATE" or "Status: draft, not yet reviewed", and "Confirmed" for neither. Today 13 features are draft by hand, 162 are draft by rule, and none is reviewed.

## 6. MCP

`buried-evidence` is a local, read-only stdio server (`pipeline/buried_pipeline/mcp/`). Tools: `find_places`, `features_near`, `plate_features`, `list_sources`, `plate_alignment`, `plate_work`. Results are paged and under 20 KB. `find_places` now returns the finds in `data/finds.json`, each reading with its lettering, crop and the feature's review state as stored. The archivist and plate-qa agents use it. It never derives dates or "on this lot", because the date logic has one implementation, in TypeScript.

## 7. Property-based testing

- **Alignment at UTM scale** (session 008). Hypothesis broke "leave-one-out error is never optimistic" at northings near 4.8e6 m, where residuals resolve only to about 1e-9 m against a fixed 1e-9 tolerance. We fit relative to a local origin and scaled the tolerance. The claim was not weakened.
- **Triangulator** (E4, E15). A hole joined at the wrong copy of a repeated vertex made the ring cross itself. A cap triangle 13 m long and 3e-7 m high had a zero float32 normal and read as an inward wall. After the fix: 3264 polygons, 0 failures.
- **False monotonicity in matching** (sessions 025, 026). "A larger error never gives more matches" was wrong. Footprints F = (0,0) to (7,7) and G = (0,4) to (7,11) went to review at a pairwise error of 1.0 m and became a clear absence at 2.5 m, because the larger shrink pulled F's core off G. We replaced the rule and kept the pair as a regression test.
- **A land-use property whose generator was wrong** (session 038). "Published areas never reach outside the map area" failed on a 2 px area at (557, 10), well inside a map area that ends at 590. `publish` refused it, and the code was right: the test's helper attached a fixed 40 by 12 px lettering crop 4 px in from the corner, which reached x = 601 on a 600 px plate. We changed the generator to build a crop equal to the area and kept the counterexample as an `@example`. The property is unchanged.
- **New for the first visit.** Tag layout never overlaps the card; a draft never prints "Confirmed"; the raise state never loses a press; a core-sample row for plan X names plan Y only inside "first drawn on"; every finds file the Validator accepts resolves each reading to a published feature with its crop inside the map area.

## 8. Kiro powers

We used none.

## What we would do differently

**What went wrong on Nov 13.** The first Unity render did not look like the concept pictures, and session 043 had to fix six problems. The Lantern never drew at a plan stop, because the Player ignores `scene/setLantern` above depth 0 (session 044). A test's workspace area used the id `use_fip_v3_1911_229_0001`, which the committed hand-traced coal yard now holds (session 038). After the merge, five older browser tests failed: three expected the old journey, one was the same land-use failure seen from the Studio suite, and one was real, because the confidence line patterns in the 3D scene no longer differed after the look pass. Session 045 fixed the land-use and card-sync tests. Session 046 is in progress.

- Run real data through each pipeline stage before specifying the next.
- Keep `tech.md` smaller. It loads every session and its command list grew with each one.
- Name a visitor's first action before writing a spec. We built the pipeline and the Report before asking what a stranger would press.
- Use worktrees from the first parallel session.
