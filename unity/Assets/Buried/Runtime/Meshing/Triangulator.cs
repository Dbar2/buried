using System;
using System.Collections.Generic;
using Buried.Geo;

namespace Buried.Meshing
{
    /// <summary>
    /// Ear-clipping triangulation with hole bridging, in double precision.
    ///
    /// Design note: design.md names LibTessDotNet for this step. The library source could not be
    /// vendored in the session that wrote this file, so this is a self-contained ear clipper
    /// (hole bridging after Eberly, "Triangulation by Ear Clipping"). The public contract is the one
    /// the property test E4 checks: triangles tile the polygon, wind counter-clockwise, and none is
    /// degenerate. Swapping in LibTessDotNet later only has to keep this signature.
    ///
    /// Input must come from <see cref="PolygonPrep"/>: exterior counter-clockwise, holes clockwise.
    /// Output indices refer to the returned vertex list (exterior first, then each hole), three per
    /// triangle, counter-clockwise.
    /// </summary>
    public static class Triangulator
    {
        /// <summary>Twice a triangle's area below which a vertex is treated as collinear.</summary>
        private const double DegenerateCross = 1e-9;

        public static List<int> Triangulate(PreparedPolygon polygon, out List<Vec2d> vertices)
        {
            vertices = new List<Vec2d>(polygon.Outer);
            var holeRanges = new List<int[]>(); // { start, count }
            foreach (List<Vec2d> hole in polygon.Holes)
            {
                holeRanges.Add(new[] { vertices.Count, hole.Count });
                vertices.AddRange(hole);
            }

            var ring = new List<int>();
            for (int i = 0; i < polygon.Outer.Count; i++) ring.Add(i);

            List<Vec2d> v = vertices;
            holeRanges.Sort((a, b) => MaxX(v, b).CompareTo(MaxX(v, a)));
            foreach (int[] range in holeRanges) BridgeHole(v, ring, range[0], range[1]);

            return EarClip(v, ring);
        }

        private static double MaxX(List<Vec2d> v, int[] range)
        {
            double max = double.NegativeInfinity;
            for (int k = 0; k < range[1]; k++) max = Math.Max(max, v[range[0] + k].X);
            return max;
        }

        // ---- Hole bridging ----

        private static void BridgeHole(List<Vec2d> v, List<int> ring, int start, int count)
        {
            int holeLocal = 0;
            for (int k = 1; k < count; k++)
            {
                Vec2d c = v[start + k];
                Vec2d best = v[start + holeLocal];
                if (c.X > best.X || (c.X == best.X && c.Y < best.Y)) holeLocal = k;
            }
            int holeVertex = start + holeLocal;
            Vec2d m = v[holeVertex];

            int bridge = FindBridge(v, ring, m);
            bridge = OccurrenceFacing(v, ring, bridge, m);

            var merged = new List<int>(ring.Count + count + 2);
            for (int k = 0; k <= bridge; k++) merged.Add(ring[k]);
            for (int k = 0; k < count; k++) merged.Add(start + (holeLocal + k) % count);
            merged.Add(holeVertex);
            merged.Add(ring[bridge]);
            for (int k = bridge + 1; k < ring.Count; k++) merged.Add(ring[k]);
            ring.Clear();
            ring.AddRange(merged);
        }

        /// <summary>
        /// An earlier bridge leaves the same vertex in the ring more than once. The new bridge must
        /// attach at the occurrence whose interior angle contains the direction to m, or the merged
        /// ring crosses itself. Returns <paramref name="bridge"/> when only one occurrence exists.
        /// </summary>
        private static int OccurrenceFacing(List<Vec2d> v, List<int> ring, int bridge, Vec2d m)
        {
            int n = ring.Count;
            Vec2d target = v[ring[bridge]];
            for (int pass = 0; pass < 2; pass++)
            {
                bool inclusive = pass == 1;
                for (int k = 0; k < n; k++)
                {
                    if (!Same(v[ring[k]], target)) continue;
                    Vec2d a = v[ring[(k + n - 1) % n]];
                    Vec2d c = v[ring[k]];
                    Vec2d b = v[ring[(k + 1) % n]];
                    double left1 = Cross(a, c, m);
                    double left2 = Cross(c, b, m);
                    bool convex = Cross(a, c, b) > 0.0;
                    bool inside;
                    if (inclusive) inside = convex ? (left1 >= 0.0 && left2 >= 0.0) : (left1 >= 0.0 || left2 >= 0.0);
                    else inside = convex ? (left1 > 0.0 && left2 > 0.0) : (left1 > 0.0 || left2 > 0.0);
                    if (inside) return k;
                }
            }
            return bridge;
        }

        /// <summary>Position in <paramref name="ring"/> of the vertex to join the hole's rightmost vertex m to.</summary>
        private static int FindBridge(List<Vec2d> v, List<int> ring, Vec2d m)
        {
            int n = ring.Count;
            double bestX = double.PositiveInfinity;
            int edge = -1;
            for (int i = 0; i < n; i++)
            {
                Vec2d a = v[ring[i]];
                Vec2d b = v[ring[(i + 1) % n]];
                if (a.Y == b.Y) continue;
                bool straddles = (a.Y <= m.Y && b.Y >= m.Y) || (b.Y <= m.Y && a.Y >= m.Y);
                if (!straddles) continue;
                double t = (m.Y - a.Y) / (b.Y - a.Y);
                double x = a.X + t * (b.X - a.X);
                if (x >= m.X && x < bestX)
                {
                    bestX = x;
                    edge = i;
                }
            }

            if (edge < 0) return NearestVertex(v, ring, m);

            int iA = edge;
            int iB = (edge + 1) % n;
            Vec2d pa = v[ring[iA]];
            Vec2d pb = v[ring[iB]];
            var hit = new Vec2d(bestX, m.Y);
            if (hit.X == pa.X && hit.Y == pa.Y) return iA;
            if (hit.X == pb.X && hit.Y == pb.Y) return iB;

            int p = pa.X > pb.X ? iA : iB;
            Vec2d pv = v[ring[p]];

            int chosen = p;
            double bestTan = double.PositiveInfinity;
            double bestDist = double.PositiveInfinity;
            for (int k = 0; k < n; k++)
            {
                if (k == p) continue;
                Vec2d q = v[ring[k]];
                if (q.X <= m.X) continue;
                if (!InTriangleInclusive(q, m, hit, pv)) continue;
                double dx = q.X - m.X;
                double tan = Math.Abs(q.Y - m.Y) / dx;
                double dist = dx * dx + (q.Y - m.Y) * (q.Y - m.Y);
                if (tan < bestTan || (tan == bestTan && dist < bestDist))
                {
                    bestTan = tan;
                    bestDist = dist;
                    chosen = k;
                }
            }
            return chosen;
        }

        private static int NearestVertex(List<Vec2d> v, List<int> ring, Vec2d m)
        {
            int best = 0;
            double bestDist = double.PositiveInfinity;
            for (int k = 0; k < ring.Count; k++)
            {
                Vec2d q = v[ring[k]];
                double d = (q.X - m.X) * (q.X - m.X) + (q.Y - m.Y) * (q.Y - m.Y);
                if (d < bestDist)
                {
                    bestDist = d;
                    best = k;
                }
            }
            return best;
        }

        // ---- Ear clipping ----

        private static double Cross(Vec2d a, Vec2d b, Vec2d c)
        {
            return (b.X - a.X) * (c.Y - a.Y) - (b.Y - a.Y) * (c.X - a.X);
        }

        private static bool InTriangleInclusive(Vec2d p, Vec2d a, Vec2d b, Vec2d c)
        {
            double d1 = Cross(a, b, p);
            double d2 = Cross(b, c, p);
            double d3 = Cross(c, a, p);
            bool hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
            bool hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
            return !(hasNegative && hasPositive);
        }

        private static bool InTriangleStrict(Vec2d p, Vec2d a, Vec2d b, Vec2d c)
        {
            double d1 = Cross(a, b, p);
            double d2 = Cross(b, c, p);
            double d3 = Cross(c, a, p);
            return (d1 > 0 && d2 > 0 && d3 > 0) || (d1 < 0 && d2 < 0 && d3 < 0);
        }

        private static bool Same(Vec2d a, Vec2d b)
        {
            return a.X == b.X && a.Y == b.Y;
        }

        private static bool BlockedBy(List<Vec2d> v, List<int> idx, int pi, int ci, int ni, bool strict)
        {
            Vec2d a = v[idx[pi]];
            Vec2d b = v[idx[ci]];
            Vec2d c = v[idx[ni]];
            for (int q = 0; q < idx.Count; q++)
            {
                if (q == pi || q == ci || q == ni) continue;
                Vec2d p = v[idx[q]];
                if (Same(p, a) || Same(p, b) || Same(p, c)) continue; // a bridge duplicates vertices
                bool inside = strict ? InTriangleStrict(p, a, b, c) : InTriangleInclusive(p, a, b, c);
                if (inside) return true;
            }
            return false;
        }

        private static List<int> EarClip(List<Vec2d> v, List<int> ring)
        {
            var triangles = new List<int>();
            var idx = new List<int>(ring);

            while (idx.Count > 3)
            {
                int n = idx.Count;
                bool progressed = false;

                for (int s = 0; s < n && !progressed; s++)
                {
                    int pi = (s + n - 1) % n;
                    int ci = s;
                    int ni = (s + 1) % n;
                    double cross = Cross(v[idx[pi]], v[idx[ci]], v[idx[ni]]);
                    if (Math.Abs(cross) < DegenerateCross)
                    {
                        idx.RemoveAt(ci);
                        progressed = true;
                    }
                    else if (cross > 0.0 && !BlockedBy(v, idx, pi, ci, ni, false))
                    {
                        triangles.Add(idx[pi]);
                        triangles.Add(idx[ci]);
                        triangles.Add(idx[ni]);
                        idx.RemoveAt(ci);
                        progressed = true;
                    }
                }

                if (progressed) continue;

                // No ear when boundary points count as blocking: accept points that only touch.
                for (int s = 0; s < n && !progressed; s++)
                {
                    int pi = (s + n - 1) % n;
                    int ci = s;
                    int ni = (s + 1) % n;
                    double cross = Cross(v[idx[pi]], v[idx[ci]], v[idx[ni]]);
                    if (cross > 0.0 && !BlockedBy(v, idx, pi, ci, ni, true))
                    {
                        triangles.Add(idx[pi]);
                        triangles.Add(idx[ci]);
                        triangles.Add(idx[ni]);
                        idx.RemoveAt(ci);
                        progressed = true;
                    }
                }

                if (!progressed) throw new InvalidOperationException("The polygon cannot be triangulated.");
            }

            if (idx.Count == 3 && Cross(v[idx[0]], v[idx[1]], v[idx[2]]) >= DegenerateCross)
            {
                triangles.Add(idx[0]);
                triangles.Add(idx[1]);
                triangles.Add(idx[2]);
            }
            return triangles;
        }
    }
}
