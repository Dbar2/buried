# Kiro session 005: specs for the Studio and the Report

Agent: architect (claude-opus-5.5).

## Task

Read `.kiro/steering/`, `docs/concept-brief.md` (sections 4 and 5) and specs 01 to 03. Then:

1. Apply the answers below to `.kiro/specs/03-explorer/`.
2. Write `.kiro/specs/04-studio/` and `.kiro/specs/05-report/` (requirements, design, tasks) in the
   same format as the earlier specs.

The builder agent is working in `pipeline/` and editing `.kiro/steering/tech.md` and
`.kiro/specs/02-pipeline/tasks.md` while you work. **Do not edit any steering doc or specs 01 and
02 in this session.** Put decisions that belong in steering into a short list at the end of your
reply; they will be applied in a later session.

## Answers to the open questions from session 003

1. **Gate.** A single hand-traced footprint through a reviewed edit is acceptable for the gate only.
   It must be replaced by one published through `buried publish` before any demo.
2. **Water.** The Studio covers it (spec 04): a person traces water features (the river channel,
   shoreline, creeks) from a plate or aerial as lines or polygons, with the same provenance and
   position error as buildings. No automatic water extraction.
3. **Reference machine.** Measure on the maintainer's Apple M3 Pro laptop, and again in Chrome with
   4x CPU throttling as the stand-in for a mid-range laptop.
4. **Lantern colour.** `lantern` marks the pinned lot only. A selected feature uses a brighter,
   thicker `ink` outline plus its DOM label. Update spec 03 to match.

Accepted as written: the extra bridge messages and payload fields, heights (7.0 m today, 3.5 m per
storey), the Lantern working only at Today, no tone mapping on plates, Brotli with decompression
fallback, gate on plate 229.

## Spec 04: the Reconstruction Studio

The part that proves Buried is a tool. A person brings a plate Buried has not processed and ends
with buildings rising in the Explorer, each with provenance.

### Decisions

- **One implementation of the image work.** The Studio does not re-implement alignment or
  extraction in the browser. A small Python HTTP service, `pipeline/buried_pipeline/service/`
  (FastAPI), exposes the same pure functions the CLI uses: inspect, align (fit and error), extract
  (proposals), match, publish (validate and return evidence). The service is stateless: each
  request carries what it needs or references a plate the service can fetch.
- **Bringing a plate.** Two ways: (a) pick any plate from U of T's Volume 3 index layers (the
  service downloads it on demand from the URL patterns in `sources.md`, caches it, and refuses
  hosts outside an allowlist); (b) upload an image (size-capped; never stored after the session).
  Uploaded plates need a source record with a licence line before anything can be published from
  them.
- **Visitor work is a workspace, not the canon.** What a visitor publishes lives in a workspace
  layer in the browser (IndexedDB), validated by the same schema, drawn in the Explorer through
  `scene/addFeatures`, and exportable as an evidence file. The committed files under
  `data/evidence/` change only through the repository. The UI says which is which.
- **Flow:** Import, Align, Extract, Review, Publish, as in the brief. Align shows today's map
  (MapLibre) beside the plate; control points snap to City intersections; the error figure updates
  live using the spec 02 rule and reads "Positioned within about X m". Review is fast: accept,
  nudge a vertex, merge, split, reject, each with a key. Publishing requires a reviewer name and
  marks the reviewed area (spec 02's reviewed-area rule) so absences can be trusted later.
- **Aerial observations** are set here by a person: present or absent, clear or obscured, per
  building, with the aerial visible underneath.
- **Label reading** (storeys, use, street numbers) is assisted by a vision model behind a provider
  interface in the service. The first provider is Amazon Bedrock. Without credentials the Studio
  falls back to manual entry and says so. The model proposes text for a field; a person confirms;
  the model never touches geometry, coordinates or dates. Every proposal keeps the crop it read.
- **The held-out plate.** Plate 232 (1935) must go through this exact flow, live, with no cached
  proposals. A test asserts the service has no precomputed result for it.
- **Basemap.** Today's map in the Studio and the 2D fallback is drawn from our own data: City
  building outlines, lots and street intersections from `data/present/`, styled with the palette
  tokens. No third-party tile provider, no API key.

### Hosting, recorded here for now

Static site (shell, Unity build, tiles, evidence) on Cloudflare Pages. The Studio service on
Railway. The site must work fully for the Explorer and the Report with the service down; the
Studio then says the service is unavailable and offers a recorded walkthrough.

## Spec 05: the Report

"The documented history of this place." Follow the brief's section 5 and the honesty rules.

### Decisions

- **Entirely in the shell.** No server. Lots come from `data/present/` (property boundaries);
  address search uses the clipped address points; findings come from `web/src/evidence/`.
- **Lot position error** for City property boundaries: 1.0 m unless the dataset states otherwise;
  record the value and its reason in the design.
- **Sections, in order:** the "Buried screens; it doesn't certify." line; the core sample (one band
  per era, tap to move the Explorer there); findings in three groups (water history, past land
  use, fill and old structures), each finding with status, "on this lot" or "near this lot (within
  X m)", sources; what these records cannot tell you; before you dig (Ontario Dig Authority);
  sources with licence lines; a link back to the live view.
- **Wording is generated by templates in code**, not by an LLM, for the submission. Every sentence
  is built from evidence fields and passes the banned-word and no-unsupported-number checks.
- **PDF** is the browser's print-to-PDF from a print stylesheet that fits one Letter or A4 page.
  **Share link** encodes the lot id and era in the URL; opening it restores the same report.
- **Outside coverage:** "Not reconstructed yet." and nothing else. Inside coverage with no
  evidence: "Nothing found in these records", listing every source and year range checked.
- Works with Unity unavailable (2D fallback), and is fully usable by keyboard and screen reader.

Give both specs correctness properties and [PBT] tasks where a property is real, in particular:
publish never emits a feature the validator rejects; a workspace feature never appears as canon;
every finding sentence has a source and no banned word; "on this lot" never appears when the
shrink-the-lot test fails; the same lot and evidence always produce the same report.

## Rules for this session

- Write only inside `.kiro/specs/03-explorer/`, `.kiro/specs/04-studio/` and `.kiro/specs/05-report/`.
- No implementation code. Plain, direct English. No emoji.
- Reply with what was written, where you departed from this brief, and open questions.
