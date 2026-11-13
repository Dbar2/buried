# Demo script (target 2:50, limit 3:00)

Written for the first visit rebuilt on Nov 13 (sessions 037 to 046). Everything is recorded on the live site, `https://buried.pages.dev`, except the hook shot. Anything the files do not settle is marked "(to confirm)"; check each on the first dry run. The shape follows section E of `docs/research/gpt-what-it-takes-to-win-2026-11-13.md`, cut to what exists.

## Before recording

- Use a fresh browser profile. The scene hint and the Lantern hint show once per browser, and the page remembers having shown them.
- Confirm the live site serves the new first visit: `/` shows "Something used to stand here." and the button "Raise the past". It has served it since the afternoon of Nov 13.
- No Studio, no service and no `data/raw/` are needed. The Studio service is not deployed and the Studio is not in this video.
- The status line on every card will read "Status: draft, not yet reviewed", because no feature is reviewed (13 draft by hand, 162 draft by rule). Record it as it is. If the maintainer reviews the three finds before recording (task M1 in spec 06), re-read the shots and the voice-over: the factory's card would then read "reviewed by NAME, DATE".
- Do not open plate 232 (1935) anywhere in the video.
- Desktop shots at 1280 x 800. The phone shot is Chromium device mode at 390 x 844 with touch on.
- Press "Raise the past" only after the Still has faded and the scene is live; allow a few seconds on a cold load. A press before that reads "Lighting the lamp" and plays when the Player is ready.
- Sessions 045 and 046 changed the card, the ruler and the Lantern strip after the last full dry run of this script. Re-read each shot against the live page.
- Say nothing about 1947 (it is not on the ruler), water, Align, or user-test results (none are recorded in the repository).

## Shot list

| Time | Shot | URL or command | Voice-over |
|---|---|---|---|
| 0:00 to 0:10 | The live landing: the 1911 sheet on a dark table, today's buildings as soot blocks, "Something used to stand here." Hold for 3 seconds, then move to the button. | `https://buried.pages.dev/` | "This Toronto block had buildings that are gone. The fire insurance plans drew them. Buried raises them, and shows the map that proves each one." |
| 0:10 to 0:22 | Press "Raise the past". Today's buildings sink to thin outlines and the 1911 plan's buildings stand up as ghosts, staggered, in about two seconds. The camera stays still. | Button | "Press one button. Today sinks, and the buildings on the 1911 plan stand up." |
| 0:22 to 0:42 | The Glove & Overall Factory selects itself. Let the leader line and the card settle. Point at the name as lettered, the crop, "Seen on: 1911 plan, sheet 229", "Positioned within about" a figure (to confirm the figure), and "Status: draft, not yet reviewed". | Automatic after Raise | "The first find is the Glove and Overall Factory, named exactly as the plan letters it, with the crop it was read from. The card says how closely it is placed. And it says plainly: draft, not yet reviewed. A person has not checked this one yet." |
| 0:42 to 1:02 | Click "Show the original sheet" for two seconds, then back. Press the "Coal yard" tag in the top row. Move the era ruler to 1935 (Right arrow, or click). Read the line the card adds. | Tag, ruler | "Any find can be compared across plans. The coal yard is lettered J. W. Corson and Company on the 1911 plan. On the 1931 to 35 plan it is lettered Northern Fuels Company. The ruler says so, and shows its source." (to confirm the exact ruler wording and which lettered line it quotes) |
| 1:02 to 1:14 | Move the ruler back to 1911. Press "Lantern". Drag the lens across the block: today inside the lens at a plan stop. | Button, drag | "The Lantern is a lens. Drag it, and the other era shows inside." (to confirm what the lens shows at the 1911 stop: the Player draws Today inside it, and the ruler moves to Today while it is on) |
| 1:14 to 1:26 | The phone: reload at 390 px, press Raise, select a find. The card is a bottom sheet; drag it up. | Device mode on the live URL | "On a phone the card is a sheet. Same finds, same evidence." |
| 1:26 to 1:36 | On a find, press "Share this find". Open the copied link in a new tab: it opens raised on that find. | `/find/coal-yard` (to confirm: the slug is `coal-yard` in `data/finds.json`) | "Every find has a link that opens straight on it." |
| 1:36 to 1:54 | "Full record" on a card. The Report opens: "Buried screens; it doesn't certify." at the top. Scroll once, then Cmd+P: one page, paper theme, sources at the bottom. | `/report?lot=<lot id>&era=<era id>` (ids to confirm: read them from the address bar after "Full record") | "Full record opens the report for that lot. It says what the records show, what they cannot tell you, and points to Ontario Dig Authority before any dig. It prints on one page." |
| 1:54 to 2:08 | Kiro proof 1, the spec. Open `.kiro/specs/06-first-visit/tasks.md` and scroll the three groups: W, U, P. Then show the git worktrees (`git worktree list`, to confirm the names). | Editor, terminal | "This redesign was one short spec, split into three task groups: web, Unity and pipeline. We built them at the same time in three worktrees." |
| 2:08 to 2:26 | Kiro proof 2, a property test that caught a mistake. Open the test `test_published_areas_never_reach_outside_the_map_area` (file path to confirm, under `pipeline/tests/`), showing the `@example` with x0 557, y0 10. Then `docs/kiro-sessions/038-notes.md`, "The failing property test". | Editor | "A property test failed. The code was right and the test's generator was wrong: it attached a lettering crop that ran off the plate. We fixed the generator and kept the counterexample." |
| 2:26 to 2:40 | Kiro proof 3, the held-out hook. Show `.kiro/hooks/held-out.json`. In a builder session, ask it to create `pipeline/tests/fixtures/extract/probe.json` containing `fip_v3_1935_232`. The write is refused with the hook's message. | `kiro-cli chat --agent builder` (command name to confirm). Fallback: `uv --directory pipeline run pytest tests/hooks/test_held_out_write.py` (path to confirm). Recorded locally, not on the live site. | "Plate 232 is held out, so we never tuned on it. A hook refuses any agent write that puts it in a tuning file." |
| 2:40 to 2:50 | End on the live landing with the URL in view. | `https://buried.pages.dev/` | "Buried. Forgotten maps, rebuilt with proof. Try it at buried dot pages dot dev." |

## Notes

- The voice-over is about 330 words. No shot needs more than 2.5 words a second. If the cut runs long, shorten the Lantern shot first, then the phone shot.
- The hook's refusal wording comes from its script (exit code 2). Check it on the first dry run.
- Proof 1 is a still of readable files. Proof 2 and proof 3 each need the artefact readable on screen for at least three seconds.
- The research file asks for the real user-test results in the last seconds. None exist in the repository, so the script does not claim any. If a test is run before recording, add one sentence to the final shot from its notes.
