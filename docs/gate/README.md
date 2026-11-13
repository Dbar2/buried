# Go/no-go gate, met on Nov 12, 2026

The brief set three proofs to reach by Nov 14 before any further work.

## 1. Alignment

Both editions of Goad Volume 3 plate 229 were checked against six present-day City of Toronto
street intersections (`data/control/`, `data/alignment/`).

| Plate | Supplied georeferencing RMSE | Worst point | Published as |
|---|---|---|---|
| 1911 (revised to 1914) | 2.140 m | 3.504 m | within about 4.3 m |
| 1931, revised to 1935 | 1.504 m | 2.607 m | within about 3.1 m |

The refined affine had a lower in-sample RMSE but a higher leave-one-out RMSE on both plates, so
the pipeline kept U of T's supplied georeferencing. The control points are a draft picked by eye
from 60 m crops and all lie in the northern two-thirds of the plate.

## 2. Reconstruction

One footprint, the bank at Queen St E and River St, was traced by hand from the 1911 plate and
written to `data/evidence/fip_v3_1911_229.geojson` (a draft, marked unreviewed). The Unity WebGL
build extrudes it at runtime from that file. `gate-1911-bank-closeup.jpg` shows the volume standing
on the bank's own drawing; `gate-evidence-card.png` shows its provenance card in the page.

## 3. Time

Switching between the 1911 and 1935 eras swaps the draped plate; the building and the three
control-point markers do not move (`gate-deltas.json`: 0 px between eras, under 0.6 px from the
test's own camera projection, threshold 2 px). `gate-1935-bank-closeup.jpg` shows the same volume
over the same bank on the later plate.

What the automated check does and does not prove: it measures debug markers drawn at fixed world
positions, so it proves the camera and projection are consistent across eras. That the plates
themselves sit correctly under those markers was checked by eye in the two close-ups, and by the
alignment measurements above.

### The drape placement check (`web/e2e/drape.spec.ts`)

A second test looks at the drape's own pixels. For control points of each plate it points the camera
straight down at the ground position the tile's corners give that pixel (about 0.25 m per canvas
pixel), builds from the tile's own JPEG the patch it predicts the canvas shows, and correlates that
patch with a screenshot (normalised cross-correlation, offsets within 8 px). It proves that the tile
is drawn where the camera's own matrix puts the ground position its corners assign each pixel, to
within about one screen pixel: no flip, mirror, half-texel shift, UV or corner-order error, on both
plates, and that nothing outside the plate's map area is drawn. Together with the alignment
records, which say how far the corners put each drawn intersection from the City's, it means a plate
on screen sits within its stated alignment error of today's map. It does not prove that the corners
or the transform are right (`align-check` does that), anything about extruded features, or placement
far from the control points (all six points of plate 229 lie in its northern two-thirds). Results
of the last run are in `docs/kiro-sessions/015-notes.md`.

## Numbers

- WebGL build: 7.9 MB compressed (budget 15 MB).
- Tests at the gate: pipeline (pytest, Hypothesis), web 267 (Vitest, fast-check), Unity EditMode 54,
  Playwright gate test 2.
