# Demo script (target 2:55, limit 3:00)

Everything here exists today except where marked "(to confirm)". Sessions 029 to 034 have briefs but no notes files, so the shots that depend on them (the card, land-use areas, the Lantern label) need a dry run first.

## Before recording

Record every shot on one origin. The Studio workspace is stored in the browser per origin, so the 2A Percy St shot only shows the traced area if it runs where the Studio ran. Use the local site, not `https://buried.pages.dev`, because the Studio service is not deployed.

From the repository root, in three terminals:

1. `uv --directory pipeline run buried fetch fip_v3_1911_229` (once; writes `data/raw/`).
2. From `pipeline/`: `uv sync --extra service`, then `uv run uvicorn buried_pipeline.service.app:create_app --factory --port 8000`.
3. From `web/`: `npm run build`, then `npm run preview` (it proxies `/v1` to `http://127.0.0.1:8000`). Use the address it prints.

Never open plate 232 in this video. Use a window of 1280 x 800.

## Shot list

| Time | Shot | URL or command | Voice-over |
|---|---|---|---|
| 0:00 to 0:10 | The landing: dusk backdrop, wordmark, one field, three example addresses. Hold still for 3 seconds. | `/` | "Buried rebuilds a Toronto block from fire insurance plans, and every building comes with its evidence. It starts with one question: what was here?" |
| 0:10 to 0:20 | Type `541 Queen St E`, press Enter. An exact match goes straight to the place page. | Field on `/` | "Type an address." |
| 0:20 to 0:35 | The place page. The camera flies to the lot, outlined in amber. The report opens on the right with its first line, "Buried screens; it doesn't certify." | `/place?lot=5446981` (to confirm: that id is the lot holding the 1911 bank, session 023; read the real id from the address bar) | "The scene is on the left and the report is on the right. The report says what the plans show for this lot, and what they cannot tell you." |
| 0:35 to 0:55 | Dig. Focus the depth gauge and press Down three times: Today, 1947, 1935, 1911. Pause on 1947 so the line "No 1947 imagery loaded yet" is readable. Pause on 1911. | Keys on the gauge | "Going deeper goes back in time. We have no 1947 imagery loaded yet, and the page says so. At 1911, buildings from the 1911 plan appear. Most were traced by a rule and not checked one by one, and the page marks them as estimated." |
| 0:55 to 1:10 | Up three times to Today. Hold Space (or press `L`) and sweep the pointer across the bank's lot. The Lantern button reads "Lantern: 1931-35 plan" (to confirm, session 033). | Keys on the gauge | "Hold space and a lens shows the 1931 to 1935 plan inside it and today outside." |
| 1:10 to 1:30 | Down to 1911. Click the bank, `bld_fip_v3_1911_229_0001`. The card opens in the report column: crop of the untouched scan, confidence with its reason, "Positioned within about" a figure in metres, a "Confirmed by" line. Click "View original scan". | Click in scene. Fallback: `/?era=<era id>&showEvidence=bld_fip_v3_1911_229_0001` (era id to confirm) | "Click a building and the card shows the scan it came from, how sure we are, and who confirmed it. This one says 'gate draft, unreviewed', because that is what the record says." |
| 1:30 to 1:40 | The Studio. Pick "Plate 229, 1911 edition, revised to 1914". Click Extract. Outlines draw on in sequence. | `/studio` | "In the Studio, a person picks a plate. Buried proposes outlines with plain image processing. It never decides." |
| 1:40 to 1:55 | "Trace an area". Click vertices around the yard lettered "COAL & WOOD YARD" near Sumach St. Press Enter. Type the use exactly as printed, `COAL & WOOD YARD`. Drag the crop around the lettering. Save. | Studio, Review step | "For past land use, the reviewer outlines the yard and types what the plate letters. The crop it was read from stays with it." |
| 1:55 to 2:05 | Set the reviewed area. Enter a reviewer name, `Demo reviewer`. Publish. The message reads "Published to your workspace on this device. It is not part of Buried's reviewed record." | Studio, Publish | "Publishing needs a name and a reviewed area. It goes to this browser only, and the page says so." |
| 2:05 to 2:20 | Search `2A Percy St`. Scroll the report to "What the land was used for". The yard appears as lettered on the 1911 plan, under "From your workspace". | `/` then the field (to confirm: the traced yard touches or lies near the 2A Percy St lot; if not, pick the nearest address from the examples) | "Search a nearby address and the traced yard shows up as what the 1911 plan letters here. The wording is built from the record, not written by a model." |
| 2:20 to 2:32 | The Report print view. Open the report page for the same lot and press Cmd+P. One page, paper theme, sources at the bottom. | `/report?lot=<lot id>&era=<era id>` (ids to confirm). Fallback: `npx playwright test e2e/report.spec.ts` from `web/`, then open `web/e2e/output/report-letter.pdf` | "The report prints on one page. It lists what was checked and ends with a pointer to Ontario Dig Authority. Buried screens. It doesn't certify." |
| 2:32 to 2:39 | Show a spec. Open `.kiro/specs/02-pipeline/tasks.md` at task 1.6, a ticked `[PBT]` task. | Editor | "Kiro built this from five specs. A task is ticked only when its tests pass." |
| 2:39 to 2:46 | A hook blocking a write. Start a builder session and ask it to create `pipeline/tests/fixtures/extract/probe.json` containing `fip_v3_1935_232`. The write is refused with a message. | `kiro-cli chat --agent builder` (command name to confirm). Show `.kiro/hooks/held-out.json` first. Fallback: `uv --directory pipeline run pytest tests/hooks/test_held_out_write.py` | "Plate 232 is held out. A hook stops agents writing it into tuning files." |
| 2:46 to 2:53 | The plate-qa report: scroll `docs/qa/fip_v3_1911_229.md` to "Published features outside the control hull" (30 inside, 70 outside). | Editor | "An agent wrote this from the MCP server: 70 of 100 features sit outside the measured area." |
| 2:53 to 2:55 | End card: wordmark and tagline. | `/` | "Forgotten maps, rebuilt with proof." |

## Notes

- The voice-over is about 340 words, at no more than 2.5 words a second in any shot. If the cut runs long, drop the 0:55 shot first.
- The Studio shots need `data/raw/fip_v3_1911_229/` on disk. Extraction takes under a second.
- The hook's refusal wording comes from its script (exit code 2). Check it on the first dry run.
- Do not narrate anything about 1947 buildings, the water layer or Align. None of them exists yet.
