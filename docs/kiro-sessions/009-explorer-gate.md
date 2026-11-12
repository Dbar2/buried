# Kiro session 009: the Explorer gate (Unity WebGL inside the shell)

Agent: builder (claude-sonnet-5.5).

Implement spec `.kiro/specs/03-explorer/` task group 1, tasks 1.1 to 1.10 and 1.12. Read the
spec's `requirements.md` and `design.md` first. Task 1.11 (gate data) is the maintainer's; see
"Gate data" below for what already exists.

## Facts about this machine

- Unity 6000.3.26f1 with WebGL build support is installed on an external drive. Never call the
  editor binary directly. Use the wrapper, one call at a time, each takes one to several minutes:
  - `tools/unity.sh exec <Namespace.Class.Method>` runs a static editor method headless.
  - `tools/unity.sh test` runs EditMode tests; results in `unity/Logs/editmode-results.xml`.
  - `tools/unity.sh build` runs `Buried.Editor.Build.WebGL` for the WebGL target.
  Each prints the exit code, compile errors (`error CS...`), and the build or test summary.
  Read `unity/Logs/*.log` for detail.
- A throwaway spike confirmed the toolchain: an empty built-in-pipeline scene builds to WebGL in
  about 80 s and 4.0 MB with Brotli. The real project uses URP; measure and report its size.
- There is no Unity editor UI in this workflow. Create the Unity project from text: 
  `unity/Packages/manifest.json` (URP, test framework, Newtonsoft JSON if the design uses it),
  `unity/ProjectSettings/ProjectVersion.txt`, assembly definitions, C# sources, and an editor
  method that creates and saves the bootstrap scene, the URP pipeline asset and renderer, and sets
  the player settings (WebGL template, Brotli with decompression fallback, colour space). Let Unity
  generate the remaining `ProjectSettings/*` on first run, then keep them in git. `unity/Library`
  is ignored.
- Hand-written `.meta` files are not needed; Unity creates them. Commit the ones it creates.
- Node 26 and npm are available. Playwright may be installed with `npx playwright install chromium`.
  WebGL in headless Chromium needs `--use-gl=angle --use-angle=swiftshader` (or `--enable-unsafe-swiftshader`);
  if the gate test cannot get a WebGL 2 context headless, run it headed and say so.

## Gate data

- Alignment records exist for both editions of plate 229: `data/alignment/fip_v3_1911_229.json`
  (4.3 m) and `data/alignment/fip_v3_1935_229.json` (3.1 m), each from six City intersections in
  `data/control/`.
- Tiles: `buried tile` output for `fip_v3_1911_229` exists from session 008 if that session
  finished item 5; run `uv --directory pipeline run buried tile fip_v3_1935_229` as well.
- The three ground control points the Playwright test projects are three of the six intersections
  in `data/control/fip_v3_1911_229.json`; use their `reference` coordinates.
- The one gate building: the maintainer adds `data/evidence/` content for one hand-traced
  footprint while you work. Until it exists, develop against a synthetic fixture under the test
  directories, and make the gate test read the real file when present and skip with a clear
  message when absent.

## Done looks like

- `npm --prefix web test` and `npm --prefix web run build` pass.
- `tools/unity.sh test` passes; `tools/unity.sh build` succeeds and the output is where the shell
  expects it.
- The shell loads the WebGL build, drapes one plate, extrudes the gate building from an evidence
  file at the correct position, shows its provenance in a DOM card on click, and switches between
  the 1911 and 1935 eras without the ground control points moving more than 2 px.
- The gate Playwright test (1.12) exists and has been run; report its measured pixel deltas.
- Commands recorded in `.kiro/steering/tech.md`.

Make a local commit per task. Never weaken a property or the 2 px threshold to make a test pass;
report the numbers instead. Do not push. End with files changed, commands run and results, the
build size, and anything unfinished.
