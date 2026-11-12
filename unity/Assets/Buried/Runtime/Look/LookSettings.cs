using UnityEngine;

namespace Buried.Look
{
    /// <summary>Fixed look and camera numbers. Colours come from the palette, never from here.</summary>
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

        /// <summary>Alpha of the plain gate ghost fill. Group 4 replaces this with the confidence treatments.</summary>
        public const float GhostFillAlpha = 0.6f;

        /// <summary>Extra distance past the farthest bounds corner that the fog radius covers.</summary>
        public const float FogRadiusMarginM = 300f;

        /// <summary>The ground quad reaches this many fog radii in every direction.</summary>
        public const float GroundExtentRadii = 4f;

        /// <summary>
        /// Exponential fog density for a coverage radius R. Gate version: plain fog that leaves the
        /// default view readable, ln(50) / (4 R). Group 4 sets the final rule from design.md.
        /// </summary>
        public static float FogDensity(float radiusM)
        {
            return Mathf.Log(50f) / (4f * Mathf.Max(radiusM, 1f));
        }
    }
}
