# Kiro session 010: build, test and fix the Explorer gate

Agent: builder (claude-sonnet-5.5). You can run commands in this session.

The coder agent wrote spec 03 task group 1 (tasks 1.1 to 1.10 and 1.12) without being able to run
anything: commit "Explorer gate, first draft (unbuilt)". Nothing has been compiled or tested. Your
job is to make it real.

## State

- Gate data is in place (task 1.11): `data/tiles/fip_v3_1911_229.{jpg,json}`,
  `data/tiles/fip_v3_1935_229.{jpg,json}`, alignment records and control files for both editions,
  and `data/evidence/fip_v3_1911_229.geojson` with one hand-traced building
  (`bld_fip_v3_1911_229_0001`, the bank at Queen St E and River St, observed on both plates).
- The architect has since revised steering and specs (session 007). Schema and data changes from
  that session (the 1931 year on the 1935 edition, map areas) are NOT applied yet and are not part
  of this session. Build against the data as it is.

## Work through these in order; fix whatever fails; commit after each one goes green

1. `npm --prefix web install`
2. `npx --prefix web playwright install chromium` (or `npm --prefix web exec -- playwright install chromium`)
3. `npm --prefix web run gen:bridge-types` and `npm --prefix web run gen:bridge-samples`
4. `npm --prefix web test` and `npm --prefix web run typecheck`
5. `tools/unity.sh exec Buried.Editor.Setup.Run` (first run imports packages; several minutes).
   The coder guessed package versions (URP 17.3.0, Newtonsoft 3.2.1, test framework 1.6.0) and some
   editor APIs. If Unity reports a package or compile error, read `unity/Logs/exec.log`, fix, rerun.
   If a package version does not resolve, read the resolver's message in the log for the available
   versions rather than guessing again.
6. `tools/unity.sh test` until EditMode tests pass, including the property tests.
7. `tools/unity.sh build` until the WebGL build succeeds. Report the size of
   `web/public/unity/Build/`.
8. `npm --prefix web run build`
9. `npm --prefix web run test:e2e` (the gate test). If headless Chromium cannot get WebGL 2, try the
   swiftshader flags in the Playwright config before falling back to headed mode. Report the
   measured pixel deltas for the three control points across the two eras and the screenshots'
   paths. The building-click test must run against the real evidence file, not skip.

## Rules

- Never weaken a property, a test, or the 2 px threshold to get to green. If something cannot be
  made to pass, stop and report the numbers and what you tried.
- The coder wrote its own ear-clipping triangulator instead of vendoring one. Keep it only if the
  extrusion property (E4) passes on real and generated polygons; say which way it went.
- Keep changes inside `web/`, `unity/`, `data/schema/bridge*`, `tools/` and
  `.kiro/specs/03-explorer/tasks.md` (tick tasks only when their tests pass). Record the commands
  that now work in `.kiro/steering/tech.md` with targeted edits.
- Commit `unity/ProjectSettings/`, `unity/Packages/` (including the lock file) and the `.meta`
  files Unity generates. Never commit `unity/Library/`, `web/public/unity/` or `node_modules/`.
- Do not push.

End with: what failed and how you fixed it (briefly, by step), the final results of every command,
the build size, the gate deltas, and anything unfinished.
