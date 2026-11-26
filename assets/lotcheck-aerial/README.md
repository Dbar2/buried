# Aerial photographs for the lot check (sources)

Fetched on Nov 25, 2026 from the City of Toronto's public map services, which the City publishes
on its open data portal as the dataset "Web Map Services" under the Open Government Licence -
Toronto. Attribution: "Contains information licensed under the Open Government Licence - Toronto."

| File | Service | Notes |
|---|---|---|
| `today-2025-source.jpg` | `basemap/cot_ortho_2025_color_8cm` | Map export for the block, EPSG:26917, 0.15 m per pixel |
| `aerial-1939-source.jpg` | `basemap/cot_historic_aerial_1939` | Cached tiles at zoom 19 (about 0.22 m per tile pixel here), resampled to EPSG:26917 at 0.3 m per pixel by `tools/fetch_city_aerial.py` |

Block bounds (EPSG:26917): 632295, 4834745 to 632715, 4835185.

The City's own caveat for the historic photographs: they were not orthorectified, their spatial
accuracy varies, and they are provided as is. Buried shows the 1939 photograph for looking only.
The web copies are in `web/public/lotcheck/aerial/` with `aerial.json`.
