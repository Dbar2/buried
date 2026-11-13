# Session 039 notes: new look and routes (web lane, part one)

Spec 06 tasks W1, W2 and the core-sample part of W10.

## What changed

### W1: tokens, fonts, controls
- `tokens.css` now holds the design.md palette (`soot`, `haze`, `block`, `parchment`, `parchment-dim`,
  `ink`, `ink-soft`, `rule`, `copper`, `lantern` #DCA34B, `water`), renamed in the order design.md gives.
  Every `var(--...)` and `token('--...')` use in `web/src/` and `web/social/` was updated. The favicon
  uses `parchment` on `soot`.
- Fonts: `@fontsource/libre-baskerville` (400, 400 italic) and `@fontsource/source-sans-3` (400, 600),
  IBM Plex Mono unchanged. `@fontsource/fraunces` and `@fontsource/inter` removed. Heading weights
  went from 600 to 400 (Baskerville is loaded at 400 only; 600 would be a synthesised bold), in
  `app.css`, `layout.css`, `report.css`, `sources.css`, `place.css`.
- Sources page: a "Typefaces" section with the SIL Open Font License 1.1 line (it credited no fonts before).
- `web/src/styles/contrast.test.ts` checks all nine pairs against their floors and against design.md's
  stated ratios (within 0.15), and that the two forbidden pairs really are below 3.1.
- Controls: header on `haze` with a `copper` hairline, depth gauge and evidence card on solid `haze`
  with a hairline border (was 90% translucent, no border), the landing's gradient backdrop and the
  social card's gradient replaced with flat `soot`. `public/social-card.png` was regenerated
  (`npm run gen:social-card`).
- E2E expectations changed to read `tokens.css` by new names: `art.spec.ts`, `look.spec.ts` (token
  regex now allows hyphens; `night` to `soot`, old light `ink` to `parchment`), `studio-brand.spec.ts`
  (primary is now `parchment` fill with `ink` text), `brand.spec.ts` (font families Libre Baskerville
  and Source Sans 3, no Fraunces or Inter).

### W2: routes and header
- `routeFor` returns `block` (`/` with no query, `/find/<slug>`), `search` (`/place` without `lot`),
  `place` (`/place?lot=`), and the old routes unchanged. `findSlugFor` reads the slug.
  Tests in `placeLink.test.ts` cover every row.
- `web/src/block/BlockPage.tsx` (placeholder) and `block.css`: headline, line, a link styled as a dim
  button to `/?era=1911`, margin caption with "Look up an address" to `/place`. It is an `<a>`, so it
  keeps link behaviour; part two replaces it with the Raise button.
- `Landing` (address search) is served at `/place`. Header: wordmark and "Sources" only; no Studio or
  Explorer link. Sources page links "The workshop (runs on a maintainer's machine)" to `/studio`.
- New page title for the block page: "Buried · Forgotten maps, rebuilt with proof." The static
  `index.html` title is unchanged ("Buried · What was here?"), so crawlers still see the old text.
- E2E expectations changed: `brand`, `polish`, `phone`, `firstload` visit `/place` instead of `/` for
  the search page; `art.spec.ts` "Today with no lot pinned" visits `/explorer`; `hosting.spec.ts`
  checks `/`, `/find/overall-factory` and `/place` as first requests; `studio-brand.spec.ts` no longer
  looks for a Studio nav link.

### W10 (core-sample part only)
- `web/src/evidence/rowWording.ts`: `outlineAttribution`, `firstDrawnText`, `clearPresenceSourceIds`.
  A row for plan X says "A building outline read from the X plan sits on this lot." when X is the
  origin; for another origin Y it says "A building outline sits on this lot." then "First drawn on the
  <Y> plan; drawn again on the <X> plan.", only when X has a clear presence in the linked set. Where X
  has none, the row names no other plan, and says "From the <X> plan. No outline at this lot is read
  from it." if that leaves the row with no outline sentence.
- P4 (fast-check) in `rowWording.test.ts`; row tests in `buildReport.test.ts`.
- Not done: the "Status:" line (needs the schema field from another session), so W10 is not ticked.

## Contrast
All nine pairs pass their floors and match design.md's ratios. `--copper` on `--soot` is 4.45 (design.md
says 4.4), `--rule` on `--parchment` is 3.46 (3.5). No token changed.

## Where steering and code disagreed
- design.md says the selected find and "this one" use `--lantern`, and look.spec 26.5 (spec 03) says
  the default view has no `lantern` pixel in the canvas or the DOM. I kept `lantern` to focus rings and
  the nav underline; the depth gauge's current stop is `parchment`, not `lantern`.
- design.md "Controls" says the one primary action is `lantern` with `ink` text, while "Studio look"
  says the Studio primary is `parchment` with `ink`. I followed "Studio look" in the Studio.
- design.md: Libre Baskerville regular and italic only. The Report, Sources and Studio headings were
  600; they are 400 now.
- The old Report theme and the Studio still use `--font-heading` for some `h3`-like labels; none was
  checked in a browser.

## For the other lanes and the maintainer
- **Unity breaks until its lane follows.** `unity/Assets/Buried/Runtime/Look/BuriedPalette.cs` lists
  the old token names (`night`, `fog`, `present`, `ink`, `text`, `muted`) and `Buried.Editor.Setup` and
  `PaletteTests` read them from `tokens.css`, so Setup throws "tokens.css has no --night colour" until
  the palette asset takes the new names. I did not touch `unity/`.
- Not run: the Unity-backed Playwright suites (`look`, `art`, `brand`, `lantern`, `phone`, `firstload`,
  `studio-brand`). Expectations listed above were edited but not run.
- `data/raw` shows as untracked in `git status`; it was already there.

## Checks run
- `npm --prefix web test`: 98 files, 873 tests passed. `npm --prefix web run typecheck` and `npm --prefix web run build`: clean.
- `npx playwright test -c playwright.hosting.config.ts` (from `web/`): 17 passed (hosting, polish, report, cardsync), after the build.
