# Kiro session 016: footprint extraction from greyscale plates

Agent: builder (claude-sonnet-5.5). Lane: `pipeline/`, `data/extract/` or wherever the spec puts
proposals, `.kiro/specs/02-pipeline/tasks.md` (ticks), `.kiro/steering/tech.md` (commands, targeted
edits). Another builder is working in `unity/` and `web/` at the same time; do not touch them.
Retry git commands that hit `index.lock`.

Read only: this brief; spec 02 `tasks.md` task group 7; `requirements.md` requirement 17 and the
extraction requirement it revises (7); `design.md` "Extract" (the greyscale rewrite), "Steps" and
"Tuning fixtures and the held-out plate". Search for headings; do not read the spec end to end.

## Task

Implement spec 02 tasks 7.1 to 7.9 and 7.11 (`buried extract`), then run it for real.

What the plates look like (from the maintainer's inspection of plate 229, both editions):
single-band 8-bit greyscale; buildings are grey-filled shapes bounded by black outlines, in a few
grey tones; some carry a diagonal slash, an X, hatching or lettering inside; dashed lines are lot
lines, not walls; street numbers and names sit in the white streets; the 1911 scan is about
0.058 m per pixel and the 1931-35 scan about 0.12 m per pixel; map areas exist under
`data/control/map_area/` for both editions of plate 229.

Requirements that matter most:

- Deterministic image processing only. No model calls. Byte-identical output across runs.
- Proposals are polygons in EPSG:26917 with their pixel polygon, a `tone_class`, weakness flags
  and a quality score. No `material`. Nothing outside the map area.
- Tuning may use plate 229 only (both editions). Nothing may reference plate 232. Write the guard
  (7.2) first.
- Add `buried extract --preview`: write a JPEG of the map area with every proposal outlined
  (colour by quality band) to `data/work/extract/<source>_preview.jpg`, so a person can judge the
  result at a glance. This is a debugging aid; give it a requirement number at the end of spec 02.

## Real run

Run `buried extract fip_v3_1911_229 --preview` and `buried extract fip_v3_1935_229 --preview`.
Report, per plate: number of proposals, the distribution of quality scores, the count per tone
class and per weakness flag, runtime, and the preview paths. Then look at each preview yourself
and say plainly what it gets right and wrong (merged row houses, missed light-toned buildings,
text picked up as shapes, dashed lot lines closing false shapes). Make at most two rounds of
parameter changes on the tuning plates to fix the worst failure, recording each change and its
effect. Do not chase perfection: a person reviews every proposal in the Studio. Stop and report.

Task 7.10 (tuning crops cut by the maintainer) is not part of this session.

## Rules

Tests never touch the network. Never weaken a property. Narrow tests while iterating, full suite
once at the end. Commit per task; tick only when tests pass. Do not push. Short final report.
