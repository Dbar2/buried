# Kiro session 031: hosting fix from the real deploy, README refresh, first load, phone pass (web lane)

Agent: builder (claude-sonnet-5.5). Checkout: the `lane/web` worktree. Lane: `web/`, plus
`README.md` and the hosting lines in `.kiro/steering/tech.md` (targeted edits). No bridge changes.
Commit with `git commit -m ... -- <paths>`.

Read only: this brief; `web/public/_headers`, `web/public/_redirects`, `web/vite/hosting*`,
`README.md`, `docs/gate/README.md`, the hosting paragraph in `tech.md`, your landing and place
page components.

## 1. Hosting fix (found on the live site)

The site is live at `https://buried.pages.dev`. On Cloudflare Pages the rule
`/place /index.html 200` did not rewrite: Pages answered `/place?lot=...` with a 308 to
`/?lot=...`, which opens the wrong page. Pages serves `index.html` for unknown paths on its own
when there is no top-level `404.html`. The maintainer redeployed with `_redirects` removed and
all four deep links then returned 200. Make the source match: remove the rewrite rules (keep the
file only if it has a real rule), update `hosting.test.ts` to assert there is no rewrite to
`/index.html` and no `404.html` in the build, and record in `tech.md` the deploy command that
worked: `npx wrangler pages deploy web/dist --project-name buried --branch main` and the reason
for the rule's removal.

## 2. README refresh

The status table is a day stale. Rewrite "Where it stands" from what is in the repository now:
live URL, the place page, landing, Studio slice with export, Report, extraction, publish, match,
the MCP server and the two agents that use it, hooks, what is still draft (the 163 buildings
accepted by rule and marked so, the control points, the map areas), and what is not built (Studio
Align and editing, 1947 imagery, land-use tracing UI, the deployed Studio service). Replace the
hero image with `docs/progress/place-page-541-queen-1911.png`. Keep the voice: plain, specific,
dry; numbers from the repo; nothing unbuilt in the present tense; under 200 lines. Do not claim
test counts you have not read from a file or run yourself in this session.

## 3. First load

The landing loads the whole Player before it is useful. Show the wordmark, field and examples
immediately on a still dusk backdrop (a CSS-only treatment from the palette, no generated image),
start the Player after first paint, and cross-fade the scene in when it reports ready (no fade
under reduced motion). The core-sample mark is the loading indicator. Measure and report time to
interactive search and time to scene on the built site with and without 4x CPU throttling.

## 4. Phone pass

At 390 px: landing, place page (scene on top at a sensible height, report below, gauge reachable
by thumb), card, fallback. Touch: tap a ghost opens its card; a visible control digs up and down;
no horizontal scroll. Fix what breaks. Screenshots `phone-landing.png`, `phone-place.png`.

## 5. Sharing

Page titles per route ("541 and 543 Queen St E · Buried"), a meta description, and Open Graph
tags with a static social card composed in CSS and rendered once to a PNG by a Playwright script
you add (wordmark, mark and tagline on the night background; no map imagery, no generated art).

Never weaken a test. Narrow tests while iterating, full suites once at the end. Commit per item.
Do not push. Short final report with the measured times and screenshot paths.
