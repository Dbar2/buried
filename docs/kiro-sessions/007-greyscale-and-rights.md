# Kiro session 007: what the real plates look like, and what that changes

Agent: architect (claude-opus-5.5).

The maintainer downloaded and looked at both editions of plate 229. Three facts change the specs.

## 1. The scans are greyscale, not colour

Both editions are single-band greyscale images (photographic copies). There is no pink for brick
or yellow for wood. Buildings appear as grey-filled shapes with black outlines; fills come in a
small number of grey tones; some buildings carry diagonal hatching, an X (stable or shed) or a
skylight mark; yards and lumber piles are hatched areas without a solid outline.

Change spec 02 (`buried extract`) accordingly:

- Segmentation works on tone and line work, not colour classes: local-contrast normalisation,
  outline detection and closing, grey-fill regions bounded by outlines, polygon simplification.
- Do not claim a construction material from a grey tone. A proposal carries a `tone_class`
  (for example light, mid, dark, hatched) as an observed fact about the scan. `material` is set
  only when a person or the label-reading step reads it from the plate's lettering or legend, and
  it is recorded with the crop it was read from. Until then it is absent, never guessed.
- Keep the per-proposal quality score. Add the things that make a greyscale proposal weak:
  open outline, hatched fill, text overlapping the shape, touching the plate edge or a fold line.
- The plate margin, title block, scale bar, north arrow, archive labels and the ruler in the 1935
  photograph are not map content. Extraction and tiling work inside a **map area** polygon per
  plate, set by a person once (in the Studio or a small JSON under `data/control/`), never detected
  silently.

## 2. The 1935 copies come from the Public Archives of Canada

The 1935 photographs show archive labels along the top: "PUBLIC ARCHIVES CANADA / NATIONAL MAP
COLLECTION / NO REPRODUCTION WITHOUT PERMISSION", the number "NMC-0013999", and "INCOMPLETE SET".
The plate itself reads "Toronto, Vol. III, January 1931, revised to May 1935". U of T's Map & Data
Library distributes these files publicly and labels the plans out of copyright.

- In `sources.md`, record for the 1935 edition: the holding institution (Public Archives of Canada,
  now Library and Archives Canada, National Map Collection, NMC-0013999), the label text, and the
  rights note: the plan was published in 1935 by a corporate publisher, U of T lists it as out of
  copyright, and the label is the archive's reproduction notice on its copy. Mark the status
  "low risk, credit both institutions; maintainer to confirm before submission". Attribution line
  for the 1935 edition: "Library and Archives Canada, National Map Collection (NMC-0013999).
  Digitized and georeferenced by the University of Toronto Map & Data Library."
- The 1935 source's years are `year_from: 1931`, `year_to: 1935`. Update the era definition and
  every place that assumed a single year 1935. The era is still labelled "1935" in the UI, with
  the range shown in the evidence card ("1931, revised to 1935").
- Tiles show the map area only. The Sources page shows the full uncropped photograph of each plate,
  labels included, so nothing about its origin is hidden.

## 3. What the showcase block contains (read from the plates, for scoping only)

Plate 229 covers Queen St East to Eastern Ave, Sumach St to St Lawrence St, with King St East
crossing diagonally and River St at the north-east. Lettering visible on the plates includes, in
1911: a cork factory, a machine shop, a coal and wood yard, coal sheds, a lumber yard with lumber
piles, a Baptist mission hall, rows of dwellings; and in the 1931-35 edition: a knitting mill where
the lumber piles were, a City of Toronto street cleaning department yard, a rag and metal
warehouse, a coal and wood yard. These are land uses the Report's "past land use" group must be
able to express. Do not write any of them into evidence or story text from this list: each one
enters only through the Studio, read from the plate with its crop.

Add a land-use feature kind to the Studio flow in spec 04 if it is not already there: a person
outlines an area (a yard, a factory lot) and records the use as lettered on the plate.

## Rules for this session

- You may edit `.kiro/steering/` and all specs. The builder is not running during this session.
- Keep requirement and task numbers stable; add at the end.
- No implementation code. Plain, direct English.
- Reply with what changed, by file, and anything still open.
