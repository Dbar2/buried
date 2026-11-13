# Kiro session 023: scene art direction and the pinned lot (Unity lane)

Agent: builder (claude-sonnet-5.5). Checkout: the main working copy. Lane: `unity/`,
`data/schema/bridge*`, and only these web files: `web/src/bridge/**`, the generated bridge types
and samples, `web/src/explorer/**` where a new message must be sent, and the e2e specs. Two other
builders work in separate worktrees on other files. Commit with `git commit -m ... -- <paths>`.
Never commit `Bootstrap.unity` for id-only changes.

Read only: this brief; `.kiro/steering/design.md` (it changed today: read "The map sheet is lit",
ghosts, the pinned lot, today's buildings); `docs/brand/concept-a-landing.jpg` and
`concept-b-place-page.jpg` if you can open images (mood targets, not specs); the bridge schema;
your own notes in `docs/kiro-sessions/018-notes.md`. Do not read the specs end to end.

## State

`data/evidence/` now holds 100 buildings from the 1911 plate and 63 from the 1931-35 plate. All but
one are `estimated` (a draft pass by rule). The scene must make 160 ghosts look good and stay fast.

## Build, in this order, rebuilding and reading the look screenshots after each

1. **Estimated and unknown treatments.** Only "documented" is drawn properly today. Implement the
   dashed-outline, lighter-fill treatment for `estimated` and the soft, edgeless volume for
   `unknown`, so the three classes are distinguishable by pattern in a greyscale screenshot.
2. **Storey lines.** One horizontal ink line per documented storey on a ghost; none when storeys
   are not recorded (do not invent a count; height stays the spec's default).
3. **The lit map sheet.** Display-tone the draped plate toward `ink` paper (tone curve on the
   greyscale scan, line work stays dark), with one soft warm light pool falling off into fog.
   Add a bridge message to switch a drape between the lit display and the untouched scan
   ("view original scan"), default lit. The Studio and crops are not affected.
4. **The pinned lot.** A bridge message `scene/focusLot` carrying the lot polygon (EPSG:26917):
   draw its outline on the ground in `lantern` in every era, place one small warm light beside it,
   move the light pool of item 3 to it, and fly the camera to frame it (eased, 900 ms; a cut under
   reduced motion). Clearing it restores the default view. The Explorer sends it when the page has
   `?lot=<id>`; lot polygons come from `data/present/` property boundaries.
5. **Today's buildings.** Darker than the fog near the camera, dissolving with distance, with a
   thin lighter roof edge. Matte, cold, untextured.
6. **Budget.** With all 163 buildings in an era the scene holds 60 fps on this machine and 30 fps
   under 4x CPU throttling; batch ghost meshes if needed. Report measured frame times.

Bridge changes are yours this round: bump the version, update the schema, fixtures, both parsers
and the generated files, and list the new messages in your final report so the web lane can adopt
them next round.

## Checks

Extend the look test: a 1911 view with the lot of `bld_fip_v3_1911_229_0001` pinned, saved to
`web/e2e/output/art-1911-pinned.png`; a close view of mixed estimated ghosts,
`art-estimated-close.png`; Today, `art-today.png`. Assert the three confidence classes differ in
edge pattern, the pinned outline is `lantern` and is the only `lantern` in the canvas, and the
drape's line work keeps at least 4.5:1 against its lit paper.

Never weaken a test. Narrow tests while iterating, full suites once at the end. Commit per item;
tick tasks only if a matching spec task exists. Do not push. Short final report with numbers and
screenshot paths.
