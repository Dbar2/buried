**Buried currently presents a research prototype. First place requires a finished experience with an obvious payoff, credible usefulness, and visible evidence that Kiro improved the result. More features will make this worse.**

**A. Research: rules, winners, pattern**

Your summary is substantially correct. Important additions:

- Deadline: **December 4, 2 p.m. PST—5 p.m. Toronto**. You have 21 days.
- Projects must be newly created after **October 30, 2026, 9 a.m. Pacific**; disclose incorporated pre-existing work.
- The public, licensed repository must be on **GitHub specifically**, with root `.kiro/` committed.
- Kiro’s listed features are examples to explain, not a requirement to use every feature.
- The video *should* be under three minutes; judges need not watch beyond three minutes.
- Judges may judge solely from submission materials. Keep the application freely accessible through **January 29, 2027**.
- Overall first place is **$30,000**. Overall and category prizes cannot stack; bonuses can. Best Demo requires the highest Presentation score among entries in the top 10% overall. [Official rules](https://kiroween.devpost.com/rules)

All five criteria are indeed equally weighted. Design explicitly rewards a complete product experience; Implementation specifically rewards thoughtful, effective Kiro use. [Competition page](https://kiroween.devpost.com/)

**Verified winners:** Awards below come from individual submissions. Opening interactions and appearance are reconstructed from their descriptions and screenshots, **not timed observations**. YouTube playback was blocked, so I cannot honestly assess their editing, narration, or exact opening sequences; each demo is linked.

| Winner | Product, entry interaction, appearance/theme | Documented Kiro evidence; video |
|---|---|---|
| [InteractionKit—overall first](https://devpost.com/software/kiro-interactionkit) | Gesture-development template. Pinch to slice pumpkins and solve maths; alternatively draw in mid-air. Playful pumpkin game plus lightboard demonstrates two applications. | Hooks wire gestures; steering separates architecture; Context7 supplies API references; specs produce applications. [Demo](https://www.youtube.com/watch?v=FHMdbhIxMt4). |
| [UnitSet—overall second](https://devpost.com/software/unitset) | Sketch or describe an interface, generate working UI, edit it. Infinite canvas, editor and code views. Frankenstein means combining previously separate tools. | Specs cover connected subsystems; steering and MCP support implementation. [Demo](https://www.youtube.com/watch?v=Fo9IyXTqRNA). |
| [SpookBnB—overall third](https://devpost.com/software/spookbnb-when-dark-mode-gets-truly-dark) | Toggle an ordinary rental website into a flashlight-controlled escape room. Familiar hospitality imagery becomes threatening; solve hidden puzzles. | Specs, iterative creative prompting, steering, cleanup hooks. [Demo](https://www.youtube.com/watch?v=6EIi0rokiBo). |
| [Faxi—Resurrection + Influencer Choice](https://devpost.com/software/faxi-16iecy) | Handwrite and fax a request; receive an internet-powered fax response. Physical paper is the interface; dashboard exposes processing. Resurrection serves offline seniors. | Sixteen-plus specs, four hooks, steering, custom MCP integrations. [Demo](https://www.youtube.com/watch?v=P815zFoZgEY). |
| [rumorNet—Frankenstein](https://devpost.com/software/rumornet) | Explore misinformation through network and individual-post analysis. Dark analytical dashboard; theme primarily architectural. Exact initial visitor action unverified. | Specified frontend, conversational backend iteration, filesystem/Git MCP, steering against superficial test passing. [Demo](https://www.youtube.com/watch?v=5ei5kdsVJUs). |
| [Impulse Kit—Skeleton Crew + Most Creative](https://devpost.com/software/impulse-kit) | Tap/swipe desirable items; resist undesirable ones. Visual reflex games cover drinks, grammar and trading. Little literal Halloween decoration. | Kiro specifies timing, scoring and state; examples override one reusable engine. [Demo](https://www.youtube.com/watch?v=QDrQQLuOpkQ). |
| [Seance—Costume Contest](https://devpost.com/software/seance) | Pick a country and story path; answer questions in a page-turning book. Smoke, folklore, ambient sound and failure animations establish atmosphere. | EARS requirements, task execution, README hook, change-control steering. [Demo](https://www.youtube.com/watch?v=1FIc4Hev--w). |
| [WorldNotes—Startup](https://devpost.com/software/splat-n-treat) | Explore a spatial world; place annotated 3D objects and share a viewer. Gaussian splats and “treats” supply the visual identity. | Specs define contracts; Kiro assists refactoring, cloud integration and validation. [Demo](https://www.youtube.com/watch?v=QJFAIPCnAI4). |
| [BlueKai—Influencer Choice](https://devpost.com/software/bluekai-bluesky-on-a-flip-phone) | Sign into Bluesky on a flip phone; navigate with physical keys. Compact, hardware-native interface. Theme is obsolete hardware revived. | Requirements and architecture explicitly address old-browser constraints. [Demo](https://www.youtube.com/watch?v=aQAQOIzGeAo). |
| [Upload Drive-In—Code with Kiro first + Blog](https://devpost.com/software/upload-drive-in) | Drop files into a simple portal; files arrive organized in existing Google Drive storage. Conventional business UI; no Halloween requirement. | Kiro helped generalize storage integration and resolve OAuth/queue complexity. [Demo](https://youtu.be/0_ULZ8y_Dkc). |

The [2025 gallery](https://kiroween-2025.devpost.com/project-gallery) also contains blog/social bonus recipients; its generic “Winner” badges do not mean category wins.

**My inference:** The strongest precedents have a concrete verb, visible transformation and understandable beneficiary. They do **not** share one aesthetic. Buried lacks a compelling introduction and a clear audience. Its engineering evidence is buried behind its interface.

**B. Why these screens lose attention**

- **Landing:** An empty search field assigns homework. Visitors lack a Toronto address and any reason to care. “Loading the scene” offers no visual reward or recovery.
- **Today:** Anonymous grey slabs resemble an unfinished engine demo. The report takes nearly half the viewport before exploration begins. “Features (0)” suggests failure.
- **1911:** The archival map is your strongest visual, yet competes with wireframe clutter and paragraphs. The historical change is hard to identify.
- **Trust:** “Confirmed” beside “draft, unreviewed” is contradictory. A 1935 row describing a footprint read from 1911 undermines temporal provenance. Resolve the underlying attribution.
- **Report:** Repetition, tiny crops and unsupported-era rows overwhelm the actual finding. The opening disclaimer answers a question visitors haven’t asked.
- **Studio:** A prominent navigation item leads to a dead service. That advertises incompleteness.
- **Sources:** No separate Sources screenshot arrived; I cannot critique its layout.
- **Phone landing:** Still no map, building or resurrection. A desktop keyboard-based Lantern also needs a visible touch equivalent.

**C. The version worth submitting**

**Pitch:** “Bring a Toronto block’s past back as ghost buildings—and inspect the original map behind every outline.”

Audience: local-history educators and curious residents. Stop mixing that introduction with environmental screening.

**First 30 seconds—one obvious action:**

- **0–5:** Show the actual block as a composed miniature on an archival map. A faint historic outline pulses beneath today’s buildings. One large control: **“Raise the past.”** Small scope label: “One Toronto block. Two historic plans.”
- **5–15:** Visitor presses it. Today recedes; the selected archival plate appears; documented outlines emerge as ghost structures. Camera stays anchored.
- **15–30:** One reviewed building highlights automatically. Its source crop opens beside its outline. Visitor immediately understands both the spectacle and how to verify it.

A lightweight map must work while Unity loads. The primary action must never depend on an indefinite spinner.

**Full journey—five beats:**

1. Raise the block.
2. Select one of three manually reviewed discoveries.
3. Drag the Lantern across the same location to compare plan and present.
4. Open its record: crop, edition, alignment uncertainty, review status.
5. Share that exact discovery; optionally export its report.

**Wow:** The ink outline on the century-old plate becomes the highlighted ghost, then snaps back into its source crop. The relationship between evidence and reconstruction is the spectacle.

**Fun and Halloween:** Excavation, anticipation and discovery. Buildings materialize like architectural apparitions; the Lantern reveals another recorded layer. No invented deaths, hauntings or historical dialogue. Date controls select documented snapshots. Unsourced heights remain explicitly schematic.

**Brand brief:** *An archival atlas examined by lamplight.*

- **Palette:** parchment `#E8DCC1`, ink `#23221F`, soot `#121715`, oxidized copper `#6D8376`, lantern amber `#DCA34B`.
- **Type:** restrained historical serif such as Libre Baskerville; Source Sans 3 for controls; monospace only for coordinates and measurements.
- **Motifs:** survey marks, plate borders, registration crosses, tracing paper, restrained ink hatching. Use real scans as the principal imagery.
- **Layout:** scene dominates; evidence appears in a compact drawer. Mobile gets a scene above a bottom sheet.
- **Motion:** controlled ink tracing and translucent emergence; restrained camera movement; reduced-motion equivalent.
- **Sound:** optional paper movement and a soft lantern click; mute by default.
- **Voice:** concise, curious, exact. “Raise the past.” “Show the original.” “Nearby, within 7 m.” “Rule-based draft—unreviewed.” “No record loaded for this date.”

**Cut/demote:** General address search, 1947 without evidence, empty analytical sections, public Studio navigation, repeated disclaimers, exhaustive feature lists. Preserve full caveats and “Buried screens; it doesn’t certify” in records and exports. Keep source/status labels beside every claim.

**D. Ranked return per day**

These are prioritization judgments, not predicted judge scores.

| Rank | Criterion | Work | Days |
|---|---|---|---:|
| 1 | Presentation | Storyboard immediately; record a complete, legible demonstration; replace submission prose with audience → action → result → proof. | 3 |
| 2 | Design | Build the guided entrance, anchored resurrection, evidence drawer and touch Lantern. Eliminate dead routes and loading traps. | 6 |
| 3 | Potential Impact | Test with five residents/educators. Measure unassisted discovery and source-finding; fix failures. Report actual results. | 3 |
| 4 | Technological Implementation | Package three requirement → Kiro action → verified outcome examples. Show one real PBT counterexample and the held-out protection hook. | 2 |
| 5 | Innovation/Idea | Perfect source-to-ghost correspondence and edition comparison. Explain the difference from viewing a georeferenced scan. | 3 |

Reserve four days for integration, review, browser/mobile verification and submission. Freeze features December 1; submit December 3.

Ten thousand lines of specs earn nothing by themselves. Demonstrated consequences do.

**E. Video: 2:50**

- **0:00–0:10:** Working resurrection immediately. “This block has a past you can still inspect.”
- **0:10–0:25:** Show the educator/resident problem: finding and interpreting historic plans.
- **0:25–0:55:** Fresh visit → one action → ghost emergence.
- **0:55–1:20:** Lantern comparison; select a reviewed discovery.
- **1:20–1:40:** Original crop, uncertainty, edition and review status. Show a draft’s visibly different status.
- **1:40–2:15:** Three short Kiro proofs: spec drives behavior; PBT catches a real bug; hook protects held-out material. Show readable artifacts.
- **2:15–2:35:** Share/export the finding; demonstrate phone interaction.
- **2:35–2:50:** State actual user-test results and one-block scope. End on the live experience and URL.

Use captured functioning software. No opening logo animation, installation footage or scrolling inventories.

**F. Three biggest risks**

1. **Resurrection category ambiguity.** Old buildings are not dead technology. Frame the revived technology as the paper fire-insurance atlas becoming an interactive, queryable instrument. Seek organizer clarification now; use Frankenstein if that interpretation is rejected.

2. **Apparent precision exceeds evidence.** Review the three showcased discoveries manually. Separate edition evidence, alignment uncertainty and geometric approximation. Correct “confirmed/unreviewed” and 1911/1935 attribution before polishing anything.

3. **Judges never reach the payoff.** Remove mandatory search, dead Studio and blank waiting. Test fresh sessions on ordinary laptops and phones. Require an unprompted visitor to trigger resurrection within ten seconds and locate its source within thirty. If they cannot, the journey still fails.