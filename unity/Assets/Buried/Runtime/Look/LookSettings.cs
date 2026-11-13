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

        public const float SunElevationDeg = 8f;
        /// <summary>The sun shines from the west (azimuth 270 degrees), travelling east.</summary>
        public const float SunTravelHeadingDeg = 90f;
        public const float SunIntensity = 0.6f;
        public const float AmbientIntensity = 0.3f;

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
        public const float GhostEdgeCasingAlpha = 1.0f;

        /// <summary>The casing's width each side of the line. Under the 2 px of requirement 26.4.</summary>
        public const float GhostEdgeCasingPx = 1.5f;
        public const float EdgeEmission = 1.2f;

        /// <summary>Alpha of the present buildings' outline once the depth has left Today (DepthBlend).</summary>
        public const float PresentFaintEdgeAlpha = 0.2f;
    }
}
