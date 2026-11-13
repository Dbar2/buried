---
inclusion: always
---

# Sources

Rule: no source enters `data/`, the shell or Unity until it has a row here with a licence note and
an attribution line, and an entry on the in-app Sources page. A source marked "to be confirmed
before use" may be researched but not shown or cited. The only exception is a visitor's workspace
source in the Studio, under the conditions in "Workspace sources (Studio)" below.

Check the rights statement on each item when it is downloaded. Record the date checked.

## Showcase sources

| Source id | Item | Years | Status | Licence note | Attribution line | Rights checked |
|---|---|---|---|---|---|---|
| `fip_v3_1911_229` | Goad fire insurance plan, Vol 3, plate 229, 1911 edition revised to 1914 | 1911 to 1914 | Confirmed available | U of T labels it out of copyright. No licence or terms attached. Credit anyway. | Digitized and georeferenced by the University of Toronto Map & Data Library. | 2026-11-10 |
| `fip_v3_1911_232` | Same, plate 232 | 1911 to 1914 | Confirmed available | As above | Digitized and georeferenced by the University of Toronto Map & Data Library. | 2026-11-10 |
| `fip_v3_1935_229` | Goad fire insurance plan, Vol 3, plate 229, January 1931 revised to May 1935 (U of T's "1935 edition"). Photograph of the copy held by the Public Archives of Canada, now Library and Archives Canada, National Map Collection, NMC-0013999. | 1931 to 1935 | Low risk, credit both institutions; maintainer to confirm before submission | See "The 1935 edition" below. | Library and Archives Canada, National Map Collection (NMC-0013999). Digitized and georeferenced by the University of Toronto Map & Data Library. | 2026-11-10 (U of T collection); archive labels recorded in Kiro session 007 |
| `fip_v3_1935_232` | Same, plate 232. **Held out.** | 1931 to 1935 | As above | As above | Library and Archives Canada, National Map Collection (NMC-0013999). Digitized and georeferenced by the University of Toronto Map & Data Library. | As above |
| `aerial_1947_<id>` | U of T 1947 georeferenced aerial photographs, photos covering the showcase plates. Publisher: City of Toronto. Originals held at the City of Toronto Archives. | 1947 | Confirmed available | Collection page: "Require permission to use: None. Require acknowledgement to use: None. Cost for use: None. Restrictions: Public." Credit anyway. | 1947 aerial photographs: City of Toronto Archives. Georeferenced by the University of Toronto Map & Data Library. | 2026-11-12 |

The plate rights were checked in the research session of Nov 10, 2026 (`docs/concept-brief.md`
section 9). The aerial rights were checked on the U of T Map & Data Library collection page:
`https://mdl.library.utoronto.ca/collections/geospatial-data/toronto-aerial-photographs-1947-black-and-white-and-colourized`.

### The 1935 edition

The 1935 plates are photographs of the copy held by the Public Archives of Canada (now Library and
Archives Canada), National Map Collection. The labels below were read on plate 229. Plate 232 is
taken to be from the same set; its labels are checked against this text when it is fetched for the
demo, and any difference is recorded here. Labels along the top of the photograph read:
"PUBLIC ARCHIVES CANADA / NATIONAL MAP COLLECTION / NO REPRODUCTION WITHOUT PERMISSION", the number
"NMC-0013999", and "INCOMPLETE SET". The plate itself reads "Toronto, Vol. III, January 1931,
revised to May 1935". The 1935 photographs also show a ruler.

- Holding institution: Library and Archives Canada (formerly Public Archives of Canada), National
  Map Collection, NMC-0013999.
- Rights note: the plan was published in 1935 by a corporate publisher (Goad). U of T's Map & Data
  Library distributes the files publicly and lists the plans as out of copyright. The label is the
  archive's reproduction notice on its own copy, not a licence attached to U of T's files.
- Status: low risk; credit both institutions. **The maintainer confirms this before submission.**
- Years: `year_from: 1931`, `year_to: 1935`. The era is labelled "1935"; the evidence card shows
  "1931, revised to 1935".
- Display: tiles show the map area only. The in-app Sources page shows the full uncropped
  photograph of each plate, labels and ruler included, so nothing about its origin is hidden.

The 1911 scans and the 1935 photographs are greyscale. Buildings are grey-filled shapes with black
outlines; there is no colour for brick or wood.

### 1947 aerial records in use

`<id>` is the record's `Name` field in the index layer, lowercased (for example
`s0012_fl1947_it0001h` gives `aerial_1947_s0012_fl1947_it0001h`). Each record that Buried uses is
listed here before it is added to `data/sources.json`. The list comes from
`buried fetch --aerial-candidates` and a person's check that the photo covers the showcase plates.

Checked on 2026-11-12 with `buried fetch --aerial-candidates` (four records intersect the plates'
union bounds) and by comparing each footprint polygon with the map areas of plate 229 (both
editions) and the inspect bounds of plate 232. Two records cover the plates and are in use:

| Source id | Index `Name` | Black-and-white zip size | Footprint covers |
|---|---|---|---|
| `aerial_1947_s0012_fl1947_it0018h` | `s0012_fl1947_it0018h` | 11.7 MB | all of plate 229's map area; 97% of plate 232's bounds |
| `aerial_1947_s0012_fl1947_it0022d` | `s0012_fl1947_it0022d` | 10.7 MB | all of plate 229's map area; 89 to 95% of plate 232's bounds |

Not used: `s0012_fl1947_it0018g` (footprint misses the plates) and `s0012_fl1947_it0022c`
(touches 0.1% of plate 1935/229's map area). A footprint covering a spot says the photograph
includes it; it does not say the spot is readable. Only a person sets that.

The ground control for these photographs is U of T's own georeferencing, which Buried has not
measured against City intersections. Neither photograph has an alignment record, so neither is
tiled yet: the tile sidecar Schema requires an alignment error, and none can be stated until
control points are read. No feature is published from an aerial until one is measured.

## Present-day sources (City of Toronto Open Data)

Checked on the City of Toronto Open Data portal (CKAN, `https://ckan0.cf.opendata.inter.prod-toronto.ca`)
on 2026-11-12. All four are published under the Open Government Licence - Toronto.

| Source id | CKAN package id | Role | Format used | Status | Licence note | Attribution line | Rights checked |
|---|---|---|---|---|---|---|---|
| `present_toronto_building_outlines_2026` | `topographic-mapping-building-outlines` | Today's buildings; building-corner control points | GPKG | Confirmed available | Open Government Licence - Toronto | Contains information licensed under the Open Government Licence - Toronto. | 2026-11-12 |
| `present_toronto_property_boundaries_2026` | `property-boundaries` | Lots for the Report and the pinned lot | GPKG | Confirmed available | Open Government Licence - Toronto | Contains information licensed under the Open Government Licence - Toronto. | 2026-11-12 |
| `present_toronto_address_points_2026` | `address-points-municipal-toronto-one-address-repository` | Address search inside the coverage area | GPKG | Confirmed available | Open Government Licence - Toronto | Contains information licensed under the Open Government Licence - Toronto. | 2026-11-12 |
| `present_toronto_intersections_2026` | `intersection-file-city-of-toronto` | Street-intersection control points | GPKG | Confirmed available | Open Government Licence - Toronto | Contains information licensed under the Open Government Licence - Toronto. | 2026-11-12 |

- The id year is the retrieval year. In the registry, `year_from` is the year of the dataset's last
  refresh as the CKAN metadata states it at retrieval, and `year_to` is the retrieval year. A
  layer is a snapshot of the city at some point in that range.
- The content behind an id never changes once committed, because control files cite its feature
  ids. A later retrieval with different content gets a new id, agreed here first.
- `buried present` (spec 02) fetches each dataset through the CKAN API into `data/raw/`, clips it
  to the project bounds, reprojects it to EPSG:26917 and writes a small file under `data/present/`.
  Nothing citywide is committed.

## Download patterns

Confirmed. `<plate>` is the plate number, for example `229`.

- 1911 edition: `https://maps.library.utoronto.ca/datapub/FIP/vol3_19111914/v3-1911-<plate>.zip`
- 1935 edition: `https://maps.library.utoronto.ca/datapub/FIP/vol3_1935/Georeferenced/v3-1935-<plate>.zip`
- 1947 aerials: feature layer
  `https://services1.arcgis.com/9NvE8jKNWWlDGsUJ/arcgis/rest/services/Toronto_Aerial_Photographs_1947_Index/FeatureServer/0`.
  Fields: `Name` (record id), `url` (JPEG), `zip_url` (georeferenced download), `thumbnail_url`.
  Geometry is each photo's footprint. Fetch only the records whose footprints cover the showcase
  plates.
- Plate index layers on the same server: `vol3_19111914` (fields `Name`, `Plan_`, `URL`,
  `zip_url`) and `vol3_1935` (fields `Name`, `url`, `zip_url`).

Plates download with no login, at about 5.5 cm per pixel. The 1911 plates are GeoTIFFs with a
world file; the 1935 plates are JPEGs with a world file and a PAM `.aux.xml` sidecar. Each zip also
holds a `.txt` of the ground control points U of T fitted its georeferencing to (6 for 1911 plate
229, 4 for 1935 plate 229). U of T gives no error estimate, and its own points are not independent
checks; Buried measures the error against City intersections.

Downloads go to `data/raw/` (gitignored). Only the showcase plates and aerials, downsampled, are
published under `data/tiles/`. Never mirror a collection.

## Other sources

| Source | Role | Status | Licence note | Attribution line |
|---|---|---|---|---|
| Toronto Public Library fire plan indexes | Choosing blocks by coverage | Usable for research | Check item rights before using any TPL scan in the app | To be confirmed before use |
| Don Valley Historical Mapping Project layers | River and shoreline history | Not usable | Copyright of the authors, no licence. Ask permission, or trace from public-domain maps in the Studio. | Not applicable until permission is given |
| City of Toronto 3D massing (CKAN `3d-massing`, SHP, refreshed Dec 2025 as seen on 2026-11-12) | Present-day building heights (optional; the fallback is a fixed storey height) | Candidate, optional. No source id yet. | Confirm the licence on the package page before first use. An earlier note here said the dataset was retired; the Nov 12 portal check shows a Dec 2025 refresh. | To be confirmed before use |
| Public-domain historical maps (shorelines, creeks) | Earliest layer, Water remembers, story mode | None chosen | Pick specific maps and confirm each rights statement | To be confirmed before use |
| Ontario lidar elevation | Water remembers hillshade (optional) | Candidate | Confirm coverage and licence | To be confirmed before use |
| Ontario Dig Authority (formerly Ontario One Call, renamed Oct 1, 2026) | "Before you dig" pointer. URL: `https://ontariodigauthority.ca/` | Link only | No content reused | Not applicable (link only) |
| City of Toronto basement flooding protection subsidy page | Report "Water history" next step | Link only | No content reused. The URL is looked up and link-checked by the task that adds it (spec 05 task 5.3), not guessed. | Not applicable (link only) |
| City of Toronto land acknowledgement | Report "What these records cannot tell you" | Link only | Buried links to the City's published acknowledgement and does not write its own. The URL is looked up and link-checked by spec 05 task 5.3. The maintainer approves the final wording before submission. | Not applicable (link only) |

## Workspace sources (Studio)

The Studio (spec 04) works on two kinds of source that are not in `data/sources.json`: Volume 3
plates from the U of T index layers that Buried has not registered, and images a visitor uploads.
They are an exception to the rule at the top of this file, under these conditions:

- They live only in the visitor's browser workspace and are shown only to that visitor.
- They appear on the in-app Sources page in a separate section headed "Your workspace", marked
  "Not part of Buried's published records", with their licence note and attribution line.
- An unregistered Volume 3 plate uses the Volume 3 licence note and attribution line above (the
  1931-35 attribution line for 1935 plates) and `rights_checked_on: null`, because no person has
  checked that item. The Sources page says so. The per-item rights check happens when, and only
  when, the plate enters canon: it gets a row here first, then a Registry entry.
- An upload carries the licence note, attribution line and rights date the visitor entered, and the
  visitor's statement that they may use the image this way. Its id is `ws_upload_<12 hex>`. It
  enters canon only through a reviewed export, with a source id agreed here.
- Nothing from a workspace source reaches canon files, the canon parts of the Report or a share
  link.

## Adding a source

1. Agree its source id here before first use (`structure.md` has the id rules).
2. Record type, title, `year_from`, `year_to`, URL, licence note, attribution line, date checked.
3. Add it to the in-app Sources page.
4. Only then cite it in evidence.
