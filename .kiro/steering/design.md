---
inclusion: fileMatch
fileMatchPattern: ["web/**", "unity/**"]
---

# Design

Brand: **an archival atlas examined by lamplight.** A real plan sheet on a dark table, one warm
lamp from the upper left, buildings rising off the paper as ink-edged apparitions. The Halloween
comes from the lamp, the fog, digging and buildings that come back. No invented deaths, hauntings
or dialogue; no skulls, pumpkins, bats, faces, cartoon ghosts or jump scares.

## What the brand is not

Not a dark dashboard: no card grids, no pill buttons, no gradient fills, no sidebar, no glass or
blur panels, no drop shadows, no icon rows, no stat tiles.

## Identity

- Wordmark "Buried" in Libre Baskerville. Tagline: "Forgotten maps, rebuilt with proof." Mark: the
  core-sample lens, a thin circle holding three or four strata lines (favicon, loading mark).
- Motifs: survey marks, registration crosses in corners, plate borders, sheet numbers, light ink
  hatching, catalogue cards, paper tags on string. Real scans are the main imagery. No other
  logos or illustrations; the concept pictures in `docs/brand/` are direction, not assets.

## Palette tokens

Defined once in `web/src/styles/tokens.css`; `Buried.Editor.Setup` writes the Unity palette asset
from it and an EditMode test compares the two. No raw hex values in components or materials.

| Token | Hex | Use |
|---|---|---|
| `--soot` | `#121715` | The table, sky, page background on the dark theme |
| `--haze` | `#1F2622` | Ground fog, the header band, the phone sheet's backing |
| `--block` | `#2B312D` | Today's buildings and their plinths (matte, cold) |
| `--parchment` | `#E8DCC1` | The sheet, the catalogue card, tags, text on soot, ghost fill |
| `--parchment-dim` | `#A99F8A` | Secondary text on soot or haze |
| `--ink` | `#23221F` | Text and lines on parchment, ghost edges, storey lines |
| `--ink-soft` | `#57524A` | Secondary text on parchment |
| `--rule` | `#7A7364` | Hairlines and control outlines on parchment |
| `--copper` | `#6D8376` | Ghost shade tint, survey marks and crosses on soot, hairlines on soot |
| `--lantern` | `#DCA34B` | The one primary action, the selected find, focus rings on soot |
| `--water` | `#5FB3B3` | Documented water only. Never text, links or accents |

Old tokens. `--ink` changes meaning from light to dark, so first replace every `var(--ink)` with
`var(--parchment)`, then the rest, then define the new `--ink`: `--ink` (old, `#E8DFC8`) and
`--text` → `--parchment`; `--night` → `--soot`; `--fog` → `--haze`; `--present` → `--block`;
`--muted` → `--parchment-dim`; `--lantern` keeps its name, new value; `--water` is unchanged.

Contrast pairs (WCAG 2 ratios; spec 06 task W1 measures them in a test that fails below the floor):

| Pair | Ratio | Floor | Use |
|---|---|---|---|
| `--parchment` on `--soot` | 13.3 | 4.5 | Body text on the dark theme |
| `--parchment` on `--haze` | 11.4 | 4.5 | Header and phone backing |
| `--parchment-dim` on `--soot` | 6.9 | 4.5 | Secondary text |
| `--ink` on `--parchment` | 11.7 | 4.5 | Card and tag text |
| `--ink-soft` on `--parchment` | 5.7 | 4.5 | Card secondary text |
| `--ink` on `--lantern` | 7.1 | 4.5 | The primary button's label |
| `--lantern` on `--soot` | 8.1 | 3 | Focus rings and selected tag outline on soot |
| `--rule` on `--parchment` | 3.5 | 3 | Control outlines on the card |
| `--copper` on `--soot` | 4.4 | 3 | Hairlines and marks only, never body text |

Pairs that fail and must not be used: `--lantern` on `--parchment` (1.6; focus rings on paper use
`--ink`), `--copper` on `--parchment` (3.0; decoration only, never a needed outline).

- `--lantern` stays rare: the one primary action on a screen, the selected find (its edges, its
  tag outline, its leader line) and focus rings on soot. The pinned lot on the place page is the
  same "this one" meaning. Never decoration, never a second button.
- Selection is never colour alone: the selected find also has a thicker edge, its card and its
  tag marked `aria-pressed`.

Report theme (light paper) keeps its near-monochrome tokens in `tokens.css`: `--report-paper`
`#FBFAF7`, `--report-ink` `#1A1A18`, `--report-ink-soft` `#4D4C48`, `--report-rule` `#8E8D88`. No
`--lantern`, `--water`, `--copper` or `--haze`; focus rings on paper use `--report-ink`.

## Type

- Headings, the wordmark and a find's name: Libre Baskerville (regular and italic). Fraunces is
  dropped: at display size its soft, wonky forms read as 1970s, not as a surveyor's plate.
- Controls and body: Source Sans 3 (Inter is dropped). Self-host every font; no off-origin request.
- IBM Plex Mono only for measurements, sheet numbers, source ids and coordinates. Card kickers
  ("LETTERED ON THE 1911 PLAN") are small capitals with wide tracking.
- Body size at least 16 px on screen. The printed Report uses the point sizes in spec 05 "Print"
  (body 9.5 pt); this is the only exception. Numbers with units carry the unit: `about 4 m`.
- Position error on the card is "Placed within about X m", elsewhere "Positioned within about X
  m"; never `±` or wording that reads as a bound. The text comes from the Evidence Library.

## Motion

- Raise: today's blocks sink to plinths (600 ms), the sheet brightens, then ghosts rise
  staggered, nearest the first find first. Each ghost's ink edges draw on, then its fill comes
  up. Everything has settled by 2.2 s.
- Era change: 600 to 900 ms crossfade of sheet and ghosts.
- Camera: still during Raise, era change and selection. It moves only when the visitor drags or
  asks ("Show on the map"), and then with an eased flight. Never spins or orbits on its own.
- Studio: extracted footprints draw on in sequence; published buildings rise into the scene.
- `prefers-reduced-motion` is passed to Unity over the bridge. With it: Raise, era change and
  flights cut to the end state. Nothing loops or pulses while the visitor is reading.

## Confidence encoding

Confidence is shown by pattern and by a text label. Never by colour alone. The same three classes
and labels appear in the scene, the evidence card, the list view and the Report.

| Class | Label | Scene | 2D and Report |
|---|---|---|---|
| Documented | "Documented" | Solid `ink` outline, filled volume | Solid outline, solid badge |
| Estimated | "Estimated" | Dashed `ink` outline, lighter fill | Dashed outline, outlined badge |
| Unknown | "Unknown" | Fog volume, no hard edges, a "?" marker | Dotted outline, "?" badge |

- The label always comes with its reason (from `confidence_reason`), on the card and in the Report.
- Confidence is computed outside Unity and arrives over the bridge. Unity maps class to look only.

## Accessibility

- Keyboard paths for: Raise the past, the find tags, the era ruler (Left/Right; Up/Down on the
  place page's depth gauge), search on `/place`, Lantern (Space to hold, `L` to toggle, arrows to
  move), selecting ghosts (Tab through a list), Show Evidence, and every Studio review action
  (accept, edit vertex, merge, split, reject).
- Every ghost has a text equivalent in a list view: name or use, date window, confidence label,
  position error, sources. The list is reached from a small "List" control.
- Visible focus ring on every interactive element.
- The Unity canvas is never the only way to reach information. The flat sheet fallback, the 2D
  map and the Report work when WebGL fails or is turned off.
- Era changes are announced to screen readers ("Now showing the 1911 plan").

## The Report takes the costume off

- Light paper theme, no fog, no glow, no atmospheric copy. It may go to an inspector or a lawyer.
- "Buried screens; it doesn't certify." is the first line.
- Prints to one page (Letter and A4) without clipping. Sources and licence lines are printed.
- Findings show their status label in text. Dates in Plex Mono. No icons without text.

## The raised scene and the card

- **Block page** (`/` and `/find/<slug>`). The scene fills the window. A thin `--haze` header:
  wordmark left, "Sources" right, a hairline rule with a registration cross at each end. Before
  Raise: the headline, the button and its line over the upper left of the sheet; paper tags on
  strings pinned at the finds. After Raise: find tags in a row along the top, the catalogue card
  docked at the right edge (about 360 px), the era ruler along the bottom (Today, 1935, 1911), the
  Lantern control at the bottom left, "List" beside it. A margin caption under the sheet names the
  block and holds "Look up an address".
- **The catalogue card.** Parchment, `--ink` text, hairline `--rule` lines between rows, a
  registration cross in each corner, no shadow. Kicker, name as lettered (Baskerville; the second
  lettered line in italic), the untouched lettering crop in a hairline frame, then rows "Seen on",
  "Placed within", "Status", then "Show the original sheet", "Share this find", "Full record". A
  thin `--lantern` leader line runs from the selected find's anchor to the card's left edge.
- **Phone** (under 720 px wide). Scene above, about 55 per cent of the height; the ruler on the
  scene's lower edge; the find tags in one scrolling row at the top. The card is a bottom sheet
  that peeks at kicker, name and status and drags up to full. No leader line on a phone.
- **Place page** (`/place?lot=`) keeps its layout: scene left about 58 per cent with the depth
  gauge, the paper report right about 42 per cent, the report below the scene on narrow screens.

## Studio look

- The scan is dimmed toward mid-grey so traced outlines read. Outlines in `--parchment`; rejected
  ones faint and dashed; the current one thicker with a small mono tag.
- The active step and nav item carry a `--lantern` underline. One primary button per panel,
  filled `--parchment` with `--ink` text. Dense, calm, no decoration.

## Controls

- Rectangular, 2 px radius at most, hairline borders, no shadows, no gradients, no pills; buttons
  are text. The one primary action is filled `--lantern` with `--ink` text; others are outlined
  (`--rule` on parchment, `--parchment-dim` on soot) or plain text links.
- Tags are paper: `--parchment` fill, `--ink` text, a hairline string to their anchor. The
  selected tag gets a `--lantern` outline on soot or a double `--ink` rule on paper.
- Focus rings: `--lantern` on soot and haze, `--ink` on parchment, `--report-ink` on the Report.

## How the Unity scene looks

- **Light.** One warm key light from the upper left, off frame, as if from a desk lamp: brightest
  on the sheet near the upper left, falling off toward the lower right and onto the `--soot`
  table beyond the sheet. Low cool ambient. The lamp is light only; no lamp model is shown.
- **The sheet.** The plate's map-area tile draped flat, toned toward `--parchment` with its lines
  toward `--ink` (a tone curve on the greyscale scan and the lamp falloff, nothing else), in a thin
  ink plate border. Raise brightens it. The card crop, "Show the original sheet", the Studio, the
  core sample and the Sources page always show the untouched scan.
- **Fog.** A thin ground fog in `--haze`, low over the table, and distance fog that dissolves the
  table's edge. No visible edge of the world. No fog particles.
- **The present.** Today's buildings are matte `--block` volumes on the sheet, no texture or
  windows. After Raise they sink to plinths 1 m high so the ghosts read over them.
- **The past.** Ghosts are plain volumes: a translucent `--parchment` fill, faces away from the
  lamp tinted toward `--copper`, crisp `--ink` edges and one horizontal `--ink` line per
  documented storey. No windows, chimneys, cornices or roofs: no source gives them. No bloom, no
  flicker.
- **The selected find.** Its edges turn `--lantern` and thicken, with a faint `--lantern`
  emission. The pinned lot on the place page is outlined in `--lantern` on the ground. These and
  the lamp are the only warm accents in the scene.
- **Water.** Documented water renders as faint `--water` light on the sheet. Never animated waves.
- **Show Evidence.** The selected ghost goes transparent over the untouched source raster.
- **Restraint.** No particles, lens flares, chromatic aberration, film grain or camera shake.
  Post-processing is limited to tone mapping and subtle bloom on `--lantern` emission only.
  Blender props use the same palette and never stand in for buildings.
