using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// Where a world point lands on the canvas, in CSS pixels from the top left (bridge 0.8.0, scene/anchors). Pure: it
    /// takes the view-projection matrix scene/cameraChanged also reports (projection times view, OpenGL clip conventions),
    /// so an EditMode test can check it without a camera.
    /// </summary>
    public static class AnchorProjection
    {
        /// <summary>The farthest off the canvas a position is reported, in CSS pixels (the schema allows a million).</summary>
        public const float LimitPx = 50000f;

        /// <summary>
        /// Projects <paramref name="world"/>. Returns true when the point is in front of the camera and inside the
        /// canvas. <paramref name="x"/> and <paramref name="y"/> are then its position; for a point outside the canvas
        /// they are still where it would be (clamped to <see cref="LimitPx"/>), and for a point behind the camera they are 0.
        /// </summary>
        public static bool Project(Matrix4x4 viewProjection, Vector3 world, float widthCss, float heightCss, out float x, out float y)
        {
            Vector4 clip = viewProjection * new Vector4(world.x, world.y, world.z, 1f);
            if (clip.w <= 1e-6f)
            {
                x = 0f;
                y = 0f;
                return false;
            }
            float ndcX = clip.x / clip.w;
            float ndcY = clip.y / clip.w;
            x = Mathf.Clamp((ndcX * 0.5f + 0.5f) * widthCss, -LimitPx, LimitPx);
            y = Mathf.Clamp((0.5f - ndcY * 0.5f) * heightCss, -LimitPx, LimitPx);
            float ndcZ = clip.z / clip.w;
            return Mathf.Abs(ndcX) <= 1f && Mathf.Abs(ndcY) <= 1f && ndcZ >= -1f && ndcZ <= 1f;
        }
    }
}
