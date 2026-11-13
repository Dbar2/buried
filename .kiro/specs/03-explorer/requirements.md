# Requirements: 03 Explorer

## Introduction

The Explorer is the 3D part of Buried: a foggy neighbourhood at dusk that you dig through, where
depth is time. It has two halves:

- a Unity 6 (6000.3.26f1, URP) project in `unity/`, built to WebGL, that draws a scene built at
  runtime from data it is sent;
- the React shell in `web/`, which loads the evidence, computes everything that is a fact (with the
  Evidence Library from spec 01), owns all text and UI, and drives Unity over one typed bridge.

This spec covers the bridge, the Unity scene (extruded footprints, draped rasters, water, today's
buildings), Dig, ghosts, the Lantern, Show Evidence, Water remembers, search and fly-to, keyboard
paths, the list view, the 2D fallback and the performance budget. The Report and the Studio are
separate specs; this spec gives the Studio a way to make published buildings rise in the scene and
guarantees that the Report never depends on Unity.

Rules come from `.kiro/steering/` (`tech.md`, `structure.md`, `product.md`, `design.md`,
`sources.md`, `evidence.md`). Contract file shapes, the date logic and the per-era feature list come
from spec 01. Tiles, alignment records and present-day layers come from spec 02. Where this spec and
the concept brief differ, the steering docs win.

## Glossary

- **Shell**: the Vite + React + TypeScript app in `web/`.
- **Player**: the Unity WebGL build running inside the Shell.
- **Bridge**: the one channel between Shell and Player: `SendMessage` to the `Bridge` GameObject
  (Shell to Player) and a `.jslib` function that calls `window.buriedBridge.onMessage(json)`
  (Player to Shell).
- **Bridge Schema**: `data/schema/bridge.schema.json`, JSON Schema draft 2020-12, the catalogue of
  every Bridge message.
- **Envelope**: the JSON object `{ "type": <string>, "payload": <object> }` that every Bridge
  message is.
- **Bridge module**: `web/src/bridge/` on the Shell side and `unity/Assets/Buried/Runtime/Bridge/`
  on the Player side. The only code on each side that sends, receives, parses or serialises Bridge
  messages.
- **Evidence Library**: `web/src/evidence/` (spec 01).
- **Era list**: the `EraFeatureList` that `featuresForEra` returns for one era (spec 01).
- **Scene feature**: the subset of an era list entry that the Player needs to draw it (design.md).
- **Drape**: a tile from `data/tiles/` (spec 02) placed on the ground by its four EPSG:26917
  corners.
- **Present buildings**: today's building outlines from
  `data/present/present_toronto_building_outlines_2026.geojson`, drawn as context, not evidence.
- **Ghost**: a drawn evidence feature of kind `building`.
- **Depth**: a number from 0 to n−1, where n is the number of eras; 0 is Today and n−1 the earliest
  era. Integer depths are eras; fractional depths are transitions.
- **Era index**: an era's integer depth.
- **Lens**: the circular Lantern region on screen that shows a past era inside and Today outside.
- **Coverage area**: the union of the `mapped_area` of every evidence file.
- **Pinned lot**: the property boundary the user chose by search or click, from
  `data/present/present_toronto_property_boundaries_2026.geojson`.
- **Project frame**: the conversion between EPSG:26917 and Unity world coordinates using the origin
  in `data/project.json`.
- **Reference machine**, **mid-range profile** and **fast connection profile**: the measurement
  setup in design.md "Budget".
- **Gate**: the go/no-go checkpoint due Nov 14 (requirement 24).

## Requirement 1: Unity project and headless build

**User story:** As the maintainer, I want the Unity project to build from the terminal, so that the
WebGL player can be rebuilt without opening the editor.

### Acceptance criteria

1.1 THE Unity project SHALL live in `unity/`, target Unity 6000.3.26f1 with the Universal Render
Pipeline, and build for WebGL 2 only.

1.2 THE command `Unity -batchmode -quit -projectPath unity -executeMethod Buried.Editor.Build.WebGL`
SHALL build the Player into `web/public/unity/` and SHALL exit with status 0 on success and a
non-zero status on any build error.

1.3 THE build output directory SHALL be gitignored.

1.4 THE Unity project SHALL contain exactly one scene in the build, `Bootstrap`.

1.5 WHEN the build command or the EditMode test command is added, THE same change SHALL record it
under "Commands" in `.kiro/steering/tech.md`.

## Requirement 2: The scene is built at runtime

**User story:** As a reviewer, I want every building and raster in the scene to come from evidence
data, so that nothing in the showcase area is hand-placed.

### Acceptance criteria

2.1 THE `Bootstrap` scene SHALL contain one root GameObject named `Bridge` and no other GameObject,
mesh, collider, light or camera.

2.2 THE Player SHALL create the camera, lights, ground, sky, fog and all showcase content at
runtime.

2.3 THE Player SHALL build every footprint by procedural triangulation and extrusion of the
geometry it receives, and every drape from the corners it receives.

2.4 THE Unity project SHALL NOT contain building geometry from Blender or any other modelling tool.
Blender GLB props, when added, SHALL NOT stand in for buildings.

2.5 THE Player SHALL NOT use a Unity UI Canvas, UI Toolkit or TextMeshPro, and SHALL NOT draw any
text.

## Requirement 3: Coordinates

**User story:** As a developer, I want one conversion between stored coordinates and Unity
coordinates, so that everything lines up by construction.

### Acceptance criteria

3.1 THE Player SHALL convert an EPSG:26917 position (easting E, northing N) and a height h in metres
to the Unity world position `(E − E0, h, N − N0)`, where (E0, N0) is the origin received in
`scene/init`, subtracting in double precision before converting to float.

3.2 THE Player SHALL convert a Unity world position back to EPSG:26917 by adding the origin in
double precision.

3.3 THE origin SHALL be read by the Shell from `data/project.json` and sent in `scene/init`. No
origin value SHALL appear as a constant in C# or in Shell code.

3.4 IF any corner of the project bounds in `scene/init` is more than 4000 m from the origin, THEN
THE Player SHALL refuse the message and send an `error`, because float precision at that distance
no longer guarantees 1 mm.

3.5 THE Player SHALL NOT apply any per-object offset, nudge or correction to a position it was
sent.

3.6 THE Shell SHALL convert between EPSG:26917 and EPSG:4326 only in `web/src/map/edge.ts`, and
only for the 2D map.

## Requirement 4: One typed bridge

**User story:** As a developer on either side, I want one message catalogue that both sides are
tested against, so that the Shell and the Player cannot drift apart.

### Acceptance criteria

4.1 THE Bridge Schema SHALL be a single JSON Schema draft 2020-12 document at
`data/schema/bridge.schema.json` that defines the Envelope and one `$defs` entry per message type,
and SHALL reuse `position`, `featureId` and `sourceId` from `evidence.schema.json` by `$ref`.

4.2 THE Bridge Schema SHALL carry a bridge version as the `const` of `bridgeVersion` in the
`scene/init` and `ready` payloads, and every change to the Bridge Schema SHALL change that version.

4.3 THE Shell SHALL send messages only by `SendMessage("Bridge", "Receive", json)` from the Bridge
module, and the Player SHALL send messages only through the `.jslib` function that calls
`window.buriedBridge.onMessage(json)`.

4.4 THE Shell SHALL use TypeScript types generated from the Bridge Schema, and a test SHALL fail if
regenerating them changes the committed file.

4.5 THE Player SHALL use one C# DTO type per message payload, and a test SHALL fail if any DTO's
fields differ from the Bridge Schema's properties for that message (names, required, types).

4.6 WHEN either side receives a message, it SHALL validate the Envelope and the payload before
acting on it; IF the message is malformed or its type is unknown, THEN it SHALL log the reason,
drop the message and take no other action. The Player SHALL also send an `error` message.

4.7 WHEN the Shell is about to send a message, THE Bridge module SHALL validate it against the
Bridge Schema and SHALL throw instead of sending if it is invalid.

4.8 THE Player SHALL reject any payload with a property the Bridge Schema does not define.

4.9 No code outside the Bridge module on either side SHALL call `SendMessage`, reference
`window.buriedBridge`, declare the `.jslib` import, or build message JSON.

4.10 WHEN the Shell receives `ready` with a `bridgeVersion` different from its own, THE Shell SHALL
NOT send `scene/init`, SHALL show the 2D map with the reason, and SHALL log both versions.

## Requirement 5: Message catalogue

**User story:** As a developer, I want each message's purpose and payload fixed, so that each side
knows exactly what it must handle.

### Acceptance criteria

5.1 THE Bridge Schema SHALL define these Shell-to-Player messages: `scene/init`, `scene/loadEra`,
`scene/setDepth`, `scene/focusLot`, `scene/selectFeature`, `scene/setLantern`,
`scene/showEvidence`, `scene/addFeatures`, `scene/setReducedMotion`, `scene/setWaterRemembers` and
`debug/markers`, with the payloads in design.md "Message catalogue".

5.2 THE Bridge Schema SHALL define these Player-to-Shell messages: `ready`, `eraLoaded`,
`featureClicked`, `featureHovered`, `groundClicked`, `cameraChanged` and `error`, with the payloads
in design.md.

5.3 THE `scene/loadEra` payload SHALL carry the era id, the scene features derived from that era's
Era list, and the drapes for that era.

5.4 THE Player SHALL send `ready` once, after its first rendered frame, when it can accept messages.

5.5 THE Player SHALL send `eraLoaded` for an era after every mesh for it is built and every drape
texture for it has loaded or failed.

5.6 THE Player SHALL send `cameraChanged` at most 10 times per second while the camera moves and
once when it stops.

5.7 THE Player SHALL honour `debug/markers` only if `scene/init` had `debug: true`; otherwise it
SHALL drop the message and send an `error`.

## Requirement 6: The Player draws what it is told

**User story:** As the person responsible for honesty, I want dates and confidence decided in one
place, so that the 3D view can never claim more than the Evidence Library does.

### Acceptance criteria

6.1 THE Player SHALL NOT receive, read or compute years, date windows, date phrases, lot relations
or confidence classes. It SHALL receive confidence as a field on each scene feature and map it to a
visual treatment only.

6.2 THE Player SHALL draw in an era exactly the scene features it received for that era, and SHALL
NOT filter, add or remove features by any rule of its own.

6.3 THE Shell SHALL build every `scene/loadEra` and `scene/addFeatures` feature list only from
`featuresForEra` for that era (spec 01), so that a feature is never drawn outside its evidence
window.

6.4 THE Shell SHALL derive each scene feature from its Era list entry with one function, which
copies `id`, `kind`, `geometry` and `confidence` unchanged and adds `heightM` by the rule in
design.md.

6.5 THE Shell SHALL NOT send features of kind `land_use` to the Player in this spec.

6.6 THE Player SHALL NOT read any file under `data/` directly. It SHALL load only the drape image
URLs it is sent.

## Requirement 7: The Shell owns all text and UI

**User story:** As a reader, I want every word on screen to come from one place that follows the
honesty rules.

### Acceptance criteria

7.1 THE Shell SHALL draw the search box, depth gauge, era labels, evidence card, hover label, list
view, attribution lines, error messages and every other piece of text as DOM.

7.2 WHEN the Player sends `featureHovered` with a feature id, THE Shell SHALL show a DOM label near
the given screen position with the feature's confidence label ("Documented", "Estimated" or
"Unknown") and its use when one is recorded; WHEN the id is null, THE Shell SHALL hide it.

7.3 THE Shell SHALL take date phrases, position wording and confidence labels from the Evidence
Library (`datePhrases`, `positionPhrase`) and SHALL NOT word them itself.

7.4 No text the Explorer shows SHALL contain a banned word as defined by the Evidence Library's
`findBannedWords`.

## Requirement 8: Era content

**User story:** As a viewer, I want each era to show its own buildings, water and source images in
the right place.

### Acceptance criteria

8.1 THE Shell SHALL order eras by depth from Today (0) to the earliest era (n−1), using the eras in
`data/project.json` sorted by `year_to` descending, and SHALL send only era ids and era indexes to
the Player, never years.

8.2 THE Shell SHALL include in an era's drapes every tile whose source has `attribution_status:
confirmed` and whose year range contains the era's year range.

8.3 THE Player SHALL place each drape with a mesh whose vertices are the bilinear interpolation of
the four corners it was sent, and SHALL draw the image with its original colours, changing only its
opacity.

8.4 THE Shell SHALL send the present buildings in `scene/init`, each with a fixed display height
given in design.md, and SHALL NOT show that height as text anywhere.

8.5 THE Player SHALL extrude each building scene feature from the ground (y = 0) to its `heightM`.

8.6 THE Player SHALL draw water scene features as faint `water` light on the ground: polygons as
filled shapes, lines as ribbons whose width is given in design.md.

8.7 WHILE an era is not loaded, THE Player SHALL draw nothing for it and SHALL NOT draw a
placeholder in its place.

8.8 WHEN a drape carries a `clip` polygon (the plate's map area), THE Player SHALL draw no drape
pixel whose ground position lies outside that polygon by more than one mask texel (design.md
"Drape mask"). The clip SHALL change opacity only.

8.9 THE Player SHALL fade each drape's opacity from 0 at its boundary (the `clip` polygon, or the
four corners when there is no clip) to full over `DRAPE_FEATHER_M` inside it, so that no drape
ends in a hard edge. WHILE Show Evidence draws a drape, THE Player SHALL NOT apply the fade to it.

## Requirement 9: Ghosts and confidence

**User story:** As a viewer, I want to see how sure Buried is about each ghost by its look and by a
label, never by colour alone.

### Acceptance criteria

9.1 THE Player SHALL draw a `documented` ghost with solid `ink` edges and a filled translucent
volume.

9.2 THE Player SHALL draw an `estimated` ghost with dashed `ink` edges and a lighter fill than a
documented ghost.

9.3 THE Player SHALL draw an `unknown` ghost as a soft fog volume with no hard edges and a "?"
marker, drawn as a world-space image, not as text.

9.4 THE three treatments SHALL differ in edge pattern and fill, not in hue.

9.5 THE Shell SHALL show the confidence label and its reason (from `confidence_reason`) on the
evidence card and in the list view.

## Requirement 10: Dig

**User story:** As a viewer, I want to go back in time by going down, with smooth transitions that
keep my place.

### Acceptance criteria

10.1 THE Shell SHALL own the current depth and SHALL send it to the Player with `scene/setDepth`.

10.2 WHEN the user scrolls the mouse wheel over the 3D view without a modifier key, drags the depth
gauge, or presses Down or Up on the depth gauge, THE Shell SHALL change the depth deeper or
shallower accordingly.

10.3 WHEN the depth moves to a new integer era, THE Shell SHALL animate the depth to it over a
duration between 600 and 900 ms and SHALL end exactly on the integer.

10.4 WHILE the depth is between Today and the next era, THE Player SHALL draw the present buildings
draining from solid to wireframe and then to a faint outline; WHILE the depth is at or past the next
era, THE Player SHALL draw them as a faint outline.

10.5 WHILE an era's weight rises from 0 to 1, THE Player SHALL make its ghosts rise from the ground
to their full height and fade in.

10.6 WHILE the depth is between two eras, THE Player SHALL draw both eras' content blended by the
fractional part of the depth, and SHALL NOT draw any other era's content.

10.7 WHEN the depth reaches an integer era, THE Shell SHALL announce "Now showing <era label>" to
screen readers through an `aria-live="polite"` region.

10.8 THE Shell SHALL keep the eras adjacent to the current depth loaded, so that a transition never
waits for a load.

10.9 THE camera SHALL NOT move when the depth changes.

## Requirement 11: Selection and the evidence card

**User story:** As a viewer, I want to click a ghost and see the evidence behind it.

### Acceptance criteria

11.1 WHEN the user clicks a drawn feature, THE Player SHALL send `featureClicked` with its id and
era id; WHEN the click hits no feature, THE Player SHALL send `groundClicked` with the EPSG:26917
position of the ground point under the cursor.

11.2 WHEN the Shell receives `featureClicked`, THE Shell SHALL send `scene/selectFeature` with that
id and open the evidence card for it.

11.3 THE evidence card SHALL show: the feature's use if recorded; its date phrases; its confidence
label and reason; its position phrase; its storeys if recorded, or "Storeys: not recorded"; one
line per source checked for its linked set with the source id, the source's years as worded by the
Evidence Library's `sourceYearsText` (for example "1931, revised to 1935"), and whether the feature
was present, absent or not readable (with the visibility); the origin source's title and
attribution line; who confirmed it and when; a crop of the origin source's tile around the feature
with the feature outlined; and the feature id.

11.4 WHEN a feature is selected, THE Player SHALL draw its edges in `ink`, brighter and thicker
than unselected edges (design.md "Materials and treatments"), and THE Shell SHALL show its DOM
label. THE Player SHALL NOT use `lantern` for a selected feature.

11.5 WHEN the user presses Escape or closes the card, THE Shell SHALL send
`scene/selectFeature` with null and close the card.

11.6 IF a clicked id is not in the Shell's current Era lists, THEN THE Shell SHALL ignore the click
and log it.

11.7 IN the scene and on the 2D map, `lantern` SHALL mark only the pinned lot (its outline and its
light). No feature, control, hover state or selection SHALL be drawn in `lantern`.

## Requirement 12: Show Evidence

**User story:** As a sceptical viewer, I want to see the source itself beneath a ghost.

### Acceptance criteria

12.1 WHEN the user chooses Show Evidence on the evidence card, THE Shell SHALL send
`scene/showEvidence` with the feature id, `on: true` and the drape of the feature's origin source.

12.2 WHILE Show Evidence is on, THE Player SHALL draw the selected ghost nearly transparent with its
edges visible, draw the given drape at full opacity beneath it, and hide every other drape.

12.3 WHEN Show Evidence is turned off, the selection changes or the depth changes, THE Shell SHALL
send `scene/showEvidence` with `on: false`, and THE Player SHALL restore the previous look.

12.4 THE camera SHALL NOT move when Show Evidence is turned on or off.

## Requirement 13: The Lantern

**User story:** As a viewer at Today, I want to hold a lens over the city and see the past inside
it.

### Acceptance criteria

13.1 WHILE the depth is 0 and the user holds Space with focus in the Explorer, or long-presses on
touch, THE Shell SHALL send `scene/setLantern` with `on: true`, the lens centre in normalised canvas
coordinates, the lens radius and the Lantern era id, and SHALL update the centre as the pointer
moves.

13.2 WHILE the Lantern is on, THE Player SHALL draw inside the lens the Lantern era's content and
no present buildings, and outside the lens the Today content.

13.3 WHILE the Lantern is on, THE Player SHALL pick features inside the lens only from the Lantern
era and outside it only from Today.

13.4 THE Lantern era SHALL default to the era at depth 1 and SHALL be selectable in the Shell from
the eras deeper than Today.

13.5 WHEN Space is released or the long-press ends, THE Shell SHALL send `scene/setLantern` with
`on: false`.

13.6 WHILE the depth is not 0, THE Shell SHALL NOT turn the Lantern on and SHALL say in a status
line that the Lantern works from Today.

13.7 WHILE the Lantern is on and a keyboard is the input, THE arrow keys SHALL move the lens centre
by 5% of the canvas height per press.

## Requirement 14: Water remembers

**User story:** As a resident, I want to see documented water from past eras under today's streets.

### Acceptance criteria

14.1 WHEN the user turns Water remembers on at depth 0, THE Shell SHALL send
`scene/setWaterRemembers` with `on: true` and the ids of the past eras whose Era lists contain at
least one water feature.

14.2 WHILE Water remembers is on, THE Player SHALL draw, with the Today content, the water scene
features of each named era, and no other content from those eras.

14.3 THE Shell SHALL state which eras' records the water comes from, as DOM text.

14.4 IF no era list contains a water feature, THEN THE Shell SHALL say
"No documented water in these records" and list the eras checked, and SHALL NOT send the message.

14.5 WHEN the depth leaves 0, THE Shell SHALL turn Water remembers off.

## Requirement 15: Search, the pinned lot and fly-to

**User story:** As a resident, I want to type my address, have the camera fly there and see my lot
pinned in every era.

### Acceptance criteria

15.1 THE Shell SHALL search addresses only in
`data/present/present_toronto_address_points_2026.geojson`, with no network geocoder.

15.2 WHEN the user picks an address, THE Shell SHALL find the lot in the property boundaries layer
that contains the address point, computed in EPSG:26917.

15.3 IF the search finds no address, or the lot does not intersect the coverage area, THEN THE
Shell SHALL say "Not reconstructed yet." and nothing else, and SHALL NOT move the camera.

15.4 WHEN the lot intersects the coverage area, THE Shell SHALL send `scene/focusLot` with the lot
and `fly: true`.

15.5 WHEN the Player receives `scene/focusLot`, THE Player SHALL outline the lot in `lantern` on the
ground in every era, add one small warm light near it that lights the ground and ghosts but not the
present buildings, and, if `fly` is true, fly the camera to frame the lot with an eased flight.

15.6 WHEN the Shell receives `groundClicked`, THE Shell SHALL find the lot under that point and
handle it as in 15.3 and 15.4, with `fly: false`.

15.7 THE pinned lot SHALL stay pinned across depth changes until another lot is chosen or the user
clears it.

## Requirement 16: Camera

**User story:** As a viewer, I want to move around the scene myself, and never have the camera move
on its own.

### Acceptance criteria

16.1 THE Player SHALL move the camera only in response to user input on the 3D view, a
`scene/focusLot` with `fly: true`, or, only when `scene/init` had `debug: true`, a
`debug/setCamera`.

16.2 THE Player SHALL let the user pan by dragging, rotate and tilt by right-dragging or with two
fingers, and zoom with Ctrl or Shift and the wheel, pinch, or the `+` and `-` keys.

16.3 THE Player SHALL keep the camera target inside the project bounds, its height between 30 m and
1500 m, and its pitch between 20 and 80 degrees.

16.4 THE Player SHALL NOT spin, orbit or drift the camera on its own.

16.5 THE Shell SHALL capture an unmodified wheel event over the 3D view for Dig before it reaches
the Player.

16.6 UNTIL task 3.1 adds Dig on the wheel, an unmodified wheel event over the 3D view SHALL reach
the Player and zoom. From task 3.1 on, 16.5 applies and only Ctrl or Shift with the wheel zooms.
(Open: the maintainer decides whether the plain wheel stays Dig; see design.md "Camera".)

16.7 WHEN the user drags to pan, THE Player SHALL keep the ground point under the pointer under it
for the whole drag, and SHALL stop the camera when the pointer stops or is released (no inertia).

16.8 THE default pose after `scene/init` SHALL show the whole `initialView` rectangle the Shell
sent, centred on the canvas, looking north-north-east (heading 22.5 degrees) at a pitch of 21 degrees
(session 015; see requirement 26.2).

## Requirement 17: Keyboard, list view and screen readers

**User story:** As a keyboard or screen reader user, I want to reach everything the 3D view shows.

### Acceptance criteria

17.1 THE Shell SHALL give keyboard paths for search (Tab, and `/` to focus it), the depth gauge
(Up and Down change era, Home goes to Today, End to the earliest era), the Lantern (Space to hold),
selecting ghosts (Tab through the list view, Enter to select), and Show Evidence (a button on the
evidence card).

17.2 THE depth gauge SHALL be a DOM slider with role `slider`, `aria-valuemin`, `aria-valuemax`,
`aria-valuenow` and `aria-valuetext` set to the era label.

17.3 THE list view SHALL list every feature drawn in the current era with its use or kind, date
phrases, confidence label, position phrase and source ids, in the order of the Era list.

17.4 THE list view SHALL state how many features in the current era are not shown because their
sources disagree and they need review, when that number is not zero.

17.5 WHEN the user selects a feature in the list view, THE Shell SHALL select it as in 11.2 and
SHALL NOT move the camera unless the user chooses "Show in scene", which flies to it.

17.6 Every interactive element SHALL have a visible focus ring.

17.7 THE Shell SHALL pass an automated accessibility check (axe) with no serious or critical
violations on the Explorer and the 2D map.

## Requirement 18: Reduced motion

**User story:** As a viewer who is sensitive to motion, I want the Explorer to change without
movement.

### Acceptance criteria

18.1 THE Shell SHALL read `prefers-reduced-motion`, send it in `scene/init`, and send
`scene/setReducedMotion` whenever it changes.

18.2 WHILE reduced motion is on, THE Player SHALL replace every transition with an opacity
crossfade: no wireframe stage, no rising or condensing ghosts, no rise on `scene/addFeatures`.

18.3 WHILE reduced motion is on, THE Player SHALL cut the camera to the target of a
`scene/focusLot` instead of flying.

18.4 THE Player SHALL NOT loop or pulse any visual while no input or message has arrived.

## Requirement 19: Fallbacks and Report independence

**User story:** As a viewer whose browser cannot run the 3D view, I want the same records on a 2D
map and a reason why.

### Acceptance criteria

19.1 IF the browser has no WebGL 2 context, THEN THE Shell SHALL NOT load the Player and SHALL show
the 2D map with the message "This browser cannot show the 3D view (WebGL 2 is not available). The
map below shows the same records."

19.2 IF the Player fails to load, or sends no `ready` within 30 s, THEN THE Shell SHALL show the 2D
map with a message saying the 3D view did not load and why, as far as it is known.

19.3 THE Shell SHALL let the user switch to the 2D map at any time and back.

19.4 THE 2D map SHALL show, for the current era, the same Era list features (with the confidence
outline patterns from `design.md`, and the selected feature with the brighter, thicker `ink`
outline of requirement 11.4), the drapes, the present buildings, the pinned lot, the attribution
lines, the depth gauge, search, the evidence card and the list view.

19.5 THE 2D map SHALL use MapLibre GL JS with no basemap, and SHALL take its positions from
`web/src/map/edge.ts`.

19.6 THE Report route and its modules SHALL NOT import the Player loader or any module that does,
and SHALL render with the Player unavailable.

## Requirement 20: Look

**User story:** As a viewer, I want the scene to look like a city at dusk lit by a lantern, with
the sources shown as they are.

### Acceptance criteria

20.1 THE Player SHALL take every colour from one palette asset whose values equal the CSS tokens in
`web/src/styles/tokens.css`, checked by a test.

20.2 THE Player SHALL draw a dusk sky graded from `night` at the zenith to a dim grey-blue near the
horizon, a low directional light from the west, low ambient light, and exponential distance fog in
`fog` so that the edge of the coverage area dissolves with no visible edge of the world.

20.3 THE Player SHALL draw present buildings as matte `present` volumes with no texture, lit by no
warm light.

20.4 THE Player SHALL draw ghosts with thin `ink` edges, a translucent pale fill and slight
self-illumination, with no flicker.

20.5 THE Player SHALL NOT tint, sharpen, colour-grade, tone-map or fog the colours of a drape; it
SHALL fade a drape's opacity only, including for distance.

20.6 THE Player SHALL use no particles, lens flares, chromatic aberration, film grain or camera
shake, and SHALL limit post-processing to bloom that affects only `ink` and `lantern` emission.

## Requirement 21: Sources and attribution

**User story:** As the maintainer, I want every source the Explorer shows credited, and nothing
shown that is not cleared.

### Acceptance criteria

21.1 THE Shell SHALL NOT send to the Player, or show, any source whose `attribution_status` is
`to_be_confirmed`.

21.2 WHILE any drape or present-day layer is visible, THE Shell SHALL show the attribution line of
each visible source as DOM text.

21.3 THE Shell SHALL provide a Sources page built from `data/sources.json` that lists, for every
registered source, its id, title, years (through `sourceYearsText`), holding institution when
recorded, URL, licence note, attribution line and the date its rights were checked.

21.4 FOR each plate with a `full_image` in its tile sidecar, THE Sources page SHALL show that full,
uncropped photograph, archive labels and ruler included, with alt text. THE Shell SHALL never drape
a full image.

## Requirement 22: Studio publish into the scene

**User story:** As a Studio user, I want buildings I publish to rise into the scene in their era.

### Acceptance criteria

22.1 THE Shell SHALL provide one function that, given updated evidence collections, recomputes the
Era lists and sends `scene/addFeatures` for every era whose list gained entries, with only those
entries, and sends a full `scene/loadEra` for every era whose list lost or changed entries.

22.2 WHEN the Player receives `scene/addFeatures`, THE Player SHALL add the features to that era,
replacing any feature with the same id, and SHALL make them rise from the ground over 900 ms unless
reduced motion is on.

22.3 THE Studio integration itself (when to call 22.1) belongs to the Studio spec.

## Requirement 23: Budget

**User story:** As a judge on a laptop, I want the Explorer to start quickly and run smoothly.

### Acceptance criteria

23.1 ON the mid-range profile (design.md "Budget") with the fast connection profile and a cold
cache, THE time from navigation start to the first frame after `eraLoaded` for Today SHALL be under
8 s, as the median of 5 runs.

23.2 THE total size of the files in `web/public/unity/Build/` SHALL be under 15,000,000 bytes.

23.3 ON the mid-range profile, during the scripted run in design.md, THE 95th percentile frame
interval SHALL be at most 33.3 ms (30 fps floor), and THE median frame interval SHALL be reported
against the 16.7 ms (60 fps) target.

23.4 THE measurements in 23.1 to 23.3 SHALL be recorded with the machine, browser version, profile
(reference machine or mid-range profile), build commit and date in `docs/kiro-sessions/` notes each
time they are run.

23.5 THE measurements in 23.1 and 23.3 SHALL be run on both the reference machine and the
mid-range profile. The pass or fail verdict SHALL be taken from the mid-range profile; the reference
machine results SHALL be recorded alongside.

## Requirement 24: The Nov 14 gate

**User story:** As the maintainer, I want to know by Nov 14 whether the 3D view can show a real
plate and a real building in the right place across eras.

### Acceptance criteria

24.1 Task group 1 in `tasks.md`, with its stated dependencies on specs 01 and 02, SHALL be enough,
with no other task in this spec, to reach the gate.

24.2 AT the gate, THE Player SHALL load inside the Shell, draw one plate draped on the ground, draw
at least one extruded footprint from a real evidence file at its EPSG:26917 position, and switch
between two eras.

24.3 AT the gate, WHEN the user clicks that footprint, THE Shell SHALL show a DOM card with its id,
origin source, position phrase, `confirmed_by` and `confirmed_at`, and the origin source's
attribution line.

24.4 AT the gate, a Playwright test SHALL show that the screen positions of three ground control
points, drawn as debug markers at their reference coordinates, differ by at most 2 px between the
two eras and from the positions projected from the camera's reported view-projection matrix.

24.5 A footprint written by a reviewed hand edit SHALL be acceptable for the gate only. Before any
demo, THE maintainer SHALL set that feature's status to `rejected` with a `status_reason`, publish
its replacement through `buried publish`, and THE demo readiness check (design.md) SHALL pass.

## Requirement 25: Tests and tooling

**User story:** As the maintainer, I want the pure parts proved by tests and the commands recorded
where Kiro reads them.

### Acceptance criteria

25.1 THE Unity project SHALL have EditMode tests for coordinate conversion, polygon preparation,
triangulation and extrusion, drape meshes, Bridge parsing and serialisation, and the lens mask.

25.2 Each correctness property in `design.md` SHALL have a test: fast-check for the Shell, seeded
generated cases in EditMode tests for the Player.

25.3 Tests SHALL NOT use the network. Fixtures SHALL be small, synthetic unless stated, and
committed under `web/`, `unity/` or `data/schema/bridge_fixtures/`.

25.4 WHEN a task adds a command (Shell dev, build, preview, end-to-end tests, Unity build, Unity
EditMode tests, size check), THE same change SHALL record it under "Commands" in
`.kiro/steering/tech.md`.

25.5 A Playwright test SHALL show, for every control point of each draped gate plate, that the
tile's own pixels around the control point appear on screen where the camera's reported
view-projection puts the ground position the tile corners assign to that pixel, within 1 px, by
normalised cross-correlation (design.md "Drape placement check").

25.6 No package with a known vulnerability (`npm audit --omit=dev`) SHALL ship to users in the
built site. Dev-only advisories SHALL be recorded with the reason they remain.

25.7 THE Player's triangulation SHALL be tested on every polygon in the committed
`data/evidence/*.geojson` and `data/present/*.geojson` files, not only on generated polygons.

## Requirement 26: The look pass

**User story:** As the maintainer, I want the scene to read as Buried before more features are
added, so that the look is a foundation and not a final coat of paint.

Each criterion is checked from the screenshots that task 16.7 saves (canvas 1280 × 800, default
pose, debug off). (a) to (f) of task 16.7 automate parts of 26.1, 26.2, 26.5, 26.6 and 26.9.

### Acceptance criteria

26.1 AT the default pose, THE published building SHALL appear inside the middle third of the
canvas. (Session 018: the earlier clause that two corners of the drape lie outside the canvas is
dropped. The default view frames the whole map area, so the corners of a map-area tile are in view.)

26.2 THE default view SHALL show the horizon (maintainer decision, session 015). THE top rows of the
canvas SHALL be within a small distance of `night`; THE horizon row SHALL lie between 12 and 22 per
cent of the canvas height from the top; THE rows just above the horizon SHALL be lighter and bluer
than the top rows; and no building silhouette SHALL cross the horizon with more than low contrast.
There SHALL be no default Unity skybox, no pure black and no visible horizon line where the ground
ends. The ground and the sky meet in the `fog` colour. (The brief asked for a pitch of about 32
degrees and a vertical field of view of about 50; with those the top edge is below the horizon, so
the defaults are 21 degrees and 58 degrees, which put the horizon 15 per cent down.)

26.3 THE drape SHALL fade into the ground with no hard straight edge; beyond it the ground SHALL
continue in `fog` into the distance, so that nothing reads as a rectangle floating in a void.

26.4 THE building SHALL show thin `ink` lines on its top outline, vertical corners and base, and a
translucent fill through which the plate's own lines are visible. It SHALL carry no warm or blue
tint, and any glow around its lines SHALL be no wider than about 2 px.

26.5 THE screenshots SHALL contain no `lantern` colour and no `water` colour, in the canvas or the
DOM, because nothing is pinned, no water is drawn and the view has no primary action.

26.6 THE header SHALL run across the top with the wordmark "Buried" in Fraunces and the Sources
link in Inter, on `night` or `fog`.

26.7 THE depth gauge SHALL sit on the right edge and list Today, 1947, 1935 and 1911 from top to
bottom, years in IBM Plex Mono, with the current era marked by shape and weight (not by `lantern`
or `water`).

26.8 WITH the evidence card open, THE card SHALL be a `fog` panel that does not cover the building,
with the heading in Fraunces, body text in Inter at 16 px or larger, and the feature id, years and
position figure in IBM Plex Mono.

26.9 THE attribution line of each visible drape SHALL be legible along the bottom edge, and no
debug marker SHALL be drawn.

26.10 WHEN the gauge has keyboard focus, THE focus ring SHALL be visible in the screenshot.
