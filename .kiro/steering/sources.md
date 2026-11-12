---
inclusion: always
---

# Sources

Rule: no source enters `data/`, the shell or Unity until it has a row here with a licence note and
an attribution line, and an entry on the in-app Sources page. A source marked "to be confirmed
before use" may be researched but not shown or cited.

Check the rights statement on each item when it is downloaded. Record the date checked.

## Showcase sources

| Source id | Item | Years | Status | Licence note | Attribution line |
|---|---|---|---|---|---|
| `fip_v3_1911_229` | Goad fire insurance plan, Vol 3, plate 229, 1911 edition revised to 1914 | 1911 to 1914 | Confirmed available | U of T labels it out of copyright. No licence or terms attached. Credit anyway. | Digitized and georeferenced by the University of Toronto Map & Data Library. |
| `fip_v3_1911_232` | Same, plate 232 | 1911 to 1914 | Confirmed available | As above | Digitized and georeferenced by the University of Toronto Map & Data Library. |
| `fip_v3_1935_229` | Goad fire insurance plan, Vol 3, plate 229, 1935 edition | 1935 | Confirmed available | As above | Digitized and georeferenced by the University of Toronto Map & Data Library. |
| `fip_v3_1935_232` | Same, plate 232. **Held out.** | 1935 | Confirmed available | As above | Digitized and georeferenced by the University of Toronto Map & Data Library. |
| `aerial_1947_<id>` | U of T 1947 georeferenced aerial photographs, tiles covering the showcase area | 1947 | Confirmed available | Metadata says no permission, acknowledgement or cost is required. Credit anyway. | To be confirmed before use |

## Download patterns

Confirmed. `<plate>` is the plate number, for example `229`.

- 1911 edition: `https://maps.library.utoronto.ca/datapub/FIP/vol3_19111914/v3-1911-<plate>.zip`
- 1935 edition: `https://maps.library.utoronto.ca/datapub/FIP/vol3_1935/Georeferenced/v3-1935-<plate>.zip`
- 1947 aerials: index service `Toronto_Aerial_Photographs_1947_Index` on U of T's ArcGIS
  organisation. Each record has a `zip_url`. Fetch only the records whose footprints cover the
  showcase plates.

Plates download as GeoTIFF plus world file, about 5.5 cm per pixel, with no login. U of T
georeferenced them with 2 control points each and gives no error estimate; Buried measures it.

Downloads go to `data/raw/` (gitignored). Only the showcase plates and aerials, downsampled, are
published under `data/tiles/`. Never mirror a collection.

## Other sources

| Source | Role | Status | Licence note | Attribution line |
|---|---|---|---|---|
| Toronto Public Library fire plan indexes | Choosing blocks by coverage | Usable for research | Check item rights before using any TPL scan in the app | To be confirmed before use |
| Don Valley Historical Mapping Project layers | River and shoreline history | Not usable | Copyright of the authors, no licence. Ask permission, or trace from public-domain maps in the Studio. | Not applicable until permission is given |
| City of Toronto 3D massing | Present-day 3D | Not usable | Retired | Not applicable |
| Present-day building outlines (OpenStreetMap or City of Toronto building outlines) | Today era, lots | Candidate, not chosen | To be checked when the source is chosen | To be confirmed before use |
| Toronto address points | Search inside the coverage area | Candidate | Open Government Licence – Toronto. Confirm the dataset is current. | To be confirmed before use |
| Public-domain historical maps (shorelines, creeks) | Earliest layer, Water remembers, story mode | None chosen | Pick specific maps and confirm each rights statement | To be confirmed before use |
| Ontario lidar elevation | Water remembers hillshade (optional) | Candidate | Confirm coverage and licence | To be confirmed before use |
| Ontario Dig Authority (formerly Ontario One Call, renamed Oct 1, 2026) | "Before you dig" pointer | Link only | No content reused | Not applicable (link only) |

## Adding a source

1. Agree its source id here before first use (`structure.md` has the id rules).
2. Record type, title, `year_from`, `year_to`, URL, licence note, attribution line, date checked.
3. Add it to the in-app Sources page.
4. Only then cite it in evidence.
