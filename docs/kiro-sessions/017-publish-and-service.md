# Kiro session 017: publish, and the Studio service's first slice

Agent: builder (claude-sonnet-5.5). Lane: `pipeline/`, `data/schema/studio_api*`,
`.kiro/specs/02-pipeline/tasks.md` and `.kiro/specs/04-studio/tasks.md` (ticks),
`.kiro/steering/tech.md` (commands). Another builder is in `unity/` and `web/`; the one web file
you may touch is the generated-types script and its output named in spec 04 task 1.3. Use
`git commit -m ... -- <paths>` so you never sweep in the other builder's staged files.

Read only: this brief; spec 02 `tasks.md` group 8 and `design.md` "Publish"; spec 04 `tasks.md`
groups 1, 2, 3, 6 and 8, and `design.md` "Endpoints", "Safety" and the proposal and decisions
shapes. Search for headings; do not read the specs end to end.

## Goal

The shortest honest path from "Buried proposes" to "a person confirms and it is evidence":
`buried extract` proposals in, a decisions file from a reviewer, valid evidence out, and the same
thing over HTTP for the Studio.

## Order

1. **Spec 02 group 8** (`buried publish`) with properties U1 to U6. Publishing needs a named
   reviewer and a reviewed area; position error follows the spec 02 rule; ids are never reused.
2. **Spec 04 group 1** (the Service API schema, data version rule, conformance tests, generated
   TypeScript types) and **group 2** where it only extends publish and extract for the Studio.
3. **Spec 04 group 3** (FastAPI service skeleton, safety limits, the held-out guard: the service
   holds no precomputed result for plate 232).
4. **Spec 04 group 6** (extract endpoint) and the publish part of **group 8** (validate decisions,
   return an evidence FeatureCollection; nothing is written to `data/evidence/` by the service).
   Add the two read endpoints the Studio needs to start: list the registered showcase plates with
   their tile sidecars, and health. Leave uploads, the Volume 3 index, align, label assist, overlay
   and match for later sessions; do not stub them with fake success.

## Real check

Start the service locally, call extract for `fip_v3_1911_229` and publish with a small decisions
body that accepts three proposals as a test reviewer, validate the returned collection with
`buried validate`'s library function, and report the timings. Do not write the result into
`data/evidence/`. Record how to run the service in `tech.md`.

## Rules

Tests never touch the network. Never weaken a property. Narrow tests while iterating, full suite
once at the end. Commit per task; tick only when tests pass. Do not push. Short final report:
endpoints that exist, results, anything unfinished.
