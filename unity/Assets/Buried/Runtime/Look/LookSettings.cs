using UnityEngine;

namespace Buried.Look
{
    /// <summary>
    /// Fixed look and camera numbers (design.md "Look" and "Materials and treatments"). Colours come
    /// from the palette, never from here.
    /// </summary>
    public static class LookSettings
    {
        public const float CameraFovDeg = 58f;
        public const float NearClipM = 5f;
        public const float FarClipM = 20000f;

        // Session 015: the default view shows the horizon, with a band of sky filling about 15 per
        // cent of the canvas (rows 12 to 22 per cent from the top hold the horizon). The brief asked
        // for a pitch of about 32 degrees and a field of view of about 50; with those the horizon is
        // above the top of the canvas (32 degrees below the horizontal, minus half of 50, leaves the
        // top edge 7 degrees BELOW it). The horizon row is
        //   (1 - tan(pitch) / tan(fov / 2)) / 2   of the canvas height from the top,
        // so a pitch of 21 degrees and a field of view of 58 degrees put it 15.4 per cent down.
        public const float DefaultPitchDeg = 21f;
        /// <summary>The default heading: north-north-east, so Queen St E runs across the upper part of the view.</summary>
        public const float DefaultHeadingDeg = 22.5f;
        public const float MinPitchDeg = 20f;
        public const float MaxPitchDeg = 80f;
        public const float MinCameraHeightM = 30f;
        public const float MaxCameraHeightM = 1500f;

        // ---- Fog and ground ----

        /// <summary>Extra distance past the farthest bounds corner that the fog radius covers.</summary>
        public const float FogRadiusMarginM = 300f;

        /// <summary>The ground quad reaches this many fog radii in every direction.</summary>
        public const float GroundExtentRadii = 4f;

        /// <summary>Fraction of the light that survives at the fog radius: 1 / 50.</summary>
        public const float FogTransmissionAtRadius = 1f / 50f;

        /// <summary>The fog radius R: the distance from the bounds centre to its farthest corner, plus a margin.</summary>
        public static float FogRadius(double centreToFarthestCornerM)
        {
            return (float)centreToFarthestCornerM + FogRadiusMarginM;
        }

        /// <summary>
        /// Exponential fog density for fog radius R: ln(50) / R, so that 2 in 100 of the light is left at
        /// distance R and the edge of the coverage area dissolves.
        /// </summary>
        public static float FogDensity(float radiusM)
        {
            return Mathf.Log(50f) / Mathf.Max(radiusM, 1f);
        }

        /// <summary>How far the ground quad reaches from the bounds centre, in each direction.</summary>
        public static float GroundHalfExtent(float fogRadiusM)
        {
            return GroundExtentRadii * fogRadiusM;
        }

        // ---- Sky ----

        /// <summary>The horizon band is this far up the palette from night to muted.</summary>
        public const float HorizonMix = 0.25f;

        /// <summary>sin(elevation) at which the sky is at its lightest, just above the horizon.</summary>
        public const float SkyBandElevation = 0.035f;

        /// <summary>
        /// sin(elevation) at which the sky has become `night`. The default view's top edge is about
        /// 8 degrees above the horizon (sin = 0.139) and the top 5 per cent of the canvas spans 5.5 to 8 degrees, so the sky is
        /// `soot` from 4.6 degrees (session 046; it was 6.9 degrees, which left those rows a little lighter than `soot`).
        /// </summary>
        public const float SkyZenithElevation = 0.08f;

        // ---- Sun and ambient ----

        public const float SunElevationDeg = 32f;
        /// <summary>
        /// The lamp travels toward heading 105 degrees (east-south-east), so it stands to the west-north-west: upper left of the first
        /// visit's view, which looks along the plate's own up (heading 342.5). Shadows fall to the lower right (session 043).
        /// </summary>
        public const float SunTravelHeadingDeg = 105f;
        public const float SunIntensity = 0.6f;
        public const float AmbientIntensity = 0.3f;

        /// <summary>How far the lamp's colour goes from `parchment` toward `lantern` (the lamp is the scene's one warm light).</summary>
        public const float LampWarmth = 0.5f;

        /// <summary>The unit vector from a surface toward the lamp (Unity world: x east, y up, z north).</summary>
        public static Vector3 LampToward()
        {
            return -(Quaternion.Euler(SunElevationDeg, SunTravelHeadingDeg, 0f) * Vector3.forward);
        }

        /// <summary>How far a face turned from the lamp goes toward `copper` (design.md: faces away from the lamp tinted toward copper).</summary>
        public const float GhostCopperShade = 0.9f;

        // ---- Bloom (the only post effect; tone mapping is None) ----

        public const float BloomThreshold = 1.0f;
        public const float BloomIntensity = 0.3f;
        public const float BloomScatter = 0.2f;

        // ---- Ghosts ----

        /// <summary>
        /// Fill alpha of a documented ghost. Raised from 0.35 and 1.5 px (session 021) because a ghost
        /// did not read against a draped plate at close range. Still translucent, and the glow stays
        /// at 1 px, inside requirement 26.4.
        /// </summary>
        public const float GhostFillAlpha = 0.70f;
        public const float GhostEmission = 0.3f;

        /// <summary>
        /// Display heights (session 046): 3.6 m for each recorded storey, 4.5 m for a building whose storeys are not read. The Player
        /// builds every building to these (EraLayer.HeightOf), whatever <c>heightM</c> the Shell sends: the Shell's own constants
        /// (web/src/explorer/sceneFeatures.ts, 3.5 and 3.5) are older and are not read for a building.
        /// </summary>
        public const float StoreyHeightM = 3.6f;
        public const float UnreadStoreysHeightM = 4.5f;

        /// <summary>The display height of a building with this many recorded storeys (0: none read).</summary>
        public static float BuildingHeightM(int storeys)
        {
            return storeys > 0 ? storeys * StoreyHeightM : UnreadStoreysHeightM;
        }

        /// <summary>
        /// An estimated building under this footprint area (m2) is drawn as a pale filled volume with its top outline and nothing
        /// else, and a dashed line is dashed only along a segment longer than <see cref="DashMinSegmentCssPx"/> on screen (session 046).
        /// </summary>
        public const float SmallFeatureAreaM2 = 60f;
        public const float DashMinSegmentCssPx = 12f;

        /// <summary>How far a ghost's roof is lifted toward white, so it reads lighter than the lit paper it stands on.</summary>
        public const float GhostTopLift = 0.55f;

        /// <summary>An estimated edge is `ink` this far toward `rule`: a little quieter than a documented one, still well over 2.4 : 1 on the paper.</summary>
        public const float EstimatedEdgeSoftness = 0f;

        /// <summary>
        /// Edge width in CSS pixels, the glow on each side beyond it, and the edge emission. Session 043: the width came down from 2.5
        /// to 1.3 (a ghost's edge is at most about 1.5 px at the opening distance), and the fill went up from 0.45 to 0.55, so a ghost
        /// reads as a pale volume and not as dark hatching.
        /// </summary>
        public const float EdgeWidthCssPx = 1.3f;
        public const float EdgeGlowPx = 1.0f;
        public const float EdgeGlowAlpha = 0.35f;

        /// <summary>
        /// Storey lines (session 043): a hairline at this share of an edge's alpha, fading to nothing between these two camera
        /// distances (m), so they do not alias into noise at the opening distance.
        /// </summary>
        public const float StoreyLineAlpha = 0.4f;
        public const float StoreyFadeNearM = 220f;
        public const float StoreyFadeFarM = 420f;

        /// <summary>
        /// Before Raise the held era's features show as flat `copper` outlines on the paper, at this alpha and this width (CSS px):
        /// no fill, no height (session 043).
        /// </summary>
        public const float HeldOutlineAlpha = 0.7f;
        public const float HeldOutlineWidthCssPx = 1.0f;

        /// <summary>
        /// The ghost edge's glow ring is drawn in `night` at this alpha, so the `ink` line has a dark
        /// casing on a pale plate. It is the same 1 px wide ring, inside requirement 26.4.
        /// </summary>
        public const float GhostEdgeCasingAlpha = 0.25f;

        /// <summary>The casing's width each side of the line. Under the 2 px of requirement 26.4.</summary>
        public const float GhostEdgeCasingPx = 0.8f;
        public const float EdgeEmission = 1.2f;

        /// <summary>Alpha of the present buildings' outline once the depth has left Today (DepthBlend).</summary>
        public const float PresentFaintEdgeAlpha = 0.2f;

        /// <summary>
        /// Today's buildings keep a thin lighter line along the roof, so a dark volume stays legible
        /// (design.md "The present"). It is this strong while the fill is solid, and gives way to the
        /// wireframe's own edge alpha as the fill drains.
        /// </summary>
        public const float PresentRoofEdgeAlpha = 0.75f;
        public const float PresentRoofEdgeWidthCssPx = 1.25f;

        // ---- Confidence classes (design.md "Confidence encoding"; session 023) ----
        // The three classes differ by pattern, so they stay apart in a greyscale screenshot:
        // documented is a solid line and the fill above; estimated is a dashed line and a lighter
        // fill; unknown has no line at all and a soft volume that thins toward the roof.

        /// <summary>Estimated fill alpha: about half of the documented fill.</summary>
        public const float EstimatedFillAlpha = 0.45f;

        /// <summary>
        /// A dash's share of its period, the shortest period in metres, and the shortest period on screen
        /// in CSS pixels. The period is the larger of the two, so a dashed line still reads as dashes
        /// from the default view and is not finer than the pixel grid.
        /// </summary>
        public const float DashOnFraction = 0.55f;
        public const float DashPeriodM = 2.5f;
        public const float DashPeriodCssPx = 11f;

        /// <summary>Unknown: fill alpha at the foot of the volume, and how much of it is left at the roof.</summary>
        public const float UnknownFillAlpha = 0.34f;
        public const float UnknownRoofShare = 0.25f;

        /// <summary>The height over which an unknown volume thins from its foot to its roof, in metres.</summary>
        public const float UnknownFadeHeightM = 9f;

        // ---- The pinned lot (design.md "The pinned lot"; session 023) ----

        /// <summary>The camera flight to a pinned lot (design.md "Motion": eased, 900 ms), its pitch and the room kept around the lot.</summary>
        public const float LotFlightS = 0.9f;
        public const float LotPitchDeg = 40f;
        public const float LotPaddingM = 40f;

        /// <summary>"Show on the map" (scene/frameFeature): the room kept around the feature's footprint.</summary>
        public const float FrameFeaturePaddingM = 25f;

        /// <summary>The lot's outline on the ground: a `lantern` line this wide, with a `night` casing.</summary>
        public const float LotOutlineWidthCssPx = 3f;
        public const float LotOutlineCasingCssPx = 1.5f;


        // ---- The lit map sheet (design.md "Draped rasters: the map sheet is lit"; session 023) ----
        // A draped plate reads as warm paper lit from above by one lantern: the greyscale scan is
        // toned toward `ink` (paper) with its line work kept dark (`night`), brightest under one
        // soft light pool and falling off to the floor, then into the fog. The floor keeps the line
        // work at 4.5 : 1 or better against the paper even far from the light (a test checks it).

        /// <summary>The scan's luminance (linear) at and below which a pixel is line colour, and at and above which it is paper.</summary>
        public const float ToneLineLuminance = 0.02f;
        public const float TonePaperLuminance = 0.60f;

        /// <summary>The light a point far from the pool still gets, as a share of full light.</summary>
        public const float LightFloor = 0.32f;

        /// <summary>
        /// The first visit's sheet before Raise: the lit display at this share of its brightness. Raise takes it to 1
        /// with the sinking plinths (spec 06 requirement 3.1: "brighten the sheet").
        /// </summary>
        public const float LandingSheetGain = 0.85f;

        /// <summary>Radius (m) at which the pool has fallen to 1 / e: with no lot pinned, and around a pinned lot.</summary>
        public const float LightPoolRadiusM = 260f;
        /// <summary>The first visit's lamp pool: a pool on the Queen and River corner that the sheet falls away from toward its far edges and its lower left.</summary>
        public const float LandingPoolRadiusM = 70f;
        public const float LightPoolRadiusPinnedM = 150f;

        // ---- The sheet as a page (session 043) ----

        /// <summary>The paper's thickness (the table sits this far below the sheet), the ink rule's inset from the edge and its width, in metres.</summary>
        public const float SheetThicknessM = 0.4f;
        public const float SheetRuleInsetM = 1.4f;
        public const float SheetRuleWidthM = 0.35f;
        public const float SheetRuleAlpha = 0.8f;

        /// <summary>The contact shadow on the table: how far it is thrown along the lamp's travel (m), how soft it is (m) and how dark.</summary>
        public const float SheetShadowThrowM = 1.6f;
        public const float SheetShadowSoftM = 1.8f;
        public const float SheetShadowAlpha = 0.65f;
        public const float SheetShadowMarginM = 12f;

        /// <summary>The paper's side is this share of `parchment`, shaded toward `copper` away from the lamp.</summary>
        public const float SheetSideBrightness = 0.7f;

        /// <summary>How far the lamp's warmth tints the paper under the pool, and how cool the paper is far from it (shadows lean to `copper`).</summary>
        public const float SheetWarmth = 0.35f;
        /// <summary>The cool lean of the shadow: red down by this, green by half of it, blue untouched (session 046; it used `copper`, which went khaki on the paper).</summary>
        public const float SheetCoolness = 0.04f;
        /// <summary>The warm tint reaches this many light-pool radii, so the lit paper stays warm where the light has begun to fall away.</summary>
        public const float SheetWarmReach = 2.4f;

        /// <summary>The first visit's fog is this share of the project's: the table beside the sheet stays `soot` and only the far edge takes `haze`.</summary>
        public const float BlockFogShare = 0.1f;

        // ---- Today's buildings after Raise (session 043) ----

        /// <summary>Today's buildings sink flat to this height and stay as a thin `block` outline at this alpha. (This replaces the 1 m plinth.)</summary>
        public const float PresentSunkHeightM = 0.05f;
        public const float PresentSunkEdgeAlpha = 0.35f;

        /// <summary>The shadow of a standing block on the paper: its colour is `soot`, at this alpha; it is cast along the lamp's travel.</summary>
        public const float PresentShadowAlpha = 0.5f;
        public const int PresentShadowQueue = 2950;

        /// <summary>A block's roof takes this much of the lamp's warm light.</summary>
        public const float PresentTopWarm = 0.25f;
        public const float PresentPageRoofGain = 1.2f;
        public const float PresentPageWallLight = 0.9f;

        // ---- The Lantern and Show Evidence (session 028) ----

        /// <summary>The lens opens and closes over this long. Reduced motion: it does neither, it is there or it is not.</summary>
        public const float LensOpenS = 0.12f;

        /// <summary>The lens edge: a thin `ink` ring with a `night` casing so it reads on a pale plate and on the dark ground.</summary>
        public const float LensRimWidthCssPx = 1.5f;
        public const float LensRimAlpha = 0.7f;

        /// <summary>How far in front of the camera the rim's polyline is placed (metres). It is drawn over everything, so only the screen position matters.</summary>
        public const float LensRimDistanceM = 2f;

        /// <summary>Segments in the rim's ring.</summary>
        public const int LensRimSegments = 96;

        /// <summary>Show Evidence: the untouched scan is shown this far (m) around the ghost's footprint box, and the ghost's own fill is left at this alpha.</summary>
        public const float EvidenceMarginM = 4f;
        public const float EvidenceFillAlpha = 0.05f;

        // ---- The selected find (spec 06 requirement 4.1, session 040) ----

        /// <summary>The selected edge is this many times as thick as a ghost's, and its emission is above 1 so that it, and only it, blooms.</summary>
        public const float SelectedEdgeWidthFactor = 2.8f;
        public const float SelectedEmission = 1.6f;

        /// <summary>The faint `lantern` tint over the selected volume, and its own emission.</summary>
        public const float SelectedFillAlpha = 0.75f;
        public const float SelectedTopLift = 0.6f;
        public const float SelectedFillEmission = 0.5f;

        /// <summary>Faces of the selected volume turned from the lamp take `lantern` toward `ink` by this much (and this share of the turn).</summary>
        public const float SelectedShadeToInk = 0.45f;
        public const float SelectedShadeMix = 0.7f;

        /// <summary>The soft pool of `lantern` light on the paper around the selected find's foot: its peak alpha and its reach beyond the footprint (m).</summary>
        public const float SelectedGlowAlpha = 0.9f;
        /// <summary>
        /// The pool's radius is the footprint's longest side times this (so the pool is about twice the building's width across), plus the
        /// reach beyond that (session 046).
        /// </summary>
        public const float SelectedGlowWidthShare = 1.3f;
        public const float SelectedGlowReachM = 6f;
        public const int SelectedGlowQueue = 2960;

        /// <summary>The selection is drawn over the ghosts and their edges (queues 3000 and 3010).</summary>
        public const int SelectedQueue = 3020;

        // ---- Land-use areas (bridge 0.7.0, session 034) ----
        // An area is drawn flat on the ground: diagonal `ink` stripes, each with a `night` casing so the stripes
        // read on a pale plate and on the dark ground (and in a greyscale screenshot), over a faint `ink` tint,
        // with the class's thin outline. It sits above the drapes and under every ghost.

        /// <summary>The thickness of the sheet an area is drawn as. The Player ignores any height it is sent for an area.</summary>
        public const float AreaHeightM = 0.05f;

        /// <summary>Render queues: the fill is above the drapes (2900 and up, Show Evidence's patch at 2990) and the outline above the fill.</summary>
        public const int AreaFillQueue = 2950;
        public const int AreaEdgeQueue = 2955;

        /// <summary>
        /// The stripe period in metres, and the shortest it is allowed on screen in CSS pixels. Where the metre period
        /// would be finer than the pixel period, the period doubles until it is not (octaves, so it does not shimmer).
        /// </summary>
        public const float AreaHatchPeriodM = 2.5f;
        public const float AreaHatchPeriodCssPx = 12f;

        /// <summary>A stripe's `ink` core as a share of the period, and the `night` casing each side of it as a share of the period.</summary>
        public const float AreaHatchInkShare = 0.30f;
        public const float AreaHatchCasingShare = 0.11f;

        /// <summary>The alpha between the stripes, as a share of the stripe alpha.</summary>
        public const float AreaHatchGapShare = 0.2f;

        /// <summary>Stripe alpha by confidence class: low opacity, and lighter the less sure the record is.</summary>
        public const float AreaDocumentedAlpha = 0.34f;
        public const float AreaEstimatedAlpha = 0.24f;
        public const float AreaUnknownAlpha = 0.16f;
    }
}
