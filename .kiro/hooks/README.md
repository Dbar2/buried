# Hooks

Each JSON file guards one concern. Every command is one listed under "Commands" in
`.kiro/steering/tech.md`, run from the repository root, sometimes with test-file filters passed to
`npm test` (Vitest) or `pytest`. Timeouts are in seconds.

| File | Guards | Why |
|---|---|---|
| `evidence.json` | Saving or creating anything under `data/evidence/`, `data/control/`, `data/alignment/`, or `data/sources.json` runs `buried validate`. Saving `data/schema/evidence.schema.json` regenerates the TypeScript types and runs both conformance tests, then validates all data. | The evidence files are the contract between the pipeline, the Shell and Unity. A file that fails the Schema or a cross-file rule (no source, no position error, an error figure that does not recompute) must be caught on save, not at the next build. |
| `sources.json` | Saving or creating `data/sources.json` asks an agent to check each source's licence note, attribution line and matching row in `.kiro/steering/sources.md`. It reports gaps and never edits. | `sources.md`: no source enters `data/` until it has a row there with a licence note and an attribution line. Adding a source is a reviewed edit, so the hook reports instead of fixing. |
| `honesty.json` | Saving a Report module, the Evidence Library's banned-word, findings or sentence modules, or the Explorer's card text model runs the banned-word and every-finding-has-a-source tests. | Product honesty rules 1, 4 and 10. These are the files that produce or check the text an inspector or a lawyer may read. |
| `held-out.json` | Before any file write by an agent, blocks writes under the extraction parameter sets or tuning fixtures that mention plate 232 (1935), exiting 2 with a message. | Plate 232 (1935) is the held-out plate processed live in the demo (product.md, evidence.md). The pytest guard catches it after the fact; this stops it at the write. |
| `ui.json` | Saving a component under `web/src/` runs the type check and the tests related to the changed files. Creating one asks an agent to check for raw colours and for `prefers-reduced-motion`. | design.md: tokens are defined once and components hold no hex values; motion has a reduced-motion path. |
| `bridge.json` | Saving `data/schema/bridge.schema.json` regenerates the bridge types and samples and runs both sides' parse tests, Unity through `tools/unity.sh test`. | tech.md: one bridge schema shared by both sides, checked in tests. A schema change that only one side has seen is the drift the bridge rule exists to stop. |
| `spec-tasks.json` | After a spec task runs, an agent runs the web tests, the web type check and the pipeline tests, and unticks the task if any fails. | Spec rule: a task is done only when its tests pass. |

## Notes

- **One glob per hook.** Each `matcher` holds a single glob. Where a concern covers several folders
  or both save and create, there is one hook per glob and trigger, so no hook depends on brace
  expansion or list matchers.
- **`held-out.json` and its script.** It calls
  `uv --directory pipeline run python -m buried_pipeline.hooks.held_out_write`, added by spec 02
  task 17 in session 025. The hook is enabled. Fed a write event that names plate 232 in the
  extraction parameters, the script exits 2 with its refusal message; for an ordinary write it
  exits 0.
- **`held-out.json` matcher.** `write` is the tool name in this project's agent configurations
  (`.kiro/agents/*.json`). If Kiro reports the tool under another name in the hook event, change the
  matcher to that name. The script reads the target path and text from the tool input itself, so it
  works for whole-file writes and partial edits alike.
- **What `held-out.json` cannot see.** Files written by shell commands (for example a pipeline run)
  do not pass through the write tool. The pytest guard `pipeline/tests/extract/test_held_out.py`
  covers those.
- **`ui.json` uses `vitest --changed`.** It runs the tests that import a file changed since the last
  commit, which includes the saved component's own tests, without the hook needing the saved path.
- **Unity is slow.** `bridge.json` runs headless Unity, which takes several minutes. It fires only on
  a bridge schema save, which is rare and always needs both sides checked.
- **`spec-tasks.json` is an agent hook** because a command hook cannot untick a task. It never edits
  code or tests; the fix belongs to the next task run.
