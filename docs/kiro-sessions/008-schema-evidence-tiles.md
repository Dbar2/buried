# Kiro session 008: schema, evidence library, tiles

Agent: builder (claude-sonnet-5.5).

State of play: the alignment gate is met. The maintainer wrote `data/control/fip_v3_1911_229.json`
(six City intersections) and ran `buried align-check fip_v3_1911_229`: supplied georeferencing
RMSE 2.140 m, max 3.504 m, published alignment error 4.3 m, record in
`data/alignment/fip_v3_1911_229.json`. Tick spec 02 task 3.12.

Work in this order and make a local commit after each numbered item. If you run out of room, stop
at a clean boundary and report where.

1. **Fix property A4** (`test_a4_leave_one_out_is_never_optimistic`). The counterexample you found
   is a precision problem: residuals near northing 4.8e6 m are only resolved to about 1e-9 m.
   Decision: fit and evaluate affines relative to a local origin (subtract the centroid of the
   reference points, and of the pixel points, in double precision before forming the normal
   equations; add them back on output), and make the property's tolerance scale with coordinate
   magnitude instead of a fixed 1e-9. Do not weaken what the property claims. Keep the Hypothesis
   counterexample as an explicit regression example.
2. **Spec 01 task 1** (the Schema and conformance fixtures) **and task 2** (source registry check).
   The control file and alignment record already written by the pipeline must validate against
   the Schema; if the Schema in the design and the pipeline's current file shapes disagree, the
   Schema in the design wins and you fix the pipeline, with a test.
3. **Spec 01 task 4 and task 12** (Python Validator and the 002b checks), then **spec 02 task 4**.
4. **Spec 01 task 10** (the project file `data/project.json`, origin E0 = 632500, N0 = 4835000 as
   proposed by `buried inspect --propose-origin`).
5. **Spec 02 task 6** (`buried tile`), for plates only; aerial tiling waits for task 5. Run it for
   real on `fip_v3_1911_229` and report the output files and sizes.
6. **Spec 01 tasks 3, 5, 6, 9, 13 and 14** (the web package under `web/`, generated types,
   validated loading, date logic, drawn-in-era and per-era lists, linked sets, position wording,
   public API) with their [PBT] tasks. Node 22+ and npm are available. Vitest and fast-check.

Rules: tests never touch the network; no fixture describes a real building; never weaken a
property to make it pass, report the counterexample instead; do not push. End with files changed,
commands run and results, and anything unfinished.
