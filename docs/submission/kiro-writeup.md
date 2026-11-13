# How we used Kiro to build Buried

## 1. Kiro IDE, CLI, Web, Crew

We installed Kiro IDE 1.4.154 and Kiro CLI 3.1.0 on Nov 10. The concept brief planned the IDE for specs and UI and the CLI for pipeline jobs. The build did not go that way. Every session ran through the CLI, non-interactively, with one written task brief per session. The briefs are in `docs/kiro-sessions/` (001 to 034), with `*-notes.md` files where a builder recorded findings. The IDE stayed installed and we did not use it for the build. We did not use Kiro Web or Crew.

A command outside an agent's allowlist is refused before it starts, so briefs name the command shapes that work. From session 023, parallel sessions ran in separate git worktrees (`lane/web`, `lane/pipeline`, and the main copy). Before that, two builders shared one checkout, and one commit swept the other's staged files in under the wrong message (`015-notes.md`). We used one surface, so we have no measured IDE-versus-CLI comparison.

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

None can write `.env*` or `.git`. The coder wrote the Explorer's first draft unable to run anything (session 009), and a builder compiled, tested and fixed it (session 010). The mechanic's first run was session 036, which made corrections to this document. The archivist has not been run yet, so `docs/sources/` does not exist.

**plate-qa.** Its first real run failed: `features_near` returned 163 features as 199 KB with no paging, the client truncated it, and `plate_work` gave counts without ids or crops (session 030). We added paging, a compact mode, flagged-proposal lists and `plate_features`. Its reports in `docs/qa/` then flagged, for the 1911 plate, 70 of 100 features outside the control hull, footprint pairs whose crops overlap (0039 and 0009 by 87 per cent) and possible merged lots.

## 3. Agent hooks

Seven files in `.kiro/hooks/`, explained in its `README.md`:

- `evidence.json`: `buried validate` on save of evidence, control, alignment or `sources.json`.
- `sources.json`: an agent checks licence note, attribution and `sources.md` row, and never edits.
- `honesty.json`: banned-word and every-finding-has-a-source tests on Report text modules.
- `held-out.json`: below.
- `ui.json`: type check and related tests; an agent checks for raw hex colours and `prefers-reduced-motion`.
- `bridge.json`: regenerates bridge types and runs both sides' parse tests, Unity headless.
- `spec-tasks.json`: after a spec task, runs the suites and unticks the task on failure.

The held-out guard runs before an agent write and exits 2 when the write targets extraction parameters, extraction fixtures or `data/control/map_area/` and names plate 232 (1935). A pytest guard covers files written by shell commands, which the hook cannot see. We tested the guard script by hand with a write event that names plate 232 in the extraction parameters: it exited 2 with its refusal message, and exited 0 for an ordinary write. No agent has tripped it in a real session.

Kiro refused the architect's writes under `.kiro/hooks/` in session 012, although its permission rules allowed that folder, so an architect session drafted the files (session 012) and we moved them into place by hand. A permission rule also refused the builder's write to `.kiro/settings/mcp.json` (session 025), and we pasted the JSON in.

## 4. Spec-driven development

Five specs: evidence model, pipeline, Explorer, Studio, Report. Each has numbered EARS requirements, a design with a Correctness Properties section, and tasks that name files and requirements. Property tasks are marked [PBT]. A task is ticked only when its tests pass.

Two catches before code. Session 001's first run found that a plate "revised to" a later year cannot have one year; we adopted `year_from` and `year_to`. Session 007 then read the 1935 plates, "January 1931, revised to May 1935", and they carry 1931 to 1935. Second, absence is readable only inside a reviewed area a person attests. `publish` refuses undecided proposals inside one, and `match` writes a clear absence only inside one.

Two misses. Spec 02's matching rule shrank footprints by the plates' combined errors (4.3 m and 3.1 m), which erased a typical 20 m² footprint, so the first real `buried match` sent every pair to review. A maintainer review found the place page saying "Checked by a person" for a record marked "gate draft, unreviewed" (session 027).

Against vibe coding: specs gave builders a stopping rule and gave us one place to settle questions. We did not build both ways, so we cannot say which was faster. The specs reached about 10,000 lines (10,039 at the time of writing), and sessions that read them whole wasted credits. From session 015 each brief names the sections to read.

## 5. Steering docs

Six files in `.kiro/steering/`: `product`, `tech`, `structure` and `sources` (always loaded), `evidence` (for `data/**`, `pipeline/**`) and `design` (for `web/**`, `unity/**`). Three choices mattered:

- **Hard honesty rules.** `product.md` numbers eleven, including banned words, "on this lot" versus "near", and no invented years. Each has a test.
- **One coordinate system.** EPSG:26917 for storage, maths and Unity, with one origin, so alignment is exact by construction.
- **"The spec that needs a decision makes it."** `tech.md` lists what is decided. The rest stays open until a spec settles it and records why.

On day two the pieces worked but did not answer an ordinary person's question fast. Session 022 rewrote `product.md` and `design.md`: the place page became the unit, with search first ("What was here?"), real crops for the core sample, and a lit map sheet.

## 6. MCP

`buried-evidence` is a local, read-only stdio server (`pipeline/buried_pipeline/mcp/`, registered in `.kiro/settings/mcp.json`). Tools: `find_places`, `features_near`, `plate_features`, `list_sources`, `plate_alignment`, `plate_work`. Results are paged and under 20 KB. The archivist and plate-qa agents use it. It serves facts, such as whether a centroid lies inside the control hull. It never derives dates or "on this lot", because the date logic has one implementation, in TypeScript, and a second would drift.

## 7. Property-based testing

- **Alignment at UTM scale** (A4, session 008). Hypothesis broke "leave-one-out error is never optimistic" at northings near 4.8e6 m, where residuals resolve only to about 1e-9 m against a fixed 1e-9 tolerance. We fit relative to a local origin and scaled the tolerance. The claim was not weakened.
- **Hole bridging** (E4). The triangulator attached a bridge at the wrong copy of a repeated vertex and the ring crossed itself.
- **The 13 mm fold-back** (E15, session 015). City outline 306711 has a jog at vertices 39, 40 and 0, leaving a wall with no solid behind it. Vertices under 2 cm apart are now merged.
- **The inward wall** (E15, session 028). On 39-vertex `bld_fip_v3_1935_229_0009` the ear clipper emitted a cap triangle 13 m long and 3e-7 m high. In float32 its normal was zero and the test read it as an inward wall. We fixed the collinearity threshold. Afterward: 3264 polygons, 0 failures.
- **False monotonicity in matching** (sessions 025, 026). "A larger error never gives more matches" was a wrong property, and the rule under it could not match real footprints. We replaced both with a best-overlap rule (at least 0.5, runner-up under 0.3). The counterexample: footprints F = (0,0) to (7,7) and G = (0,4) to (7,11) went to review at a pairwise error of 1.0 m and became a clear absence at 2.5 m under the retired shrink rule, because the larger shrink pulled F's core off G. The pair is kept as a regression test of the new rule.

Three were code bugs, one was a rigid tolerance plus numerics, one was a wrong property.

## 8. Kiro powers

We used none.

## What we would do differently

- Run real data through each pipeline stage before specifying the next.
- Keep `tech.md` smaller. It loads every session and its command list grew with each one.
- Put "who reviewed this" in the schema. 162 of 163 buildings were accepted by rule and the page had no field to say so.
- Use worktrees from the first parallel session.
