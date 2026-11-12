# Kiro session 012: Explorer follow-up tasks, and the project's hooks

Agent: architect (claude-opus-5.5).

The gate is met: read `docs/gate/README.md`. Two jobs.

## 1. Spec 03: add the tasks that were deferred

Add numbered tasks at the end of `.kiro/specs/03-explorer/tasks.md` (and requirements or design
text where needed) for:

- The session 007 items recorded in the design's "Changes from session 007" section: clipping the
  drape to the plate's map area polygon (bridge field included), the years text on the evidence
  card (`sourceYearsText`), and the full photograph on the Sources page.
- What the gate run taught us:
  - The gate's pixel check measures debug markers, not the drape. Add a drape check: render a
    plate whose control points are known, sample the screenshot at each control point's projected
    position, and compare a small patch against the same patch cut from the tile at that control
    point's pixel (normalised cross-correlation above a stated threshold). State what it proves.
  - Meshes store float32 positions in one world frame, and the extrusion property had to compare
    against the float-rounded polygon. Decide whether chunks should carry a local origin (double
    precision offset, float local vertices) and write the task either way, with the reasoning.
  - The builder kept the coder's ear-clipping triangulator instead of vendoring LibTessDotNet.
    Record that decision in the design, and add a property that runs the triangulator on every
    polygon in `data/evidence/` and `data/present/`, not only generated ones.
  - `web/scripts/checkUnitySize.ts` is named in the design but does not exist. Add the task.
  - `npm install` reports vulnerabilities in the dev dependency tree. Add a task to audit them and
    record which ship to users (none should).
- A **look pass** before any further feature work, as its own task group placed right after the
  gate: the scene must already read as Buried at this stage. Dusk sky and fog per
  `.kiro/steering/design.md`; ink-outlined ghost treatment for the one building; the drape faded
  toward the coverage edge so there is no hard rectangle floating in a void; a sensible default
  camera framed on the showcase block rather than the whole photograph; mouse-wheel and pinch zoom
  and inertia-free drag; and the shell's first real layout (header, era control as the start of the
  depth gauge, evidence card) using the palette tokens and self-hosted fonts. Include acceptance
  criteria a reviewer can check from a screenshot.

## 2. Hooks

Write the project's Kiro hooks as JSON under `.kiro/hooks/`, in the current format
(`{ "version": "v1", "hooks": [ { "name", "description", "trigger", "matcher", "action", "timeout",
"enabled" } ] }`, where `action` is `{ "type": "command", "command": ... }` or
`{ "type": "agent", "prompt": ... }`, and triggers include `PostFileSave`, `PostFileCreate`,
`PreToolUse`, `PostToolUse`, `PreTaskExec`, `PostTaskExec`, `Stop`). One file per concern:

- `evidence.json`: on save under `data/evidence/`, `data/control/`, `data/alignment/` or
  `data/sources.json`, run `uv --directory pipeline run buried validate` and fail loudly; on save
  of `data/schema/evidence.schema.json`, regenerate the TypeScript types and run the conformance
  tests.
- `sources.json`: on adding or changing a source, an agent hook that checks the entry has a licence
  note and attribution line and that `.kiro/steering/sources.md` has a matching row, and reports
  the gap instead of editing.
- `honesty.json`: on save of report templates or generated-text modules, run the banned-word and
  "every finding has a source" tests.
- `held-out.json`: a `PreToolUse` command hook that blocks any write under the extraction tuning
  fixtures or parameter files whose content mentions plate 232, exiting 2 with a message.
- `ui.json`: on save of a component under `web/src/`, run the type check and the component's tests;
  an agent hook that checks new components use palette tokens (no raw hex) and respect
  `prefers-reduced-motion`.
- `bridge.json`: on save of `data/schema/bridge.schema.json`, regenerate bridge types and samples
  and run both sides' parse tests (the Unity side through `tools/unity.sh test`).
- `spec-tasks.json`: `PostTaskExec`, run the fast test suites and refuse to leave a task ticked
  when they fail.

Use only commands that exist in `.kiro/steering/tech.md`. Add a short `.kiro/hooks/README.md`
saying what each hook guards and why. Where a hook needs a small script (for example the held-out
check), specify it in a new spec 02 or spec 01 task rather than writing code here; name the script
path the hook will call.

## Rules

- You may edit `.kiro/specs/03-explorer/`, `.kiro/hooks/`, and add tasks at the end of spec 01 or
  02 `tasks.md` for hook scripts (append only; the builder is editing those files' checkboxes).
- No implementation code. Plain, direct English.
- Reply with what was written and anything open.
