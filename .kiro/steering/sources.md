---
inclusion: always
---

# Sources

Rule: no source enters `data/`, the shell or Unity until it has a row here with a licence note and
an attribution line, and an entry on the in-app Sources page. A source marked "to be confirmed
before use" may be researched but not shown or cited.

Check the rights statement on each item when it is downloaded. Record the date checked.

## Showcase sources

| Source id | Item | Years | Status | Licence note | Attribution line | Rights checked |
|---|---|---|---|---|---|---|
| `fip_v3_1911_229` | Goad fire insurance plan, Vol 3, plate 229, 1911 edition revised to 1914 | 1911 to 1914 | Confirmed available | U of T labels it out of copyright. No licence or terms attached. Credit anyway. | Digitized and georeferenced by the University of Toronto Map & Data Library. | 2026-11-10 |
| `fip_v3_1911_232` | Same, plate 232 | 1911 to 1914 | Confirmed available | As above | Digitized and georeferenced by the University of Toronto Map & Data Library. | 2026-11-10 |
| `fip_v3_1935_229` | Goad fire insurance plan, Vol 3, plate 229, 1935 edition | 1935 | Confirmed available | As above | Digitized and georeferenced by the University of Toronto Map & Data Library. | 2026-11-10 |
| `fip_v3_1935_232` | Same, plate 232. **Held out.** | 1935 | Confirmed available | As above | Digitized and georeferenced by the University of Toronto Map & Data Library. | 2026-11-10 |
| `aerial_1947_<id>` | U of T 1947 georeferenced aerial photographs, photos covering the showcase plates. Publisher: City of Toronto. Originals held at the City of Toronto Archives. | 1947 | Confirmed available | Collection page: "Require permission to use: None. Require acknowledgement to use: None. Cost for use: None. Restrictions: Public." Credit anyway. | 1947 aerial photographs: City of Toronto Archives. Georeferenced by the University of Toronto Map & Data Library. | 2026-11-12 |

The plate rights were checked in the research session of Nov 10, 2026 (`docs/concept-brief.md`
section 9). The aerial rights were checked on the U of T Map & Data Library collection page:
`https://mdl.library.utoronto.ca/collections/geospatial-data/toronto-aerial-photographs-1947-black-and-white-and-colourized`.

### 1947 aerial records in use

`<id>` is the record's `Name` field in the index layer, lowercased (for example
`s0012_fl1947_it0001h` gives `aerial_1947_s0012_fl1947_it0001h`). Each record that Buried uses is
listed here before it is added to `data/sources.json`. The list comes from
`buried fetch --aerial-candidates` and a person's check that the photo covers the showcase plates.

None yet.

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

Plates download as GeoTIFF plus world file, about 5.5 cm per pixel, with no login. U of T
georeferenced them with 2 control points each and gives no error estimate; Buried measures it.

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
| Ontario Dig Authority (formerly Ontario One Call, renamed Oct 1, 2026) | "Before you dig" pointer | Link only | No content reused | Not applicable (link only) |

## Adding a source

1. Agree its source id here before first use (`structure.md` has the id rules).
2. Record type, title, `year_from`, `year_to`, URL, licence note, attribution line, date checked.
3. Add it to the in-app Sources page.
4. Only then cite it in evidence.
