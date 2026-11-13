# Design: 06 First visit

## Routes and modules

`routeFor` (`web/src/place/placeLink.ts`) gains `block` for `/` with no query and for
`/find/<slug>`, and `search` for `/place` without `lot` (the old landing, `place/Landing.tsx`,
moves there). Everything else routes as now. Pages serves `index.html` for any path (no
`404.html`), so `/find/<slug>` needs no host rule. New Shell code lives in `web/src/block/`;
wording lives in the Evidence Library (`web/src/evidence/`), never in components.

## The finds file

`data/finds.json`, schema `data/schema/finds.schema.json` 1.0.0:

```json
{ "schema_version": "1.0.0", "finds": [{ "id": "find_0001", "slug": "overall-factory",
  "kind": "building", "order": 1, "tag": "Overall factory", "noun": "factory",
  "readings": [{ "source": "fip_v3_1911_229", "feature_id": "bld_fip_v3_1911_229_NNNN",
    "lettered": ["Glove & Overall Factory", "Hamilton Carhartt Mfr. Ltd."],
    "crop_px": [0, 0, 0, 0], "read_by": "<person>", "read_on": "2026-11-14" }] }] }
```

- `slug` is `[a-z0-9-]+`. `lettered` lines are transcribed exactly; the first is the card title.
  `crop_px` follows the evidence provenance crop convention.
- `pipeline/buried_pipeline/validate/finds.py`, run by `buried validate`: shape; unique `id`,
  `slug`, `order`; `source` registered; `feature_id` published in `data/evidence/<source>.geojson`
  with a matching kind (`bld` for `building`; `use` or `bld` for `area`); crop wholly inside
  `data/control/map_area/<source>.json`; at least one reading with a crop, else an error.
- A 1935 reading exists only once that plan's feature is published.

## Review state (evidence schema 1.2.0)

`provenance.review = { state: "reviewed" | "draft_rule" | "draft_hand", by?, on? }`; `by` (a
person) and `on` (ISO date) required for `reviewed`, forbidden otherwise. `confirmed_by` and
`confirmed_at` stay as the publishing record and are never printed as a status. Migration
`pipeline/buried_pipeline/migrate/review_state.py`, idempotent: the Bank of Nova Scotia feature
`draft_hand`, every other existing feature `draft_rule`. `buried publish` writes `reviewed` from
the decisions file's reviewer and date. `web/src/evidence/review.ts` gives "Status: reviewed by
<by>, <on>" or "Status: draft, not yet reviewed"; the word "Confirmed" is not in it.

## Bridge 0.7.0

Only group U edits `data/schema/bridge.schema.json`.

| Message | Direction | Payload |
|---|---|---|
| `scene/setAnchors` | Shell to Player | `feature_ids`, in find order |
| `scene/anchors` | Player to Shell | `width`, `height` (canvas CSS px); `anchors`: `feature_id`, `x`, `y`, `on_screen` |
| `scene/raise` | Shell to Player | `era_id`, `first_feature_id`, `animate` |
| `scene/raised` | Player to Shell | `era_id` |
| `scene/frameFeature` | Shell to Player | `feature_id` |

- An anchor is the top centre of the feature's volume (ground centroid for an area); `on_screen`
  is false behind the camera or outside the canvas. `scene/anchors` is sent after
  `scene/setAnchors`, after `scene/raised`, after a resize, and at most once per frame while the
  camera moves; never while nothing changes.
- The Player owns the raise: plinths sink over 600 ms, the sheet brightens, then each ghost's
  edges draw on and its fill rises over 700 ms, starts staggered by distance from the first
  find's centroid so the last starts by 1.5 s. Reduced motion or `animate: false`: end state at
  once. Selection keeps the existing message; the Player maps it to lantern edges.

## Load states

`web/src/block/raiseState.ts`, a pure reducer: `still` -press-> `waiting` -ready-> `raising`
-raised-> `raised`; `still` -ready-> `ready` -press-> `raising`; any state -failed, or 20 s after
first paint without ready-> `flat`, keeping a pending press. `waiting` reads "Lighting the lamp".
The Block page chunk does not import the Unity loader; it starts it after first paint.

## The Still

`Buried.Editor.Still.Render` (headless) renders the opening pose (`BlockCamera`, the constant the
Player also uses) to `web/public/still/block-wide.jpg` (1600 by 1000) and `block-tall.jpg` (780
by 1600), each under 250 KB, plus `block.json` with the finds' anchors in image pixels. All three
are committed. The Shell maps those anchors through the image's object-fit cover arithmetic, so
tags sit on the Still before the Player loads.

## Tags and the leader line

`web/src/block/tagLayout.ts`, pure: anchors, tag sizes, viewport and keep-out rectangles
(header, card, ruler, Lantern control, top tag row) in; a rectangle or `hidden` per tag out.

- A tag tries above its anchor on a 40 px string, then 60 to 160 px in 20 px steps, then the same
  offsets to the left and right. The first spot inside the viewport that overlaps no keep-out and
  no earlier tag wins; otherwise the tag is hidden (it stays in the top row and the list).
- `on_screen: false` hides the tag. The selected find has no pinned tag; its leader line runs
  from the anchor to the card's left edge at the title row, and is hidden when the anchor is off
  screen or under the card, and on a phone. Then the card offers "Show on the map".

## The card

`web/src/block/FindCard.tsx`, one component; `BottomSheet.tsx` wraps it under 720 px. Text from
`web/src/evidence/findText.ts`: kicker from the reading's plan; title and subtitle from
`lettered` (banned-word check first, R4.3); crop from `crop_px` on the untouched tile; "Seen on";
"Placed within about X m" from `position_error_m` through the existing wording function; the
status line. An unnamed ghost takes its title from storeys and its crop from provenance (R4.5).
The ruler line (R5.3) uses the Evidence Library's plain plan names.

## Lantern lens, Flat sheet, share

- `LanternLens.tsx` draws the ring; `lensDrag.ts` (pure) tests whether a start is inside the lens
  and turns moves into the existing lens-position messages, with pointer capture.
- `FlatSheet.tsx`: the tile with an SVG layer. `sheetTransform.ts` (pure) maps EPSG:26917 to tile
  pixels from the sidecar corners. Anchors are footprint centroids, so tags, card and leader line
  are shared. The ruler swaps tiles; Today shows present outlines in `--block` over the dimmed 1911
  tile; the lens is a circular clip of the other layer.
- `share.ts` copies the link. `pageTitle.ts`: "<first lettered line>, <plan> · Buried", and the
  description "Lettered on the <plan> at Queen Street East and River Street, Toronto, with the map
  that proves it." Crawlers still see the generic card (session 031); no per-find static HTML.

## Core sample rows

The core-sample row text (in `web/src/place/`, wording in the Evidence Library) takes the row's
source and the feature's observations, and names a feature from another origin only as "First
drawn on the <Y> plan; drawn again on the <X> plan.", with a clear presence on X.

## Properties

- **[PBT] P1** Every finds file the Validator accepts has each reading resolving to a published
  feature with its crop inside the map area (Hypothesis).
- **[PBT] P2** For any anchors, sizes, viewport and card, no visible tag intersects the card,
  another keep-out or another visible tag (fast-check).
- **[PBT] P3** For any draft feature, the card text has no "Confirmed" (any case) and has "draft,
  not yet reviewed".
- **[PBT] P4** For any row for plan X and feature with origin Y ≠ X, the text names Y only inside
  "first drawn on".
- **[PBT] P5** For any event sequence, `raiseState` never loses a press, and only `waiting` reads
  "Lighting the lamp".
- **[PBT] P6** `sheetTransform` round-trips the sidecar corners within 0.5 px.

## Decisions taken here

Libre Baskerville and Source Sans 3 replace Fraunces and Inter. The Player timeout is 20 s. A
share link opens raised without the animation. Pinned tags stay for finds not selected; the top
row switches. `noun` is hand data. Address search moves to `/place`.
