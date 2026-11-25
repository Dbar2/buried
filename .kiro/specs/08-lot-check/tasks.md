# 08 Lot check: tasks

One builder session, in order. **(demo)** marks what the demo video needs. Record new commands in
`tech.md`. Old `PlacePage` and `Landing` stay in the tree, unrouted.

- [x] 1. **(demo)** Industrial list: `web/src/evidence/industrialUse.ts` and test, exported from the
  Evidence Library index. P2; list sorted, unique, lowercase, no banned words. (4.1)
- [ ] 2. **(demo)** Verdict: `web/src/lotcheck/lotCheck.ts`, `copy.ts`, test. Fixtures: the Percy
  Street lot (on), one beside it (near), a covered lot with no match, a lot outside coverage.
  P1, P3, P6. (3.2 to 3.8, 4)
- [ ] 3. **(demo)** Landing fact and examples: `web/src/lotcheck/landing.ts`, test. P4. Run on the
  committed data; report the count and the addresses. (2.3, 2.4)
- [ ] 4. **(demo)** Compare model: `web/src/lotcheck/compare.ts`, test. P5; lot corners land where
  `worldToPixel` puts them. (5.1 to 5.3)
- [ ] 5. Routes: `web/src/place/placeLink.ts` and test, `web/src/App.tsx`, `web/src/shell/Header.tsx`,
  `web/src/shell/pageTitle.ts`, `web/src/sources/SourcesPage.tsx`. Add `landing`, `lot`, `how`;
  remove `walk`; header "How it works" and "Sources"; the Studio linked from Sources only. A test
  that the new pages import no `explorer`, `bridge` or `walk` module. (1.1 to 1.3, 7.4)
- [ ] 6. **(demo)** Landing: `web/src/lotcheck/LandingPage.tsx`, `web/src/styles/lotcheck.css`,
  `web/scripts/genLandingPlan.ts`, script `gen:landing-plan`, `web/public/lotcheck/*`. (2, 7.1)
- [ ] 7. **(demo)** Result and compare view: `LotPage.tsx`, `CompareView.tsx`, `CompareView.test.tsx`
  (divider keys, clamp, plan switch announcement), CSS. "Download the one-page record" opens the
  Report for the lot; if the Report has no print entry, add at most a `print=1` query that calls
  `window.print()`, and say so. Extend the spec 06 W1 contrast test with design.md's pairs; fail on
  `--lantern` text or `--copper` text on parchment. No token values change. (3, 5, 7.2)
- [ ] 8. How page: `HowPage.tsx`, copy, four small crops under `web/public/lotcheck/`. (6)
- [ ] 9. Block link: measure the Brotli size of `web/public/unity/Build/*`. Over 30 MB total (this
  spec's figure; the maintainer may change it), remove "See this block in 3D" and the `/block` and
  `/find/<slug>` routes and say so; otherwise keep both. (3.6)
- [ ] 10. **(demo)** Browser tests: `web/e2e/lotcheck.spec.ts`, `web/playwright.lotcheck.config.ts`
  (own port, no WebGL, no Unity build). Landing to example to result; tag and lettering visible;
  divider by keyboard and drag; plan switch; 390 px pass (`e2e/output/lotcheck-*.png`); no `/unity/`
  request; transfer sizes against 1.4. Run the block and hosting specs and list those that fail
  because routes moved. (1.3, 1.4, 7.1)
- [ ] 11. Report: sizes, the Percy Street count, list proposals, tile size, every departure.
