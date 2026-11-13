# Kiro session 021: Studio export, four review fixes, and the Report's first slice

Agent: builder (claude-sonnet-5.5). Lane: `web/`, `unity/`, `.kiro/specs/03-explorer`,
`04-studio` and `05-report` `tasks.md` (ticks), `.kiro/steering/tech.md`. No other builder is
running. Do not commit `Bootstrap.unity` for id-only changes.

Read only: this brief; spec 04 `tasks.md` group 14 and `design.md` "Export bundle"; spec 05
`tasks.md` groups 1 to 7 and 11, `design.md` (the sections those tasks name) and requirements for
the sections of the report (search the headings); `.kiro/steering/product.md` honesty rules and
`design.md` "The Report takes the costume off". Do not read the specs end to end.

## 1. Studio export (spec 04 group 14)

A reviewer must be able to take their workspace out of the browser: export the published
workspace for a plate as a bundle containing the evidence FeatureCollection (schema-valid), the
decisions, the reviewed areas and a short README naming the reviewer and the plate. This is how
reviewed work becomes part of the repository: the maintainer commits an exported bundle after
reading it. Round-trip test: export, validate with the Evidence Library, re-import into an empty
workspace, same features.

## 2. Four fixes from the maintainer's review of the Studio slice

1. The plate list leads with the human title ("Plate 229, 1911 edition, revised to 1914") and
   shows the source id beneath in mono, not the other way round.
2. Opening a plate fits it to the stage; after Extract the view stays fitted until the reviewer
   moves. `F` still fits the current proposal.
3. In the Explorer, the hint line ("Click a building...") sits unreadably over a bright plate.
   Give the hint and the era note a `fog` backing strip like the attribution, or move them into
   the header row; they must meet 4.5:1 over any drape.
4. Ghosts are too faint at close range (see `web/e2e/output/studio-explorer.png`): raise the edge
   weight and fill slightly so a ghost reads clearly against a draped plate, still below the
   glow cap in requirement 26.4, and add that view to the look test with a measured contrast.

## 3. The Report's first slice (spec 05 groups 1 to 7 and 11, in order, as far as fits)

"The documented history of this place." Entirely in the shell; no server; templates in code, no
LLM. A person picks a lot inside the coverage area (click it in the Explorer or search an address
from the clipped address points) and gets, in this order: the line "Buried screens; it doesn't
certify."; the core sample (one band per era; selecting a band moves the Explorer there); findings
in three groups with status, "on this lot" or "near this lot (within X m)", and sources; what
these records cannot tell you; before you dig (Ontario Dig Authority); sources with licence lines;
a link back to the live view. Outside coverage: "Not reconstructed yet." Inside coverage with no
evidence: "Nothing found in these records", listing every source and year range checked. Light
paper theme; prints to one Letter or A4 page; share link restores the same report. Include
workspace features in a clearly separate "From your workspace" section, left out of share links.

With today's data most lots will honestly say "Nothing found in these records" and list what was
checked. That is the correct output; do not add placeholder findings. Test the populated case
with synthetic fixtures and the real case with the one committed building's lot.

Playwright: open a report for the lot containing `bld_fip_v3_1911_229_0001`, save a screenshot of
the on-screen report and a PDF via print emulation to `web/e2e/output/report-*.{png,pdf}`.

## Rules

Never weaken a test. Banned words and "every finding has a source" tests must cover every sentence
template. Narrow tests while iterating, full suites once at the end. Commit per item; tick only
what passes. Do not push. If the Report does not fit, stop at a clean boundary after group 5 and
say so. Short final report with screenshot paths.
