using System;
using System.Collections.Generic;
using UnityEngine;

namespace Buried.Walk
{
    /// <summary>
    /// The walk's arithmetic as pure functions (no scene, no clock), so EditMode tests and properties can reach them:
    /// the bounds polygon, the rigid fit that places the model, the walking step and the plaque cone.
    /// Headings are degrees clockwise from north (+z); 90 faces east (+x), the same as Unity's yaw.
    /// </summary>
    public static class WalkMath
    {
        // ---- The bounds polygon (points are east, north) ----

        private const float OnEdgeM = 1e-4f;
        private const float InwardNudgeM = 0.02f;

        /// <summary>True when the point is inside the polygon or on its edge.</summary>
        public static bool Inside(Vector2[] polygon, Vector2 p)
        {
            bool inside = false;
            for (int i = 0, j = polygon.Length - 1; i < polygon.Length; j = i++)
            {
                Vector2 a = polygon[i];
                Vector2 b = polygon[j];
                if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
            }
            if (inside) return true;
            Vector2 edge;
            return (ClosestOnBoundary(polygon, p, out edge) - p).magnitude <= OnEdgeM;
        }

        /// <summary>The nearest point on the polygon's edge to <paramref name="p"/>; <paramref name="edgeDirection"/> is that edge's unit direction.</summary>
        public static Vector2 ClosestOnBoundary(Vector2[] polygon, Vector2 p, out Vector2 edgeDirection)
        {
            float best = float.MaxValue;
            Vector2 bestPoint = polygon[0];
            edgeDirection = Vector2.right;
            for (int i = 0, j = polygon.Length - 1; i < polygon.Length; j = i++)
            {
                Vector2 a = polygon[j];
                Vector2 b = polygon[i];
                Vector2 ab = b - a;
                float length2 = ab.sqrMagnitude;
                float t = length2 <= 0f ? 0f : Mathf.Clamp01(Vector2.Dot(p - a, ab) / length2);
                Vector2 q = a + ab * t;
                float d = (p - q).sqrMagnitude;
                if (d < best)
                {
                    best = d;
                    bestPoint = q;
                    edgeDirection = length2 <= 0f ? Vector2.right : ab / Mathf.Sqrt(length2);
                }
            }
            return bestPoint;
        }

        /// <summary>
        /// A point inside the polygon for any point: the point itself when it is inside, otherwise the nearest edge point
        /// nudged a little inward. Pushing against an edge therefore slides along it and never sticks.
        /// </summary>
        public static Vector2 Clamp(Vector2[] polygon, Vector2 p)
        {
            if (Inside(polygon, p)) return p;
            Vector2 direction;
            Vector2 onEdge = ClosestOnBoundary(polygon, p, out direction);
            Vector2 normal = new Vector2(-direction.y, direction.x);
            Vector2 inward = onEdge + normal * InwardNudgeM;
            if (Inside(polygon, inward)) return inward;
            inward = onEdge - normal * InwardNudgeM;
            if (Inside(polygon, inward)) return inward;
            return onEdge;
        }

        /// <summary>
        /// Where a move from <paramref name="from"/> (inside) to <paramref name="to"/> ends: <paramref name="to"/> if it is
        /// inside, else the point on the edge it pushed against, slid along the edge. The end is always inside.
        /// </summary>
        public static Vector2 KeepInside(Vector2[] polygon, Vector2 from, Vector2 to)
        {
            Vector2 end = Clamp(polygon, to);
            if (Inside(polygon, end)) return end;
            return Inside(polygon, from) ? from : end;
        }

        // ---- Placing the model ----

        /// <summary>A mirror of east (optional), a turn about the vertical, then a translation: how the model goes onto the manifest.</summary>
        public struct Rigid
        {
            public bool Mirror;
            public float YawDeg;
            public Vector3 Translation;

            public Vector3 Apply(Vector3 p)
            {
                if (Mirror) p.x = -p.x;
                return Quaternion.Euler(0f, YawDeg, 0f) * p + Translation;
            }
        }

        /// <summary>
        /// The rigid transform that carries <paramref name="source"/> onto <paramref name="target"/> (the same number of
        /// points, at least two, not all at one place). Both with and without a mirror are tried; the one with the smaller
        /// worst error wins. <paramref name="maxError"/> is that worst error in metres (horizontal and vertical).
        /// </summary>
        public static Rigid FitRigid(IList<Vector3> source, IList<Vector3> target, out float maxError)
        {
            if (source.Count != target.Count || source.Count < 2) throw new ArgumentException("need the same number (two or more) of points");
            Rigid plain = FitOne(source, target, false, out float plainError);
            Rigid mirrored = FitOne(source, target, true, out float mirroredError);
            if (mirroredError < plainError)
            {
                maxError = mirroredError;
                return mirrored;
            }
            maxError = plainError;
            return plain;
        }

        private static Rigid FitOne(IList<Vector3> source, IList<Vector3> target, bool mirror, out float maxError)
        {
            int n = source.Count;
            var a = new Vector3[n];
            for (int i = 0; i < n; i++)
            {
                a[i] = source[i];
                if (mirror) a[i].x = -a[i].x;
            }
            Vector3 ca = Vector3.zero, cb = Vector3.zero;
            for (int i = 0; i < n; i++)
            {
                ca += a[i];
                cb += target[i];
            }
            ca /= n;
            cb /= n;

            // With R(y) = [cos sin; -sin cos] on (x, z): dot = cos |a|^2 and cross = a.x b.z - a.z b.x = -sin |a|^2.
            double dot = 0.0, cross = 0.0;
            for (int i = 0; i < n; i++)
            {
                Vector3 p = a[i] - ca;
                Vector3 q = target[i] - cb;
                dot += p.x * q.x + p.z * q.z;
                cross += p.x * q.z - p.z * q.x;
            }
            float yaw = (float)(Math.Atan2(-cross, dot) * 180.0 / Math.PI);
            Quaternion rotation = Quaternion.Euler(0f, yaw, 0f);
            var fit = new Rigid { Mirror = mirror, YawDeg = yaw, Translation = cb - rotation * ca };

            maxError = 0f;
            for (int i = 0; i < n; i++)
            {
                maxError = Mathf.Max(maxError, (fit.Apply(source[i]) - target[i]).magnitude);
            }
            return fit;
        }

        // ---- Walking ----

        /// <summary>The unit vector (east, north) a heading faces.</summary>
        public static Vector2 Forward(float yawDeg)
        {
            float r = yawDeg * Mathf.Deg2Rad;
            return new Vector2(Mathf.Sin(r), Mathf.Cos(r));
        }

        /// <summary>
        /// The horizontal velocity (east, north) for the keys held. <paramref name="input"/> is x = right, y = forward, each -1 to 1;
        /// a diagonal is no faster than straight on. Shift runs.
        /// </summary>
        public static Vector2 Velocity(Vector2 input, float yawDeg, bool run)
        {
            if (input.sqrMagnitude > 1f) input.Normalize();
            Vector2 forward = Forward(yawDeg);
            Vector2 right = new Vector2(forward.y, -forward.x);
            return (forward * input.y + right * input.x) * (run ? WalkSettings.RunSpeedMs : WalkSettings.WalkSpeedMs);
        }

        public static float ClampPitch(float pitchDeg)
        {
            return Mathf.Clamp(pitchDeg, -WalkSettings.PitchLimitDeg, WalkSettings.PitchLimitDeg);
        }

        /// <summary>Heading in [0, 360).</summary>
        public static float WrapYaw(float yawDeg)
        {
            float y = yawDeg % 360f;
            if (y < 0f) y += 360f;
            return y >= 360f ? 0f : y;
        }

        // ---- Exhibits ----

        public struct PlaqueTarget
        {
            public string Slug;
            public Vector3 Position;
        }

        /// <summary>
        /// The plaque the visitor is near and looking at: within <paramref name="rangeM"/> of the eye and within
        /// <paramref name="coneDeg"/> of where it faces. The one nearest the middle of the view wins; null for none.
        /// </summary>
        public static string NearestPlaque(Vector3 eye, Vector3 forward, IList<PlaqueTarget> plaques, float rangeM, float coneDeg)
        {
            if (forward.sqrMagnitude <= 0f) return null;
            forward.Normalize();
            string best = null;
            float bestAngle = float.MaxValue;
            foreach (PlaqueTarget plaque in plaques)
            {
                Vector3 to = plaque.Position - eye;
                float distance = to.magnitude;
                if (distance > rangeM) continue;
                float angle = distance <= 1e-4f ? 0f : Vector3.Angle(forward, to / distance);
                if (angle > coneDeg || angle >= bestAngle) continue;
                best = plaque.Slug;
                bestAngle = angle;
            }
            return best;
        }
    }
}
