# Session 028 notes: mesher fix, the Lantern, Show Evidence (scene lane)

Builder, claude-sonnet-5.5. Bridge 0.5.0 to 0.6.0.

## 1. The mesher

`E15` failed on `bld_fip_v3_1935_229_0009` because the ear clipper emitted a cap triangle 13 m long and 3e-7 m high (area
4.3e-6 m2, over the 1e-6 floor in `Extruder`). Stored as float32 its normal came out as (0, 0, 0), so the test took it for a wall
and found it "facing into the solid". The cause is in `Triangulator`: it treated a triangle as collinear only below a twice-area
of 1e-9, far under what float32 positions (about 4e-6 m at 50 m from the origin) can hold. A triangle is now collinear when
twice its area is under 2e-5 or its height over its longest edge is under 0.02 mm; the middle vertex is dropped as before.
Walls come from the rings, not from the triangulation, so they are unchanged, and a dropped sliver moves the cap by under 0.02 mm.

E15 now collects every failing polygon and lists them together (no polygon is excluded), and the polygon is a named
regression test. Result: 3264 polygons, 0 failures, E4 still passes.

## 2. The pinned lot

The lamp is gone (post, head, `LampPosition`, the constants). The outline in `lantern` stays, and the light pool on the sheet still
moves to the lot. Nothing warm marks the lot where no plate is draped (at Today). I did not add a pool that draws without a
drape, because that needs a new shader reference in `Bootstrap.unity`.

## 3 and 4. New bridge messages (0.6.0)

| Name | Direction | Payload | What the Player does |
|---|---|---|---|
| `scene/setLantern` | Shell to Player | `{ on, center: {x, y} (0..1 from the top left), radius (0.05..0.5 of the canvas height), eraId }` | Lens on or off. Inside: the era's lit plate and ghosts and no present buildings. Outside: Today. Thin `ink` ring with a `night` casing. Ignored (warning) when the depth is not 0; the lens shuts when the depth leaves 0. Unknown era: `era_not_initialised`. Reduced motion: no easing. |
| `scene/showEvidence` | Shell to Player | `{ featureId, on, drape? }` (drape required when on, absent when off; checked by both parsers) | The ghost's volume at alpha 0.05 with its outline kept; the untouched scan drawn full strength on its footprint box grown by 4 m. The rest of the lit sheet is as it was. Off restores. |

`drape` is optional in the schema instead of nullable as in the spec design, so the Unity DTO reflection test needs no null type.
`sceneFocusLot` no longer mentions a lamp. `ScreenPointDto` is the new shared object.

How it works: the lens is a global shader vector (`_BuriedLens`, in fragment pixels) and a per-material `_LensMode` (0, 1 inside,
2 outside). Today's present buildings are outside-only, the Lantern's era inside-only and held at weight 1 while the lens is on.
`LanternMask.Contains` picks the era for a click. The clip is compiled into a `_BURIED_LENS` variant only (see below).
Show Evidence draws the ghost again on its own and rebuilds its chunk without it; the patch is a second `DrapeLayer` with the
mask's coverage channel and no tone curve, one queue step below the ghosts.

## Shell wiring (small edits in `web/src/explorer/`)

`lantern.ts`, `useLantern.ts`, `LanternToggle.tsx/.css`, `showEvidence.ts` (all new) and `Explorer.tsx` / `UnityView.tsx`
(two props and one hook call). Space held (focus in the Explorer, or nowhere with the pointer over it), a 500 ms touch
long-press, `L` and the Lantern button toggle, arrows move the lens by 0.05, Escape turns it off. The depth gauge, buttons and
inputs keep their own Space. Show Evidence has no button yet: `/?showEvidence=<feature id>` sends it while that feature's era is on
screen. The evidence card lane (029) can call `buildShowEvidence` from `lantern.ts`. `?lanternEra=<id>` picks the era inside the lens;
without it the era at depth 1 (1947, which has no plate) is used.

## Decision to look at

- **A discard costs a frame budget.** The first version put `discard` in every shader. With the lens off, `art.spec` frame times fell
  from 60 to 44 to 51 fps on the GPU run (the same run with the lens on gave 60 once the machine was quiet, so the machine
  was noisy too). On a tile-based GPU a shader that can discard loses hidden-surface removal. The clip is now compiled only into the
  `_BURIED_LENS` variant, which a material gets only while it meets the lens (`LensMaterial.SetMode`). After that: 60.0 fps in every
  case of `art.spec` and `lantern.spec`.

## Checks

- Unity EditMode: 155 tests, all pass (137 at the start of the session, 135 of them passing).
- Web `npm test`: 82 files, 724 tests pass. Typecheck passes.
- Playwright (after `tools/unity.sh build` and `npm run build`): lantern 4 of 4, art 4 of 4, look 12 of 12, dig 6, drape 4, gate 2.
- Lens (1280 x 800, lens radius 134 px over the bank): outside the lens the picture equals Today in all 890 815 pixels
  (0 differ by more than 8); inside it equals the 1911 picture except 839 of 51 411 pixels (1.6%, Today's faint outlines, which
  are drawn in every era); 92% of the inside differs from Today. The rim is drawn at 100% of 180 directions. Space released and
  Escape both give Today again (0 pixels differ); `L` turns the lens on; the arrow keys move it.
- Show Evidence on the bank: normalised cross-correlation 0.994 between a 128 px window and the tile's own pixels (window of
  16384 px, 9926 away from the ghost's lines; the lit sheet gives 0.774 on the same pixels). **The lines the ghost draws over its footprint
  (roof, floor line, base, corners, within 7 px) are left out of the correlation. With them in, it is 0.741.** The ghost keeps its
  outline (roof line at 170 of 170 points). The rest of the sheet differs from the lit sheet in 0 of 906 492 pixels. The patch differs from the
  lit sheet in 85% of its pixels.
- Frame times with the lens on, GPU Chromium (Metal): 60.0 fps at 1x and at 4x CPU throttling, p95 16.7 ms. Software GL (SwiftShader):
  5 to 15 fps with and without the lens; not judged.

## Pictures

`web/e2e/output/lantern-today.png`, `evidence-bank.png`, `art-1911-pinned.png` (no lamp).
