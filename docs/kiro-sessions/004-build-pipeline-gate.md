# Kiro session 004: build the pipeline up to the alignment gate

Agent: builder (claude-sonnet-5.5).

## Task

Implement spec `.kiro/specs/02-pipeline/` in the gate order stated at the top of its `tasks.md`:
task groups 1 and 2, then tasks 10.1 to 10.4 (`buried present`, intersections), then group 3
(alignment error). Stop there.

Read `requirements.md` and `design.md` for the spec first, and the steering docs. Work through the
tasks in order. For each task: write the code and its tests, run them, fix failures, tick the
checkbox in `tasks.md`.

## What done looks like

From `pipeline/`:

- `uv sync` succeeds on Python 3.12.
- `uv run pytest` passes, including the property tests marked [PBT] for these task groups.
- `uv run ruff check .` is clean.
- `uv run buried fetch` is implemented and safe to run (the maintainer runs the real download).
- `uv run buried inspect` and `uv run buried align-check` are implemented against synthetic test
  rasters; the maintainer runs them on the real plates afterwards.

## Rules

- Tests never touch the network. Use fakes and small synthetic fixtures.
- Do not run `buried fetch` or `buried present` against the real network yourself.
- Do not create control-point files for real plates; the maintainer picks the points.
- No fixture or parameter may reference plate 232 (1935).
- Never weaken a property to make it pass. If one fails, fix the code or report the counterexample.
- Do not commit. End with: files changed, commands run and their results, anything unfinished.
