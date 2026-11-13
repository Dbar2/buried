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
        /// 8 degrees above the horizon (sin = 0.139), so the top rows of the canvas are `night`.
        /// </summary>
        public const float SkyZenithElevation = 0.12f;

        // ---- Sun and ambient ----

        public const float SunElevationDeg = 38f;
        /// <summary>The lamp shines from the west (azimuth 270 degrees), travelling east: upper left in the first visit's north-west view.</summary>
        public const float SunTravelHeadingDeg = 90f;
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
        public const float GhostCopperShade = 0.55f;

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
        public const float GhostFillAlpha = 0.45f;
        public const float GhostEmission = 0.15f;

        /// <summary>Edge width in CSS pixels, the glow on each side beyond it, and the edge emission.</summary>
        public const float EdgeWidthCssPx = 2.5f;
        public const float EdgeGlowPx = 1.0f;
        public const float EdgeGlowAlpha = 0.35f;

        /// <summary>
        /// The ghost edge's glow ring is drawn in `night` at this alpha, so the `ink` line has a dark
        /// casing on a pale plate. It is the same 1 px wide ring, inside requirement 26.4.
        /// </summary>
        public const float GhostEdgeCasingAlpha = 0.3f;

        /// <summary>The casing's width each side of the line. Under the 2 px of requirement 26.4.</summary>
        public const float GhostEdgeCasingPx = 1.5f;
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
        public const float EstimatedFillAlpha = 0.22f;

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
        public const float LightFloor = 0.38f;

        /// <summary>
        /// The first visit's sheet before Raise: the lit display at this share of its brightness. Raise takes it to 1
        /// with the sinking plinths (spec 06 requirement 3.1: "brighten the sheet").
        /// </summary>
        public const float LandingSheetGain = 0.75f;

        /// <summary>Radius (m) at which the pool has fallen to 1 / e: with no lot pinned, and around a pinned lot.</summary>
        public const float LightPoolRadiusM = 260f;
        /// <summary>The first visit's lamp pool: wide enough that the whole sheet is lit.</summary>
        public const float LandingPoolRadiusM = 320f;
        public const float LightPoolRadiusPinnedM = 150f;

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
        public const float AreaDocumentedAlpha = 0.6f;
        public const float AreaEstimatedAlpha = 0.4f;
        public const float AreaUnknownAlpha = 0.26f;
    }
}
