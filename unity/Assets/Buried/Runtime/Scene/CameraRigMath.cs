using System;
using Buried.Look;
using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// The camera rig's maths, with no scene and no input, so EditMode tests can call it. A pose is a
    /// target point on the ground (Unity world, y = 0), a distance from it, a pitch (degrees below the
    /// horizontal) and a heading (degrees clockwise from north, +z). Screen pixels follow Unity's
    /// convention: the origin is the bottom left.
    /// </summary>
    public static class CameraRigMath
    {
        public struct Pose
        {
            public Vector3 Target;
            public float Distance;
            public float PitchDeg;
            public float HeadingDeg;
        }

        public static Pose MakePose(float targetX, float targetZ, float distance, float pitchDeg, float headingDeg)
        {
            return new Pose { Target = new Vector3(targetX, 0f, targetZ), Distance = distance, PitchDeg = pitchDeg, HeadingDeg = headingDeg };
        }

        public static Quaternion Rotation(Pose pose)
        {
            return Quaternion.Euler(pose.PitchDeg, pose.HeadingDeg, 0f);
        }

        public static Vector3 Position(Pose pose)
        {
            return pose.Target - Rotation(pose) * Vector3.forward * pose.Distance;
        }

        /// <summary>Unity's world-to-camera matrix for the pose (the camera looks down its own -z, as Camera.worldToCameraMatrix does).</summary>
        public static Matrix4x4 View(Pose pose)
        {
            Matrix4x4 camera = Matrix4x4.TRS(Position(pose), Rotation(pose), Vector3.one);
            return Matrix4x4.Scale(new Vector3(1f, 1f, -1f)) * camera.inverse;
        }

        public static Matrix4x4 ViewProjection(Pose pose, float fovDeg, float aspect)
        {
            Matrix4x4 projection = Matrix4x4.Perspective(fovDeg, aspect, LookSettings.NearClipM, LookSettings.FarClipM);
            return projection * View(pose);
        }

        /// <summary>The distance limits that keep the camera height between the minimum and maximum.</summary>
        public static void DistanceLimits(float pitchDeg, out float min, out float max)
        {
            float sin = Mathf.Sin(pitchDeg * Mathf.Deg2Rad);
            min = LookSettings.MinCameraHeightM / sin;
            max = LookSettings.MaxCameraHeightM / sin;
        }

        public static Pose ClampPose(Pose pose, float minX, float minZ, float maxX, float maxZ)
        {
            pose.PitchDeg = Mathf.Clamp(pose.PitchDeg, LookSettings.MinPitchDeg, LookSettings.MaxPitchDeg);
            float lo, hi;
            DistanceLimits(pose.PitchDeg, out lo, out hi);
            pose.Distance = Mathf.Clamp(pose.Distance, lo, hi);
            pose.Target.x = Mathf.Clamp(pose.Target.x, minX, maxX);
            pose.Target.z = Mathf.Clamp(pose.Target.z, minZ, maxZ);
            pose.Target.y = 0f;
            return pose;
        }

        /// <summary>Normalised device coordinates (-1..1) of a world point, or false when it is behind the camera.</summary>
        public static bool ProjectToNdc(Pose pose, float fovDeg, float aspect, Vector3 world, out Vector2 ndc)
        {
            Vector4 clip = ViewProjection(pose, fovDeg, aspect) * new Vector4(world.x, world.y, world.z, 1f);
            if (clip.w <= 1e-6f)
            {
                ndc = Vector2.zero;
                return false;
            }
            ndc = new Vector2(clip.x / clip.w, clip.y / clip.w);
            return true;
        }

        /// <summary>The pixel (bottom-left origin) a world point lands on.</summary>
        public static bool ProjectToPixel(Pose pose, float fovDeg, float widthPx, float heightPx, Vector3 world, out Vector2 pixel)
        {
            Vector2 ndc;
            if (!ProjectToNdc(pose, fovDeg, widthPx / heightPx, world, out ndc))
            {
                pixel = Vector2.zero;
                return false;
            }
            pixel = new Vector2((ndc.x * 0.5f + 0.5f) * widthPx, (ndc.y * 0.5f + 0.5f) * heightPx);
            return true;
        }

        /// <summary>The ground point (y = 0) under a pixel, or false when the ray does not reach the ground.</summary>
        public static bool GroundUnderPixel(Pose pose, float fovDeg, float widthPx, float heightPx, Vector2 pixel, out Vector3 ground)
        {
            float tan = Mathf.Tan(fovDeg * 0.5f * Mathf.Deg2Rad);
            float aspect = widthPx / heightPx;
            float ndcX = pixel.x / widthPx * 2f - 1f;
            float ndcY = pixel.y / heightPx * 2f - 1f;
            Vector3 local = new Vector3(ndcX * tan * aspect, ndcY * tan, 1f);
            Vector3 direction = Rotation(pose) * local;
            Vector3 origin = Position(pose);
            if (direction.y >= -1e-6f)
            {
                ground = Vector3.zero;
                return false;
            }
            float t = -origin.y / direction.y;
            ground = origin + direction * t;
            ground.y = 0f;
            return true;
        }

        /// <summary>
        /// The new target that puts <paramref name="anchor"/> (a ground point) under <paramref name="pixel"/>.
        /// Used for panning (the point under the pointer when the drag began) and for zooming about the pointer.
        /// </summary>
        public static bool TargetKeepingUnder(Pose pose, float fovDeg, float widthPx, float heightPx, Vector2 pixel, Vector3 anchor, out Vector3 target)
        {
            Vector3 now;
            if (!GroundUnderPixel(pose, fovDeg, widthPx, heightPx, pixel, out now))
            {
                target = pose.Target;
                return false;
            }
            Vector3 delta = anchor - now;
            delta.y = 0f;
            target = pose.Target + delta;
            return true;
        }

        /// <summary>
        /// The smallest distance at which the whole ground rectangle is in view when the camera looks at
        /// its centre with the given pitch and heading. Pure bisection on the projected corners.
        /// </summary>
        public static float FitDistance(
            float minX, float minZ, float maxX, float maxZ, float pitchDeg, float headingDeg, float fovDeg, float aspect)
        {
            Pose pose = MakePose((minX + maxX) * 0.5f, (minZ + maxZ) * 0.5f, 1f, pitchDeg, headingDeg);
            var corners = new[]
            {
                new Vector3(minX, 0f, minZ), new Vector3(minX, 0f, maxZ),
                new Vector3(maxX, 0f, maxZ), new Vector3(maxX, 0f, minZ),
            };

            float lo = 1f;
            float hi = 1f;
            while (!Fits(pose, hi, corners, fovDeg, aspect) && hi < 1e7f) hi *= 2f;
            if (Fits(pose, lo, corners, fovDeg, aspect)) return lo;
            for (int i = 0; i < 60; i++)
            {
                float mid = 0.5f * (lo + hi);
                if (Fits(pose, mid, corners, fovDeg, aspect)) hi = mid;
                else lo = mid;
            }
            return hi;
        }

        private static bool Fits(Pose pose, float distance, Vector3[] corners, float fovDeg, float aspect)
        {
            pose.Distance = distance;
            foreach (Vector3 corner in corners)
            {
                Vector2 ndc;
                if (!ProjectToNdc(pose, fovDeg, aspect, corner, out ndc)) return false;
                if (Mathf.Abs(ndc.x) > 1f || Mathf.Abs(ndc.y) > 1f) return false;
            }
            return true;
        }

        /// <summary>A step of the wheel or a pinch: the factor the distance is scaled by (a notch is 0.85).</summary>
        public static float ZoomFactor(float notches)
        {
            return Mathf.Pow(0.85f, notches);
        }

        /// <summary>Whether a wheel turn zooms: always with Ctrl or Shift, and without a modifier only while the interim mapping holds.</summary>
        public static bool WheelZooms(bool modifierHeld)
        {
            return modifierHeld || CameraInputMap.PlainWheelZooms;
        }
    }

    /// <summary>
    /// Which camera inputs are mapped to what. Requirement 16.6 and design.md "Camera": until Dig exists
    /// (task 3.1) the plain wheel zooms. When Dig takes the plain wheel, set <see cref="PlainWheelZooms"/>
    /// to false: zoom then moves to Ctrl or Shift with the wheel, pinch, and the + and - keys. This is the
    /// whole switch.
    /// </summary>
    public static class CameraInputMap
    {
        public const bool PlainWheelZooms = true;
    }
}
