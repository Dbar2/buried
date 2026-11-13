# Kiro session 026: a matching rule that works on small footprints; service deploy readiness

Agent: builder (claude-sonnet-5.5). Checkout: the `lane/pipeline` worktree. Lane: `pipeline/`,
`.kiro/specs/02-pipeline/` and `.kiro/specs/04-studio/tasks.md`, `.kiro/steering/tech.md`. Do not
touch `web/`, `unity/` or `data/evidence/`. Commit with `git commit -m ... -- <paths>`.

Read only: this brief; your session 025 changes (`align/pairwise.py`, `match/`), spec 02
requirement 13 and `design.md` "Match"; spec 04 `tasks.md` groups 3, 4 and 15.

## 1. Decision on the matching rule (your session 025 findings were right)

The shrink-to-core rule cannot match a typical footprint, and the monotonicity property was
false. Replace the plate-to-plate rule; keep the strict xfail test's counterexample as a regular
regression test of the new rule.

**Pairwise registration.** For two sources sharing at least four control references, take each
shared reference's position under A's chosen transform and under B's chosen transform and fit a
transform `T_BA` taking B positions to A positions (similarity for four or five references,
affine for six or more; least squares, centred as in the alignment code). The pairwise error is
`max(0.5, 2 x leave-one-out RMS)` metres, rounded up to 0.1 m, recorded with its residuals where
it can be recomputed. Matching compares A's footprints with `T_BA` applied to B's. Published
geometry is never changed by this; say so in the design.

**Rule.** Let `e` be the root-sum-square of the pairwise error and both features' digitising
terms. For a footprint F on A and a candidate G on B, the overlap score is the largest
intersection-over-union of `F + t` and `G` over translations `t` with `|t| <= e` (a grid no
coarser than 0.25 m, including zero).
- **Match:** F's best candidate scores at least 0.5, its second-best scores under 0.3, and F is
  also G's best candidate. Write the presence observation and the `same_as` link as before.
- **Clear absence:** F lies wholly inside one of B's reviewed areas, and over all `t` no footprint
  on B covers 10 per cent or more of F's area.
- **Otherwise:** the review list, with the scores, so a person decides.
- Without a pairwise registration (fewer than four shared references) use the combined absolute
  errors for `e` and the identity for `T_BA`.

**Properties.** `T_AB` composed with `T_BA` is the identity within tolerance; the overlap score
never decreases as `e` grows; a footprint and a copy of it shifted by less than `e` always match
when no other footprint is near; two footprints further apart than `e` plus their sizes never
match and, inside a reviewed area, give a clear absence; results do not depend on processing
order; nothing is written when validation fails.

Run it against a copy of the real evidence under `data/work/` and report, per direction: matched,
absent, review, and the pairwise error. List five matched pairs with their scores.

## 2. Service deploy readiness (spec 04 groups 3, 4 and 15, only what a first deploy needs)

Wire `PlateFetcher` into the service behind a cache-directory setting so extract and publish work
when `data/raw/` is empty; make `GET /v1/plates/registered` answer without reading the held-out
plate's raster; CORS limited to configured origins; a `PORT`-aware start command; a Dockerfile
that builds from the repository root and a `railway.json` (or the equivalent start config) that
runs it; a `/v1/health` that reports the data version. Tests with fakes. Do not deploy; write the
exact deploy steps into `tech.md`.

Never weaken a property. Narrow tests while iterating, full suite once at the end. Commit per
item; tick tasks only when tests pass. Do not push. Short final report.
