using Buried.Interop;
using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// The Lantern's lens as pure maths (design.md "Lantern"). The Shell gives the centre in normalised canvas
    /// coordinates (x from the left, y from the top) and the radius as a fraction of the canvas height; the lens is
    /// a circle on screen, so it stays round whatever the canvas shape. The shader and the Picker use the same test:
    /// a point is inside when its distance to the centre is less than the radius.
    /// </summary>
    public static class LanternMask
    {
        /// <summary>The radius in pixels.</summary>
        public static float RadiusPx(double radiusFraction, int heightPx)
        {
            return (float)(radiusFraction * heightPx);
        }

        /// <summary>
        /// The centre in the units of the shader's SV_POSITION: pixels from the left, and from the top when the
        /// graphics API's texture space starts at the top (Metal, D3D) or from the bottom when it does not (OpenGL ES, WebGL).
        /// </summary>
        public static Vector2 FragmentCentre(ScreenPointDto centre, int widthPx, int heightPx, bool uvStartsAtTop)
        {
            float x = (float)(centre.x * widthPx);
            float y = (float)((uvStartsAtTop ? centre.y : 1.0 - centre.y) * heightPx);
            return new Vector2(x, y);
        }

        /// <summary>The centre in Unity screen coordinates (pixels from the left and from the bottom, as Input.mousePosition).</summary>
        public static Vector2 ScreenCentre(ScreenPointDto centre, int widthPx, int heightPx)
        {
            return new Vector2((float)(centre.x * widthPx), (float)((1.0 - centre.y) * heightPx));
        }

        /// <summary>Whether a point in Unity screen coordinates is inside the lens.</summary>
        public static bool Contains(Vector2 screenPoint, ScreenPointDto centre, double radiusFraction, int widthPx, int heightPx)
        {
            Vector2 c = ScreenCentre(centre, widthPx, heightPx);
            float r = RadiusPx(radiusFraction, heightPx);
            float dx = screenPoint.x - c.x;
            float dy = screenPoint.y - c.y;
            return dx * dx + dy * dy < r * r;
        }

        /// <summary>
        /// How open the lens is after <paramref name="t"/> (0 to 1) of its opening: eased, so it neither snaps nor
        /// lingers. Reduced motion has no easing: the lens is shut or open.
        /// </summary>
        public static float Openness(float t, bool reducedMotion)
        {
            t = Mathf.Clamp01(t);
            if (reducedMotion) return t >= 1f ? 1f : 0f;
            return t * t * (3f - 2f * t);
        }
    }
}
