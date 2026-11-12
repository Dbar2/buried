---
inclusion: fileMatch
fileMatchPattern: ["web/**", "unity/**"]
---

# Design

Mood: a city at dusk, lit by a lantern. The spookiness comes from atmosphere and the depth-is-time
metaphor. No cartoon ghosts, faces, skulls, bats or jump scares.

## Palette tokens

Dark theme (Explorer, Studio, shell chrome). Starting values; run a WCAG contrast check before
locking them, and record the results here.

| Token | Hex | Use |
|---|---|---|
| `night` | `#0E1116` | Background, sky |
| `fog` | `#1B2129` | Panels, ground haze |
| `present` | `#2E3742` | Today's buildings |
| `ink` | `#E8DFC8` | Ghosts, archival lines |
| `lantern` | `#F2A541` | Pinned lot, primary actions |
| `water` | `#5FB3B3` | Documented water, shorelines |
| `text` | `#EDEAE3` | Body text |
| `muted` | `#9AA3AD` | Secondary text |

- The present is cold, the past is warm. Do not mix them: no warm tint on today's buildings, no
  blue tint on ghosts.
- `lantern` marks the pinned lot and primary actions only. Never use it for decoration, and never
  for selection. A selected feature or review item has a brighter, thicker `ink` outline plus its
  DOM label. The Studio has no pinned lot, so it uses no `lantern` on its maps.
- `water` is only for documented water features. Never for links, info or generic accents.
- Body text is `text` on `night` or `fog`. Text must meet 4.5:1; large text and UI outlines 3:1.
- Define tokens once (CSS custom properties in `web/`, one C# palette asset in `unity/`). No raw
  hex values in components or materials.

Report theme (light paper) uses its own tokens, defined next to the Report
(`web/src/report/report.tokens.css`, spec 05). It is near-monochrome: dark ink on off-white, with
grey rules. It does not use `lantern`, `water` or `fog`. Starting values:

| Token | Hex | Use |
|---|---|---|
| `--report-paper` | `#FBFAF7` | Background |
| `--report-ink` | `#1A1A18` | Text, solid badges |
| `--report-ink-soft` | `#4D4C48` | Secondary text |
| `--report-rule` | `#8E8D88` | Rules, outlines |

Contrast results: not measured yet. Spec 05 task 5.4 measures them and records them here; a token
that fails is changed only with the maintainer.

## Type

- Headings: Fraunces.
- UI and body: Inter.
- Dates, plate numbers, source ids, coordinates, error margins: IBM Plex Mono.
- Self-host the font files with the shell; do not load them from a CDN at runtime.
- Body size at least 16 px on screen. The printed Report uses the smaller point sizes in spec 05
  "Print" (body 9.5 pt) so that it fits one page; this is the only exception.
  Numbers with units always carry the unit: `about 4.0 m`, `1947`.
- Position error is always worded "Positioned within about X m", never `±` or any wording that
  reads as an absolute bound. The text comes from the Evidence Library, not from components.

## Motion

- Era change: 600 to 900 ms. The present drains to wireframe, then to a faint outline, so the
  viewer keeps their place. Ghosts condense up from the ground.
- Camera: eased flights only. Never spin, orbit or move the camera unless the user asked.
- Studio: extracted footprints draw on in sequence; published buildings rise into the scene.
- Respect `prefers-reduced-motion` in the shell and pass it to Unity over the bridge. With reduced
  motion: crossfades only, no camera flights (cut to the target), no rising or condensing.
- Nothing loops or pulses while the user is reading.

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

- Keyboard paths for: search, depth gauge (Up/Down change era), Lantern (Space to hold),
  selecting ghosts (Tab through a list), Show Evidence, and every Studio review action
  (accept, edit vertex, merge, split, reject).
- Every ghost has a text equivalent in a list view: name or use, date window, confidence label,
  position error, sources.
- Visible focus ring on every interactive element.
- The Unity canvas is never the only way to reach information. A 2D map fallback and the Report
  work when WebGL fails or is turned off.
- Era changes are announced to screen readers ("Now showing 1947").

## The Report takes the costume off

- Light paper theme, no fog, no glow, no atmospheric copy. It may go to an inspector or a lawyer.
- "Buried screens; it doesn't certify." is the first line.
- Prints to one page (Letter and A4) without clipping. Sources and licence lines are printed.
- Findings show their status label in text. Dates in Plex Mono. No icons without text.

## How the Unity scene looks

- **Light.** Dusk: low sun from the west, sky graded from `night` at the zenith to a dim grey-blue
  near the horizon. Low ambient light. No day cycle.
- **Fog.** Exponential distance fog in the `fog` colour, dense enough that the edge of the
  coverage area dissolves. There is no visible edge of the world.
- **The present.** Today's buildings are matte `present` volumes, unlit by any warm source, no
  texture, no windows. Quiet enough that ghosts read over them.
- **The past.** Ghosts are drawn like ink on paper: thin `ink` edges, a translucent pale fill,
  slight self-illumination. They glow faintly; they do not bloom or flicker.
- **The pinned lot.** Outlined in `lantern` on the ground in every era. One small warm light near
  it. That is the only warm light in the scene. A selected ghost uses the brighter, thicker `ink`
  outline, not `lantern`.
- **Water.** Documented water renders as faint `water` light on the ground under today's streets.
  Never as animated waves.
- **Draped rasters.** Plates and aerials are shown with their original colours (the plates are
  greyscale). Do not tint, sharpen or stylise a source raster; it is evidence. Fade its opacity
  only. A plate drape shows its map area only; the full photograph, with archive labels, is on the
  Sources page.
- **Show Evidence.** The selected ghost goes transparent and the source raster appears beneath it.
- **Restraint.** No particles, lens flares, chromatic aberration, film grain or camera shake.
  Post-processing is limited to tone mapping and subtle bloom on `ink` and `lantern` only.
- Blender hero props (such as the lantern) use the same palette. They never stand in for
  buildings.
