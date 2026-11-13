# Kiro session 027: place page honesty and polish, Sources page, static hosting (web lane)

Agent: builder (claude-sonnet-5.5). Checkout: the `lane/web` worktree. Lane: `web/` only (not
`web/src/bridge/**`, not generated bridge files). No bridge changes; the scene lane's new messages
(`scene/focusLot` and others) arrive next round. Commit with `git commit -m ... -- <paths>`.

Read only: this brief; `.kiro/steering/product.md` honesty rules and decisions 3 to 5;
`.kiro/steering/design.md` place page, controls and the Report theme; your own session 024 code in
`web/src/report/`, `web/src/place/` (or wherever the place page lives) and
`web/src/evidence/plainWords.ts`; spec 04 `tasks.md` group 15 and spec 03 task 17.3.

## 1. An honesty bug to fix first

The place page says "Checked by a person." for `bld_fip_v3_1911_229_0001`, whose record says
`confirmed_by: "Buried maintainers (gate draft, unreviewed)"`. The wording was keyed on
`confidence: documented`. Confidence says how the footprint and storeys were read; it says nothing
about who checked it. Rule from now on: the page never claims a person checked something unless
the record's provenance says so in a structured way. Until the schema has such a field (do not add
one in this lane), show the record's own words: "Confirmed by: <confirmed_by>" with the date, for
every feature, and drop "Checked by a person" and "Not yet checked by a person" as derived
phrases. Add a test with the real evidence file that fails if the page prints a review claim the
record does not contain.

## 2. The report reads like a person wrote it

- The heading is the address or addresses ("541 and 543 Queen St E"), with "The documented history
  of this place." as the line under it. The lot id moves to the sources block.
- No "Address: '...'" lines, no quoted machine strings, no bare ids in sentences.
- One short summary sentence at the top, built only from facts on the page, for example: "Two
  fire insurance plans cover this lot: 1911 and 1931-35. One building outline from them sits within
  7 m of it." When nothing is known: "Buried holds two plans that cover this lot. Nothing on them
  has been reviewed here yet."
- Uses lettered on a plate are quoted once, as "lettered on the 1911 plan as 'Bank of Nova Scotia;
  offices on 2nd'", not repeated per era.
- Group headings in plain words: "Water", "What the land was used for", "Old buildings and fill".
  A group with nothing to report gets one line saying what was checked, not a boxed "Not covered".
- A coverage line on the landing and the place page: which plans Buried holds for this area, and
  that coverage today is one block of Toronto.
- Landing: the tagline under the wordmark, "Try" before the examples, and Enter on an exact match
  goes straight to the place page.

## 3. Sources page

Each source with its attribution and rights note, and for each plate the full uncropped
photograph (`<id>_full.jpg`), archive labels included (spec 03 task 17.3). Plain layout, paper
theme.

## 4. Static hosting (spec 04 group 15, the site half)

Make `npm run build` produce a folder that works on Cloudflare Pages as is: a `_headers` file so
the Unity `.unityweb` files are served with the right `Content-Type` and `Content-Encoding`
(the build uses Brotli with decompression fallback; keep the fallback working if headers are
missing), long cache for hashed assets and no cache for `/data/index.json`; an SPA fallback for
`/place`, `/report`, `/studio`, `/sources`; the Studio service URL from `VITE_STUDIO_SERVICE_URL`
with the "service unavailable" sentence when it is unset; a size report for the build folder
(largest files, total). Test with `vite preview` plus a Playwright run that loads `/place?lot=...`
directly. Write the exact deploy command into `tech.md` (you may edit that one steering file with
a targeted edit); do not deploy.

Screenshots to `web/e2e/output/`: `polish-place.png`, `polish-landing.png`, `polish-sources.png`.

Never weaken a test. Narrow tests while iterating, full suites once at the end. Commit per item.
Do not push. Short final report.
