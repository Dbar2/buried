# Buried

**Forgotten maps, rebuilt with proof.**

Kiroween 2026 · Category: **Resurrection** (Frankenstein is the fallback; decide at submission) · Concept brief v2, Nov 10, 2026

> Buried turns archival fire insurance maps and aerial photos into a living 3D model of a neighbourhood through time, with the evidence behind every building. You can explore it, add to it, and get the documented history of any place it covers.

---

## 1. The 30-second pitch

Every street sits on top of a past. In Toronto, factories, rail yards, creeks and whole shorelines have vanished under today's city. The records exist: fire insurance plans that mapped every building from the 1880s to the 1920s, and aerial photos from 1947. But they're scans in library collections that only researchers and consultants read.

Buried brings them back to life in three parts:

1. **The Explorer** is the experience. Fly into a foggy 3D neighbourhood and **dig**: going deeper goes back in time. Vanished buildings rise as ghosts where they stood, each one honest about how sure we are.
2. **The Reconstruction Studio** is the invention. Import an archival map plate Buried hasn't seen before, line it up with today's map, let it find the buildings, confirm them, and watch them appear in 3D with their source attached. It's reusable technology, not a hand-built diorama.
3. **The Report** is the useful part. Pick a place inside the covered area and get its documented history: what stood there and when, what the records show about water and past land use, what they *can't* tell you, and who to talk to next. Export it as a one-page PDF.

**Why "Resurrection":** fire insurance mapping was the 1880s' version of GIS. Surveyors drew every building in the city, colour-coded by material, block by block. Production stopped decades ago. Buried resurrects that dead technology as a live, explorable model. *(Frankenstein also fits, since archival paper, computer vision, GIS, 3D and an AI narrator are stitched together, but that description fits most AI apps. Resurrection matches the brand.)*

---

## 2. Who it's for

| Person | Moment | What they get |
|---|---|---|
| **A resident or buyer** (face of the demo) | "What was on my street? Is there anything about this land worth asking about?" | The documented history of the place, with proof, plus findings worth discussing with a professional |
| **A homeowner planning to dig** | Underpinning, an addition, a pool | What used to be there, plus a clear pointer: request locates through **Ontario Dig Authority** before digging. Buried's maps are not utility locates. |
| **Heritage groups, museums, researchers** | Rebuilding a vanished neighbourhood | The Studio: turn their own map plates into evidence-backed 3D |
| **Environmental and property professionals** (later) | Early historical research | A faster first pass; Ontario's Phase One site assessment guidance already uses fire insurance plans and aerial photos |

**The problem in one line:** the history of a place is locked in archival scans that ordinary people can't read, and the tools that do read them are built for consultants.

**What exists today:**
- **Pastpic and TimeWalk** do immersive history: photo overlays and pre-built 3D scenes.
- **ERIS and Envirosite** sell historical records to environmental professionals.

None of them turns raw archival maps into an evidence-backed, inspectable 3D model that anyone can explore *and extend*. *(Re-check these before the write-up.)*

---

## 3. Part 1: The Explorer

### 3.1 Arrive
- A dark, foggy 3D neighbourhood at dusk, with today's buildings in cool slate.
- A search bar (*"What was here?"*) plus two entry points: **Walk the Lost Marsh** (story) and **Open the Studio**.

### 3.2 Search → fly in
- Type an address or click a lot inside the coverage area. The camera flies down, the lot outline glows lantern amber, and a depth gauge on the right edge reads **Today**.
- Outside the coverage area, Buried says so plainly: *"Not reconstructed yet."* The stretch goal is the 1947 Lantern view for any Toronto address (§3.5).

### 3.3 Dig: depth = time
Scroll down, drag the depth gauge, or press ↓. Each era is a layer:

| Depth | Era | What appears | Evidence |
|---|---|---|---|
| Surface | Today | Current buildings in 3D, streets | Present-day building outlines (OpenStreetMap or city open data) |
| Layer 1 | 1947 | The 1947 aerial draped on the ground; buildings seen then and gone now rise as ghosts | U of T 1947 georeferenced aerials |
| Layer 2 | Fire plan year(s) | Footprints extruded by storey count, with materials from the plate legend | Fire insurance plans (pick years by coverage, §7) |
| Layer 3 | Earliest covered year | Shoreline, marsh and creeks where documented; earlier buildings where plates exist | Earlier plates and public-domain maps |

- **Transitions:** the present drains to wireframe, then to a faint outline, so you never lose your place. Ghosts condense up from the ground like mist.
- **The lot stays pinned and lit** in every era.

### 3.4 Ghosts with honest confidence
Vanished buildings render as pale, glowing volumes in ink-on-paper style. How solid a ghost looks encodes how sure we are:

| Confidence | Look | Meaning |
|---|---|---|
| **Documented** | Solid ink outline, filled | Footprint and storeys read directly from a source |
| **Estimated** | Dashed outline, lighter fill | Footprint from a source, but height or shape inferred |
| **Unknown** | Fog volume, no hard edges, "?" | Something was here; the shape isn't recorded |

Confidence is shown by pattern and label, never by colour alone.

### 3.5 The Lantern
Hold **Space** (or long-press on touch) and a circular lantern lens follows the cursor: the past inside, the present outside. Drag it down a street to compare in place.
*Stretch goal:* a 1947 Lantern for any Toronto address. It's just the citywide aerial layer, so it's cheap, and it gives every visitor something.

### 3.6 Show Evidence
Click a ghost to open its evidence card:
- **Source crop:** a crop of the source plate or aerial with the building outlined
- **What each source shows:** *"Present on 1910 plate 33 · 1947 aerial: lot clearly empty"*, or *"1947 aerial: obscured"*
- **Date window:** *"Built by 1910 · Gone by 1947"* only when the absence is clear. Otherwise *"Last seen 1910."*
- **Position accuracy:** *"Positioned within ±4 m"*
- **Confidence badge,** with the reason

**Show Evidence** turns the ghost transparent and projects the original plate beneath it.

### 3.7 Water remembers
Documented creeks, marsh and old shorelines render as faint teal light under today's streets. Where public elevation data is licensed and covers the area, a subtle hillshade shows old valleys still shaping the land.

### 3.8 Story mode: The Lost Marsh (built last)
A guided, narrated camera tour of the **industrial waterfront**. Ashbridge's Bay, once a vast marsh, is filled to make the Port Lands, then industrialized, then a century later the city cuts a new mouth for the Don. It's 4–6 scenes, each anchored to sources, and you can leave the tour and explore at any point.
*Note:* this is the waterfront story. It doesn't claim residential lots were marsh unless the evidence shows it.

---

## 4. Part 2: The Reconstruction Studio

This is what proves Buried is technology, not a hand-built model.

### 4.1 The flow
1. **Import.** Drop in a fire insurance plate (an image, or an already-georeferenced file).
2. **Align.** If the plate isn't georeferenced, click 4 or more matching points, such as street corners or surviving buildings, on the plate and on today's map. Buried fits the transform and shows the **alignment error in metres**. U of T's plates arrive already georeferenced, but with only 2 control points each and no error estimate. Buried checks them against surviving street corners and buildings, measures the error itself, and lets you add points to tighten the fit.
3. **Extract.** Buried proposes building footprints:
   - **Shapes:** deterministic image processing finds the coloured building shapes and their black outlines.
   - **Labels:** a vision model reads the labels (storey counts, use names, addresses) and matches materials to the plate's own legend.
4. **Review.** Each proposal appears over the plate. Accept, nudge a vertex, merge, split or reject, in a few seconds per building.
5. **Publish.** Accepted buildings join the model with full provenance (plate, crop, alignment error, who confirmed, when), and rise in the 3D Explorer in that plate's era.

### 4.2 Rules
- **The AI proposes and a person confirms.** The write-up says so plainly.
- **Code, not the LLM, handles** geometry, coordinates and dates.
- **One plate stays held out.** It's never used while tuning extraction, and it's the plate shown live in the demo. That keeps the demo honest.
- **Every published building carries its alignment error,** which feeds the Report's "on this lot vs nearby" logic (§5.2).

---

## 5. Part 3: The Report

**Title:** *The documented history of this place.*

### 5.1 What's in it
1. **Core sample.** A vertical strip showing each era as a band, with what the records show on or near this lot (*Today: dwelling · 1947: dwelling · 1910: [use from plate] · earlier: [documented feature]*). Tap a band to jump the 3D view there.
2. **Findings worth discussing with a professional,** in three groups:

| Group | What it looks for | Example next step |
|---|---|---|
| **Water history** | Documented creeks, marsh, filled water or old shoreline on or near the lot | Ask your inspector to look for signs of past water; ask the seller about basement water. Toronto offers flood-protection subsidies (link). |
| **Past land use** | Industrial or fuel-related uses on or near the lot in plates or aerials | Before digging, ask whether any environmental review exists. |
| **Fill and old structures** | Land that was water earlier and dry later; demolished buildings on the lot | Mention it to your structural engineer before underpinning or extending. |

3. **What these records can't tell you:** present-day soil, water or structural condition; anything outside the years covered; underground utilities.
4. **Before you dig:** request locates through Ontario Dig Authority. Buried's maps are not utility locates.
5. **Sources,** with links and licence lines, plus a link back to the live 3D view.

### 5.2 Honesty rules, enforced in code
- **On the lot vs nearby:** a finding is "on this lot" only if the feature overlaps the lot by more than its alignment error. Otherwise it's "near this lot (within X m)".
- **Absence needs to be clear:** a building counts as gone only when a later source shows the spot *clearly* (an empty lot or a different building). Obscured or unclear means "last seen [year]".
- **Each finding carries a status:** *Documented* · *Estimated* · *Nothing found in these records* · *Not covered*. "Nothing found" always lists which records and years were checked.
- **Banned words:** "contaminated", "unsafe", "safe", "clean" and "will flood". A test fails the build if report text contains them.
- **No source, no finding.** Every finding links to at least one source.
- **Buried screens; it doesn't certify.** This sits at the top of every report.

### 5.3 Format
- **On screen:** a panel beside the 3D view.
- **Export:** a one-page PDF and a share link.
- **Tone:** the report is the one place the costume comes off. It uses a light paper theme, sober and printable, because it may go to an inspector or lawyer.

---

## 6. Look and feel

**Mood:** a city at dusk, lit by a lantern. Spooky through atmosphere and metaphor, not cartoon ghosts.

### 6.1 Palette (starting tokens)
| Token | Hex | Use |
|---|---|---|
| `night` | `#0E1116` | Background, sky |
| `fog` | `#1B2129` | Panels, ground haze |
| `present` | `#2E3742` | Today's buildings (cool, quiet) |
| `ink` | `#E8DFC8` | Ghosts, archival lines (warm bone) |
| `lantern` | `#F2A541` | Focus, selection, pinned lot, primary actions |
| `water` | `#5FB3B3` | Buried water, shorelines |
| `text` | `#EDEAE3` | Body text |
| `muted` | `#9AA3AD` | Secondary text |

The present is cold and the past glows warm. Run a contrast check before locking these.

### 6.2 Type
- **Headings:** Fraunces
- **UI:** Inter
- **Dates, plate numbers, error margins:** IBM Plex Mono

All three are on Google Fonts.

### 6.3 Motion
- **Era changes:** 600–900 ms.
- **Camera:** cinematic easing. Never spin the camera unasked.
- **Studio:** extracted footprints draw on in sequence; published buildings rise into the 3D scene.
- **Reduced motion:** crossfades only.

### 6.4 Sound (optional, a strong extra)
Original era ambience that crossfades as you dig: city hum for today, rail and horses for the plate years, marsh birds and frogs for the earliest layer. Off by default, on in the video. **You'd produce it yourself, so there are no rights issues.**

### 6.5 Accessibility
- **Keyboard:** paths for the depth gauge, Lantern, ghosts and Studio review.
- **Text equivalents:** every ghost has one in a list view.
- **Confidence:** shown by pattern and label.
- **Fallbacks:** reduced motion and a 2D map.

---

## 7. Scope at submission

**Real, end to end:**
- **The Explorer:** one reconstructed area with 3–4 eras, Dig, ghosts, the Lantern, Show Evidence and Water remembers
- **The Studio:** import → align → extract → review → publish, shown live on a held-out plate
- **The Report:** any lot inside the coverage area, with honest coverage disclosure, plus PDF and share link
- **Story mode,** built after the three core parts work

**Cut until after the competition:**
- Citywide reports (the 1947 Lantern stays as a stretch goal)
- Ontario's Environmental Site Registry and the federal contaminated sites inventory
- General-purpose AI chat
- Photoreal reconstruction, street-level AR, other cities
- Any claim about present-day condition

### Choosing the showcase area
Choose from **where the data actually overlaps**, not from what looks good. U of T's plate index (checked Nov 10) shows:

| Spot | Plates available |
|---|---|
| **Lower Don (Eastern Ave at the Don)** | 1889 and 1892 (Vol 1), 1911 and 1935 (Vol 3), plus the 1947 aerial: **five eras with today** |
| **South Riverdale (Eastern Ave at Carlaw)** | 1911 and 1935 (Vol 3), plus 1947 |
| **Leslieville (Queen St E at Logan)** | 1913/1916 and 1934 (Vol 6), plus 1947 |
| **Port Lands (Commissioners St at Cherry)** | 1935 only (Vol 3), plus 1947 |

**Best starting point:** Eastern Ave between the Don River and Carlaw. The same plates (Vol 3: 229, 232, 249) exist for both 1911 and 1935, which is ideal for same-place, different-era reconstruction.

1. Download those plates and check them against the 1947 aerial.
2. Pick **6–10 blocks** where at least two eras are well documented and a real change happened.
3. **Only then** write the story for those blocks. Don't script a coal yard, a demolition or a creek on a lot before the sources show it.

The Lost Marsh story stays on the industrial waterfront, where the filled marsh actually is.

---

## 8. How it works

### 8.1 Architecture
```
STUDIO (in-app + pipeline)                    APP (web)
──────────────────────────                    ─────────────────────────────
Import plate ─► Align (control points,        React + MapLibre GL JS
  error in metres)                              · basemap + historic rasters (PMTiles)
         │                                      · present buildings (extrusions)
         ▼                                    Three.js custom layer
Extract: colour/outline segmentation            · ghosts, water, fog, Lantern, core sample
  + vision model reads labels/legend          
         │                                    API (TypeScript, small)
         ▼                                      · lot → features lookup (PostGIS)
Review UI (accept / edit / reject)              · report builder + honesty checks
         │                                      · PDF export
         ▼                                      · Studio endpoints (align, extract, publish)
Evidence store (PostGIS) ─────────────────►
Static tiles on Cloudflare (R2/Pages) · API + PostGIS on Railway
```

### 8.2 Evidence model
```json
{
  "id": "bld_1910_0412",
  "kind": "building",
  "geometry": "<polygon, EPSG:26917>",
  "position_error_m": 4.2,
  "attributes": { "use": "<from plate>", "material": "<from legend>", "storeys": 2 },
  "observations": [
    { "source": "fip_1910_plate_33", "year": 1910, "present": true,  "visibility": "clear" },
    { "source": "aerial_1947_tile_88", "year": 1947, "present": false, "visibility": "clear" }
  ],
  "confidence": "documented",
  "confidence_reason": "Footprint and storeys read from plate legend",
  "confirmed_by": "<person>", "confirmed_at": "<date>",
  "licence": "<attribution line>"
}
```

### 8.3 Date logic (pure code)
- **Existed:** from the first year seen to the last year seen.
- **Appeared:** between the last *clear* absence before that and the first year seen.
- **Vanished:** between the last year seen and the first *clear* absence after. If the later sources are obscured or unclear, it stays open: *"last seen [year]"*.
- **A feature is drawn in an era** only if that era falls inside its evidence window.
- **No invented exact years, ever.**

### 8.4 Trust rules
- No proof, no claim.
- Code does the maths (intervals, distances, overlap vs error). The LLM only writes sentences from facts it's given, such as story narration or report wording.
- Every generated sentence is checked before it's shown: banned words, numbers that aren't in the evidence, sources that aren't in the pack.

### 8.5 Stack
| Layer | Choice |
|---|---|
| Web app | Vite + React + TypeScript |
| Map and 3D | MapLibre GL JS + Three.js custom layer |
| Tiles | PMTiles, hosted statically |
| Basemap | OpenStreetMap-based vector tiles (attribution required) |
| API | TypeScript (e.g. Hono) on Railway |
| Spatial DB | PostgreSQL + PostGIS |
| Image processing and alignment | Python: OpenCV, GDAL, rasterio, GeoPandas, shapely |
| Vision and narration at runtime | Amazon Bedrock is a natural fit for an AWS event; decide early |
| PDF | Server-side render of the report page |
| Tests | Vitest + fast-check, Hypothesis, Playwright |

---

## 9. Data sources and status

| Source | Role | Status |
|---|---|---|
| U of T 1947 aerials, georeferenced | 1947 era; absence checks; stretch Lantern | ✅ Metadata: no permission, acknowledgement or cost required. Credit anyway. |
| U of T fire insurance plans, georeferenced | Plate eras; Studio input | ✅ Low risk, with credit. Public downloads with no login (GeoTIFF + world file, ~5.5 cm per pixel). U of T labels them out-of-copyright, and no licence or terms are attached anywhere: not the page, the map app records or the download files. The footer's "Terms and conditions" isn't even a link. Credit: "Digitized and georeferenced by the University of Toronto Map & Data Library." |
| Toronto Public Library fire plan indexes | Choosing blocks by coverage | ✅ Indexes by date and area, including Riverdale, Leslieville and the Port Lands (per review). Check item rights before using any TPL scans. |
| Don Valley Historical Mapping Project layers | River and shoreline history | ❌ Copyrighted by the authors, no licence. Ask permission, or trace from public-domain maps in the Studio. |
| Toronto 3D massing | Present-day 3D | ❌ Retired. Use OpenStreetMap buildings or the city's current building outlines. |
| Toronto address points | Search inside the coverage area | ⚠️ Confirm it's current. Open Government Licence – Toronto. |
| Public-domain maps (shorelines, creeks) | Earliest layer | ⚠️ Pick specific maps and confirm their rights statements. |
| Ontario lidar elevation | Water remembers hillshade | ⚠️ Optional. Confirm coverage and licence. |
| Ontario Dig Authority (formerly Ontario One Call, renamed Oct 1, 2026) | "Before you dig" pointer | ✅ Link only |

**Rule:** no source goes into the app without a licence line in `sources.md` and an entry on the in-app Sources page. A hook enforces it.

---

## 10. Building it in Kiro

Installed Nov 10: **Kiro IDE 1.4.154** and **Kiro CLI 3.1.0**. Both need you to sign in.

### 10.1 Using both (the write-up asks how they differ)
- **Kiro IDE:** specs, the web app, UI work, hooks
- **Kiro CLI:** the data pipeline and batch jobs, such as tiling plates, running extraction across a block or regenerating evidence, from the terminal

Keep notes as you go on what each did better. That's a ready-made write-up section.

### 10.2 Steering (`.kiro/steering/`)
- **`product.md`:** the three parts, the people, honesty rules, banned words, "screens, doesn't certify"
- **`design.md`:** tokens, type, motion, confidence encoding, accessibility, "the report takes the costume off"
- **`tech.md`:** stack, coordinate systems (EPSG:26917 for data, 3857/4326 for the web), file layout, testing rules
- **`sources.md`:** every source with its licence and attribution line

### 10.3 Specs (`.kiro/specs/`)
1. **Evidence model:** schema, observations with visibility, intervals, confidence, position error
2. **Studio:** import, alignment (control points → transform → error), extraction, review UI, publish
3. **Explorer:** scene, Dig, ghosts, Lantern, Show Evidence, Water remembers
4. **Report:** lot lookup, findings, honesty rules, PDF, share link
5. **Story mode,** last

### 10.4 Hooks
- **On save in `data/`:** validate schema, run the evidence property tests, reject features without a source or position error
- **On adding a source:** require a licence line and regenerate the Sources page
- **On UI component save:** accessibility lint and reduced-motion check
- **On report template change:** banned-words and "every finding has a source" tests
- **Before commit:** build, then run the tests

### 10.5 Custom agents
- **Archivist:** finds candidate plates and sources, records licences, and flags anything unclear
- **Plate QA:** after extraction, compares published footprints against the plate and flags misalignments or missed buildings for review

### 10.6 Property-based tests
- A feature is never drawn outside its evidence window.
- A vanish window is only closed by a *clear* absence.
- "On this lot" never appears when the overlap is smaller than the position error.
- An alignment transform round-trips control points within the reported error.
- Every finding has at least one source, and report text never contains a banned word.
- "Nothing found" always lists the records and years checked.

### 10.7 MCP and powers
Candidates:
- a PostGIS or database MCP for development queries
- Playwright for screenshot checks
- any Kiro powers that fit the map, testing or deployment work

Log what you actually used, and how.

---

## 11. Schedule (Nov 10 → Dec 4)

| Dates | Goal |
|---|---|
| **Nov 10–11** | ✅ Kiro IDE and CLI installed, CLI signed in. ✅ Fire plan terms and coverage checked. Sign in to the IDE, request credits, download the Vol 3 plates, write steering docs. |
| **Nov 12–14** | **Go/no-go gate** (below) |
| Nov 15–21 | Evidence model; Studio align, extract and review; digitize the showcase blocks; Dig and ghost rendering |
| Nov 22–27 | Report end to end; Show Evidence; the Lantern; Studio publish into 3D |
| Nov 28–Dec 1 | Story mode, sound, polish, accessibility, mobile. **Credits request deadline: Dec 1, 3pm ET.** |
| Dec 2–3 | Video, Kiro write-up, blog, social post. **Submit Dec 3.** |
| Dec 4 | Buffer. The deadline is 5pm ET. |

**The gate, by end of Nov 14 (all three must work):**
1. **Alignment:** one archival plate lined up with today's map well enough to inspect real features, with its error in metres shown.
2. **Reconstruction:** at least one building footprint taken from that plate, placed correctly in 3D with its provenance attached.
3. **Time:** switching between at least two documented eras in the browser without the alignment slipping.

If any of these fails, rethink the build before spending time on polish. If it can't be rescued, cut to Ghost Load, which still leaves about 3 weeks.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Fire plan rights are questioned later | The plates are out of copyright and carry no terms. Credit U of T, link the source, and host only the showcase plates, not a bulk copy of the collection. |
| Extraction is unreliable | Deterministic segmentation for shapes, AI for labels only, and fast human review. The held-out plate shows real performance. |
| Alignment error is too large for lot-level findings | Show the error and let the honesty rules downgrade findings to "nearby" |
| Absence is ambiguous in the aerials | "Last seen" instead of "gone by", with visibility recorded per observation |
| 3D is slow on phones | Light mode, capped detail, 2D fallback. The report never depends on 3D. |
| Scope creep | The cut list (§7) and the Nov 14 gate |
| History before colonial maps is left out | Say so plainly. Include a respectful land acknowledgement, and link to authoritative sources rather than inventing anything. |

---

## 13. Demo video (under 3:00)

| Time | Scene |
|---|---|
| 0:00 | **Hook.** Night over a real Toronto neighbourhood in 3D. *"Every street is built on a city that disappeared."* |
| 0:15 | **Dig.** Search a real address in the coverage area; the lot glows. Scroll down: today drains away, the 1947 aerial appears, ghosts rise, then the plate era. Era sounds crossfade. |
| 0:45 | **The breakthrough.** Open the Studio and import the **held-out plate**. Click control points (error: ±X m). Footprints are proposed; accept them, fix one, and publish. The buildings rise into the 3D scene in their era. |
| 1:30 | **The proof.** Click one of the new buildings: source crop, position error, attributes, *"Built by [year] · last seen / gone by [year]"*. Show Evidence projects the plate beneath it. |
| 1:50 | **The use.** Open the Report for that lot: core sample, findings with sources, what the records can't tell you, "request locates before you dig". Export the PDF. |
| 2:10 | **The Lost Marsh,** 20 seconds: wetland, fill, industry, the new river mouth, all from documented changes. |
| 2:35 | **How it's built:** the `.kiro` specs, a hook rejecting a building with no source, a property test failing then passing, the CLI running extraction across a block. |
| 2:50 | Pull up to the city. *"Forgotten maps, rebuilt with proof."* |

The specific facts on screen come from the sources found during block selection. Nothing gets scripted ahead of the evidence. Use your own sound only, with no third-party logos or footage.

---

## 14. How it maps to the rubric

| Criterion | What earns it |
|---|---|
| **Impact** | Residents and buyers get the documented history of a place in plain language; heritage groups and researchers get a tool to rebuild their own neighbourhoods |
| **Technological Implementation** | Studio (alignment, segmentation, vision labels, review, publish) plus evidence logic, built with specs, steering, hooks, custom agents, property tests, and both Kiro IDE and CLI |
| **Design** | One metaphor (depth = time), uncertainty you can see, polished atmosphere, a report that drops the costume |
| **Innovation** | Archival maps turned into an evidence-backed 4D model that anyone can explore *and extend*; public datasets combined in a new way |
| **Presentation** | A live reconstruction on a plate the system hasn't seen, a cinematic dig, visible proof, original sound |

---

## 15. Submission checklist
- [ ] Public GitHub repo with an open-source licence showing in the About section
- [ ] `.kiro/` at the repo root with steering, specs and hooks (never gitignored)
- [ ] README with run steps, a sample lot, and a judge path that takes 3 minutes or less
- [ ] Live URL, no login needed
- [ ] YouTube video, public, under 3:00
- [ ] Kiro write-up (IDE vs CLI, steering, specs, hooks, agents, property tests, MCP and powers, vs vibe coding)
- [ ] In-app Sources page with every licence and attribution line
- [ ] Category: Resurrection (or Frankenstein)
- [ ] Optional bonuses: blog post (mention Kiroween 2026) and a social post starting with `#KiroweenHackathon26`

---

## 16. Open decisions
1. **Solo or team?** Up to 3 people.
2. **Category:** Resurrection (recommended) or Frankenstein?
3. **Runtime AI:** Amazon Bedrock or a direct API?
4. **Sound:** produce the era ambience yourself (recommended), or skip it?
5. **Stretch:** the citywide 1947 Lantern, yes or no, decided after the gate?

---

*Concept brief drafted with Claude Code on Nov 10, 2026, before any project code exists. All app code will be built in Kiro during the submission period.*
