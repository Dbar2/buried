using UnityEngine;

namespace Buried.Look
{
    /// <summary>
    /// The numbers of the lit map sheet that can be checked without a GPU: the WCAG contrast between
    /// the paper and the line work at a given light. Drape.shader applies the same two colours and the
    /// same floor; this is the check that the line work stays readable wherever the light is dimmest.
    /// </summary>
    public static class DrapeTone
    {
        /// <summary>WCAG relative luminance (0 to 1) of an sRGB colour.</summary>
        public static float RelativeLuminance(Color32 srgb)
        {
            return 0.2126f * Linear(srgb.r) + 0.7152f * Linear(srgb.g) + 0.0722f * Linear(srgb.b);
        }

        private static float Linear(byte channel)
        {
            float s = channel / 255f;
            return s <= 0.04045f ? s / 12.92f : Mathf.Pow((s + 0.055f) / 1.055f, 2.4f);
        }

        /// <summary>
        /// The WCAG contrast ratio of <paramref name="paper"/> against <paramref name="line"/> when both are
        /// lit by <paramref name="light"/> (0 to 1, a multiplier on linear colour, as the shader applies it).
        /// </summary>
        public static float Contrast(Color32 paper, Color32 line, float light)
        {
            float lp = RelativeLuminance(paper) * light;
            float ll = RelativeLuminance(line) * light;
            return (Mathf.Max(lp, ll) + 0.05f) / (Mathf.Min(lp, ll) + 0.05f);
        }
    }
}
