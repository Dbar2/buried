using System;
using System.Collections.Generic;
using Buried.Geo;

namespace Buried.Meshing
{
    /// <summary>Cleans rings before triangulation (design.md "Meshing").</summary>
    public static class PolygonPrep
    {
        /// <summary>A vertex whose removal moves the ring by less than this is dropped.</summary>
        public const double CollinearToleranceM = 0.001;

        private const double SamePointM = 1e-9;
        private const double MinAreaM2 = 1e-9;

        /// <summary>Positive for counter-clockwise rings (x east, y north).</summary>
        public static double SignedArea(IList<Vec2d> ring)
        {
            double sum = 0.0;
            for (int i = 0; i < ring.Count; i++)
            {
                Vec2d a = ring[i];
                Vec2d b = ring[(i + 1) % ring.Count];
                sum += a.X * b.Y - b.X * a.Y;
            }
            return 0.5 * sum;
        }

        /// <summary>
        /// Drops the closing vertex, consecutive duplicates and vertices that lie within
        /// <see cref="CollinearToleranceM"/> of the line through their neighbours, then orients the ring
        /// (counter-clockwise for an exterior, clockwise for a hole).
        /// Returns null when fewer than 3 vertices or no area remain.
        /// </summary>
        public static List<Vec2d> CleanRing(IList<Vec2d> ring, bool exterior)
        {
            var points = new List<Vec2d>(ring);
            if (points.Count >= 2 && Distance(points[0], points[points.Count - 1]) < SamePointM)
            {
                points.RemoveAt(points.Count - 1);
            }

            for (int i = points.Count - 1; i >= 1; i--)
            {
                if (Distance(points[i], points[i - 1]) < SamePointM) points.RemoveAt(i);
            }

            bool changed = true;
            while (changed && points.Count >= 3)
            {
                changed = false;
                for (int i = 0; i < points.Count; i++)
                {
                    Vec2d prev = points[(i + points.Count - 1) % points.Count];
                    Vec2d next = points[(i + 1) % points.Count];
                    if (DistanceToLine(points[i], prev, next) < CollinearToleranceM)
                    {
                        points.RemoveAt(i);
                        changed = true;
                        break;
                    }
                }
            }

            if (points.Count < 3) return null;
            double area = SignedArea(points);
            if (Math.Abs(area) < MinAreaM2) return null;
            if ((area > 0.0) != exterior) points.Reverse();
            return points;
        }

        /// <summary>
        /// Prepares an exterior ring and its holes. Returns null when the exterior is degenerate.
        /// A degenerate hole is left out.
        /// </summary>
        public static PreparedPolygon Prepare(IList<Vec2d> exterior, IEnumerable<IList<Vec2d>> holes)
        {
            List<Vec2d> outer = CleanRing(exterior, true);
            if (outer == null) return null;
            var result = new PreparedPolygon { Outer = outer };
            if (holes != null)
            {
                foreach (IList<Vec2d> hole in holes)
                {
                    List<Vec2d> cleaned = CleanRing(hole, false);
                    if (cleaned != null) result.Holes.Add(cleaned);
                }
            }
            return result;
        }

        private static double Distance(Vec2d a, Vec2d b)
        {
            double dx = a.X - b.X;
            double dy = a.Y - b.Y;
            return Math.Sqrt(dx * dx + dy * dy);
        }

        private static double DistanceToLine(Vec2d p, Vec2d a, Vec2d b)
        {
            double length = Distance(a, b);
            if (length < SamePointM) return Distance(p, a);
            double cross = (b.X - a.X) * (p.Y - a.Y) - (b.Y - a.Y) * (p.X - a.X);
            return Math.Abs(cross) / length;
        }
    }
}
