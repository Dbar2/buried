# Kiro session 033: two integration fixes after merging the scene and web lanes

Agent: builder (claude-sonnet-5.5). Checkout: the main working copy. Lane: `web/e2e/**`,
`web/src/explorer/**`, `unity/` only if the scene itself is at fault. The web lane is working in
its own worktree on the Studio, the report and the place page; do not edit `web/src/studio/`,
`web/src/report/` or `web/src/place/`. Commit with `git commit -m ... -- <paths>`. Never commit
`Bootstrap.unity` for id-only changes.

Read only: this brief; `web/e2e/art.spec.ts` (the test at line 225 and its helpers);
`.kiro/steering/design.md` on where `lantern` may appear; `web/src/explorer/useLantern.ts` and
`lantern.ts`.

## 1. `art: Today, with no lot pinned, has no lantern anywhere` fails on main

After the merge it counts 2,436 `lantern` pixels. `design.md` allows `lantern` in Shell chrome
(the active nav underline, focus rings, the primary action) and forbids it in the scene unless a
lot is pinned. Find where the pixels are. If they are Shell chrome, make the test measure the
canvas only, with the Shell's overlays excluded by geometry (not by hiding elements with CSS that
could also hide a real fault), and keep a separate assertion that the canvas has zero `lantern`
pixels at Today with no lot pinned. If any are in the canvas, that is a scene bug: fix the scene.
Say which it was.

## 2. The Lantern's default era

At Today the lens shows the era one step down, which is 1947, and 1947 has no plate yet, so the
lens shows almost nothing unless `?lanternEra=` is given. Make the default the nearest era below
Today that has a drape to show (today that is 1935), keep `?lanternEra=` as an override, and show
the lens's era in the Lantern control's label ("Lantern: 1931-35 plan"). Test both.

## Checks

Run `art.spec.ts`, `lantern.spec.ts` and `look.spec.ts` on their own (the machine is busy; the
frame-time tests failed once under load and pass alone, so do not judge them while other suites
run). Unit tests and typecheck. Short final report.

Never weaken a test beyond scoping item 1's measurement to the canvas. Do not push.
