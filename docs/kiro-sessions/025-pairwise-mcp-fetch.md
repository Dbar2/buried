# Kiro session 025: pairwise alignment for matching, an MCP server, the held-out hook, plate fetch

Agent: builder (claude-sonnet-5.5). Checkout: the `lane/pipeline` worktree (you are in it). Lane:
`pipeline/`, `.kiro/specs/02-pipeline/` (you may add requirements, design notes and tasks at the
end for items 1 to 3), `.kiro/settings/` (new), `.kiro/steering/tech.md` (targeted edits). Do not
touch `web/`, `unity/` or `data/evidence/`. `data/raw` is linked in. Commit with
`git commit -m ... -- <paths>` on this branch.

Read only: this brief; spec 02 `design.md` "Match" and requirement 13; spec 02 `tasks.md` task 17;
spec 04 `tasks.md` group 4 and `design.md` "Plates" and "Safety"; `.kiro/steering/product.md`
decision 6 (Kiro is part of the product).

## 1. Pairwise alignment error (the reason `match` matched nothing)

The maintainer published 100 buildings from the 1911 plate and 63 from the 1931-35 plate and ran
`buried match`: every pair went to the review list. Cause: the test shrinks footprints by the two
plates' combined absolute errors (4.3 m and 3.1 m), which erases a typical 20 m2 footprint. But the
two editions were measured at the same six City intersections, and after a refined fit their
residuals agree to within about 0.3 m at every point: the plates sit far better against each
other than either does against the present-day reference.

Add a pairwise figure: for two sources that share at least four control references (same
`reference_feature_id`), compute each shared reference's position on plate A and on plate B under
their chosen transforms, take the differences, and publish a pairwise error with the same shape of
rule as the alignment error (conservative: twice the RMS of the differences, a floor you justify,
rounded up to 0.1 m). `match` uses the pairwise figure plus both digitising terms for
plate-to-plate tests when it exists, and the combined absolute errors otherwise. Record it where
it can be recomputed. Properties: the pairwise figure is symmetric; it is never used when fewer
than four references are shared; matching with a larger error never produces more matches or
absences than with a smaller one. Then run `buried match` for real and report matched, absent,
not covered and review counts per direction. Do not write to `data/evidence/` on this branch:
run it against a copy under `data/work/` and report; the maintainer will run it on main.

## 2. An MCP server for the evidence

`pipeline/buried_pipeline/mcp/`: a stdio MCP server, `buried-evidence`, read-only, that serves
facts from the committed files and derives nothing the Evidence Library owns (no date windows, no
"on this lot"). Tools: find addresses and lots by text; list features within a distance of a lot
or point with their observations, confidence, provenance and source ids; list sources with rights
and attribution; report a plate's alignment record and control hull; summarise proposals and
decisions for a plate when present under `data/work/`. Register it in `.kiro/settings/mcp.json`.
Unit tests against small fixtures; one test that starts the server and lists its tools. Say how to
run it in `tech.md` and update the "Nothing else is a server" sentence there.

## 3. The held-out hook script (spec 02 task 17)

As specified, including the shared `HELD_OUT_PATTERNS` constant used by the pytest guards and the
extension to `data/control/map_area/`. Do not enable the hook; the maintainer does that.

## 4. Plate fetch for a deployed service (spec 04 group 4, the fetch part only)

So the service can run where `data/raw/` is empty: fetch a registered plate on demand from the
allowlisted U of T host into a cache directory, verify size and hash against the manifest when
one exists, refuse other hosts, and never fetch plate 232 except through an explicit live request
(no warm-up, no precompute). Tests with a fake HTTP client only.

Never weaken a property. Narrow tests while iterating, full suite once at the end. Commit per
item; tick tasks only when tests pass. Do not push. Short final report.
