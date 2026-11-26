# Demo video

The Kiroween demo video for Buried: 2:25, 1920 x 1080, 30 fps. The site footage is recorded from the live site, `https://buried.pages.dev`. The opening, the "Built with Kiro" section and the end card are motion graphics drawn from the project's own art and files.

These scripts are production tooling for the video. They are not part of the product and were not written in Kiro sessions.

## What is in it

| Time | Scene | What it shows |
|---|---|---|
| 0:00 | A, motion | The question: what was on this land first? Ends on the 1911 plan. |
| 0:13 | B, live site | The landing, typing "2a p", the suggestion list. |
| 0:22 | C, live site | The dig: the lantern goes down through 1931-35 and 1911. |
| 0:30 | D, live site | The record: "Here stood / Coal & Wood Yard", the stamp, the lettering crops. |
| 0:43 | E, live site | The compare view: 1911 plan against the 2025 aerial photograph, the 1939 photograph, the imagined view, the postcard. |
| 1:02 | F, live site | Draft status in the provenance strip, "Not dug yet", the one-page record. |
| 1:16 | G, motion | Built with Kiro: steering, spec 08, the stamp property, 1,258 tests, hooks, agents, the MCP server, and two things Kiro caught. |
| 2:08 | H, live site and end card | One block today, every old city has such plans. The address. |

The excerpts in scene G are read from the repository when the scene is rendered: `.kiro/steering/product.md`, `.kiro/specs/08-lot-check/`, `.kiro/hooks/` and `.kiro/settings/mcp.json`.

## Narration

1. You're about to buy a house. Or dig a garden. On land far older than anything standing on it. What was there first? Nobody tells you. But somebody wrote it down.
2. This is Buried. A lot check, read from old fire-insurance plans. Type an address, or pick one that's lit.
3. The lantern goes down through the plans, year by year. Nineteen thirty-five. Nineteen eleven. And here it is.
4. Here stood a coal and wood yard, lettered on both plans. Six addresses stand on it today. The stamp comes from code, from the plan's own words, with the scan that proves it.
5. Drag the divider: the nineteen eleven plan, against a real aerial photograph of today. Switch to the City's photograph from nineteen thirty-nine. Or a view imagined from the plan. Clearly marked, and never used as evidence. And a postcard, of how it may have looked.
6. Buried screens. It doesn't certify. Every record is marked a draft until a person reviews it. Where the plans don't reach, it says: not dug yet. And one button gives you the record, on a single page.
7. We built Buried with Kiro, and changed direction three times in two weeks. What kept that affordable was the way we worked. Steering first: honesty rules that every session reads. Then a short spec: requirements, properties, tasks. Property-based tests before any page. Like this one: the stamp never appears without the lettering that triggered it. Hooks guard the rules: validation on every save, and a block on any write that touches our held-out test plate. Six agents with narrow permissions. And our own MCP server, so agents can question the evidence. And Kiro surprised us. It rejected a colour pairing we asked for, because it failed contrast. And it flagged a label that would have claimed more than our data supports.
8. Today it covers one block of Toronto. But every old city has plans like these, waiting to be read. Buried. Forgotten maps, rebuilt with proof. Dig, at buried dot pages dot dev.

## Rebuild

Needs Node with the web workspace installed (`npm --prefix web ci`; `video/node_modules` is a link to `web/node_modules`), Python with Pillow, ffmpeg and Whisper. The narration and music files are not in the repository. Put them in `video/audio/` as `s1.mp3` to `s8.mp3` and `music1.mp3`.

```
cd video
for a in act1 act2 act3; do node capture-site.mjs $a site/$a; done
for s in A G H; do node render-motion.mjs $s frames/$s; done
whisper audio/s?.mp3 --model small.en --word_timestamps True --output_format json --output_dir audio/tx
python3 build.py            # writes out/buried-demo.mp4; --preview writes a contact sheet only
```

`build.py` holds the timeline, the camera moves, the call-out labels and the captions.

## Credits

- Plans: University of Toronto Map & Data Library; Library and Archives Canada.
- Aerial photographs: City of Toronto, Open Government Licence - Toronto.
- Imagined views: made with an image model from the plans, labelled on screen.
- Narration and music: generated with ElevenLabs.
