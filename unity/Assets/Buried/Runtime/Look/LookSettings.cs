using UnityEngine;

namespace Buried.Look
{
    /// <summary>
    /// Fixed look and camera numbers (design.md "Look" and "Materials and treatments"). Colours come
    /// from the palette, never from here.
    /// </summary>
    public static class LookSettings
    {
        public const float CameraFovDeg = 40f;
        public const float NearClipM = 5f;
        public const float FarClipM = 20000f;

        public const float DefaultPitchDeg = 50f;
        public const float MinPitchDeg = 20f;
        public const float MaxPitchDeg = 80f;
        public const float MinCameraHeightM = 30f;
        public const float MaxCameraHeightM = 1500f;

        // ---- Fog and ground ----

        /// <summary>Extra distance past the farthest bounds corner that the fog radius covers.</summary>
        public const float FogRadiusMarginM = 300f;

        /// <summary>
        /// The haze is the `fog` colour where at least this share of the light survives, and darkens to
        /// `night` where this share or less survives, so the far ground reaches the sky's own colour.
        /// </summary>
        public const float FogHazeFogAbove = 0.5f;
        public const float FogHazeNightBelow = 0.25f;

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

        /// <summary>sin(elevation) at which the sky is at its lightest, a little above the horizon.</summary>
        public const float SkyBandElevation = 0.08f;

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

        /// <summary>Fill alpha of a documented ghost.</summary>
        public const float GhostFillAlpha = 0.35f;
        public const float GhostEmission = 0.15f;

        /// <summary>Edge width in CSS pixels, the glow on each side beyond it, and the edge emission.</summary>
        public const float EdgeWidthCssPx = 1.5f;
        public const float EdgeGlowPx = 1.0f;
        public const float EdgeGlowAlpha = 0.35f;
        public const float EdgeEmission = 1.2f;

        /// <summary>Alpha of the present buildings' outline once the depth has left Today (DepthBlend).</summary>
        public const float PresentFaintEdgeAlpha = 0.2f;
    }
}
