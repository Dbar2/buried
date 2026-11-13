# Session 039: the new look and the new routes (builder, web lane, part one)

Agent: `builder`. You are in the web worktree (`lane/web`). Group W of spec 06, tasks W1 and W2,
and the core-sample part of W10. A second web session does W3 to W12 once the bridge and finds
types have landed from the other two lanes.

## Read first, and only these

- `.kiro/steering/design.md` (loaded for you): Identity, Palette tokens, Type, Controls.
- `.kiro/specs/06-first-visit/requirements.md`: requirements 1.3, 7.3, 10, 11.4.
- `.kiro/specs/06-first-visit/design.md`: "Routes and modules", "Core sample rows", property P4.
- `.kiro/specs/06-first-visit/tasks.md`: W1, W2, W10.
- `web/src/styles/tokens.css`, `web/src/styles/app.css`, `web/src/shell/`, `web/src/App.tsx`,
  `web/src/place/placeLink.ts`, `web/src/place/Landing.tsx`.

Do not read other specs. Do not touch `data/schema/`, any `*.generated.ts`, `unity/`, or
`pipeline/`: other sessions own them right now.

## Tasks, in this order

Commit each on its own with `git commit -m "<message>" -- <paths>` (paths listed, never a bare
commit). No Co-Authored-By line.

### W1: tokens and fonts

- Rename and add the tokens exactly as design.md "Palette tokens" lists them, following the
  rename order it gives (the old light `--ink` becomes `--parchment`; `--ink` becomes the dark
  ink). Update every `var(--...)` use in `web/src/`. Hex values stay only in `tokens.css`.
- Fonts: Libre Baskerville (headings), Source Sans 3 (body and controls), IBM Plex Mono stays.
  Self-host them. You cannot download files (`curl` is refused): install the `@fontsource`
  packages with `npm install` (`@fontsource/libre-baskerville`, `@fontsource-variable/source-sans-3`
  or the static one) and import only the weights design.md names. Remove the Fraunces and Inter
  packages or files and their `@font-face` rules. No request may leave the origin: the hosting
  test already checks this, keep it passing.
- Add the two fonts' licence line (SIL Open Font License 1.1) wherever the Sources page credits
  the current fonts; if it credits none, add one short "Typefaces" line there.
- `web/src/styles/contrast.test.ts`: every pair design.md lists, against its floor.
- Controls: square corners, a 1 px rule, no pill shapes, no gradient fills, no drop-shadow cards.
  Apply to the buttons, the header, the depth gauge and the Lantern control that exist today, so
  the current pages already wear the new brand. The Report keeps its paper theme.
- The existing end-to-end colour tests (`look`, `art`, `brand`, `lantern` specs) read token
  values: update their expectations from `tokens.css`, never by hard-coding a hex.

### W2: routes and header

As tasks W2 and design.md "Routes and modules":

- `routeFor`: `block` for `/` with no Explorer query and for `/find/<slug>`; `search` for `/place`
  without `lot`. For this session the `block` route renders a placeholder component
  `web/src/block/BlockPage.tsx` that shows the headline "Something used to stand here.", the line
  "Every ghost comes with the map that proves it.", a disabled-looking but focusable
  "Raise the past" button that links to the Explorer at the 1911 era for now, and the margin
  caption with "Look up an address" linking to `/place`. Part two replaces its insides; keep it
  small.
- The old landing (`place/Landing.tsx`) moves to `/place`.
- Header: the wordmark (link to `/`) and "Sources" only. No Studio link, no Explorer link.
- Sources page: the link "The workshop (runs on a maintainer's machine)" to `/studio`.
- Every old link keeps working (requirement 7.3). Tests for `routeFor` cover each row.
- Update `playwright.hosting.config.ts` routes and the header tests.

### W10, core-sample part only (requirement 10, property P4)

The core sample's 1935 row currently prints "A building outline read from the 1911 plan". Fix the
row text so a row for plan X says what plan X shows, and names another plan only as "First drawn
on the <Y> plan; drawn again on the <X> plan." The wording function lives in the Evidence Library
(`web/src/evidence/`), with the fast-check property P4. Do not do the "Status:" line yet: it
needs a schema field that another session is adding.

## Test while you work

`npm --prefix web test -- <the files you touched>` and `npm --prefix web run typecheck`. At the
end, once: `npm --prefix web test`, `npm --prefix web run build`, then
`npm --prefix web run test:e2e:hosting`. Leave the long Unity-backed browser suites to the
maintainer; say in your notes which of their expectations you changed.

## Notes file

`docs/kiro-sessions/039-notes.md`: what changed, any token whose contrast pair failed and what you
did about it, and any place where steering and the code disagreed.
