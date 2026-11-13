using System;
using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// Dig, as numbers (requirement 10, design.md "Depth blend"). Pure: it maps the Shell's depth to
    /// what each part of the scene draws and holds no state, so EditMode tests can call it without a
    /// scene. The Shell owns the depth and sends it (scene/setDepth); the Player only draws it.
    /// </summary>
    public static class DepthBlend
    {
        /// <summary>
        /// The weight of era <paramref name="eraIndex"/> at <paramref name="depth"/>: with i = floor(depth)
        /// and t = depth - i, era i has 1 - t, era i + 1 has t, and every other era has 0 (requirement 10.6).
        /// </summary>
        public static float EraWeight(double depth, int eraIndex)
        {
            double floor = Math.Floor(depth);
            double t = depth - floor;
            int i = (int)floor;
            if (eraIndex == i) return (float)(1.0 - t);
            if (eraIndex == i + 1) return (float)t;
            return 0f;
        }

        /// <summary>The present buildings' fill and outline at a depth (requirement 10.4).</summary>
        public static PresentLayer.Stage Present(double depth, bool reducedMotion)
        {
            return PresentLayer.StageAt(depth, reducedMotion);
        }

        /// <summary>
        /// The vertical scale of an era's ghosts about y = 0 at weight <paramref name="weight"/>: they rise
        /// from the ground to full height as the weight goes from 0 to 1 (requirement 10.5). With reduced
        /// motion they do not rise: the scale is 1 and only the alpha changes.
        /// </summary>
        public static float Rise(float weight, bool reducedMotion)
        {
            if (reducedMotion) return 1f;
            return SmoothStep(0f, 1f, weight);
        }

        /// <summary>The factor on a ghost's fill and edge alpha: it fades in with the weight.</summary>
        public static float GhostAlpha(float weight)
        {
            return Mathf.Clamp01(weight);
        }

        /// <summary>The factor on a drape's opacity: the plate fades in with the weight.</summary>
        public static float DrapeOpacity(float weight)
        {
            return Mathf.Clamp01(weight);
        }

        /// <summary>Below this weight an era draws nothing and its objects are switched off.</summary>
        public const float VisibleWeight = 0.0005f;

        /// <summary>True when the depth is an era to within a hair, so nothing is moving.</summary>
        public static bool IsSettled(double depth)
        {
            return Math.Abs(depth - Math.Round(depth)) < 1e-6;
        }

        private static float SmoothStep(float a, float b, float x)
        {
            float t = Mathf.Clamp01((x - a) / (b - a));
            return t * t * (3f - 2f * t);
        }
    }
}
