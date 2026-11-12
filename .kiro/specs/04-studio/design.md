# Design: 04 Reconstruction Studio

## Overview

```
 Browser (Cloudflare Pages site)                               Railway
 ─────────────────────────────────────────────                ──────────────────────────────────
 /studio  web/src/studio/                                      pipeline/buried_pipeline/service/
   Import ─ Align ─ Extract ─ Review ─ Publish                   FastAPI, stateless
      │        │        │        │        │                        │
      │        │        │        │        │   HTTPS + JSON         │ validates every body against
      └────────┴────────┴────────┴────────┴──────────────────────► │ data/schema/studio_api.schema.json
   service/client.ts  (Ajv on every response)  ◄────────────────── │
      │                                                            ├─ inspect, align, tile corners,
      ▼                                                            │  extract, publish, match,
 web/src/workspace/  (IndexedDB)                                   │  validate   (spec 02 / 01 code)
   Studio sources, control files, alignment records,               ├─ labels/ provider: Bedrock | none
   proposals, decisions v2, label reads, evidence,                 ├─ raster cache (plates, uploads)
   display tiles                                                   └─ canon snapshot of data/
      │                                                                (same commit as the site)
      ▼
 web/src/evidence/ featuresForEra over canon + workspace
      │
      ├──► Explorer (spec 03): workspace features rise via applyEvidenceUpdate
      └──► Report (spec 05): workspace findings in their own, labelled section

 data/ (canon) ── served read-only at /data/ ── never written by the Studio or the Service
```

- The Service runs the pipeline's pure functions. It holds no visitor state and no results.
- The Studio holds the visitor's work in their browser. That work is never canon. It reaches
  `data/` only when the maintainer takes an export bundle through the CLI and commits it.
- Every stored EPSG:26917 coordinate in the workspace comes from the Service or is copied from a
  present layer. The Studio computes screen positions for display only and never stores them.

## Hosting

Decided in this spec because the Service is the first part of Buried that needs a server
(`tech.md` leaves hosting and any API server open until a spec needs them).

| Part | Host | Why |
|---|---|---|
| Static site: Shell build, Unity build, fonts, `/data/` contract files and tiles, recorded walkthrough | Cloudflare Pages | Static files on a CDN with no server to run; per-file limit (25 MiB) and file count are well above what the site holds (Unity build under 15 MB, present layers under 5 MB each, tiles under 4096 px). |
| Studio service | Railway, from `pipeline/Dockerfile` | Runs a Docker image, so rasterio and pyogrio wheels (which bundle GDAL) work unchanged; environment variables for secrets; no server administration. |

- Unity's Brotli build keeps its decompression fallback (spec 03), so it works whether or not Pages
  sends `Content-Encoding: br` for `.br` files. `web/public/_headers` sets
  `Content-Type: application/wasm` for `.wasm` and long cache lifetimes for hashed build files.
- The Shell reads the Service URL from `VITE_STUDIO_SERVICE_URL` at build time. It is a public URL,
  not a secret.
- The Service image is built from the repository root as context, with `pipeline/.dockerignore`
  rules that include only `pipeline/buried_pipeline/`, `pipeline/pyproject.toml`, `pipeline/uv.lock`
  and the canon contract files under `data/` (`project.json`, `sources.json`, `schema/` without
  fixtures, `evidence/`, `present/`, `control/`, `alignment/`, `tiles/*.json`). It excludes
  `data/raw/`, `data/work/`, tile images, tests, docs and `.kiro/`.
- Deploys: the site and the Service are deployed from the same commit. The data version check
  (requirement 2.6) catches the case where they are not.

## Files

### Service (`pipeline/`)

| Path | Contents |
|---|---|
| `pipeline/pyproject.toml` | Optional group `service`: `fastapi`, `uvicorn[standard]`, `python-multipart`, `boto3`. Dev: `pathspec` (for the build-context guard test). |
| `pipeline/buried_pipeline/service/app.py` | FastAPI app factory, routes, CORS, body size limit, error body. No logic beyond calling the modules below. |
| `pipeline/buried_pipeline/service/config.py` | Reads environment variables (table in "Configuration"). |
| `pipeline/buried_pipeline/service/contract.py` | Loads `studio_api.schema.json` and `evidence.schema.json`; validates request bodies; serialises responses. |
| `pipeline/buried_pipeline/service/data_version.py` | Pure: the data version rule over a list of `(path, bytes)`. |
| `pipeline/buried_pipeline/service/snapshot.py` | Loads the canon snapshot at startup, computes its data version. |
| `pipeline/buried_pipeline/service/overlay.py` | Pure: builds the would-be `data/` state from the canon snapshot and a workspace state. |
| `pipeline/buried_pipeline/service/plates.py` | Plate index query, URL building (spec 02 patterns), allowlist, download through spec 02's HTTP client and safe unzip. |
| `pipeline/buried_pipeline/service/uploads.py` | Upload checks (size, format, pixel count, zip rules), plate ref. |
| `pipeline/buried_pipeline/service/raster_cache.py` | Content-addressed cache on local disk, LRU for index plates, 2 h TTL for uploads. |
| `pipeline/buried_pipeline/service/images.py` | Display image and crops (spec 02 tile downsample rules), label crops. |
| `pipeline/buried_pipeline/service/limits.py` | In-memory rate limits per client address and the daily label cap. |
| `pipeline/buried_pipeline/service/workspace_match.py` | Pure: runs spec 02 match over the overlay and keeps only results that change workspace features alone. |
| `pipeline/buried_pipeline/service/labels/provider.py` | `LabelProvider` protocol, `LabelResult`, output parsing per field. |
| `pipeline/buried_pipeline/service/labels/bedrock.py` | Amazon Bedrock provider (Converse API). |
| `pipeline/buried_pipeline/service/labels/none.py` | Provider used when unconfigured: always `unavailable`. |
| `pipeline/buried_pipeline/service/labels/prompt.py` | The fixed prompt per field. |
| `pipeline/buried_pipeline/publish/decisions_v2.py` | Pure: decisions file v2 to the items `publish/build.py` builds; review item ids. |
| `pipeline/buried_pipeline/publish/build.py` | Extended (requirement 23). |
| `pipeline/buried_pipeline/extract/region.py` | Pure: region crop and border drop, inside the map area. |
| `pipeline/Dockerfile`, `pipeline/.dockerignore` | Service image. |
| `pipeline/.env.example` | Variable names only. |
| `pipeline/tests/service/**` | Service tests, fakes for HTTP and the label provider. |

### Shell (`web/`)

| Path | Contents |
|---|---|
| `web/src/studio/StudioPage.tsx` | Route `/studio`; step bar; health check; unavailable state with the walkthrough. |
| `web/src/studio/service/client.ts` | The only module that calls the Service. Adds `api_version` and data version, applies timeouts, validates every response with Ajv. |
| `web/src/studio/service/types.generated.ts` | Types from the Service API Schema. Never hand-edited. |
| `web/src/studio/import/PlatePicker.tsx`, `UploadForm.tsx` | Index list and upload form. |
| `web/src/studio/import/studioSources.ts` | Pure: Studio source record for a canon, index or upload plate. |
| `web/src/studio/plate/PlatePane.tsx`, `plateView.ts` | Plate image, zoom, crops; pure display-to-pixel mapping. |
| `web/src/map/presentLayers.ts` | Pure: MapLibre style layers from the present layers and palette tokens. Shared with spec 03's `MapView2D`. |
| `web/src/studio/map/MapPane.tsx` | MapLibre map with `presentLayers`, the plate drape and Studio overlays. |
| `web/src/studio/align/snapping.ts` | Pure: nearest intersection or building vertex within 12 screen px. |
| `web/src/studio/align/controlPoints.ts` | Pure: control point list edits to the `controlPoints` shape. |
| `web/src/studio/align/AlignView.tsx`, `ErrorPanel.tsx` | Align step and the error figures. |
| `web/src/studio/extract/ExtractView.tsx`, `region.ts` | Region choice and size limit. |
| `web/src/studio/review/reviewModel.ts` | Pure reducer: review items, actions, undo and redo, decisions file v2. |
| `web/src/studio/review/geometryOps.ts` | Pure: nudge, insert, delete, merge, split in integer plate pixels (JSTS for validity and union). |
| `web/src/studio/review/keymap.ts` | Key bindings. |
| `web/src/studio/review/ReviewView.tsx`, `ReviewList.tsx`, `AttributeForm.tsx` | Review UI. |
| `web/src/studio/trace/TraceTool.tsx` | Tracing water and buildings. |
| `web/src/studio/labels/LabelAssist.tsx` | Label assist UI and consent. |
| `web/src/studio/aerial/AerialCheck.tsx` | Aerial observations. |
| `web/src/studio/publish/PublishView.tsx` | Reviewer name, reviewed areas, dry run, publish, "View in Explorer". |
| `web/src/workspace/db.ts` | IndexedDB access (`idb`). The only module that touches IndexedDB. |
| `web/src/workspace/load.ts` | Load, Ajv-validate and conflict-check workspace files. |
| `web/src/workspace/merge.ts` | Pure: canon plus workspace for display; `originOf(id)`. |
| `web/src/workspace/seen.ts` | Pure: which workspace features the Explorer has not shown yet. |
| `web/src/workspace/exportBundle.ts` | Pure: the export zip contents (`fflate`). |
| `web/src/workspace/dataVersion.ts` | Pure: the data version rule (same as Python). |
| `web/vite/dataPlugin.ts` | Extended: computes `data_version` into `/data/index.json`. |
| `web/public/walkthrough/` | The recorded walkthrough (MP4, WebVTT captions, transcript HTML). |
| `web/public/_headers` | Cloudflare Pages headers. |
| `web/e2e/studio*.spec.ts` | End-to-end tests against a local Service in test mode. |

### Shared (`data/schema/`)

| Path | Contents |
|---|---|
| `data/schema/studio_api.schema.json` | The Service API Schema. |
| `data/schema/studio_api_fixtures/valid/<def>/*.json`, `invalid/<def>/<reason>.json` | Conformance fixtures, read by both suites. |

## Data version

```
data_version = lowercase hex SHA-256 of the UTF-8 text made of one line per file:
               "<path relative to data/>\t<lowercase hex SHA-256 of the file's bytes>\n"
               for every file in: project.json, sources.json, evidence/*.geojson,
               present/*.geojson, control/*.json, alignment/*.json, tiles/*.json
               sorted by path (byte order).
```

The Vite data plugin computes it at build (and in dev on each change) and writes it to
`/data/index.json` as `data_version`. The Service computes it over its snapshot at startup. Both
implementations are tested against the same fixture tree and expected value.

## Service API

### Conventions

- Prefix `/v1`. JSON bodies use snake_case like the contract files.
- Every JSON request carries `api_version`. Requests that depend on canon also carry
  `data_version`.
- Files that are later hashed or exported (control file, alignment record, proposal file, evidence
  file) travel as text, in the canonical serialisation: `json.dumps(obj, sort_keys=True, indent=2,
  ensure_ascii=False) + "\n"`. The Studio stores and exports that text verbatim and never
  re-serialises it, so SHA-256 values and byte-identical exports hold.
- Error body: `{ "error": { "code": string, "message": string, "details": [...] } }`. Codes:
  `invalid_request`, `version_mismatch`, `data_version_mismatch`, `not_allowed`, `too_large`,
  `rate_limited`, `not_found`, `no_georeferencing`, `validation_failed`, `upstream_failed`,
  `timeout`.

### Endpoints

| Method and path | Request | Response |
|---|---|---|
| `GET /v1/health` | none | `{ api_version, service_version, data_version, label_provider: "bedrock" \| "none", limits }` |
| `GET /v1/plates/index` | none | `{ plates: [{ edition: "1911" \| "1935", plate: int, name, source_id, footprint: Polygon (EPSG:26917), in_bounds: bool }] }`, from the two index layers, cached in memory for 24 h. |
| `POST /v1/plates/fetch` | `{ api_version, source_id }` | `{ plate_ref, source_id, inspect, image: { width_px, height_px, full_width_px, full_height_px } }` |
| `POST /v1/uploads` | multipart: one file | `{ plate_ref, georeferenced: bool, inspect \| null, image: {...} }` |
| `DELETE /v1/uploads/{plate_ref}` | none | 204 |
| `GET /v1/plates/{plate_ref}/image` | none | JPEG, long edge at most 4096 px, spec 02 tile downsample (area averaging, quality 85, no colour change) |
| `GET /v1/plates/{plate_ref}/crop?x&y&w&h&max` | full-resolution pixel rectangle, `w`, `h` at most 4096, `max` at most 2048 | JPEG of that rectangle, long edge at most `max` |
| `POST /v1/align` | `{ api_version, data_version, plate_ref, source, control_file_text }` | `{ control_file_text, alignment_record_text, min_feature_position_error_m, digitising_error_m, tile_sidecar }` or 422 |
| `POST /v1/extract` | `{ api_version, data_version, plate_ref, source, alignment_record_text, region_px }` | `{ proposal_file_text, dropped: { touching_region_border: int, outside_project_bounds: int } }` |
| `POST /v1/labels` | `{ api_version, plate_ref, crop_px, field: "storeys" \| "use" \| "street_number", consent: bool }` | `{ status: "proposed" \| "not_legible" \| "unavailable", reason?, provider, model_id?, crop_px, text? }` |
| `POST /v1/match` | `{ api_version, data_version, workspace, match_decisions }` | `{ evidence_files: [{ source, text }], review: [...], suggested_for_canon: [...] }` |
| `POST /v1/publish` | `{ api_version, data_version, dry_run: bool, source_id, workspace, proposal_file_text, decisions }` | `{ ok: true, evidence_file_text, counts }` or `{ ok: false, errors: [{ path, feature_id?, review_item_id?, pointer, reason }] }` |

`workspace` is `{ sources: [source], control_files: [text], alignment_records: [text],
evidence_files: [text], tile_sidecars: [tileSidecar] }`: every workspace file the overlay needs.

### Align

1. Parse `control_file_text` against `controlPoints`; check references against the canon present
   layers with spec 02's `align/references.py`.
2. Read the raster from the cache (plate ref) and its supplied georeferencing (spec 02 inspect).
3. Run spec 02's align functions: supplied residuals, refined fit when 4 or more points, LOO,
   choice, error basis, `alignment_error_m`, outliers. For an upload without georeferencing, only
   the refined fit (see "Dependencies on other documents").
4. `digitising_error_m = max(1.0, 2 × source_pixel_size_m)` and
   `min_feature_position_error_m = ceil_0.1(sqrt(alignment_error_m² + digitising_error_m²))`,
   computed by the same function `publish/build.py` uses.
5. Tile corners through spec 02's `tile/corners.py`, with the bilinear check, as a `tileSidecar`
   whose `image` names the display JPEG.
6. `control_file` in the record is `data/control/<source id>.json`, the path it has after export;
   `control_sha256` is the SHA-256 of the canonical text returned.

The alignment record carries `measured_at`, so two align calls give different texts. The Studio
freezes one record when the visitor chooses "Use this alignment". Extraction and publish use that
frozen text. Changing control points afterwards asks to discard the proposals, because spec 02
refuses to publish proposals made under a different alignment record.

### Extraction region

- `region_px` is a full-resolution pixel rectangle. Each side is at most `MAX_REGION_SIDE_M = 300` m
  (side in pixels × `source_pixel_size_m`). This is a few blocks, and the limit is set so extraction
  stays under 30 s on the Service; the value is checked by measurement (task 10.2) and changed here
  if needed.
- `extract/region.py`: read the region from the raster at the working pixel size, run spec 02's
  steps 2 to 7 on it, and drop every region whose pixels touch the crop border. Proposal ids use
  full-resolution pixel polygons, so an interior proposal has the same id, geometry and score as in
  a whole-plate run (property S13).
- Map area: the request carries the plate's map area (canon file or workspace, requirement 25), and
  extraction works inside it on the whole plate and on a region alike. There is no neatline
  detection (spec 02 requirement 16.5), so the proposal file header carries the map area even when
  the region does not reach it.
- Proposals not inside the project bounds are dropped and counted.

### Raster cache

- Directory `BURIED_CACHE_DIR` on the container's local disk, cleared at startup for uploads.
- Key: plate ref (SHA-256 of the raster file bytes after unzip). For index plates, also a map from
  download URL to plate ref, so a repeated fetch makes no request.
- Index plates: kept until the cache exceeds `BURIED_CACHE_MAX_BYTES`, then least recently used
  first.
- Uploads: deleted on `DELETE`, after 2 h without use, or on restart.
- Derived display JPEGs are kept with their raster. They are a downsample of the input, not a
  result of any request.
- Nothing from align, extract, labels, match or publish is written to the cache (requirement 1.5).

### Plate index and fetch

- Index: ArcGIS REST `query` on the `vol3_19111914` and `vol3_1935` layers named in `sources.md`
  (`where=1=1`, `outFields` as listed there, `outSR=26917`, `f=json`), through spec 02's HTTP
  client. `in_bounds` is `footprint ∩ project bounds` non-empty.
- `source_id` must match `^fip_v3_(1911|1935)_\d+$`, name a plate in the index, and be `in_bounds`.
- The URL is built from the edition's pattern in `sources.md` (the same function as spec 02
  `fetch/plates.py`, so the URL guard is the same) and checked against the host allowlist.
- One download at a time; the same User-Agent as spec 02.

### Uploads

- Accepted: a GeoTIFF (`.tif`, `.tiff`); a JPEG or PNG (no georeferencing); a zip holding one such
  image plus optional `.tfw`, `.jgw`, `.pgw`, `.wld`, `.prj` or `.aux.xml`, extracted with spec 02's
  `zipsafe`.
- Limits: `BURIED_MAX_UPLOAD_BYTES` (default 300 MB), `BURIED_MAX_PIXELS` (default 400,000,000).
  The pixel count is read from the header before any pixel is decoded.
- GDAL opens files with only the GTiff, JPEG and PNG drivers allowed and with
  `GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR`, so it cannot be pointed at other files or formats.
- No georeferencing: allowed (`georeferenced: false`), unlike CLI `inspect`, which refuses. The
  Studio then needs the refined-only path.

### Limits

Per client address (the first `X-Forwarded-For` hop set by Railway's proxy), in memory, per hour:

| Endpoint | Limit |
|---|---|
| plates/fetch | 10 |
| uploads | 5 |
| align | 900 |
| extract | 30 |
| labels | 120, and `BURIED_LABEL_DAILY_CAP` (default 1000) for the whole Service per UTC day |
| match, publish | 120 |
| image, crop | 3000 |

At most 2 extractions run at once; more wait up to 10 s, then get 429. Counters hold only counts
and expire within the hour.

### Configuration

| Variable | Use |
|---|---|
| `BURIED_ALLOWED_ORIGINS` | Comma-separated origins for CORS. |
| `BURIED_CACHE_DIR`, `BURIED_CACHE_MAX_BYTES` | Raster cache. |
| `BURIED_MAX_UPLOAD_BYTES`, `BURIED_MAX_PIXELS` | Upload limits. |
| `BURIED_LABEL_PROVIDER` | `bedrock` or `none` (default `none`). |
| `BURIED_LABEL_MODEL_ID` | Bedrock model id. Must be a vision-capable Anthropic Claude model enabled in the account's Bedrock region. No default: the maintainer sets it. |
| `BURIED_LABEL_DAILY_CAP` | Daily label cap. |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Bedrock credentials, as Railway secrets. |
| `BURIED_TEST_MODE`, `BURIED_TEST_PLATES_DIR` | End-to-end tests only: serve synthetic plates from a local directory instead of U of T. Refused at startup unless `BURIED_TEST_MODE=1`, and the health body then says `test_mode: true`. |

The Bedrock credentials belong to an IAM user or role allowed only `bedrock:InvokeModel` on the one
model.

### Label provider

```python
class LabelProvider(Protocol):
    name: str
    def read(self, crop_png: bytes, field: Literal["storeys", "use", "street_number"]) -> LabelResult: ...

LabelResult = { status: "proposed" | "not_legible" | "unavailable", text: str | None,
                model_id: str | None, reason: str | None }
```

- Crop: the full-resolution rectangle, long edge at most 1024 px, PNG.
- Bedrock: `bedrock-runtime` Converse API, one image block and the fixed prompt for the field,
  temperature 0, at most 64 output tokens, 10 s timeout, no retry. The prompt asks only for a
  transcription of the printed text for that field and a JSON reply `{"legible": bool, "text":
  string | null}`.
- Parsing (`provider.py`, shared by every provider): the reply must be that JSON and nothing else.
  `storeys`: `^\d{1,2}$`, value 1 to 20. `use`: 1 to 80 characters, no control characters.
  `street_number`: `^\d{1,5}([A-Za-z]|[-–]\d{1,5})?$`. Anything else becomes `not_legible`. Output is
  never interpreted further.
- Consent: for an upload source, `consent` must be true or the request is refused. Index plates are
  out-of-copyright library scans, and the Studio tells the visitor once that crops are sent to
  Amazon Bedrock.
- `none`: always `unavailable` with reason "Label reading is not configured".

### Workspace overlay and validation

`overlay.py` builds the would-be `data/` state: the canon snapshot, plus each workspace file at the
path it would have after export (`sources.json` gains the workspace source records,
`control/<id>.json`, `alignment/<id>.json`, `evidence/<id>.geojson`, `tiles/<id>.json`). Spec 01's
Validator checks run on that state unchanged. Overlay refuses, before validation:

- a workspace source id registered in canon (unless the record is identical to canon's);
- a workspace alignment record for a source with a canon alignment record;
- a workspace evidence file for a source with a canon evidence file (requirement 4.5).

Publish (`dry_run` or not): parse inputs, run `publish/build.py` with the decisions file v2, put the
result in the overlay, validate, return the canonical text or the errors. Each error that names a
feature or decision carries its review item id, so the Studio can show it next to the item.

### Workspace match

`workspace_match.py`:

1. Build the overlay with the match decisions file (workspace decisions only).
2. Run spec 02 match over it (`match/apply.py` and `match/rules.py`, unchanged).
3. Keep the result for workspace evidence files. Discard every change to canon files.
4. A workspace feature whose new `match_auto` presence or link points at a canon feature loses that
   presence and link (canon cannot gain the mirror). The pair goes to `suggested_for_canon`, for a
   person to decide through the export bundle.
5. Validate the overlay with canon unchanged and the kept workspace changes. Return the workspace
   evidence texts.

So a workspace feature can gain clear absences and `not_covered` results from canon plates, person
observations from aerials, and links to other workspace features, but never a link to canon.

### Held-out plate

- The Service has no stored result of any kind (requirement 1.5).
- `tests/service/test_held_out_service.py` builds the image build context file list from
  `pipeline/.dockerignore` with `pathspec`, and fails if any path, or the text of any file, names
  `fip_v3_1935_232`, `1935_232` or `1935-232`, except the registry entry in `data/sources.json`.
  This covers the canon snapshot: no control file, alignment record, evidence file or tile sidecar
  for plate 232 may be committed before the demo. After the demo, committing plate 232's evidence
  is a reviewed change that also updates this test's allowed list.
- A second test calls the extract endpoint twice for a synthetic plate with a spy on spec 02's
  extraction entry point and asserts it ran both times.

## Extensions to spec 02

### Decisions file v2

Defined in the Service API Schema as `decisionsV2`:

```
{ "version": 2, "source": sourceId,
  "decisions": [ decision, ... ],
  "reviewed_areas": [ { "pixel_polygon": [[x, y], ...], "confirmed_by", "confirmed_at" } ],
  "label_reads": [ labelRead, ... ],
  "street_numbers": [ { "review_item_id", "text", "label_read_index"?, "confirmed_by", "confirmed_at" } ] }

decision (every type also has confirmed_by, confirmed_at):
  { "type": "accept", "proposal_id", "pixel_polygon"?, "attributes"?, "confidence"?,
    "confidence_reason"?, "position_error_m"? }
  { "type": "reject", "proposal_id", "reason"? }
  { "type": "merge", "proposal_ids": [≥ 2, sorted], "pixel_polygon", "attributes"?, "confidence"?,
    "confidence_reason"?, "position_error_m"? }
  { "type": "split", "proposal_id", "parts": [ { "pixel_polygon", "attributes"?, "confidence"?,
    "confidence_reason"?, "position_error_m"? }, ≥ 2 ] }
  { "type": "trace", "kind": "building" | "water",
    "pixel_geometry": { "type": "Polygon" | "LineString", "coordinates": integer pixels },
    "attributes"?, "confidence", "confidence_reason", "position_error_m"? }

labelRead = { "review_item_id", "field": "storeys" | "use" | "street_number",
              "crop_px": { x, y, width, height }, "provider", "model_id",
              "proposed_text" | null, "status", "confirmed_text" | null,
              "confirmed_by", "confirmed_at" }
```

- `trace` with `kind: building` must be a Polygon. Water may be either.
- Spec 02's decisions file (with `decision` instead of `type`) is still read; it means `accept` or
  `reject`.
- `publish` refuses a file where one proposal id appears in more than one decision
  (requirement 23.3).
- `publish` refuses when a reviewed area contains the centroid (in pixels) of a proposal that has
  no decision (requirement 23.7). The Studio does not compute this itself; it shows the list from
  the dry run.

### Review item ids

Stored as `provenance.proposal_id` (a string in spec 01's Schema, so no Schema change is needed).

| Item | Review item id |
|---|---|
| Accepted proposal | the proposal id (`<source id>_p_<12 hex>`, spec 02) |
| Split part k (1-based, in the order given) | `<proposal id>_s<k>` |
| Merge | `<source id>_m_` + first 12 hex of SHA-256 of the sorted proposal ids joined by `,` |
| Trace | `<source id>_t_` + first 12 hex of SHA-256 of `kind`, geometry type and the integer pixel coordinates, in canonical JSON |

`publish` skips any item whose review item id is already in the file, so publishing twice gives the
same file (spec 02 requirement 10.7 carries over). `extraction_params_id` is set for accept, merge
and split, and absent for trace.

### Building features from v2 decisions

As spec 02 "Building features", with these changes:

- geometry: the decision's pixel geometry (or the proposal's) through the chosen transform;
- `kind`: `building`, `water` for a water trace, or `land_use` for a land-use trace; id prefix
  `bld_`, `wtr_` or `use_`; the sequence is one more than the highest sequence of any feature in
  the file in any status;
- `material`: only from the decision's attributes with an attribute read (spec 02 requirement
  20.3); never from the proposal. The proposal's `tone_class` goes to `provenance.tone_class` for
  accept and split, and for merge only when every merged proposal has the same tone class;
- `crop_px`: the bounding box of the pixel geometry;
- confidence: the decision's, else the defaults in "Confidence on accept";
- `mapped_area`: the map area through the chosen transform (`method: map_area`), intersected with
  the project bounds, so that a
  plate reaching past the bounds still passes spec 01 requirement 7.5. Spec 02 never meets this
  case, because the bounds contain the four showcase plates.

### Confidence on accept

Defaults the Studio fills in and the reviewer may change:

| Item | Default confidence | Default reason |
|---|---|---|
| Building with confirmed storeys | `documented` | "Footprint and storeys read from <source id>" plus, when label assist proposed the storeys, "; storeys from a machine-read label confirmed by a person" |
| Building without storeys | `estimated` | "Footprint read from <source id>; storeys not recorded" (spec 02's default) |
| Water trace | `documented` | "Traced by a person from the water drawn on <source id>" |
| Land-use trace | `documented` | "Area and use traced by a person from <source id>" (requirement 24.4) |

These strings are fixed templates in `reviewModel.ts` and pass `findBannedWords`.

## Studio sources

`studioSources.ts`:

- **Canon plate** (in `data/sources.json`): the canon record, unchanged. This includes the held-out
  plate `fip_v3_1935_232`.
- **Index plate not in canon**: `{ id: "fip_v3_<edition>_<plate>", type: "fire_insurance_plan",
  title: "Goad fire insurance plan, Vol 3, plate <n>, <edition label>", year_from, year_to, url:
  <download URL from the pattern>, licence_note: <the Volume 3 note in sources.md>,
  attribution_line: <the Volume 3 line in sources.md>, attribution_status: "confirmed",
  rights_checked_on: null, held_out: false }`. Edition years: the `vol3_19111914` layer gives 1911
  to 1914 (`years_label` "1911, revised to 1914"), `vol3_1935` gives 1931 to 1935 (`years_label`
  "1931, revised to 1935", the 1935 licence note and attribution line; requirement 28.1).
  `rights_checked_on` stays null because no person has
  checked that item's rights statement; the Sources page says "Rights not checked for this item;
  U of T labels the Volume 3 plates out of copyright (collection checked 2026-11-10)."
- **Upload**: `{ id: "ws_upload_<12 hex>", type, title, year_from, year_to, url: "upload:<plate
  ref>", licence_note, attribution_line, attribution_status: "confirmed", rights_checked_on: <date
  the visitor entered>, held_out: false }`, from the form, with the visitor's statement stored in
  the workspace alongside.

The licence note and attribution line for Volume 3 are constants in `studioSources.ts`, copied from
`sources.md` and checked equal to the canon records of the showcase plates by a test (code does not
read steering docs).

If a source's year range contains no era's range, the Studio says: "No Explorer era falls within
<years>. Buildings from this source will not appear in the Explorer. They will appear in the
Report." This follows spec 01 requirement 12.1 and is not an error.

## Studio UI

### Layout and steps

A step bar: Import, Align, Extract, Review, Publish. Each step is reachable when its inputs exist,
and the workspace keeps each source's progress, so a visitor can leave and return. The plate pane is
on the left, today's map on the right; at narrow widths they stack and a toggle switches between
them.

### Plate pane

- Shows the display JPEG; zooming past 1:1 of the display image requests full-resolution crops for
  the visible rectangle (debounced 150 ms).
- `plateView.ts` (pure) maps between screen, display and full-resolution pixels (GDAL corner
  convention). Vertex positions are rounded to whole full-resolution pixels.
- Overlays (canvas): control points, the extraction region, review items, traces, reviewed areas.

### Today's map

`presentLayers.ts` builds MapLibre layers from the present layers in the canon `/data/present/`
files, with every position converted by `edge.ts`:

| Layer | Look |
|---|---|
| Background | `night` |
| Building outlines | fill `present`, outline `muted` at 0.6 opacity |
| Property boundaries | `muted` line, 1 px, 0.5 opacity |
| Intersections | `muted` circles, radius 3 px |
| Project bounds | `muted` dashed line; DOM note "Today's map ends here" |
| Plate drape | MapLibre `image` source with the tile sidecar corners, raster opacity only |
| Review items (from the dry run) | the review states in requirement 9.2 |

No symbol layers, so no glyphs or sprites. Names are DOM text in hover cards. `lantern` is not
used in the Studio map: a selected control point or review item gets the brighter, thicker `ink`
outline and its DOM label, as in spec 03 (session 005). The pinned lot does not exist in the
Studio. Spec 03's `MapView2D` uses the same `presentLayers.ts` for its present-day layers.

### Align

- Add a point: place on the plate (click, or a keyboard cursor moved with arrows), then on the map.
- `snapping.ts`: projects candidate intersections (or exterior-ring vertices of building outlines
  in building-corner mode) to screen with the map's own projection, takes the nearest within
  12 px, and returns the feature id, kind and stored coordinate. The stored `reference` is the
  layer's coordinate, copied (property S6).
- A description field is required; for a building corner the placeholder asks why it is the same
  building.
- Live error: 250 ms after the last change, `POST /v1/align`; a newer response supersedes an older
  one. `ErrorPanel` shows `positionPhrase(min_feature_position_error_m)` as "Buildings from this
  plate: Positioned within about X m", then on separate labelled lines: supplied RMSE, refined
  in-sample RMSE, refined leave-one-out RMSE, chosen transform, published alignment error ("the
  plate's alignment error, used for every building from it"), and per-point residuals with
  outlier flags. The figure is announced through the live region when it changes.
- "Use this alignment" freezes the record. For a plate with a canon alignment record, Align is
  skipped and the panel shows the canon figures.

### Extract

The visitor draws the region rectangle on the plate; the Studio shows its size in metres (from
`source_pixel_size_m`) and refuses more than 300 m a side. Proposals come back and draw on one by
one, 40 ms apart, capped at 2 s in total; with reduced motion they appear at once. Dropped counts
are shown as text.

### Review

`reviewModel.ts` is a pure reducer over `{ proposals, traces, decisions, selection, mode, history }`.
Every action returns a new state; undo and redo walk `history`. It emits the decisions file v2.

#### Keys

Active while focus is in the review region and not in a text field. `?` shows the list.

| Key | Action |
|---|---|
| J / K | Next / previous review item (the review list order) |
| A | Accept |
| R | Reject |
| E | Edit vertices on or off |
| Tab / Shift+Tab (edit) | Next / previous vertex |
| Arrows (edit) | Move vertex 1 px; with Shift 10 px |
| I (edit) | Insert a vertex at the midpoint of the edge after the current vertex |
| Delete (edit) | Delete the current vertex (at least 3 remain) |
| M, then J / K, then Enter | Merge the item with the chosen neighbour; Escape cancels |
| S (edit), Space on two vertices, Enter | Split along the line between the two vertices |
| T | Trace a building |
| W | Trace water; P switches line or polygon; Space places a vertex at the cursor; Enter finishes |
| L | Label assist for the current item |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z | Undo, redo |

#### Geometry operations (`geometryOps.ts`)

All in integer full-resolution pixels, polygons without holes (extraction traces outer contours):

- nudge, insert, delete: change one vertex; refuse if the result is not a valid polygon (JSTS
  `isValid`) or has fewer than 3 distinct vertices;
- merge: JSTS union of the polygons; refuse unless the result is one Polygon; round vertices to
  integers and refuse if the rounded polygon is invalid, with "These outlines cannot be merged
  cleanly; move their vertices so they share an edge";
- split: the chord between two non-adjacent vertices must lie inside the polygon (JSTS `within`
  on the polygon, touching only at its two end vertices); the two parts are the two vertex runs.
  Their vertices are original vertices, so their areas sum exactly to the original (property S7).

Review states are drawn as in requirement 9.2 and named in `ReviewList`.

### Tracing

`TraceTool` places vertices on the plate pane (click, or cursor and Space). A traced item enters
the review list as a review item with state "traced" and goes through attributes, label assist and
decisions like any other. Tracing is offered on plates only (requirement 10.5).

### Label assist

`L` or the button on the attribute form asks which field, sends the item's crop rectangle (its
bounding box grown by 20 px, clamped to the plate) and shows the proposed text in a plain text
field with Confirm and Edit. Nothing changes until Confirm. The label read is recorded either way
(with `confirmed_text: null` when dismissed). If `findBannedWords` finds a banned word, the form
warns "This label contains a word Buried's reports do not print; the Report will refer to the
source instead" (spec 05). When the Service reports `unavailable`, the form says "Label reading is
not available; enter labels by hand." For uploads, a consent dialog appears once per upload.

### Aerial check

Lists published buildings (workspace and canon) whose linked set has a pending aerial item: a
registered 1947 aerial with a canon tile whose footprint covers the feature and no person
observation from that aerial yet. For each, the aerial tile is shown at full opacity, original
colours, with the feature outline (from the member spec 02 requirement 13.7 names) in `ink` over
it, and a keyboard-reachable form: present or absent, clear or obscured, note. Workspace features
go to `POST /v1/match`; canon features go to the workspace match decisions file for export
(requirement 12.4).

### Publish

- Reviewer name (kept in workspace settings; required).
- Reviewed areas: drawn on the plate as polygons, each with the checkbox statement in requirement
  13.2. The default suggestion is the extraction region.
- Dry run: `POST /v1/publish` with `dry_run: true` on entering the step and after each change.
  It shows the would-be features on today's map, the counts, and any errors next to their items,
  including undecided proposals inside reviewed areas.
- Publish: the same request with `dry_run: false`; on `ok`, store `evidence_file_text` and the tile
  sidecar and display image in the workspace, then offer "View in Explorer".

## Workspace

### Stores (`db.ts`, IndexedDB database `buried-workspace`, version 1)

| Store | Key | Value |
|---|---|---|
| `sources` | source id | source record, plus the visitor's statement for uploads |
| `files` | path (`control/<id>.json`, `alignment/<id>.json`, `evidence/<id>.geojson`, `work/proposals/<id>.geojson`, `work/review/<id>.json`, `work/review/match.json`) | `{ text, updated_at }` |
| `images` | source id | `{ jpeg: Blob, sidecar: tileSidecar }` |
| `progress` | source id | step, frozen alignment, plate ref, UI state |
| `seen` | feature id | time first shown in the Explorer |
| `settings` | key | reviewer name, consents |

### Loading (`load.ts`)

At Shell startup (Explorer, Report and Studio alike): read every store, validate each file with
Ajv against its spec 01 definition, then check against canon:

- workspace feature id equal to a canon feature id: item left out, problem "conflicts with
  Buried's records";
- workspace source id registered in canon with a different record: every item citing it left out;
- workspace evidence for a source that now has canon evidence: left out, with "Buried has now
  published this plate".

Problems are listed in the Studio and as one status line in the Explorer.

### Display merge (`merge.ts`)

`mergeForDisplay(canon, workspace) → { collections, sources, sidecars, originOf(featureId |
sourceId): "canon" | "workspace" }`. The Explorer, the 2D map and the Report call
`featuresForEra`, `linkedSets` and `lotRelation` on the merged collections. Every view model that
renders a feature (spec 03 `cardModel`, `FeatureList`, `HoverLabel`; spec 05 report sections)
takes `originOf` and adds the label "Your workspace" and the line "Not part of Buried's published
records" for workspace items. Canon-only outputs (share links, the Report's canon sections, the
Sources page canon section, the export of canon match decisions) are built from canon inputs only,
not by filtering the merge, so a workspace id cannot leak into them.

### Workspace drapes

Workspace sources have tiles only in IndexedDB. `drapesForEra` (spec 03) receives the merged
sidecars, and for a workspace sidecar the Shell sets the drape `url` to a `blob:` URL made from the
stored JPEG (revoked on unload). Spec 03's Bridge Schema allows only `/data/tiles/` URLs, so this
spec changes the drape `url` pattern to `^(/data/tiles/[^/]+|blob:.+)$` and the bridge version to
`1.1.0`, with fixtures, the C# parser pattern and an end-to-end test that the Player loads a
`blob:` texture.

### Rising into the Explorer (`seen.ts`)

On mount, the Explorer splits the merged collections into "seen" and "unseen" (published workspace
features not in the `seen` store). It loads eras with the seen set. After `eraLoaded` for the era
being shown, it calls spec 03's `applyEvidenceUpdate` with the full merged set, so unseen features
arrive by `scene/addFeatures` and rise (or fade in, with reduced motion), and then records them as
seen. "View in Explorer" opens `/?era=<era id>` (the deep link is added in spec 05), where the era
is the first, from the earliest, whose range lies inside the plate's year range; with none, the
button is not shown and the "No Explorer era" message explains why.

### Coverage

The coverage area (spec 03 `coverage.ts`) is computed over the merged collections, so a lot under
a workspace plate's `mapped_area` can be searched and reported on.

## Export bundle

`exportBundle.ts` writes `buried_export_<source id>_<YYYY-MM-DD>.zip`:

```
README.md
data/sources_entry.json                 the source record, to add after sources.md agrees the id
data/control/<id>.json                  verbatim workspace text
data/alignment/<id>.json                verbatim workspace text
data/work/proposals/<id>.geojson        verbatim
data/work/review/<id>.json              decisions file v2, verbatim
data/work/review/match_<id>.json        match decisions for this source and any canon features
expected/data/evidence/<id>.geojson     the workspace evidence file, verbatim
statement.txt                           uploads only: the visitor's statement about the image
```

README steps (from `pipeline/`): agree the id and add the row in `sources.md`; add
`sources_entry.json` to `data/sources.json` with the date the item's rights were checked; copy the
control and alignment files into `data/`; `uv run buried fetch <id>` and
`uv run buried inspect <id>`; copy the work files into `data/work/`; `uv run buried publish <id>`;
compare `data/evidence/<id>.geojson` with `expected/` byte for byte; merge the match decisions into
`data/work/review/match.json` and `uv run buried match`; `uv run buried validate`; commit.

For an upload, the export asks for the agreed source id and rewrites `ws_upload_<hex>` in every
file (source record, control file `source`, alignment record `source` and `control_file`, proposal
ids, review item ids, feature ids, evidence `origin_source`), recomputing the control SHA-256 in
the alignment record. The rewrite is a pure function with its own test, and the rewritten bundle
must still reproduce byte for byte. Rewriting changes the alignment record, so the proposal file's
`alignment_record_sha256` is rewritten too.

## Error handling

| Situation | Behaviour |
|---|---|
| Service health fails or times out (5 s) | "The Studio service is not available right now." Walkthrough offered. Workspace readable; Explorer and Report unaffected. |
| `version_mismatch` | "This page is older than the Studio service. Reload to continue." |
| `data_version_mismatch` | "The site and the Studio service are out of step. Try again in a few minutes." Both versions logged. |
| Invalid response (Ajv) | Treated as a Service error; nothing stored; logged with the Ajv errors. |
| `rate_limited` | "Too many requests; try again in N minutes." |
| Plate outside the bounds | Shown as unavailable with the reason (requirement 4.2). |
| Upload too large, wrong format, too many pixels, bad zip | Refused with the specific reason. |
| No georeferencing | Accepted; Studio switches to at least 4 points and refined only; publish disabled until the Schema dependency is met. |
| Fewer than 3 (or 4) points | No figure; "Add at least N control points". |
| Collinear points | Supplied result only, with spec 02's reason shown. |
| Reference does not snap | Point not added; "Choose a street intersection (or building corner) on today's map." |
| Region too large | Refused with the size in metres. |
| Extraction over 30 s | `timeout`; "Try a smaller region." |
| Geometry edit invalid | Refused; polygon unchanged; reason announced. |
| Label provider unavailable | Manual entry, with the message in requirement 11.5. |
| Publish validation fails | Errors shown next to their items; nothing stored. |
| Workspace file fails Ajv on load | Left out; listed as a problem. |
| Workspace item conflicts with canon | Left out; listed as a problem (requirement 14.3). |
| IndexedDB unavailable (private mode, quota) | Studio says work cannot be kept in this browser and stays read-only; Explorer and Report unaffected. |

## Correctness properties

Python properties use Hypothesis in `pipeline/tests/`. TypeScript properties use fast-check (at
least 200 runs) in `web/src/`.

**S1. Publish never emits a feature the validator rejects (Python).** For every generated proposal
file, decisions file v2 (any mix of accept, reject, merge, split and trace, buildings and water,
lines and polygons, with and without attributes and reviewer error), alignment record and workspace
overlay: `publish` either returns errors and no evidence file, or returns an evidence file that,
placed in the overlay, passes spec 01's Validator with no error. *(req 13.4, 13.5, 23.1 to 23.4)*

**S2. Decisions are consumed exactly once (Python).** For every generated decisions file v2: if any
proposal id appears in more than one decision, publish refuses and names them; otherwise the new
features are exactly one per accept, one per merge, one per split part and one per trace, each with
the review item id from the table; publishing the same inputs twice gives byte-identical text; every
new sequence is above every existing one; ids have prefix `wtr_` exactly for water. *(req 9.8,
23.1 to 23.3)*

**S3. A workspace feature never appears as canon (TS).** For every generated canon set and
workspace set (including colliding ids and colliding source ids): every view model item built from
a workspace feature carries origin `workspace` and the "Your workspace" label; no item built from a
canon feature carries it; no canon output (share link, the Report's canon sections, the Sources
page canon section, canon match decisions export) contains a workspace feature id or workspace
source id; and no colliding workspace item is drawn or listed. *(req 6.4, 6.5, 14.3 to 14.5, 15.5)*

**S4. The error shown is the pipeline's (Python and TS).** For every generated control point set,
the align endpoint's `alignment_error_m`, `digitising_error_m` and `min_feature_position_error_m`
equal those of spec 02's functions and `publish/build.py`'s floor on the same inputs (Python); and
the Studio's displayed figure is exactly `positionPhrase` of the response value (TS). *(req 7.4,
7.5, 7.7)*

**S5. References are copied, never computed (TS).** For every generated present layer, map view
and click position: snapping either refuses, or returns a control point whose `reference` is
strictly equal (`===` on both numbers) to the cited intersection point or building vertex, with
that feature's id. *(req 7.2, 7.3)*

**S6. Pixel edits stay valid and integer (TS).** For every generated simple integer polygon and
sequence of nudge, insert, delete and split operations: every accepted result is a valid polygon
with integer vertices; every refused operation leaves the polygon unchanged; a nudge changes exactly
one vertex by the requested step; a split gives two valid polygons whose shoelace areas sum exactly
to the original's. For every pair of integer rectangles that share an edge, merge gives one valid
polygon with area equal to the sum. *(req 9.1, 9.3)*

**S7. The review reducer keeps one decision per proposal (TS).** For every generated action
sequence: each proposal id is used by at most one decision; undo followed by redo returns an equal
state; and the emitted decisions file validates against the Service API Schema. *(req 9.5, 9.6,
9.8)*

**S8. The model never touches geometry (TS and Python).** For every review state and every label
read: before confirmation the decisions are unchanged; after confirmation only that item's one
attribute (and the `label_reads` list) differs. For every string a provider returns, parsing gives
either `proposed` with text matching the field's pattern, or `not_legible` (Python). *(req 11.3,
11.4)*

**S9. Only allowlisted downloads (Python).** For every request string given as `source_id` and every
index content: the Service either refuses, or builds a URL that matches one of the two `sources.md`
patterns, has an allowlisted host, and carries the plate number and edition of a plate the index
lists inside the bounds. *(req 3.1, 3.2, 4.3)*

**S10. Regions do not change interior proposals (Python).** For every synthetic plate and region:
every proposal from the region run that does not touch the region border equals, in id, geometry
and score, a proposal from the whole-plate run; and no proposal touching the border is returned.
*(req 8.2, 8.5, 23.5)*

**S11. Mapped areas stay inside the bounds (Python).** For every generated plate footprint and
neatline, the published `mapped_area` lies inside the project bounds and equals the neatline (or
footprint) intersected with them. *(req 23.4)*

**S12. Export reproduces publish (Python).** For every generated workspace state accepted by the
publish endpoint: writing the bundle's files into a temporary `data/` tree and running
`buried publish` logic gives text byte-identical to `evidence_file_text`; and the same holds after
the upload id rewrite. *(req 16.2, 16.3)*

**S13. Workspace match never changes canon (Python).** For every generated canon and workspace
state and match decisions: the canon files after `workspace_match` are byte-identical to before;
no workspace feature links to a canon feature; and the overlay validates. *(req 12.3, 12.4)*

**S14. Attributes come from reads, never from tones (Python).** For every generated proposal file,
decisions file v2 and map area: every published `material`, and every land-use `use`, has an
attribute read with a crop; no published attribute equals or derives from a proposal's
`tone_class`; every land-use feature has a `use`; and no proposal or feature has its centroid outside
the map area. *(req 9.4, 24.1, 24.2, 25.1)*

## Testing strategy

- **Service**: FastAPI `TestClient`; spec 02's HTTP fake for U of T and ArcGIS; a fake label
  provider; synthetic GeoTIFFs and PNGs from spec 02's raster helpers; a small synthetic canon
  `data/` tree. Example tests per endpoint, including every refusal in requirement 3, the 409
  cases, and CORS.
- **Contract conformance**: every file in `data/schema/studio_api_fixtures/valid/` passes and every
  `invalid/` file fails in both Ajv and `jsonschema` (requirement 22.3).
- **Data version**: one fixture tree under `data/schema/studio_api_fixtures/data_version/` with its
  expected hash, checked by both implementations.
- **Held-out**: the two tests in "Held-out plate".
- **Studio**: Vitest and React Testing Library for components; `fake-indexeddb` for the workspace;
  a fake Service client for component tests.
- **End-to-end**: Playwright against `vite preview` and a local Service started with
  `BURIED_TEST_MODE=1`, a synthetic plate directory and the fake label provider. Flows: pick a plate,
  add 4 control points, see the figure change, extract a region, review with keys only (accept,
  nudge, merge, split, reject), trace water, publish, see the feature rise in the Explorer
  (`scene/addFeatures` observed), export, Service down (walkthrough shown), axe scan.
- No test uses the network or a real model.

## Dependencies on other documents

This spec needed changes that session 005 could not make. Session 007 applied them; the table
records where each one went. The Studio parts that waited for them are enabled once the named task
is done.

| Document | Change needed | Status (session 007) |
|---|---|---|
| `product.md` rule 9 | Allow a vision model to propose the text of a printed label for a person to confirm. | Done. |
| `tech.md` | Record: hosting (Pages, Railway), the Service as an API server, Bedrock as the label provider, no third-party basemap; the pipeline also runs as a service; FastAPI in the stack; new commands. | Done. Commands are recorded by the tasks that add them. |
| `structure.md` | Add `studio_api.schema.json` and its fixtures to `data/schema/`; the `ws_upload_<hex>` workspace id form; the workspace as a place that is not `data/`. | Done. |
| `sources.md` | A rule for workspace sources (unregistered Volume 3 plates and uploads shown only to the visitor who brought them, on the Sources page "Your workspace" section). | Done ("Workspace sources (Studio)"). |
| `design.md` | `lantern` marks the pinned lot and primary actions only; selection is a brighter, thicker `ink` outline. | Done. |
| Spec 01 | `alignmentRecord.supplied` optional when `chosen` is `refined` (uploads without georeferencing). | Spec 01 requirement 26, task 16. Requirement 5.3 here waits for it. |
| Spec 01 | Allow `method: origin` on an `aerial_photograph` observation for a feature a person traced from that aerial (requirement 16.5 rejects it today). | Spec 01 requirement 27, tasks 16 and 17. Requirement 10.5 here waits for them. |
| Spec 01 | An attribute for street numbers. | Spec 01 requirement 2.5 (`street_number`), task 16. |
| Spec 02 | Requirement 1.5 scoped to the CLI commands, with the Service's label provider as the one place a model is called; requirement 2.2 noting the Service's own download rule; the decisions file v2, review item ids, water features, shared sequence, region extraction, coarse neatline and `mapped_area` ∩ bounds (requirement 23); the proposal file shape promoted to the Service API Schema. | Done: spec 02 requirements 1.5, 2.2 and 20. The coarse neatline is replaced by the person-set map area (spec 02 requirement 16). |
| Spec 03 | Bridge version `1.1.0` with `blob:` drape URLs; `MapView2D` using `presentLayers.ts`; view models taking `originOf`. | Unchanged: the code changes are tasks in this spec. Spec 03 also gains an optional drape `clip` (map area) in a later minor version; the two minor versions are combined when the second is written. |

Session 007 adds land-use areas (requirement 24), the map area step (25), the control hull warning
(26), reviewed-area `covers` (27) and the 1931-35 edition (28). See "Session 007 additions".

## Session 007 additions

### Map area step (requirement 25)

A sub-step at the start of Extract, shown once per plate. If canon has
`data/control/map_area/<source id>.json`, the Studio shows it read-only. Otherwise the plate pane
shows the whole image (labels, ruler and margin included) with a starting rectangle inset 3% from
each edge, labelled "Suggested start: move the corners to the edge of the map". The visitor moves,
adds or removes vertices (same keys as vertex editing), types what lies outside ("margin, title
block, archive labels, ruler"), optionally draws fold lines, and confirms under their reviewer name.
The result is a `mapArea` (spec 01) in the workspace. Extract and publish requests carry it; the
Service checks it with spec 02's `extract/maparea.py` checks. Outside the confirmed polygon the
plate is drawn at lower opacity. For the held-out plate this happens live, like every other step.

### Land-use areas (requirement 24)

The trace tool gains a third kind. A land-use trace is a polygon; on finishing it the Studio asks
for the use as lettered, with a crop rectangle the visitor drags over the lettering (label assist
may propose the text for that crop). The review list labels it "Land use: '<use>'". Publish builds
`use_<source id>_<NNNN>` features with the land-use default confidence. Matching across sources
(`buried match`) considers buildings only; land-use areas carry their origin observation alone, so
the Report dates them from their own plate.

### Control hull (requirement 26)

The align response includes `control_hull`, `control_hull_area_m2` and `map_area_inside_hull`
(a share in [0, 1] computed by spec 02's `align/hull.py`). The Studio draws the hull as a dashed
`muted` outline on both panes. For each review item, the Service's extract and dry-run responses
include `outside_control_hull: bool` computed in EPSG:26917, so the Studio does no geometry.

### Reviewed areas with `covers` (requirement 27)

The reviewed-area dialog has three statements with checkboxes: buildings (checked, cannot be
cleared), water, land use. The decisions file v2 carries `covers`; publish writes it.

### Greyscale plates and tone class (requirement 28, spec 02 requirement 17)

The plate pane draws the image in its own grey tones. The review list shows "Tone on the scan:
light | mid | dark | hatched | mixed" and the weakness flags as text ("Outline not closed",
"Hatched fill", "Text over the shape", "Touches the map edge", "Touches a fold"). Nothing in the
Studio maps a tone to a colour or a material.

## Decisions and reasons

- **A Python service, not image work in the browser.** Alignment, extraction, matching and
  validation already exist once in `pipeline/`. A second implementation in TypeScript or WebAssembly
  would drift. The cost is a server, which is why hosting is decided here.
- **JSON Schema as the contract, not FastAPI's models.** The bridge and the evidence already use JSON
  Schema with conformance fixtures on both sides. Request bodies are validated with `jsonschema`
  against the shared schema, so there is one source of truth.
- **Stateless, with a raster cache only.** No accounts, no stored work, nothing to secure beyond
  inputs and limits. The cache holds inputs (plates), never results, which also gives the
  held-out rule a simple test.
- **Files travel as canonical text.** The pipeline hashes control files and alignment records, and
  exports must be byte-identical. Re-serialising in the browser could reorder keys or change
  numbers.
- **Region extraction.** Whole plates are large, and the demo needs one block in seconds. Dropping
  regions that touch the border keeps interior proposals identical to a whole-plate run.
- **Plates limited to the project bounds.** Today's map exists only inside the bounds, because the
  present layers are clipped there and nothing citywide is committed. A plate outside them has
  nothing to align to. The brief said "any plate"; this is the honest limit with the data Buried
  holds.
- **Plates Buried has published are read-only in the Studio.** Two evidence files for one plate
  would duplicate buildings and break the one-file-per-source rule in the overlay.
- **The workspace never changes canon, even through matching.** A link needs a mirror on both
  features, and canon can only change through the repository. Suggested links go to the export.
- **Review item ids in `proposal_id`.** Merges, splits and traces need stable ids for idempotent
  publishing. Deriving them from proposal ids and pixel geometry keeps them stable without a schema
  change.
- **Label reads kept in the decisions file, and from schema 1.1.0 also in evidence.** Spec 01
  schema 1.0.0 had no field for attribute provenance. Schema 1.1.0 adds
  `provenance.attribute_reads`, so each published attribute carries its crop, whether a person or
  label assist read it, and the model id. The confidence reason still says when a label was
  machine-read, and the full label read record travels in the export.
- **`rights_checked_on: null` for unregistered Volume 3 plates.** No person has checked that item.
  The collection-level statement is shown, and the per-item check happens when the plate enters
  canon.
- **Cloudflare Pages and Railway.** Recorded in "Hosting". The site has no server-side code, and
  the Service needs GDAL in a container. Both are swappable: the site is static files, the Service
  a Docker image.
- **Amazon Bedrock, behind an interface.** Chosen in the brief; the provider interface and the
  `none` provider mean the Studio works without it and another provider can be added without
  touching the rest.
- **No `lantern` in the Studio map.** Session 005 limited `lantern` to the pinned lot; the Studio
  has no pinned lot, so selection uses the `ink` treatment there too.
