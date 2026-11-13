# Kiro session 022: product reframe and brand decisions into steering

Agent: architect (claude-sonnet-5.5). Edit only `.kiro/steering/product.md` and
`.kiro/steering/design.md`, with targeted edits. Read those two files, this brief and
`docs/brand/README.md`. Look at the four images in `docs/brand/` if you can open images; the
decisions below are complete without them. Do not read the specs. Keep each file under 170 lines.

## Why

After day one the pieces work (pipeline, Explorer, Studio slice, Report slice) but the product
does not yet answer an ordinary person's question quickly, and it looks like a test harness. Last
year's grand prize winner was instantly understandable and fun in its first ten seconds. Buried's
first ten seconds must be: type an address, the camera drops to the lot, the past rises, and a
plain page says what stood there.

## Product decisions (product.md)

1. **The unit is the place page.** One screen per lot: the dig (3D) on the left, a paper report on
   the right. The Explorer and the Report are two halves of it, not two destinations. The Studio
   remains its own screen.
2. **Search first.** The landing is the dusk scene with the wordmark and one field, "What was
   here?", plus two or three real example addresses from the coverage area. No tour, no modal.
3. **The core sample is made of pictures.** For each era the place page shows a real crop of that
   lot from that era's source (today's map, the 1947 photograph when aligned, the 1931-35 plate, the
   1911 plate), with the lot outlined, next to one plain sentence. A crop is evidence a person can
   read without us interpreting it, so it appears even where nothing has been reviewed yet, labelled
   "From the plate, not yet reviewed".
4. **Plain words in the body, ids in the footnotes.** Sentences name sources as "the 1911 plan"
   and "the 1931-35 plan"; source ids, plate numbers and error figures sit in mono in a sources
   block and on hover or focus, never in the middle of a sentence.
5. **Past land use is the practical value.** Uses lettered on the plates (yards, works, factories,
   stables, shops) are recorded as read by a person and drive the "past land use" findings. This
   is the part a buyer, renovator or neighbour would act on; keep "Buried screens; it doesn't
   certify" and the dig pointer.
6. **Kiro is part of the product, not only how it was built.** The repository ships what a
   Kiro user needs to add a plate or a city: steering, hooks, the `archivist` and `plate-qa`
   agents, and an MCP server that answers "what do the records show at this address" from the
   evidence files.
7. Audience line, first: "People who live in, are buying, or are about to dig into an old city
   block." Researchers and heritage groups second.

## Brand and look decisions (design.md)

1. **Identity.** Wordmark "Buried" in Fraunces. Mark: the core-sample lens, a circle holding three
   or four strata lines, drawn in thin `ink` lines; used as favicon, loading mark and report
   header. Tagline: "Forgotten maps, rebuilt with proof." No other logos or illustrations.
2. **The map sheet is lit.** In the Explorer a draped plate reads as warm paper lit from above by
   one lantern: display-toned toward `ink` (a tone curve on a greyscale scan, lines stay dark),
   brightest near the pinned lot, falling off to the fog. This replaces the earlier "do not tint a
   source raster" rule for the Explorer scene only. The untouched scan is one action away ("View
   original scan") and is what the Studio, the evidence card crop, the core-sample crops and the
   Sources page show.
3. **Ghosts are ink drawings.** Thin `ink` edges, a translucent fill, and one horizontal ink line
   per documented storey. No invented detail: no windows, cornices or roofs that no source shows.
4. **The pinned lot** is outlined in `lantern` on the ground with one small warm light beside it.
   Still the only use of `lantern` in the scene.
5. **Today's buildings** are darker than the fog near the camera and dissolve into it with
   distance; a thin lighter roof edge keeps them legible. Still matte and cold.
6. **Place page layout.** Left about 58 per cent: the scene, with a slim vertical depth gauge on
   its left edge (Today at the top). Right about 42 per cent: the report on the paper theme
   (`paper` #FAF8F3, dark ink text, hairline rules), sober and printable. On narrow screens the
   report sits below the scene. The header carries the wordmark, the address, and the nav.
7. **Studio.** The scan is dimmed toward mid-grey so traced outlines read; outlines in `ink`,
   rejected ones faint and dashed, the current one thicker with a small mono tag; the active step
   and nav item carry a `lantern` underline; one primary button per panel, filled `ink` with dark
   text. Dense, calm, no decoration.
8. **Controls.** Rectangular with a 2 px radius, hairline borders, no drop shadows, no gradients,
   no pills. Buttons are text. Focus rings are `lantern`.
9. Replace the conflicting sentences in the current file (the "never tint" rule, `lantern` rules
   that contradict the above) rather than leaving both.

Reply in a few lines with what you changed.
