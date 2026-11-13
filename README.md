# Buried

Buried is a tool for turning archival fire insurance plans into a 3D model of a neighbourhood through
time, where every building carries the evidence behind it. The first showcase is Eastern Avenue at the
Don River, Toronto, built from Goad's Volume 3 plates (1911 and 1931, revised to 1935).

Tagline: "Forgotten maps, rebuilt with proof." Entry for Kiroween 2026.

Live site: <https://buried.pages.dev>. Type an address and the page for that lot opens.

![The place page for 541 Queen St E: the 1911 scene on the left, the report for the lot on the right](docs/progress/place-page-541-queen-1911.png)

*The place page for a lot on Queen St E, at the 1911 era. The scene is on the left and the report
for the lot is on the right.*

## Where it stands

Status is read from the repository as of the last commit to this file. The go/no-go gate results
are in `docs/gate/README.md`.

| State | What |
|---|---|
| Works today | The site at `buried.pages.dev`: a landing with one search field ("What was here?"), and the place page at `/place?lot=...`. The place page puts the dig (a Unity WebGL scene with a depth gauge) beside the report for that lot. The report also has its own page, `/report`, for printing and sharing. |
| Works today | The Explorer shows 163 published buildings as ghosts across the 1911 and 1931-35 eras, each with an evidence card, and a 2D map with a text list when the Player cannot run. |
| Works today | The Report: findings with status labels, "on this lot" and "near this lot" tests, a coverage statement, a list of records checked, and a one-page print layout. |
| Works today | The Studio slice: fetch a registered plate, extract footprints, review them one by one, publish into the workspace, and export a bundle for the maintainer to review. |
| Works today | Pipeline commands: `fetch`, `inspect`, `present`, `align-check`, `control-crops`, `tile`, `extract`, `publish`, `match`, `validate`. `extract` is deterministic image processing; `publish` writes only what a person accepted. |
| Works today | The `buried-evidence` MCP server (`pipeline/buried_pipeline/mcp`, registered in `.kiro/settings/mcp.json`) and the two agents that read it: `archivist` (sources, rights) and `plate-qa` (what a reviewer should look at). The held-out-plate write hook is enabled. |
| Draft | The 163 published buildings: 100 on the 1911 plate and 63 on the 1931-35 plate. One is the hand-traced bank. The other 162 were accepted by a quality rule in a draft pass, marked "not checked one by one" in their provenance, and none has its storeys read. |
| Draft | The control points for both plates, picked by eye from 60 m crops, all in the northern two-thirds of plate 229, and the map areas, set once by hand. |
| Not built | Studio Align and editing: the Studio does not yet let you place control points or edit footprints. |
| Not built | 1947 imagery. Two aerial records are registered in `data/sources.json`, but neither has an alignment record, so neither is tiled or shown. |
| Not built | A tracing interface for past land use, and any land-use finding drawn from a plate's lettering. |
| Not built | A deployed Studio service. The site is static; extract and publish need the service run locally. |
| Not built | Water remembers: no water source has been chosen. |

Measured at the gate (plate 229, against six City of Toronto intersections):

| Plate | Supplied georeferencing RMSE | Worst point | Published as |
|---|---|---|---|
| 1911 (revised to 1914) | 2.140 m | 3.504 m | within about 4.3 m |
| 1931, revised to 1935 | 1.504 m | 2.607 m | within about 3.1 m |

Alignment is measured only at the control points. The alignment record states their hull, and a
position error is less certain outside it, which includes the southern third of plate 229. The
held-out plate (232, 1931-35) has not been published.

## Run what exists

Prerequisites:

- Python 3.12 with [uv](https://docs.astral.sh/uv/).
- Node 22 or later with npm.
- Unity 6000.3.26f1 with WebGL build support. Set `UNITY_BIN` to the editor binary
  (`.../6000.3.26f1/Unity.app/Contents/MacOS/Unity` on macOS); `tools/unity.sh` exits 3 if it
  cannot find one.

Pipeline, from `pipeline/`:

```
uv sync
uv run pytest
uv run ruff check .
uv run buried validate
```

`pytest` ends with a line such as `N passed`. `ruff` prints `All checks passed!`. `validate` checks every
contract file under `data/` against the schema and exits 0, or exits 1 and lists each error.
`uv run buried fetch`, `inspect`, `present`, `align-check <SOURCE_ID>`, `control-crops <SOURCE_ID>`,
`tile`, `extract`, `publish` and `match` are described in `.kiro/steering/tech.md`. `fetch` writes to
`data/raw/`, which is gitignored.

Web shell, from `web/`:

```
npm install
npm test
npm run typecheck
npm run build
npm run preview
```

`npm test` runs Vitest and prints a summary with no failed files. `typecheck`
prints nothing and exits 0. `build` type-checks, then Vite prints its output files and a `built in` line.
`preview` serves the build on a local URL. The Explorer needs the Unity build below in
`web/public/unity/`; without it the page loads and the Player does not.

Unity, from the repository root:

```
tools/unity.sh exec Buried.Editor.Setup.Run
tools/unity.sh test
tools/unity.sh build
```

The first command imports packages and creates the scenes and assets; the first run takes several
minutes. Every `tools/unity.sh` call ends with `unity exit code: 0   log: unity/Logs/<mode>.log`.
`test` also prints the `<test-run ...>` line from the results file; look for `failed="0"`. `build`
writes the WebGL build to `web/public/unity/`, which is gitignored.

Gate end-to-end test, from `web/`, after the Unity build:

```
npm exec -- playwright install chromium
npm run test:e2e
```

The first command is needed once. The second builds the site, starts `vite preview`, loads the real
Unity build, and should report `2 passed`. Screenshots and pixel deltas go to `web/e2e/output/`.

## Repository layout

```
web/        Vite + React + TypeScript shell: landing, place page, Explorer, Studio, Report, Sources, bridge (JS side), Evidence Library
unity/      Unity 6 project: runtime meshing, drape, camera, bridge (C# side and .jslib), EditMode tests
pipeline/   Python 3.12 package `buried_pipeline` and the `buried` command
data/       The contract files: schema, source registry, project origin, evidence, control points,
            alignment records, present-day layers, tiles. data/raw/ and data/work/ are gitignored.
docs/       Concept brief, Kiro session briefs, and the gate results
tools/      unity.sh, the headless Unity runner
.kiro/      Steering, specs, hooks and agent configurations
```

All stored coordinates are EPSG:26917 (metres). Longitude and latitude do not appear in evidence.

## Built with Kiro

- `.kiro/steering/`: the standing rules every session reads. Product and honesty rules, the stack and
  commands, repository layout, source rights, the evidence model and date logic, and the visual design.
- `.kiro/specs/`: five specs (evidence model, pipeline, explorer, studio, report), each with
  requirements, design and a task list. A task is ticked only after its tests pass.
- `.kiro/hooks/`: seven hook files that run validation, the banned-word tests and the bridge tests
  on save, plus a write guard for the held-out plate. `.kiro/hooks/README.md` says what each guards
  and why.
- `.kiro/agents/`: six agent configurations. `architect` writes specs, `builder` and `coder`
  implement tasks, `mechanic` makes small edits, and `archivist` and `plate-qa` read the evidence
  files through the MCP server and write notes, never evidence.
- `docs/kiro-sessions/`: the task brief given to Kiro for each session, numbered 001 to 031,
  including the one that produced this README.

The rules in `.kiro/steering/` require property-based tests (Hypothesis in Python, fast-check in
TypeScript, seeded generators in Unity EditMode). Two things they caught:

- **Precision in the alignment property.** A Hypothesis counterexample broke the property that a
  leave-one-out error is never optimistic. The check used a fixed 1e-9 tolerance, but at northings near
  4.8e6 m residuals only resolve to about 2e-9 m. The fix fits and evaluates affines relative to a local
  origin and scales the tolerance with coordinate magnitude. The property was not weakened, and the
  counterexample stays in the test as an explicit example.
- **Hole bridging in the triangulator.** The Unity ear-clipping triangulator joins each hole to the
  outer ring with a bridge. An earlier bridge leaves a vertex in the ring twice, and attaching the next
  bridge at the wrong copy made the merged ring cross itself. `OccurrenceFacing` in
  `unity/Assets/Buried/Runtime/Meshing/Triangulator.cs` picks the copy whose angle faces the hole. The
  extrusion property (E4) generates polygons with up to three holes.

The steering also requires a test that fails if any extraction fixture or parameter set references
plate 232 (1935), the held-out plate. The hook that blocks agent writes mentioning it is enabled.

## Sources and credits

Plates:

- 1911 edition: "Digitized and georeferenced by the University of Toronto Map & Data Library."
- 1931, revised to 1935 edition: "Library and Archives Canada, National Map Collection (NMC-0013999).
  Digitized and georeferenced by the University of Toronto Map & Data Library."

1947 aerial photographs (registered in `data/sources.json` and `.kiro/steering/sources.md`, none shown): "1947 aerial
photographs: City of Toronto Archives. Georeferenced by the University of Toronto Map & Data Library."

Present-day layers (building outlines, property boundaries, address points, intersections):
"Contains information licensed under the Open Government Licence - Toronto."

The 1931-35 plates are photographs of the copy held by Library and Archives Canada, which carries its
own "no reproduction without permission" notice. U of T distributes the files publicly and lists the
plans as out of copyright. We rate this low risk, credit both institutions, and the maintainer has yet
to confirm it for submission.

The full licence and rights notes are in `.kiro/steering/sources.md` and on the app's Sources page.
The plates are greyscale; no material is recorded unless the plate's lettering states it.

## What Buried is not

Buried screens; it doesn't certify. Its maps are not utility locates and say nothing about present-day
soil, water or structural condition. Before you dig, request locates through
[Ontario Dig Authority](https://ontariodigauthority.ca/).

## Licence

MIT. See `LICENSE`.
