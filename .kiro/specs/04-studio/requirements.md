# Requirements: 04 Reconstruction Studio

## Introduction

The Reconstruction Studio shows that Buried is a tool and not a hand-built model. A person brings a
plate Buried has not processed, aligns it to today's map with its error in metres, lets Buried
propose footprints, reviews them, traces water and any missed buildings, and publishes. The
published buildings rise in the Explorer in that plate's era, each with provenance.

The Studio has two halves:

- the Studio UI in the Shell (`web/src/studio/`, route `/studio`), which owns every screen, the
  review actions, the visitor's workspace in the browser, and the hand-off to the Explorer;
- the Studio service (`pipeline/buried_pipeline/service/`), a small stateless FastAPI app that
  exposes the same pure Python functions the `buried` CLI uses: inspect, align, extract, match and
  publish (with validation), plus a label-reading assist behind a provider interface.

This spec also records the hosting decision, because the service is the first part of Buried that
needs a server: the static site on Cloudflare Pages and the service on Railway. The Explorer and
the Report work fully with the service down.

Rules come from `.kiro/steering/` (`product.md`, `tech.md`, `structure.md`, `sources.md`,
`evidence.md`, `design.md`). Contract shapes and the Evidence Library come from spec 01. Alignment,
extraction, publish and match come from spec 02. The Explorer, the bridge and
`applyEvidenceUpdate` come from spec 03. Where this spec and the concept brief differ, the steering
docs win. Where this spec needs a steering or spec 01/02 change, it says so in design.md
"Dependencies on other documents".

## Glossary

- **Studio**: the `/studio` route and the modules in `web/src/studio/`.
- **Service**: the FastAPI app in `pipeline/buried_pipeline/service/`.
- **Service API Schema**: `data/schema/studio_api.schema.json`, JSON Schema draft 2020-12, the
  catalogue of every Service request and response body.
- **Canon**: the contract files committed under `data/` and served read-only by the site.
- **Canon snapshot**: the copy of the canon contract files built into the Service image.
- **Data version**: the hash of the canon contract files defined in design.md. The site and the
  Service each compute it.
- **Workspace**: the visitor's own store in the browser (IndexedDB): Studio sources, control points,
  alignment records, proposals, decisions, label reads, evidence files and display tiles.
- **Workspace feature**: a feature in a workspace evidence file. Never canon.
- **Index plate**: a plate listed in U of T's Volume 3 index layers (`vol3_19111914`, `vol3_1935`).
- **Upload**: an image the visitor sends from their own machine.
- **Plate ref**: the SHA-256 of a raster held in the Service's raster cache.
- **Studio source**: the source record a workspace item cites: a canon registry entry, or a
  workspace source record (design.md "Studio sources").
- **Review item**: a proposal from extraction, or a feature a person traced.
- **Review item id**: the id that names a review item and is stored as `provenance.proposal_id`
  (design.md "Review item ids").
- **Decisions file v2**: the decisions shape in the Service API Schema, read by `publish` from the
  CLI and from the Service.
- **Reviewer name**: the name a person enters before publishing, written as `confirmed_by`.
- **Label assist**: a vision model that proposes the text of a printed label for one field.
- **Label provider**: the Service interface behind which label assist runs.
- **Held-out plate**: `fip_v3_1935_232`.
- **Project bounds**: `data/project.json` `bounds` (spec 01 requirement 7.6).
- **Recorded walkthrough**: a captioned video of a real Studio session, served by the site.

## Requirement 1: The Studio service

**User story:** As the maintainer, I want the Studio to use the exact functions the CLI uses, so
that alignment, extraction and publishing have one implementation.

### Acceptance criteria

1.1 THE Service SHALL be a FastAPI app in `pipeline/buried_pipeline/service/`, installed with the
pipeline package through an optional dependency group, and SHALL run on Python 3.12.

1.2 THE Service SHALL expose the endpoints in design.md "Endpoints": health, plate index, plate
fetch, upload, plate image and crop, align, extract, labels, match and publish.

1.3 THE Service SHALL compute every alignment, extraction, matching, publishing and validation
result by calling the same pure functions that the `buried` CLI commands call (spec 02), and SHALL
NOT contain its own copy of any transform, residual, error rule, polygon, scoring, matching or
validation logic.

1.4 THE Service SHALL be stateless: each request SHALL carry, or reference by plate ref, everything
it needs. THE Service SHALL keep no record of visitors, sessions, decisions or results between
requests, other than the in-memory rate-limit counters in design.md "Limits", which hold no request
content and expire within one hour.

1.5 THE Service SHALL NOT cache or store the result of any align, extract, labels, match or publish
request. The only things it SHALL keep between requests are the raster cache (design.md "Raster
cache"), the canon snapshot, the plate index (for at most 24 hours) and the rate-limit counters.

1.6 THE Service SHALL NOT compute dates, date windows, lot relations or confidence wording.

1.7 THE Service SHALL NOT write to `data/` or to any repository file.

## Requirement 2: The Service API contract

**User story:** As a developer on either side, I want every request and response checked against
one schema, so that the Studio and the Service cannot drift apart.

### Acceptance criteria

2.1 THE Service API Schema SHALL define every request and response body, SHALL reuse spec 01
definitions (`source`, `controlPoints`, `alignmentRecord`, `featureCollection`, `position`,
`sourceId`, `featureId`) by `$ref` to `evidence.schema.json`, and SHALL define the proposal file,
the decisions file v2, label reads and the error body.

2.2 THE Service SHALL validate every JSON request body against the Service API Schema before acting
on it, and SHALL reply 422 with the validation errors when it fails.

2.3 THE Studio SHALL validate every Service response against the Service API Schema with Ajv before
using it, and SHALL treat an invalid response as a Service error.

2.4 THE Studio SHALL use TypeScript types generated from the Service API Schema, and a test SHALL
fail if regenerating them changes the committed file.

2.5 THE Service API Schema SHALL carry an `api_version`, returned by the health endpoint and sent by
the Studio on every request; IF the versions differ, THEN THE Service SHALL reply 409 and THE Studio
SHALL say the Studio needs reloading.

2.6 WHEN a request depends on canon (align, extract, match, publish), it SHALL carry the data version
the site is serving; IF it differs from the Service's canon snapshot, THEN THE Service SHALL reply
409 with both versions and THE Studio SHALL say that the site and the Studio service are out of
step.

## Requirement 3: Service safety

**User story:** As the maintainer of a public service with no login, I want it to fetch only what
it should, accept only what it can handle, and spend money only within a cap.

### Acceptance criteria

3.1 THE Service SHALL download plates only from URLs it builds itself from the two fire insurance
plan download patterns in `sources.md`, and plate index records only from the ArcGIS host named in
`sources.md`. It SHALL NOT fetch any URL taken from a request.

3.2 THE Service SHALL check every outgoing URL against a host allowlist (`maps.library.utoronto.ca`,
`services1.arcgis.com`) before the request, and SHALL refuse any other host.

3.3 THE Service SHALL refuse an upload larger than `BURIED_MAX_UPLOAD_BYTES`, a raster with more
than `BURIED_MAX_PIXELS` pixels, any format other than those in design.md "Uploads", and any zip
entry that fails spec 02's safe-unzip rules.

3.4 THE Service SHALL refuse a JSON request body larger than 10 MB.

3.5 THE Service SHALL allow cross-origin requests only from the origins in `BURIED_ALLOWED_ORIGINS`.

3.6 THE Service SHALL limit requests per client address as in design.md "Limits", and SHALL reply
429 with a retry time when a limit is reached.

3.7 THE Service SHALL hold uploaded rasters only in the raster cache, SHALL delete each upload when
the Studio asks or when it has not been used for 2 hours, whichever comes first, and SHALL NOT keep
uploads across a restart.

3.8 THE Service SHALL NOT log request bodies, uploaded images, crops, label text or credentials.

3.9 THE Service SHALL read credentials and limits only from environment variables, and THE
repository SHALL contain `pipeline/.env.example` with the variable names and no values.

3.10 THE Studio SHALL NOT receive, store or send any credential.

## Requirement 4: Bringing a plate from the U of T index

**User story:** As a heritage researcher, I want to pick a Volume 3 plate from the library's index
and start work on it without downloading anything myself.

### Acceptance criteria

4.1 THE Studio SHALL list the plates from the `vol3_19111914` and `vol3_1935` index layers whose
footprints intersect the project bounds, with edition, plate number, the proposed source id and
whether Buried has already aligned or published it.

4.2 THE Studio SHALL show plates whose footprints do not intersect the project bounds as
unavailable, with the reason "Outside the area Buried has today's map for".

4.3 WHEN the visitor picks a plate, THE Service SHALL download it from the URL pattern for its
edition, extract it safely, inspect its georeferencing with spec 02's inspect functions, and return
its plate ref, inspect report and a display image.

4.4 THE Service SHALL keep downloaded index plates in the raster cache so that a second request for
the same plate makes no request to U of T.

4.5 WHEN a picked plate already has a canon evidence file, THE Studio SHALL say that Buried has
published this plate, SHALL NOT offer Align, Extract, Review or Publish for it, and SHALL offer the
aerial check (requirement 12) for its published buildings.

4.6 WHEN a picked plate has a canon alignment record but no canon evidence file, THE Studio SHALL
use the canon alignment record and canon tile, show its position phrase, and skip Align.

## Requirement 5: Uploading a plate

**User story:** As a museum volunteer, I want to bring a scan Buried has never seen.

### Acceptance criteria

5.1 THE Studio SHALL accept an upload in the formats in design.md "Uploads" and send it to the
Service, which SHALL return a plate ref, an inspect report (or "no georeferencing") and a display
image. THE upload's type SHALL be `fire_insurance_plan` or `historical_map`; aerial photographs
SHALL NOT be uploaded until requirement 10.5's dependency is met.

5.2 BEFORE an upload can be aligned, THE Studio SHALL require a workspace source record for it with
type, title, `year_from`, `year_to`, licence note, attribution line, the date the visitor checked
its rights, and the visitor's statement that they may use the image this way.

5.3 IF an upload has no georeferencing, THEN THE Studio SHALL require at least 4 control points and
use only the refined fit, and SHALL NOT allow publishing from it until spec 01's Schema 1.1.0 is in
place (spec 01 task 16, requirement 26).

5.4 THE Studio SHALL tell the visitor, before upload, that the image is held by the Studio service
for at most 2 hours and is never published by Buried, and that a display copy stays in their
browser until they delete it.

5.5 WHEN the visitor leaves the Studio or deletes the upload, THE Studio SHALL ask the Service to
delete it.

## Requirement 6: Studio sources

**User story:** As the person responsible for sources, I want every plate the Studio works on to
carry a licence note and attribution line, and visitor sources never mixed into the registry.

### Acceptance criteria

6.1 WHEN the plate is registered in canon `data/sources.json`, THE Studio SHALL use the canon source
record unchanged.

6.2 WHEN an index plate is not registered, THE Studio SHALL create a workspace source record with
the source id from `structure.md` (`fip_v3_<edition year>_<plate>`), type `fire_insurance_plan`,
the edition's year range, the download URL, and the licence note and attribution line that
`sources.md` gives for the Volume 3 plates.

6.3 THE Studio SHALL give an upload the source id `ws_upload_<first 12 hex characters of the
image's SHA-256>`.

6.4 THE Studio SHALL NOT write a workspace source record to `data/sources.json`, and SHALL NOT
create a workspace source record whose id is already registered in canon.

6.5 THE Sources page SHALL list workspace source records in a separate section headed "Your
workspace", marked "Not part of Buried's published records", with their licence note and
attribution line.

6.6 THE Studio SHALL show the attribution line of every Studio source whose image is on screen.

## Requirement 7: Align

**User story:** As a reviewer, I want to line the plate up with today's map and see, as I work, how
far off its buildings may be.

### Acceptance criteria

7.1 THE Studio SHALL show the plate and today's map side by side, each with pan and zoom.

7.2 THE visitor SHALL add a control point by marking a position on the plate and a reference on the
map. THE Studio SHALL snap the reference to the nearest street intersection in
`present_toronto_intersections_2026` within 12 screen pixels, or, with building-corner mode on, to
the nearest exterior-ring vertex in `present_toronto_building_outlines_2026` within 12 screen
pixels, and SHALL refuse a reference that does not snap.

7.3 THE Studio SHALL record each control point in spec 01's `controlPoints` shape, copying the
reference coordinate, `reference_source`, `reference_kind`, `reference_feature_id` and, for a
building corner, `reference_vertex` from the present layer feature, and SHALL require a description
(for a building corner, why the person judges it is the same building).

7.4 WHEN control points are added, moved or removed, THE Studio SHALL request a fresh alignment from
the Service within 300 ms of the last change, and THE Service SHALL return the alignment record
computed by spec 02's align functions and error rule, plus the smallest position error a feature
from this plate can have.

7.5 THE Studio SHALL show the smallest feature position error with `positionPhrase` as
"Buildings from this plate: Positioned within about X m", and SHALL show the raw supplied RMSE, the
refined in-sample and leave-one-out RMSE, the chosen transform and the published alignment error on
separate, labelled lines, with per-point residuals and outlier flags.

7.6 WHILE the plate has fewer than 3 control points (4 for a plate without georeferencing), THE
Studio SHALL show "Add at least N control points" and no error figure.

7.7 THE Studio SHALL NOT compute any transform, residual or error figure itself.

7.8 THE Studio SHALL keep the control points and the latest alignment record in the workspace.

## Requirement 8: Extract

**User story:** As a reviewer, I want Buried to propose footprints for the blocks I choose.

### Acceptance criteria

8.1 THE visitor SHALL choose an extraction region on the plate as a pixel rectangle. THE Studio
SHALL limit it to the size in design.md "Extraction region".

8.2 THE Service SHALL run spec 02's extraction steps with the committed parameter set on that
region, SHALL drop any region touching the extraction region's border, SHALL drop any proposal not
inside the project bounds, and SHALL return a proposal file in the shape defined in the Service API
Schema with the counts dropped.

8.3 THE Studio SHALL draw the proposals over the plate one after another (design.md "Extract"), or
all at once with reduced motion.

8.4 THE Service SHALL refuse to extract from a plate that has no alignment record in the request or
in canon.

8.5 THE extraction region SHALL NOT change the id, geometry or score of a proposal that does not
touch its border, compared with extracting the whole plate.

## Requirement 9: Review

**User story:** As a reviewer, I want to accept, fix or reject each proposal in a few seconds, by
mouse or keyboard.

### Acceptance criteria

9.1 THE Studio SHALL offer, for the selected review item: accept, nudge a vertex, insert a vertex,
delete a vertex, merge with another item, split along a line between two of its vertices, and
reject, each with the key in design.md "Keys".

9.2 THE Studio SHALL show the selected review item with a brighter, thicker `ink` outline and its
DOM label, proposals with a dashed `ink` outline, accepted items with a solid `ink` outline, and
rejected items hidden unless "Show rejected" is on, when they have a dotted `muted` outline. Each
state SHALL also be named in text in the review list.

9.3 THE Studio SHALL edit geometry only in full-resolution plate pixels with integer vertices, and
SHALL refuse an edit that makes the polygon invalid.

9.4 THE Studio SHALL let the visitor set storeys, use, street number and material for an item, and
confidence with a reason, with the defaults in design.md "Confidence on accept". Every attribute
SHALL be recorded with the crop it was read from (spec 01 requirement 25). THE Studio SHALL NOT
offer `material` without a crop of the plate's lettering or legend that shows it, and SHALL NOT
fill any attribute from the proposal's tone class.

9.5 THE Studio SHALL record each decision in the decisions file v2 in the workspace with the
reviewer name and the time of the decision.

9.6 THE Studio SHALL let the visitor undo and redo review actions.

9.7 THE Studio SHALL list every review item in a DOM list with its id, state, kind, tone class,
area, score, weakness flags (spec 02 requirement 17.5) and recorded attributes, in the same order as
keyboard navigation. The tone class SHALL be labelled "Tone on the scan", never "Material".

9.8 THE Studio SHALL NOT let one proposal be used by more than one decision.

## Requirement 10: Tracing water and missed buildings

**User story:** As a reviewer, I want to draw the river, shorelines and creeks a plate shows, and any
building extraction missed.

### Acceptance criteria

10.1 THE Studio SHALL let the visitor trace, on a plate, a water feature as a line or a polygon, and
a building as a polygon, by placing vertices in full-resolution plate pixels.

10.2 A traced item SHALL go through the same review actions, attribute entry, decisions file and
publish path as a proposal, with kind `water` or `building`.

10.3 THE Studio SHALL NOT propose water geometry automatically.

10.4 THE `use` attribute of a water feature SHALL hold only a label printed on the source (for
example a river name), entered or confirmed by the person.

10.5 THE Studio SHALL NOT offer tracing on an aerial photograph until spec 01's Schema 1.1.0 and its
Validator checks are in place (spec 01 tasks 16 and 17, requirement 27); after that, a traced
aerial feature has its origin observation from the aerial with `method: origin`.

## Requirement 11: Label assist

**User story:** As a reviewer, I want help reading small printed labels, without the model ever
deciding anything.

### Acceptance criteria

11.1 THE Service SHALL read labels only through the label provider interface, and the first provider
SHALL be Amazon Bedrock.

11.2 WHEN the visitor asks for a label read on an item and field (storeys, use, street number or
material), THE Studio SHALL send the plate ref and a crop rectangle, and THE Service SHALL return
proposed text for that field with the provider name, model id and crop rectangle, or "not legible".
For material, the crop SHALL be of lettering or a legend entry on the plate.

11.3 THE proposed text SHALL become an attribute only when the person confirms or edits it, and THE
Studio SHALL record the label read (field, crop, provider, model id, proposed text, confirmed text,
reviewer name, time) in the workspace and in the decisions file v2.

11.4 THE label provider SHALL return text only. THE Service SHALL NOT pass any provider output into
geometry, coordinates, dates, confidence or any other field.

11.5 IF the provider has no credentials, is over its limit, or fails, THEN THE Service SHALL say so
in the response, and THE Studio SHALL show "Label reading is not available; enter labels by hand"
and keep manual entry working.

11.6 BEFORE label assist is used on an upload, THE Studio SHALL tell the visitor that the crop is
sent to Amazon Bedrock and SHALL require their consent for that upload.

11.7 THE Studio SHALL show each proposed text as plain text, never as markup, and SHALL warn when it
contains a banned word as found by `findBannedWords`.

11.8 Street numbers SHALL be kept with the review item in the workspace and the decisions file v2,
and SHALL be written to evidence as `attributes.street_number` with its attribute read once spec
01's Schema 1.1.0 is in place (spec 01 task 16); until then, not written to evidence.

## Requirement 12: Aerial observations

**User story:** As a reviewer, I want to say whether a 1947 aerial shows each building, so that
"Gone by 1947" rests on a person's look at the photograph.

### Acceptance criteria

12.1 THE Studio SHALL show, for a published building and a registered 1947 aerial with a canon tile
whose footprint covers it, the aerial beneath the building's outline, using the member of its
linked set that spec 02 requirement 13.7 names.

12.2 THE person SHALL set present or absent, and clear or obscured, with an optional note, under
their reviewer name.

12.3 FOR a workspace feature, THE Studio SHALL send the observation to the Service match endpoint as
a match decision, and SHALL store the returned evidence in the workspace.

12.4 FOR a canon feature, THE Studio SHALL NOT change canon; it SHALL add the decision to a match
decisions file in the workspace for export (requirement 16).

12.5 THE Studio SHALL show the aerial with its original colours, changing only its opacity.

## Requirement 13: Publish

**User story:** As a reviewer, I want my accepted buildings and traced water written as evidence that
passes every rule, and nothing I did not accept.

### Acceptance criteria

13.1 THE Studio SHALL NOT publish without a reviewer name and at least one reviewed area.

13.2 THE visitor SHALL draw each reviewed area on the plate as a pixel polygon and SHALL confirm the
statement "Every building this plate draws inside this area has been accepted or traced."

13.3 IF any proposal whose centroid lies inside a reviewed area is undecided, THEN THE Service SHALL
refuse to publish and name those proposals, and THE Studio SHALL list them. THE Studio SHALL run the
dry run (13.7) before enabling Publish, so the visitor sees this before publishing.

13.4 WHEN the visitor publishes, THE Studio SHALL send the Studio source, the alignment record, the
proposal file, the decisions file v2, the existing workspace evidence for the source, every other
workspace evidence file, source record and alignment record, and the data version; THE Service
SHALL build the evidence file with spec 02's publish functions (as extended in requirement 23), and
SHALL validate it with spec 01's Validator against the canon snapshot together with the workspace
state sent.

13.5 IF validation fails, THEN THE Service SHALL return the errors and no evidence file, and THE
Studio SHALL show each error next to the review item it names and SHALL store nothing.

13.6 WHEN validation passes, THE Studio SHALL store the returned evidence file in the workspace
unchanged.

13.7 THE Studio SHALL offer a dry run that returns the would-be evidence file and validation result
without storing anything, so the reviewer can see the published geometry on today's map.

## Requirement 14: The workspace

**User story:** As a visitor, I want my work kept in my browser and always marked as mine, never
passed off as Buried's records.

### Acceptance criteria

14.1 THE Studio SHALL keep all visitor work in the workspace (IndexedDB) and SHALL NOT send it
anywhere except to the Service for the request that needs it.

14.2 WHEN the Shell loads a workspace evidence file, source record, control file or alignment
record, it SHALL validate it against spec 01's Schema with Ajv, and SHALL leave out and report
any file that fails.

14.3 IF a workspace feature id equals a canon feature id, or a workspace source id is registered in
canon with different content, THEN THE Shell SHALL not draw that workspace item, and SHALL say
it conflicts with Buried's records.

14.4 Every piece of UI that shows a workspace feature (evidence card, hover label, list view, Studio
lists, Report) SHALL label it "Your workspace" with the explanation "Not part of Buried's published
records".

14.5 No canon output (the Sources page canon section, the canon sections of the Report, a share
link, a canon export) SHALL contain a workspace feature id or workspace source id.

14.6 THE visitor SHALL be able to delete the whole workspace, or one source's work, after
confirming.

## Requirement 15: Workspace features in the Explorer

**User story:** As a visitor, I want the buildings I publish to rise in the Explorer in their era.

### Acceptance criteria

15.1 THE Explorer SHALL compute Era lists with `featuresForEra` over canon and workspace evidence
together, with canon and workspace sources together, so that workspace features obey the same date
logic.

15.2 WHEN the Explorer opens with workspace features published since the visitor last viewed it,
THE Shell SHALL first load the eras without them and then send them with spec 03's
`applyEvidenceUpdate`, so that they rise into the scene.

15.3 THE Studio SHALL offer "View in Explorer" after publishing, which opens the Explorer at the
plate's era.

15.4 THE coverage area used by search, ground clicks and the Report SHALL include the `mapped_area`
of each workspace evidence file.

15.5 Workspace features SHALL be drawn exactly like canon features, and the difference SHALL be
shown in DOM text only. THE only bridge change SHALL be that a drape whose source is a workspace
source may carry a `blob:` URL (bridge version 1.1.0, design.md "Workspace drapes").

## Requirement 16: Export

**User story:** As the maintainer, I want a visitor's work in a form I can review and commit through
the normal pipeline.

### Acceptance criteria

16.1 THE Studio SHALL export, for one source, a zip with the workspace source record, control file,
alignment record, proposal file, decisions file v2, match decisions file, the evidence file and a
README with the CLI steps in design.md "Export bundle".

16.2 THE exported files SHALL be such that placing them as the README says and running
`buried publish <source id>` reproduces the exported evidence file byte for byte.

16.3 FOR an upload, THE export SHALL ask for the source id agreed in `sources.md` and SHALL rewrite
the source id and every feature id that contains it consistently.

16.4 THE Studio SHALL NOT write to the repository or to `data/`.

## Requirement 17: The held-out plate, live

**User story:** As a judge, I want the demo plate processed live, with nothing prepared ahead.

### Acceptance criteria

17.1 Plate 232 (1935) SHALL go through Import, Align, Extract, Review and Publish in the Studio with
no precomputed control points, alignment record, proposals, label reads or decisions.

17.2 A test SHALL fail if the Service package, the Service image build context or the canon
snapshot contains a control file, alignment record, proposal file, decisions file, label read or
evidence file for `fip_v3_1935_232`, or any path or text content naming `fip_v3_1935_232`,
`1935_232` or `1935-232` other than its registry entry in `data/sources.json`.

17.3 A test SHALL show that the Service's extract endpoint runs the extraction functions on every
request and has no code path that returns a stored result.

17.4 THE raster cache MAY hold the downloaded plate 232 image before the demo, because it is input,
not a result.

## Requirement 18: Today's map from Buried's own data

**User story:** As the maintainer, I want today's map drawn from the data we already hold, with no
tile provider and no key.

### Acceptance criteria

18.1 THE Studio map and the Explorer's 2D map SHALL draw today's map only from the present layers in
`data/present/`: building outlines, property boundaries and street intersections, styled with the
palette tokens.

18.2 THE map styles SHALL contain no source, glyph or sprite URL outside the site's own `/data/`
path, and no symbol layer with text. Names (for example an intersection's name) SHALL be shown as
DOM text.

18.3 THE Studio SHALL draw the project bounds on the map and say that today's map ends there.

18.4 THE Studio SHALL convert between EPSG:26917 and EPSG:4326 only through `web/src/map/edge.ts`.

## Requirement 19: Hosting and the Service being unavailable

**User story:** As a judge with a link, I want the site to work even if the Studio service is down.

### Acceptance criteria

19.1 THE static site (Shell, Unity build, fonts, `data/` contract files, tiles) SHALL be deployable
to Cloudflare Pages, and THE Service SHALL be deployable to Railway from a Dockerfile in
`pipeline/`.

19.2 THE Explorer, the Report, the Sources page and workspace features already published SHALL work
with the Service unreachable.

19.3 WHEN the Service health check fails or times out after 5 s, THE Studio SHALL say "The Studio
service is not available right now", SHALL offer the recorded walkthrough, and SHALL keep the
workspace readable.

19.4 THE recorded walkthrough SHALL have captions and a text transcript, SHALL be recorded from a
real Studio session, and SHALL contain no third-party logos or footage.

19.5 THE Service URL SHALL be set at build time for the Shell and SHALL NOT be a secret.

## Requirement 20: Keyboard, accessibility and motion

**User story:** As a keyboard or screen reader user, I want every Studio action without a mouse.

### Acceptance criteria

20.1 Every Studio action (choose plate, upload, add, move and remove a control point, choose a
region, every review action, trace, label assist, aerial check, reviewed area, publish, export)
SHALL have a keyboard path.

20.2 THE plate pane and the map pane SHALL each have a DOM list that is a text equivalent of what
they show: control points with residuals, review items with state and attributes.

20.3 THE Studio SHALL announce, through an `aria-live="polite"` region, each completed step, each
review decision ("Accepted 3 of 41"), and the new error figure when it changes.

20.4 Every interactive element SHALL have a visible focus ring, and THE Studio SHALL pass an axe scan
with no serious or critical violations.

20.5 WHILE reduced motion is on, THE Studio SHALL show proposals all at once and SHALL not animate
the maps.

## Requirement 21: Studio budget

**User story:** As a judge watching the live demo, I want each step to answer quickly enough to keep
the flow.

### Acceptance criteria

21.1 THE align endpoint SHALL answer in under 1 s at the 95th percentile for up to 30 control points.

21.2 THE extract endpoint SHALL answer in under 30 s for the largest extraction region.

21.3 THE labels endpoint SHALL answer in under 10 s, or time out and say so.

21.4 THE publish endpoint SHALL answer in under 5 s for up to 500 features in the workspace.

21.5 THE measurements SHALL be taken against the deployed Service and recorded with the date,
Railway plan, plate and region in `docs/kiro-sessions/` notes.

## Requirement 22: Tests and tooling

**User story:** As the maintainer, I want the Studio's rules proved by tests and its commands
recorded.

### Acceptance criteria

22.1 Each correctness property in design.md SHALL have a property-based test: fast-check for the
Studio and workspace, Hypothesis for the Service and the publish extensions.

22.2 Tests SHALL NOT use the network or the label provider. The provider and HTTP client SHALL be
replaced by fakes.

22.3 THE Python suite and the TypeScript suite SHALL give the same verdict on every fixture under
`data/schema/studio_api_fixtures/`.

22.4 WHEN a task adds a command (Service dev server, Service tests, Docker build, Studio end-to-end
tests), THE same change SHALL record it under "Commands" in `.kiro/steering/tech.md`.

## Requirement 23: Extensions to spec 02's publish and extract

**User story:** As the maintainer, I want the CLI and the Studio to publish merged, split and traced
items in exactly the same way.

### Acceptance criteria

23.1 THE `publish` build functions SHALL accept the decisions file v2 (accept, reject, merge, split,
trace) as well as spec 02's decisions file, and SHALL give every feature the review item id in
design.md "Review item ids" as `provenance.proposal_id`.

23.2 THE `publish` build functions SHALL build water features with id `wtr_<source id>_<NNNN>`,
land-use areas with `use_<source id>_<NNNN>` and buildings with `bld_<source id>_<NNNN>`, where NNNN
is one more than the highest sequence of any feature in the file in any status.

23.3 IF a decisions file v2 uses one proposal in more than one decision, or merges proposals into a
geometry that is not one valid polygon, THEN `publish` SHALL refuse it and name the decisions.

23.4 THE `publish` build functions SHALL write `mapped_area` as the map area (spec 02 requirement 16)
through the chosen transform, intersected with the project bounds.

23.5 THE `extract` functions SHALL accept an optional pixel region and drop every region that
touches its border.

23.6 THE CLI `buried publish` SHALL read a decisions file v2 when one is present, so that requirement
16.2 holds.

23.7 THE `publish` build functions SHALL refuse a decisions file whose reviewed area contains the
centroid of an undecided proposal, and SHALL name those proposals.

## Requirement 24: Land-use areas

**User story:** As a reviewer, I want to outline a yard or a factory lot and record its use as the
plate letters it, so that the Report's "past land use" group can say what the records show about
the ground around a building, not only about buildings.

The showcase plates letter uses on yards and lots as well as on buildings (session 007 read some of
them, for scoping only). Yards and lumber piles are hatched areas without a solid outline, so
extraction does not propose them (spec 02 requirement 17.6). No use is written into evidence, story
text, fixtures or tests from that reading: each enters only through the Studio, read from the plate
with its crop.

### Acceptance criteria

24.1 THE Studio SHALL let the visitor trace a land-use area on a plate as a polygon, in
full-resolution plate pixels, through the same trace tool, review actions, decisions file v2 and
publish path as a traced building, with kind `land_use`.

24.2 A land-use area SHALL require a `use` attribute holding the use as lettered on the plate, with
an attribute read whose crop shows that lettering (spec 01 requirement 25). THE Studio SHALL NOT
publish a land-use area without one.

24.3 THE Studio SHALL NOT propose land-use geometry automatically, and SHALL NOT classify a use (for
example as "industrial"); it records the plate's words.

24.4 THE default confidence of a land-use area SHALL be `documented` with the reason "Area and use
traced by a person from <source id>", and the reviewer may lower it.

24.5 THE Studio SHALL warn, as for any attribute, when the lettered use contains a banned word, and
say that the Report will refer to the source and crop instead of quoting it (spec 05 design "Uses
that cannot be printed").

## Requirement 25: The map area step

**User story:** As a reviewer, I want to mark once where the map content is on a plate, so that
margins, archive labels and the ruler never become proposals, tiles or coverage.

### Acceptance criteria

25.1 BEFORE Extract, THE Studio SHALL require a map area for the plate: the canon file
`data/control/map_area/<source id>.json` when it exists, else one the visitor draws as a pixel
polygon, with a description of what lies outside it and their reviewer name.

25.2 THE Studio MAY offer a starting rectangle (the image minus a margin), and SHALL show it as a
suggestion the visitor must move or confirm. THE Studio and the Service SHALL NOT detect a map area
or neatline automatically.

25.3 THE visitor MAY mark fold lines on the plate; proposals touching them are flagged
(spec 02 requirement 17.4).

25.4 THE map area SHALL be stored in the workspace in spec 01's `mapArea` shape, sent with extract
and publish requests, and included in the export bundle at `data/control/map_area/<source id>.json`.

25.5 THE Studio SHALL show the whole image, including what lies outside the map area, while the
map area is drawn, and SHALL dim (by opacity only) what lies outside it afterwards.

## Requirement 26: Where the alignment was measured

**User story:** As a reviewer, I want to see where my control points are and be warned about
buildings outside them, because the error figure was measured inside them.

### Acceptance criteria

26.1 THE Studio SHALL draw the alignment record's `control_hull` (spec 01 requirement 30) on both
the plate and today's map, labelled "Area measured by control points".

26.2 WHEN a review item lies partly or wholly outside the control hull, THE Studio SHALL show, next
to it and in the review list, "Outside the area the control points cover; the position figure was
measured elsewhere on this plate." THE warning SHALL NOT block publishing.

26.3 THE Align step SHALL show the share of the map area inside the hull, and SHALL suggest adding
control points where the share is low. (The figure comes from the Service; the Studio computes
nothing.)

## Requirement 27: What a reviewed area covers

**User story:** As a reviewer, I want to say that I checked an area for water and land use as well
as buildings, so that the Report can say "Nothing found" for those where it is true.

### Acceptance criteria

27.1 WHEN the visitor draws a reviewed area, THE Studio SHALL ask which kinds it attests: buildings
(always), and optionally water and land use, each with its own statement ("Every water feature this
plate draws inside this area has been traced.").

27.2 THE Studio SHALL write the answer as the reviewed area's `covers` (spec 01 requirement 28).

27.3 IF a reviewed area covers a kind and the plate draws an untraced feature of that kind inside
it, THEN that is the reviewer's error; THE Studio SHALL show the statement in full before the
reviewer confirms it.

## Requirement 28: The 1931-35 edition and greyscale plates in the Studio

**User story:** As a reviewer, I want the Studio to show each plate's real years and credit, and
the scan as it is.

### Acceptance criteria

28.1 THE Studio SHALL give an unregistered index plate from the `vol3_1935` layer `year_from: 1931`,
`year_to: 1935`, `years_label: "1931, revised to 1935"` and the 1935 licence note and attribution
line from `sources.md`; and one from the `vol3_19111914` layer 1911 to 1914 with
`years_label: "1911, revised to 1914"`.

28.2 THE Studio SHALL show plates in their original grey tones, changing only opacity, and SHALL
NOT show a tone class as a colour.

28.3 THE Service's documentation and `pipeline/.env.example` SHALL say that `BURIED_LABEL_MODEL_ID`
must be a vision-capable Anthropic Claude model enabled in the account's Bedrock region, and THE
Service SHALL have no default model id.
