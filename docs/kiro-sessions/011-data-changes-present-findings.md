# Kiro session 011: apply the session 007 data changes; present layers; lot relation and findings

Agent: builder (claude-sonnet-5.5).

The gate is met (see `docs/gate/README.md`). This session catches the data, schema and libraries
up with the specs as revised in session 007. Do not touch `unity/`, `web/src/explorer/`,
`web/src/bridge/` or `.kiro/specs/03-explorer/` in this session; another agent is working there.

Work in this order, one local commit per item, tests green before each commit:

1. **Spec 01 tasks 16 to 19** (schema changes from session 007, including the reviewed edit to
   `data/sources.json` and `data/project.json` so the 1935 edition carries `year_from: 1931`,
   `year_to: 1935`, and the era definition follows). Bump the schema version as the spec says and
   keep every existing data file valid: migrate the control files, alignment records, tile
   sidecars and the evidence file, and re-run `buried validate`.
2. **Spec 02 tasks 14 to 16** (map area files, control hull in alignment records, map-area tiles,
   the full photograph for the Sources page). The map area for each plate is set by a person; write
   the mechanism and its tests, then stop and list exactly what the maintainer must supply (file
   path and shape) for plates `fip_v3_1911_229` and `fip_v3_1935_229`. Re-run `align-check` on both
   plates so their records carry the hull; the RMSE figures must not change (2.140 m and 1.504 m).
3. **Spec 02 task 10.5**: clip the remaining present-day layers for real (building outlines,
   property boundaries, address points) with `buried present`, following the same confirm-the-fields
   procedure as for intersections. Report feature counts and file sizes. If a file is too large to
   commit sensibly (over 5 MB), say so and propose a reduction (kept fields, coordinate precision)
   rather than committing it.
4. **Spec 01 tasks 7, 8 and 15** (lot relation with the shrink-the-lot test, findings, banned
   words with inflections) with their property tests, then task 9 exports and task 11 final check.
5. Replace the local copy of the banned-word rule in the Explorer card test with the library's
   `findBannedWords` only if that file is outside the paths excluded above; otherwise list it as a
   follow-up.

Rules: tests never touch the network (the real `buried present` runs are the only network use);
never weaken a property; do not push. End with files changed, commands and results, what the
maintainer must supply, and anything unfinished.
