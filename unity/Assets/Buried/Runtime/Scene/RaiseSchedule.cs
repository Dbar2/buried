using System;
using System.Collections.Generic;
using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// "Raise the past" as numbers (spec 06 requirement 3, design.md "Motion"; bridge 0.8.0). Pure: it maps the
    /// seconds since scene/raise to what each part of the scene does, and holds no state, so EditMode tests can call
    /// it without a scene. Ghost.shader and Edge.shader repeat <see cref="StartDelay"/> and <see cref="GhostProgress"/>
    /// line for line (a test holds the two sets of constants together by reading the shaders).
    ///
    /// Timeline: the plinths sink over <see cref="SinkS"/> and the sheet brightens with them. Each ghost starts after
    /// a delay that grows with the distance of its footprint's centre from the first find's, from
    /// <see cref="FirstStartS"/> for the nearest to <see cref="LastStartS"/> for the farthest, and takes
    /// <see cref="RiseS"/> to stand up: its edges first, then its fill. The last one is done at <see cref="TotalS"/>.
    /// </summary>
    public static class RaiseSchedule
    {
        public const float SinkS = 0.6f;
        public const float FirstStartS = 0.3f;
        public const float LastStartS = 1.5f;
        public const float RiseS = 0.7f;

        /// <summary>Everything has settled by this time (design.md "Motion": 2.2 s).</summary>
        public const float TotalS = LastStartS + RiseS;

        /// <summary>The height of a plinth, in metres (design.md "How the Unity scene looks": 1 m).</summary>
        public const float PlinthM = 1f;

        /// <summary>
        /// When a ghost whose footprint's centre is <paramref name="distanceM"/> from the first find's starts to rise,
        /// given the distance of the farthest ghost. The nearest (0 m) starts at <see cref="FirstStartS"/> and the
        /// farthest at <see cref="LastStartS"/>; with every ghost at the same place they all start at the first time.
        /// </summary>
        public static float StartDelay(float distanceM, float farthestM)
        {
            if (farthestM <= 1e-4f) return FirstStartS;
            return FirstStartS + (LastStartS - FirstStartS) * Mathf.Clamp01(distanceM / farthestM);
        }

        /// <summary>A ghost's progress (0 to 1) at <paramref name="clockS"/> when it starts at <paramref name="delayS"/>.</summary>
        public static float GhostProgress(float clockS, float delayS)
        {
            return Mathf.Clamp01((clockS - delayS) / RiseS);
        }

        /// <summary>The vertical scale of a ghost at a progress: it stands up from the ground.</summary>
        public static float Rise(float progress)
        {
            return SmoothStep(progress);
        }

        /// <summary>The factor on a ghost's edge alpha: the edges come up first, over the first half of the rise.</summary>
        public static float EdgeAlpha(float progress)
        {
            return SmoothStep(Mathf.Clamp01(progress / 0.5f));
        }

        /// <summary>The factor on a ghost's fill alpha: the fill comes up after the edges, over the last two thirds.</summary>
        public static float FillAlpha(float progress)
        {
            return SmoothStep(Mathf.Clamp01((progress - 1f / 3f) / (2f / 3f)));
        }

        /// <summary>0 before the raise, 1 once the plinths have sunk and the sheet is bright.</summary>
        public static float Sink(float clockS)
        {
            return SmoothStep(Mathf.Clamp01(clockS / SinkS));
        }

        /// <summary>The order in which ghosts start: the ids sorted by distance from the origin point, nearest first, ties by id.</summary>
        public static List<string> Order(IDictionary<string, Vector2> centres, Vector2 origin)
        {
            var ids = new List<string>(centres.Keys);
            ids.Sort((a, b) =>
            {
                int byDistance = (centres[a] - origin).sqrMagnitude.CompareTo((centres[b] - origin).sqrMagnitude);
                return byDistance != 0 ? byDistance : string.CompareOrdinal(a, b);
            });
            return ids;
        }

        /// <summary>The distance of the farthest centre from the origin point (0 for none).</summary>
        public static float Farthest(IEnumerable<Vector2> centres, Vector2 origin)
        {
            float farthest = 0f;
            foreach (Vector2 c in centres) farthest = Mathf.Max(farthest, (c - origin).magnitude);
            return farthest;
        }

        private static float SmoothStep(float t)
        {
            t = Mathf.Clamp01(t);
            return t * t * (3f - 2f * t);
        }
    }
}
