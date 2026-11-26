# Session 055: real aerial photos and imagined views (builder)

Agent: `builder`. Adds pictures to the lot check: real aerial photographs of today and of 1939,
and views imagined from the plans, each labelled for what it is.

## Why

The maintainer asked: "can't we get real satellite images so people can see what's actually
there, and can we reimagine them with GPT image, how it would have looked back then too, not just
a diagram." Both are possible, and both are now on disk.

## What is on disk (made outside this session; do not regenerate, resize or edit the files)

Everything is under `web/public/lotcheck/`. Read the two JSON indexes; they are the contract.

### Real aerial photographs: `aerial/aerial.json`

Two photographs of the whole block, north up, axis-aligned in EPSG:26917. Each entry has `file`,
`year`, `label`, `bounds` (`[min_e, min_n, max_e, max_n]`), `width_px`, `height_px`,
`metres_per_pixel`, `source_url`, `licence`, `attribution`, `fetched`, and `note`.

- `today-2025.jpg`: the City of Toronto's 2025 orthorectified aerial photograph.
- `aerial-1939.jpg`: the City of Toronto's 1939 historic aerial photograph. The City says these
  historic photographs were not orthorectified, that their positions vary across the city, and
  that they are provided as is. So the 1939 photograph is shown for looking, not for measuring:
  the lot outline over it carries the note "The 1939 photograph is placed approximately."

Source and licence (from the City's open data portal, dataset "Web Map Services"): Open
Government Licence - Toronto. Attribution: "Contains information licensed under the Open
Government Licence - Toronto."

### Imagined views: `imagined/imagined.json`

Made with an image model from the plan's outlines and lettering, one set per recorded site. Each
entry has `slug`, `feature_ids` (the evidence features the picture is about), `plan_source`,
`about` ("about 1911" or "about 1935"), and up to two pictures:

- `topdown`: `file`, `bounds` (same form as above), `width_px`, `height_px`. A top-down view
  drawn to the plan's own frame, so it can sit in the compare view by its bounds. It was checked
  by eye against the plan's outlines; treat it as approximate.
- `street`: `file`, `width_px`, `height_px`, `caption`. A street-level illustration.

Every picture has the word "IMAGINED" set into a corner of the image itself. Keep it visible:
never crop these pictures, never cover that corner.

## The honesty rules for pictures (write these into steering first, item 0)

1. A real photograph is labelled with its year and "aerial photograph, City of Toronto". An
   imagined view is labelled "Imagined from the <plan> plan. Not a photograph." in the caption,
   every time it is on screen, in addition to the mark inside the picture.
2. No finding, tag, sentence or inscription is ever taken from a photograph or an imagined view.
   The verdict comes from the plans' lettering, as now.
3. An imagined view is never the default. The plan is. A visitor chooses to see it.
4. An imagined view is never shown for a place the plans do not letter.
5. The Sources page lists both kinds: the aerial photographs with their licence, and the imagined
   views as "made with an image model from the plans; decoration and illustration, not evidence".

## Read first, and only these

- `web/public/lotcheck/aerial/aerial.json`, `web/public/lotcheck/imagined/imagined.json`.
- `docs/kiro-sessions/053-notes.md`, `054-notes.md`.
- `web/src/lotcheck/compare.ts`, `CompareView.tsx`, `LotPage.tsx`, `lotCheck.ts`, `copy.ts`,
  `web/src/block/sheetTransform.ts`, `web/src/styles/lotcheck.css`,
  `web/src/sources/SourcesPage.tsx`, `web/e2e/night.spec.ts`.
- `.kiro/steering/product.md` "The lot check", `.kiro/steering/sources.md` (the table and its
  rule), `.kiro/specs/08-lot-check/requirements.md`.

Do not touch `unity/`, `pipeline/`, `data/` or the hooks. Commit each numbered item on its own
with `git commit -m "<message>" -- <paths>`. No Co-Authored-By line.

## Build

### 0. Write it down

- `.kiro/steering/product.md`: the five rules above, under "The lot check".
- `.kiro/steering/sources.md`: two rows, for the City's 2025 orthophoto and its 1939 historic
  aerial photograph (the dataset, the licence, the attribution line, the City's own caveat for
  1939), and a short note that imagined views are not sources.
- `.kiro/specs/08-lot-check/`: requirement 11 (photographs in the compare view), 12 (imagined
  views), their properties and tasks. Keep the three files under 400 lines together.

### 1. The compare view gets layers

Today the compare view has the plan on the left and today's outlines on the right. Make each
side a choice:

- **Then (left):** "1911 plan" (default), "1931-35 plan", "1939 photo", and, when an imagined
  top-down view covers the lot, "Imagined, about 1911" (or 1935).
- **Now (right):** "Today, photo" (default) and "Today, outlines".

So the first thing a visitor sees is the old plan against a real photograph of what stands there
now, with the lot outlined on both.

- Photographs and imagined top-down views are placed by their `bounds` through the same
  transform as everything else (`worldToPixel` on the tile's frame). A pure function gives the
  image's placement (an affine transform) from its bounds and the frame; property test: the
  image's four corners land where `worldToPixel` puts those four world points, within 1 px.
- The lot outline, and the "where it stood" outline, stay on top of every layer and must read on
  a colour photograph: keep the dark casing, lantern stroke on top.
- Under the view, one line that changes with the layers, for example: "Left: the 1911 plan, as
  digitized. Right: 2025 aerial photograph, City of Toronto." For 1939 add "placed
  approximately". For an imagined view: "Imagined from the 1911 plan. Not a photograph."
- The layer switches are real controls (radio groups or tab lists), keyboard reachable, 44 px on
  a phone, and announce the change politely.
- The reveal's one-time divider sweep still plays. After it, a second small flourish: the Now
  side fades from outlines to the photograph over about 0.6 s (so the visitor sees both exist).
  None of that under reduced motion.
- The photographs load after the text and the plan tile. Until a layer's picture has loaded its
  side shows the outlines.

### 2. "As it may have looked"

When the lot's lettered use has an imagined street view, show it on the record sheet under the
compare view: the heading "As it may have looked", the picture, and the caption from the index
plus "Imagined from the <plan> plan. Not a photograph." It opens larger on click (a simple
dialog, Escape closes, focus returns). On the dark page it sits like a postcard: a thin parchment
border, a slight tilt of about 1 degree, straightening on hover. No tilt under reduced motion.

For a lot that is next to a recorded site but not on it, show nothing imagined (rule 4 is about
the place the plans letter; keep it strict).

### 3. The dig sequence uses them, lightly

At the layer where the plan letters a use on the lot, if an imagined street view exists, the
slip gets a small thumbnail of it (about 96 px wide) with the tiny label "imagined". Nothing else
in the dig changes.

### 4. The landing

Under the map caption add one line that tells a visitor what they will get: "Each dig shows the
old plan, a 1939 aerial photograph, and a photograph of what stands there today."

### 5. Sources page

A section "Aerial photographs" (the two photographs, each with a small crop, year, the dataset
name, licence, attribution, and the City's caveat for 1939) and a section "Imagined views" (what
they are, how they were made, that they are not evidence, and the list of sites that have one).

### 6. Weight

`today-2025.jpg` and `aerial-1939.jpg` are large. They must not load before the visitor's result
text is on screen, and never on the landing. Report the Result's transfer before and after the
photographs. Raise requirement 1.4's Result figure only for bytes that arrive after the text, and
say so.

## Tests

- Unit: the placement function and its property; the layer model (which choices exist for a
  lot); the caption for each layer pair; a property that every caption for an imagined layer
  contains "Imagined" and "Not a photograph", and that no verdict text changes when layers
  change.
- Browser (`night.spec.ts` or a new spec on the lot-check config): the result for 2A Percy St
  shows the plan against the photograph by default; switching Then to "1939 photo" and to
  "Imagined, about 1911" changes the picture and the caption; "As it may have looked" is present
  with its caption and opens larger; a lot with no recorded use shows no imagined picture;
  screenshots `web/e2e/output/photos-*.png` for each layer pair at 1440 by 900 and one phone
  pass. Look at them.
- At the end, once: `npm --prefix web test`, `npm --prefix web run typecheck`,
  `npm --prefix web run build`, the lot-check config, the hosting spec.

## Notes file

`docs/kiro-sessions/055-notes.md`: what you built, weights, every departure, and what still
looks wrong to you.
