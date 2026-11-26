---
inclusion: fileMatch
fileMatchPattern: ["web/**", "unity/**"]
---

# Design

Brand: **an archival atlas, read by lantern at night** (session 053, the night dig). The lot check is a
dark page with a parchment record lying on it: night ground, parchment text, a real plan scan as the main
picture, one lantern-coloured outline on the lot. The 3D block (`/block`) keeps the lamplit table. The
Halloween rule: night, fog, lantern, earth, spade, grave-marker lettering. No skulls, pumpkins, cartoon
ghosts, blood or bats; no faces, jump scares, invented deaths, hauntings or dialogue; nothing invented
about a place.

## What it must not look like

Not a dashboard, not a card grid, not a poster. No tiles of stats, no pill buttons, no gradient
fills, no sidebar, no glass or blur panels, no drop shadows, no icon rows, no hero image with text
laid over it. A page is a column of plain sections separated by hairlines, with one plan picture.

## Identity

- Wordmark "Buried" in Libre Baskerville. Tagline: "Forgotten maps, rebuilt with proof." Mark: the
  core-sample lens, a thin circle holding three or four strata lines (favicon, loading mark).
- Motifs, used lightly: survey marks, a registration cross in a corner, plate borders, sheet
  numbers. Real scans are the only evidence imagery. The five illustrations in `web/public/lotcheck/art/`
  (lantern, earth cross-section, paper, skyline, spade) are decoration made with an image model; the Sources
  page says so under "Illustrations". No other logos or illustrations; the pictures in `docs/brand/` are
  direction, not assets.
- Layout: the lot check text column is about 720 px wide; the Landing and the Result are two columns up to
  about 1180 px. Left-aligned text, generous line spacing. The one centred block is the inscription at the
  top of the record sheet, set like a grave marker.

## Palette tokens

Defined once in `web/src/styles/tokens.css`; `Buried.Editor.Setup` writes the Unity palette asset
from it and an EditMode test compares the two. No raw hex values in components or materials.

| Token | Hex | Used for |
|---|---|---|
| `--parchment` | `#E8DCC1` | The lot check page ground; the 3D catalogue card and tags; text on soot |
| `--ink` | `#23221F` | Text and lines on parchment; the casing round the lot outline; ghost edges |
| `--ink-soft` | `#57524A` | Secondary text and captions on parchment |
| `--rule` | `#7A7364` | Hairlines between sections; control and field outlines on parchment |
| `--copper` | `#6D8376` | Secondary marks: survey marks, crosses, the compare divider's grip. Never text |
| `--lantern` | `#DCA34B` | The one primary button, the lot outline, the selected find, focus rings on soot |
| `--soot` | `#121715` | The slim header, the 3D pages' table and sky |
| `--haze` | `#1F2622` | The header band, 3D ground fog, the phone sheet's backing |
| `--block` | `#2B312D` | Today's buildings in 3D and their outline after Raise |
| `--parchment-dim` | `#A99F8A` | Secondary text on soot or haze |
| `--water` | `#5FB3B3` | Documented water only. Never text, links or accents |
| `--stamp` | `#8E3B2E` | The rubber stamp on the record sheet, on parchment only. Nothing else |

Contrast pairs (WCAG 2 ratios; spec 06 task W1's test measures them and fails below the floor):

| Pair | Ratio | Floor | Use |
|---|---|---|---|
| `--ink` on `--parchment` | 11.7 | 4.5 | Body text, the tag, the card |
| `--ink-soft` on `--parchment` | 5.7 | 4.5 | Captions, provenance strip, "Try:" |
| `--ink` on `--lantern` | 7.1 | 4.5 | The primary button's label |
| `--lantern` on `--ink` | 7.1 | 3 | The lot outline's stroke against its ink casing |
| `--rule` on `--parchment` | 3.5 | 3 | Field and control outlines, hairlines |
| `--parchment` on `--soot` | 13.3 | 4.5 | Header text, 3D page text |
| `--parchment` on `--haze` | 11.4 | 4.5 | Header band, phone backing |
| `--parchment-dim` on `--soot` | 6.9 | 4.5 | Secondary text on soot |
| `--lantern` on `--soot` | 8.1 | 3 | Focus rings and selected marks on soot |
| `--copper` on `--soot` | 4.4 | 3 | Hairlines and marks on soot only |
| `--stamp` on `--parchment` | 5.5 | 4.5 | The stamp's text and double border on the record sheet |

Pairs that fail and must not be used: `--lantern` on `--parchment` (1.6), so a lantern stroke on
paper always has an `--ink` casing and a focus ring on paper is `--ink`; `--copper` on `--parchment`
(3.0), so copper is never a needed outline or any text on the lot check pages; `--lantern` as text
anywhere.

- `--lantern` stays rare: the one primary button on a screen, the lot outline, the lit lots on the Landing's
  plan, the lantern's own glow and focus on soot. Never body decoration, never a second button. The primary
  button also has a 1 px `--ink` border, because lantern on parchment is 1.6.
- `--stamp` is used for the rubber stamp and nothing else, and only on parchment.
- Selection and state are never colour alone: the tag is words, the selected layer in the compare view is a
  checked radio with a heavier rule (session 055; it was `aria-pressed` buttons), the outline has a casing.
- The Report theme keeps its near-monochrome tokens: `--report-paper` `#FBFAF7`, `--report-ink`
  `#1A1A18`, `--report-ink-soft` `#4D4C48`, `--report-rule` `#8E8D88`. No `--lantern`, `--water`,
  `--copper` or `--haze`; focus rings on paper use `--report-ink`.

## Type

- Headings, the wordmark and a lettered name: Libre Baskerville (regular and italic).
- Controls and body: Source Sans 3. Self-host every font; no off-origin request.
- IBM Plex Mono only for measurements, sheet numbers, source ids and coordinates. Kickers
  ("A LOT CHECK FROM OLD FIRE-INSURANCE PLANS") are small capitals with wide tracking.
- Body size at least 16 px on screen. The printed Report uses the point sizes in spec 05 "Print"
  (body 9.5 pt); this is the only exception. Numbers with units carry the unit: `about 4 m`.
- Position error is "Positioned within about X m" (the card: "Placed within about X m"); never `±`
  or wording that reads as a bound. The text comes from the Evidence Library.

## Motion

- The lot check pages are a night dig (session 053). Only `transform` and `opacity` animate, except the
  compare divider's one sweep and the stamp's filter, which is applied once and never animated.
  - Landing entrance, about 1.6 s: the lantern flickers alight (opacity), its light spreads over the paper
    (scale and opacity), the recorded lots begin to glow one after another (80 ms apart). After that: the
    flame flickers (opacity, 3 to 5 s), fog drifts (translate, 60 s), recorded lots pulse slowly (opacity,
    3.2 s), and a soft pool of light follows the pointer over the map.
  - The dig (an overlay when a visitor chooses an address on the Landing): about 4.5 s with two plans. 0.8 s
    to break ground, 1.2 s per layer (0.6 s down, 0.6 s paused with its paper slip), 0.8 s at the bottom,
    0.5 s dark beat. Never longer than 7 s. Skip, Escape and Enter end it. A direct visit to a Result does not
    play it.
  - The reveal on the Result: the sheet rises into place (0.6 s), the stamp comes down 0.4 s after (scale 1.5
    to 1 with a little overshoot, the sheet nudges 1 px), the compare divider sweeps once from the right edge
    to the middle, the dashed "where it stood" outline breathes (4 s), the rows arrive one after another
    (120 ms apart). Settled by about 2.4 s.
  - Buttons: the "Dig" label nudges down 1 px on hover and focus. Focus rings change in 150 ms.
- `prefers-reduced-motion`: no overlay, no sweep, no pulse, no flicker, no drift. Every page cuts to its end
  state and the Result shows the stamp in place.
- Block page Raise: today's blocks sink flat to a thin `--block` outline at about 35 per cent
  (600 ms), the sheet brightens, then ghosts rise staggered, nearest the first find first. Ink edges
  draw on, then fill. Settled by 2.2 s. Era change: a 600 to 900 ms crossfade. The camera is still
  unless the visitor drags or asks, then an eased flight. It never spins or orbits.
- Studio: extracted footprints draw on in sequence; published buildings rise into the scene.
- `prefers-reduced-motion`: everything cuts to its end state (and is passed to Unity over the
  bridge).

## Confidence encoding

Confidence is shown by pattern and by a text label. Never by colour alone. The same three classes
and labels appear in the scene, the card, the list view, the compare view and the Report.

| Class | Label | Scene | 2D and Report |
|---|---|---|---|
| Documented | "Documented" | Solid `ink` outline, filled volume | Solid outline, solid badge |
| Estimated | "Estimated" | Dashed `ink` outline, lighter fill | Dashed outline, outlined badge |
| Unknown | "Unknown" | Fog volume, no hard edges, a "?" marker | Dotted outline, "?" badge |

- The label always comes with its reason (from `confidence_reason`), on the card and in the Report.
- Confidence is computed outside Unity and arrives over the bridge. Unity maps class to look only.

## Accessibility

- Keyboard paths for: the address field and "Check this address" (Enter submits), the example
  links, the compare divider (Left/Right 5 per cent, Home and End; `role="slider"`, `aria-valuenow`,
  `aria-label` "Divider between the 1911 plan and today"), the plan switch, every button and link,
  and on the 3D pages Raise, find tags, the era ruler, the Lantern (Space to hold, `L` to toggle,
  arrows to move) and every Studio review action.
- The compare view has a text equivalent: "What the plans show" lists every row the map draws.
- Visible focus ring on every interactive element: `--ink` 2 px with 2 px offset on parchment,
  `--lantern` on soot and haze, `--report-ink` on the Report.
- The Unity canvas is never the only way to reach information. The lot check works with WebGL off.
- A change of plan in the compare view is announced ("Now showing the 1911 plan").
- Touch targets at least 44 px. Text reflows at 320 px with no sideways scroll.

## The Report takes the costume off

- Light paper theme, no fog, no glow, no atmospheric copy. It may go to an inspector or a lawyer.
- "Buried screens; it doesn't certify." is the first line.
- Prints to one page (Letter and A4) without clipping. Sources and licence lines are printed.
- Findings show their status label in text. Dates in Plex Mono. No icons without text.

## The lot check pages: the night dig

The page is night: `--soot` ground with `--haze` fog, text on it `--parchment`, focus rings `--lantern`. The
record is a parchment sheet (`paper.webp`) lying in the dark with `--ink` text, so the compare view, the
rows' crops and the provenance strip keep their paper rules. Illustrations are decoration only: they never
carry a claim. Weights: the Landing may transfer 950 KB and the Result 700 KB before the tile.

- **Header.** Slim `--soot` band: wordmark left; "How it works" and "Sources" right; hairline rule in
  `--copper`. The mark glows faintly `--lantern` on these pages.
- **Landing** (`/`). Night. The skyline along the top, low fog. Left column: kicker, headline ("What is
  buried under your address?", Baskerville, large, `--parchment`), one sentence, the address combobox and
  the "Dig" button side by side (stacked on a phone), "or dig somewhere at random", then the computed fact
  and the coverage line. Right (under on a phone): the real plan crop on the paper art with a lantern
  standing at its corner and the recorded lots outlined faintly in `--lantern`. Hover or focus brightens a
  lot and shows a paper tag with its lettering; a click digs there. The spade stands in the ground at the
  page edge. Caption, computed: "N lots on this block have something recorded. Click one."
- **The combobox.** A parchment field, 48 px high. Its list is parchment, `--ink` text, hairline rows of 44
  px; a lot with something recorded carries a small `--lantern` dot and the words "something recorded".
  Empty and focused: "Try one of these". No match: "We have not dug there yet. Try one of these:".
- **The dig** (overlay, full window). `strata.webp` panned down behind a lantern on a rope, the skyline above
  the ground line, earth dark except in the lantern's light. A depth ruler at the left: "Today", then each
  plan covering the lot, newest first. At each mark the lantern pauses and a paper slip beside it shows what
  the result shows for that layer, from `buildLotCheck`. Caption at the bottom: "Digging down to <year>…" and
  the address. "Skip" at the lower right.
- **Result** (`/lot/<id>`). The address in Baskerville, `--parchment`. The record sheet, with the lantern at
  its upper left (hidden on a phone). At the top of the sheet an inscription set like a grave marker (thin
  `--ink` rule, corner ornaments, centred, Baskerville): "HERE STOOD" or "NEXT DOOR STOOD" or "NOTHING
  LETTERED HERE" or "NOT DUG YET", the lettered name in italic, one line of years. The verdict sentence
  stays under it. The tag is a rubber stamp: `--stamp` text and double border, small capitals, rotated about
  -6 degrees, slightly uneven (one SVG turbulence filter on the stamp only). The compare view is on the
  sheet. Right column: "What the plans show", "What this does not tell you", the one `--lantern` button,
  then "Share this check" and "Dig another address" as text links.
- **Not covered.** "NOT DUG YET", the spade art and the coverage line. No stamp animation beyond the rest.
- **Compare view.** One frame in a hairline plate border, 4:3 on desktop and 1:1 on a phone. The
  plan on the left, today on the right, a 2 px `--ink` divider with a round `--copper` grip
  carrying small chevrons. The lot outline is a 4 px `--lantern` stroke inside a 6 px `--ink`
  casing, identical on both sides. Today's outlines are 1 px `--ink`; lot lines 1 px `--rule`
  dashed. On the Today side each lettered use on the lot is also drawn as a faint dashed
  `--ink-soft` line that breathes ("where it stood"; parchment would vanish on the parchment ground). Plan switch above the frame: two text buttons,
  the active one with a heavier underline. Corner labels "1911 plan" and "Today" in mono on parchment chips.
- **What the plans show.** A table without a grid: each row has the lettering crop in a hairline
  frame (never recoloured), the year in mono, one line of text. Rows are separated by hairlines.
- **Actions.** "Download the one-page record" is the one filled `--lantern` button. "Share this
  check" and "See this block in 3D" are plain text links.
- **Provenance strip.** One line of `--ink-soft` text with mono figures under a hairline.
- **Phone** (under 720 px wide). Same order, single column. The field and the button stack. The
  compare view is square and edge to edge. The one-page record button spans the width.
- **3D pages** (`/block`, `/find/<slug>`) keep the soot theme, the catalogue card (parchment,
  `--ink` text, hairline `--rule` lines, a registration cross in each corner, no shadow, a thin
  `--lantern` leader line from the selected find) and the bottom sheet on a phone.

## Studio look

- The scan is dimmed toward mid-grey so traced outlines read. Outlines in `--parchment`; rejected
  ones faint and dashed; the current one thicker with a small mono tag.
- The active step and nav item carry a `--lantern` underline. One primary button per panel,
  filled `--parchment` with `--ink` text. Dense, calm, no decoration.

## Controls

- Rectangular, 2 px radius at most, hairline borders, no shadows, no gradients, no pills.
- The one primary action is filled `--lantern` with `--ink` text and a 1 px `--ink` border. Others
  are outlined (`--rule` on parchment, `--parchment-dim` on soot) or plain text links, underlined.
- The address field: parchment ground, 1 px `--rule` border (`--ink` when focused), 48 px high.
- Paper tags on the 3D pages: `--parchment` fill, `--ink` text, a hairline string to their anchor.

## How the Unity scene looks (3D pages only)

- **Light.** One warm key light from the upper left, off frame, as from a desk lamp, falling off
  onto the `--soot` table. Low cool ambient. No lamp model.
- **The sheet.** The plate's map-area tile draped flat, toned toward `--parchment` (a tone curve and
  the lamp falloff, nothing else), in a thin ink border. The card crop, "Show the original sheet",
  the Studio, the compare view and the Sources page always show the untouched scan.
- **Fog.** A thin ground fog in `--haze` and distance fog that dissolves the table's edge. No
  particles.
- **The present.** Today's buildings are matte `--block` volumes, no texture or windows. After Raise
  they stay as a thin `--block` outline at about 35 per cent.
- **The past.** Ghosts are plain volumes: translucent `--parchment` fill, faces away from the lamp
  tinted toward `--copper`, crisp `--ink` edges and one horizontal `--ink` line per documented
  storey. No windows, chimneys, cornices or roofs: no source gives them. No bloom, no flicker.
- **The selected find.** Its edges turn `--lantern` and thicken, with a faint emission. Water is
  faint `--water` light on the sheet, never animated.
- **Restraint.** No particles, lens flares, chromatic aberration, film grain or camera shake.
  Post-processing is tone mapping and subtle bloom on `--lantern` emission only.

## The walk (parked)

`/walk` (spec 07) is parked on Nov 25: not linked, not shipped. If revived, it stays a labelled
reconstruction: walls, windows, doors, lamps and painted signs are drawn at eye height, each exhibit
panel states what the plan gives and what is imagined, and its night look belongs to that mode
alone. Later sessions must not remove the labels or apply the ghost rules to it.
