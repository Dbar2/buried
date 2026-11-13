# Kiro session 019: the Studio's first working slice (Extract, Review, Publish, see it in 3D)

Agent: builder (claude-sonnet-5.5). Lane: `web/` (not `web/src/evidence/`), `unity/`,
`data/schema/bridge*`, `.kiro/specs/04-studio/tasks.md` and `.kiro/specs/03-explorer/tasks.md`
(ticks), `.kiro/steering/tech.md` (commands). Another builder is in `pipeline/`. Use
`git commit -m ... -- <paths>`. Do not commit `Bootstrap.unity` for id-only changes.

Read only: this brief; spec 04 `tasks.md` groups 1 (web halves of 1.2 and 1.3), 9, 11 and 13;
spec 04 `design.md` "Workspace", "Review" and "Publish and the Explorer"; spec 04 requirements for
Review and Publish (search the headings); `data/schema/studio_api.schema.json`; and
`.kiro/steering/design.md`. Do not read the specs end to end.

## What exists

The service (`pipeline/buried_pipeline/service/`, FastAPI) has `GET /v1/health`,
`GET /v1/plates/registered`, `POST /v1/extract` and `POST /v1/publish` (a dry run that validates
decisions and returns an evidence FeatureCollection; it writes nothing). `tech.md` says how to run
it. Extraction returns about 150 to 180 proposals for plate 229 in under a second.

## Build this slice, end to end

A person opens the Studio, picks one of the registered showcase plates, and:

1. **Extract.** One action calls the service; proposals draw onto the plate in sequence.
2. **Review.** The plate fills the main area (pan, zoom, fit); proposals are outlined on it by
   quality band using pattern and label as well as colour. One proposal is current. Keys: `A`
   accept, `R` reject, `J`/`K` or arrows next and previous, `F` fit to current, `U` undo. The side
   panel shows the current proposal's crop at native resolution, its tone on the scan (never
   "material"), its weakness flags in plain words, and two optional fields the reviewer may fill
   from the lettering: storeys (integer) and use as lettered. A running count: accepted, rejected,
   undecided. Editing vertices, merge, split and tracing are later sessions: do not show controls
   for them.
3. **Reviewed area.** Before publishing the reviewer drags a rectangle (or accepts "the visible
   area") to state "every building inside this area has been decided". Undecided proposals inside
   it block publishing and are listed.
4. **Publish.** Requires a reviewer name. Calls the service, receives the validated collection,
   stores it in the workspace (IndexedDB, same schema), and never touches the committed evidence.
   The UI says plainly: "Published to your workspace on this device. It is not part of Buried's
   reviewed record."
5. **See it.** "Open in the Explorer" switches to the Explorer at that plate's era, where the
   workspace buildings rise as ghosts through `scene/addFeatures`, marked as workspace features in
   their evidence card ("From your workspace, confirmed by <name>").

If the service is unreachable the Studio says so in one sentence and offers nothing that would
fail. Steps that are not built (Import, Align, labels, tracing) are not shown as steps.

## Design direction (maintainer)

The Studio is a working tool: calm, dense, legible. Dark theme tokens from `design.md`. The plate
is the hero and keeps its own colours; UI chrome is quiet. One accent (`lantern`) marks only the
current proposal. Accepted proposals take the `ink` treatment; rejected ones recede to a faint
dashed outline; undecided stay neutral. Type: Inter for UI, IBM Plex Mono for ids, counts, metres
and keys; Fraunces only for the page title. A compact key legend sits at the bottom of the side
panel. No cards-within-cards, no pill badges for everything, no gradients, no icons without text,
no celebratory animation on publish: the buildings rising in the Explorer is the payoff.
Everything works by keyboard, focus is always visible, and reduced motion is respected.

## Tests

Unit and property tests for the workspace and decisions (spec 04's properties for this slice:
publish never stores a feature the validator rejected; a workspace feature never appears as
canon). One Playwright test that starts the service through Playwright's `webServer`, runs the
whole slice on `fip_v3_1911_229` (accept five proposals, reject two, set a reviewed area, publish
as a test reviewer, open the Explorer) and saves screenshots of Review and of the Explorer with
the workspace ghosts to `web/e2e/output/studio-*.png`. Never use plate 232 in tests.

## Rules

Never weaken a test. Narrow tests while iterating, full suites once at the end. Commit per task;
tick only what passes. Do not push. Final report: what works, what you skipped from groups 9, 11
and 13, results, screenshot paths.
