using UnityEngine;

namespace Buried.Walk
{
    /// <summary>
    /// Every number of the walk test (spec 07) in one place. The night colours belong to this mode alone: they are
    /// not palette tokens (design.md "The walk (a test)"), so they are defined here once and nowhere else.
    /// </summary>
    public static class WalkSettings
    {
        // The visitor (requirement 3.1).
        public const float CapsuleRadiusM = 0.3f;
        public const float CapsuleHeightM = 1.8f;
        public const float EyeHeightM = 1.62f;
        public const float WalkSpeedMs = 2.4f;
        public const float RunSpeedMs = 4.6f;
        public const float StepHeightM = 0.3f;
        public const float GravityMs2 = -9.81f;
        public const float PitchLimitDeg = 80f;
        /// <summary>Degrees of look per pixel of pointer movement.</summary>
        public const float LookDegPerPx = 0.12f;
        /// <summary>A larger pointer step in one frame is a browser glitch (a known pointer-lock spike), not a turn.</summary>
        public const float MaxLookStepPx = 150f;

        // Exhibits (requirement 5.1).
        public const float PlaqueRangeM = 3.2f;
        public const float PlaqueConeDeg = 25f;

        // The bridge (requirement 6.1): at most four a second.
        public const float StateIntervalS = 0.25f;

        // Night (requirement 4). Deep blue-green: darker than --haze, cooler than --soot.
        public static readonly Color FogColor = new Color(0.020f, 0.050f, 0.056f, 1f);
        /// <summary>Exponential squared: about 60 m visible, nothing past about 70 m.</summary>
        public const float FogDensity = 0.027f;
        public static readonly Color AmbientColor = new Color(0.030f, 0.050f, 0.062f, 1f);
        public static readonly Color MoonColor = new Color(0.50f, 0.62f, 0.85f, 1f);
        public const float MoonIntensity = 0.55f;
        public const float MoonPitchDeg = 48f;
        public const float MoonYawDeg = 215f;
        public const float ShadowDistanceM = 45f;
        public static readonly Color LampColor = new Color(1.00f, 0.66f, 0.30f, 1f);
        public const float LampIntensity = 6.0f;
        public const float LampRangeM = 14f;
        public static readonly Color LanternColor = new Color(1.00f, 0.70f, 0.34f, 1f);
        public const float LanternIntensity = 4.5f;
        public const float LanternRangeM = 11f;
        public const float LanternFlicker = 0.07f;

        // The lantern in the hand (requirement 4.3): right, down, forward of the camera.
        public static readonly Vector3 LanternOffset = new Vector3(0.32f, -0.30f, 0.55f);

        // Post-processing (requirement 4.4): tone mapping, bloom on emissive surfaces, a vignette.
        public const float BloomThreshold = 0.9f;
        public const float BloomIntensity = 0.45f;
        public const float BloomScatter = 0.55f;
        public const float VignetteIntensity = 0.34f;
        public const float VignetteSmoothness = 0.45f;

        // The road is wet (requirement 4.4): its roughness is capped here.
        public const float WetRoughness = 0.18f;

        // Head bob and sway (requirement 3.4).
        public const float BobAmplitudeM = 0.022f;
        public const float BobStepsPerMetre = 0.85f;
        public const float LanternSwayDeg = 3.2f;
    }
}
