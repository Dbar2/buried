# Kiro session 029: evidence card, two-way sync, original-scan toggle, 2D fallback (web lane)

Agent: builder (claude-sonnet-5.5). Checkout: the `lane/web` worktree (main, with the scene lane's
bridge 0.5.0, is merged in; `web/public/unity/` holds the matching Player build). Lane: `web/`
only; do not edit the bridge schema, `web/src/bridge/**` or generated bridge files, and send only
messages that already exist in bridge 0.5.0 (`scene/focusLot`, `scene/clearLot`,
`scene/setDrapeMode`, `scene/setDepth`, `scene/selectFeature`, and the Player's `featureClicked`,
`eraLoaded`, `cameraChanged`). Commit with `git commit -m ... -- <paths>`.

Read only: this brief; `.kiro/steering/design.md` place page, evidence card and accessibility
sections; `docs/kiro-sessions/023-notes.md` "Bridge 0.5.0 messages for the web lane"; your own
place page and report components.

## Build

1. **Evidence card on the place page.** Clicking a ghost opens its card as part of the paper
   report column (not a dark overlay on the scene): a crop of the untouched scan around the
   building with its outline, what the record says (use as lettered, storeys when read), the
   confidence label with its reason, "Positioned within about X m", the record's own "Confirmed
   by" line and date, the source's attribution, and "View original scan" which switches the drape
   mode in the scene. Closing it returns to the report. Keyboard and screen reader complete.
2. **Two-way sync.** Moving the depth gauge or digging with the wheel highlights the matching band
   in the core sample and scrolls it into view (respect reduced motion); choosing a band already
   moves the scene. The header's era text follows.
3. **Hints.** The "Click a building..." line appears only until the first click, never overlaps
   other scene text, and is not shown on the place page when a card is open.
4. **Scene load failure.** `polish-place.png` showed "The 3D view did not load" overlapping other
   text in one run. Reproduce or rule out, fix the overlap, and when the Player really fails to
   load or WebGL 2 is missing, show the 2D fallback: the era's untouched tile with published
   footprints drawn over it (pattern by confidence), the lot outlined, the same gauge, and one
   sentence saying why 3D is not shown. The report column never depends on the Player.
5. **A list view** of the features on screen for the current era (name or use when lettered,
   confidence label, position figure, confirmed-by line), reachable by keyboard, as the text
   equivalent of the ghosts.

## Checks

Playwright screenshots: `card-bank.png` (card open on the place page), `fallback-2d.png` (WebGL
disabled), `sync-1935.png`. Tests: the card prints no review claim beyond the record's words; the
fallback shows the same footprint count as the era list; gauge and band stay in sync in both
directions; no text overlaps in the scene overlay at 1280 and 390 px.

Never weaken a test. Narrow tests while iterating, full suites once at the end. Commit per item.
Do not push. Short final report with screenshot paths.
