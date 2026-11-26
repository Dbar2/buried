# Demo script (target 2:45, limit 3:00)

For the lot check, recorded on the live site, `https://buried.pages.dev`, except the Kiro proofs in the editor and terminal. Anything the files do not settle is marked "(to confirm)"; check each on the first dry run. Facts are from sessions 050 to 055 and `.kiro/specs/08-lot-check/`.

## Before recording

- Fresh browser profile at 1440 x 900. The phone shot is Chromium device mode at 390 x 844 with touch on. Reduced motion must be off, or the dig and the stamp do not play.
- Open the live site and walk it once: landing, suggestions, Enter, the dig, the record, every layer switch, Sources, How. Confirm no console errors.
- Do not press Enter or click again while the dig plays. A fresh Enter after the first 600 ms skips it (session 054).
- Say "draft, not yet reviewed" aloud only if the provenance strip still shows it. As of the session 055 notes, none of the 178 features is reviewed. If the maintainer has reviewed the coal yard since, change the line to what the strip says.
- Before recording, find two more addresses on the dry run: one with the tag "Not covered yet" ("NOT DUG YET"), and optionally the lot tagged "A past use is lettered on these plans" (a City works yard, "street cleaning", not on the industrial list). Neither address is in the files I read (to confirm).
- On the committed data no lot gets "No industrial use lettered on these plans" (0 of 168), so the "nothing lettered" inscription does not appear. Do not promise it.
- The imagined view and the postcard exist only for lots where a use is lettered on the lot (requirement 12.1), so use 2A Percy St. The postcard ("As it may have looked") sits below the record sheet and its provenance strip, so scroll to it.
- The 1939 photograph is soft at close range. Say it is placed approximately and move on.
- Do not open plate 232 (1935) anywhere. Do not show or mention the 3D block, the walk, the Studio or 1947 imagery. Do not claim user tests, "confirmed" records or a "clean" lot.
- Kiro shots are recorded locally: editor with the files below open, and a terminal at the repository root.

## Shot list

| Time | Shot | URL or command | Voice-over |
|---|---|---|---|
| 0:00 to 0:15 | The landing at night: headline "What is buried under your address?", the plan under the lantern with lit lots, the fog. Hold 3 s, then move to the field. | `https://buried.pages.dev/` | "You're about to buy, dig or plant on an old city lot. Nobody tells you a coal yard stood there. The old fire-insurance plans did. Buried reads them for you." |
| 0:15 to 0:55 | Type `2a p`. The list shows "2A Percy St" with its dot and "something recorded". Choose it with Enter. Let the whole dig play (about 4.8 s): the lantern pauses at Today, then each plan, with a slip (the 1931-35 and 1911 slips read "Coal & Wood Yard" with the firm name; wording to confirm). The record opens: "HERE STOOD / Coal & Wood Yard / recorded on the plans of 1911 and 1931-35", the sentence, the stamp "Past industrial use recorded". Point at the provenance strip. | Field, keyboard | "Type an address. Buried digs down through the plans, year by year. At each plan, a slip shows what that plan letters on this lot. Here stood a coal and wood yard, lettered in 1911 and again in 1931-35. The stamp is code's verdict, from the plan's own words, with the crop it was read from. And the page says plainly: draft, not yet reviewed. No person has signed off these records yet." |
| 0:55 to 1:25 | Scroll until the compare view is in frame. Drag the divider: the 1911 plan against today's photograph, the lot outlined on both. Press "1939 photo" under Then. Press "Imagined, about 1911": the "IMAGINED" corner and the caption "Imagined from the 1911 plan. Not a photograph." Scroll to the postcard "As it may have looked", and open it larger. | Radio groups under the frame | "Drag the divider: the 1911 plan against a 2025 aerial photograph, with the lot outlined on both. Now the City's 1939 photograph, which the City says is placed approximately, and the page says so too. This view is imagined from the plan with an image model. It's marked, and captioned: not a photograph. No finding ever comes from a picture. The postcard carries the same label." |
| 1:25 to 1:40 | Back to the landing with "Dig another address". Press "or dig somewhere at random" and press Skip when the slips have shown. Then type the "not covered" address (to confirm) and show "NOT DUG YET" with the coverage line. | Link, field | "Dig at random and you get another lot. Where the plans don't cover a lot, the page says 'Not dug yet'. It never says nothing was there." |
| 1:40 to 1:50 | On a record, press "Download the one-page record". The Report opens and the print dialog appears: one page, plain paper, "Buried screens; it doesn't certify." at the top, sources at the bottom. | Button (`/report?lot=<id>&print=1`) | "One button makes a printable record: one page, plain paper, sources at the bottom. It starts with: Buried screens; it doesn't certify." |
| 1:50 to 2:03 | Kiro proof 1, the spec. Open `.kiro/specs/08-lot-check/requirements.md` at requirement 4.6, then `design.md` at P1 `[PBT]`, then `tasks.md` with its ticked boxes. | Editor | "Every page came from a spec. Requirement 4.6: the tag never appears without its lettering. Property P1 tests it, and a task is ticked only when tests pass." |
| 2:03 to 2:16 | Kiro proof 2, a hook. Open `.kiro/hooks/held-out.json`, then the `held-out.json` row of `.kiro/hooks/README.md`. Then run the guard test in the terminal. | `uv --directory pipeline run pytest tests/extract/test_held_out.py` (run from the repository root; path from the hooks README, command form to confirm) | "Hooks guard the rules. This one refuses any agent write that puts the held-out plate in a tuning file." |
| 2:16 to 2:30 | Kiro proof 3, steering and its test. Open `.kiro/steering/product.md` at honesty rule 1 and rule 13, then the lot check's test that runs the banned-word check over generated sentences (P3; file `web/src/lotcheck/lotCheck.test.ts`, name to confirm). | Editor | "Honesty lives in steering. A list of banned words, checked on every sentence. Kiro surprised us here: the builder flagged that 'No industrial use lettered' would claim more than our review covers." |
| 2:30 to 2:45 | Phone view at 390 px: the landing, then a record with the stamp. End on the landing in the desktop window with the URL in view. | `https://buried.pages.dev/` | "It works on a phone, and without WebGL. Try it at buried dot pages dot dev. Forgotten maps, rebuilt with proof." |

## Notes

- The voice-over is about 325 words. If it runs long, cut the postcard sentence first, then the random dig.
- The dig is an animation and the lookup is instant. The How page says so. Say it only if there is time; do not imply the page computes while the lantern moves.
- Each Kiro proof needs its artefact readable on screen for at least three seconds.
- The surprise line is from `docs/kiro-sessions/051-notes.md`, "The landing count": the stricter test is one condition in `lotCheck.ts`, left for the maintainer.
- No user-test results exist in the repository, so the script claims none.
