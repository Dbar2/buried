# Kiro session 020: the 1947 aerials, and matching across editions

Agent: builder (claude-sonnet-5.5). Lane: `pipeline/`, `data/` (not `data/schema/bridge*`),
`.kiro/specs/02-pipeline/tasks.md` (ticks), `.kiro/steering/tech.md` and
`.kiro/steering/sources.md` (targeted edits). Another builder is in `web/` and `unity/`. Use
`git commit -m ... -- <paths>`.

Read only: this brief; spec 02 `tasks.md` groups 5, 6 (aerial part) and 11; `design.md` "Aerials"
and "Match"; requirement 13; `.kiro/steering/sources.md` rows for the 1947 aerials.

## 1. The 1947 aerials (spec 02 group 5, then the aerial half of group 6)

Find the 1947 aerial photographs whose footprints intersect the showcase plates' map areas using
the index layer recorded in `sources.md`, fetch only those (report how many and their sizes
before downloading; stop and report instead of downloading if the total exceeds 400 MB), register
them in `data/sources.json` with the confirmed attribution line and `rights_checked_on:
2026-11-12`, inspect their georeferencing, and tile them: one JPEG per photograph clipped to the
project bounds with a sidecar, small enough to commit (aim under 3 MB each; downsample and say to
what ground resolution). The Explorer's 1947 era needs these. Measure nothing you cannot measure:
the aerials have no control points yet, so their sidecars carry no alignment error and say so.

## 2. Match (spec 02 group 11)

`buried match`: for each published building, add observations from every other plate that covers
the spot, with the exact tests in requirement 13 (presence by overlap after shrinking by the
combined error; clear absence only inside a reviewed area with nothing within the combined error;
otherwise `not_covered`; ambiguous cases go to a review list, never guessed). Aerial observations
are never decided by code: write pending items for a person. Linked features use `same_as`.
Properties M1 to M7.

There is only one published building today, so prove the command on synthetic fixtures and run it
once for real, reporting what it wrote and what it put in the review list.

## Rules

Tests never touch the network; the real fetch is the only network use. Never weaken a property.
Narrow tests while iterating, full suite once at the end. Commit per task; tick only what passes.
Do not push. Short final report.
