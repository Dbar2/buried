# Session 018 notes: two test decisions, then Dig

Builder, claude-sonnet-5.5. Brief: `018-dig.md`.

## 1. The two decisions

### 26.1 corner criterion: dropped

The test "26.1 / (d) at least two corners of the 1911 drape are off the canvas" is deleted from
`web/e2e/look.spec.ts`, and the clause is removed from requirement 26.1. The default view frames the
whole map area plus 15 per cent, so the four corners of a map-area tile are in view. The other half of
26.1 (the published building inside the middle third) is unchanged and its test still runs. Pitch 21
degrees with a 58 degree field of view stays.

### 17.4 margin: 15 m

`design.md` "Drape placement check" and the test constant (`INSIDE_MARGIN_M`, default `FEATHER_M`) now
say 15 m, the width of the drape's edge fade. `DRAPE_MARGIN_M` still overrides it for measuring runs.
Run on both plates at the default margin: 4 passed.

| Plate | Point | Inside the map area | Patch sd | NCC peak | Offset (px) | Result |
|---|---|---|---|---|---|---|
| 1911 | cp_13465478 | 20.0 m | 56.8 | 0.9842 | 0, 0 | tested, passes |
| 1911 | cp_13465645 | 17.4 m | 79.3 | 0.9815 | 0, 0 | tested, passes |
| 1911 | cp_13465760 | 42.9 m | 45.2 | 0.9881 | 0, 0 | tested, passes |
| 1911 | cp_13465711 | 81.1 m | 48.9 | 0.9845 | 0, 0 | tested, passes |
| 1911 | cp_13465571 | 8.5 m | | | | skipped (under 15 m) |
| 1911 | cp_13465784 | 9.1 m | | | | skipped |
| 1935 | cp_13465478 | 18.9 m | 45.2 | 0.9703 | 0, 0 | tested, passes |
| 1935 | cp_13465760 | 47.2 m | 31.1 | 0.9867 | 0, 0 | tested, passes |
| 1935 | cp_13465711 | 79.4 m | 46.7 | 0.9907 | 0, 0 | tested, passes |
| 1935 | cp_13465571 | 9.3 m | | | | skipped |
| 1935 | cp_13465645 | 13.5 m | | | | skipped |
| 1935 | cp_13465784 | 13.8 m | | | | skipped |

1911 has four tested points, 1935 has three, so both meet the "at least three" rule. Outside the map
area (item 6): 102.5 m outside the 1911 clip and 97.7 m outside the 1935 clip, the largest channel
difference against the same view with no drape is 0. Task 17.4 is ticked.
