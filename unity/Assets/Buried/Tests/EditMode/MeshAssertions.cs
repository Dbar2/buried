using System;
using System.Collections.Generic;
using Buried.Geo;
using Buried.Meshing;
using NUnit.Framework;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>Checks shared by the meshing example tests and the extrusion property test (E4).</summary>
    public static class MeshAssertions
    {
        public static bool IsCap(MeshData mesh, int triangle)
        {
            return mesh.TriangleNormal(triangle).y > 0.5f;
        }

        public static bool IsWall(MeshData mesh, int triangle)
        {
            return Mathf.Abs(mesh.TriangleNormal(triangle).y) < 0.01f;
        }

        public static double CapArea(MeshData mesh)
        {
            double sum = 0.0;
            for (int t = 0; t < mesh.TriangleCount; t++)
            {
                if (IsCap(mesh, t)) sum += mesh.TriangleArea(t);
            }
            return sum;
        }

        /// <summary>Area of the polygon: exterior minus holes.</summary>
        public static double PolygonArea(PreparedPolygon polygon)
        {
            double area = Math.Abs(PolygonPrep.SignedArea(polygon.Outer));
            foreach (List<Vec2d> hole in polygon.Holes) area -= Math.Abs(PolygonPrep.SignedArea(hole));
            return area;
        }

        /// <summary>Area of the polygon after each vertex is rounded to float32, as the mesh stores it.</summary>
        public static double StoredPolygonArea(PreparedPolygon polygon)
        {
            double area = Math.Abs(PolygonPrep.SignedArea(Rounded(polygon.Outer)));
            foreach (List<Vec2d> hole in polygon.Holes) area -= Math.Abs(PolygonPrep.SignedArea(Rounded(hole)));
            return area;
        }

        private static List<Vec2d> Rounded(List<Vec2d> ring)
        {
            var result = new List<Vec2d>(ring.Count);
            foreach (Vec2d p in ring) result.Add(new Vec2d((double)(float)p.X, (double)(float)p.Y));
            return result;
        }

        public static bool InsideSolid(PreparedPolygon polygon, double x, double y)
        {
            if (!PointInRing(polygon.Outer, x, y)) return false;
            foreach (List<Vec2d> hole in polygon.Holes)
            {
                if (PointInRing(hole, x, y)) return false;
            }
            return true;
        }

        private static bool PointInRing(List<Vec2d> ring, double x, double y)
        {
            bool inside = false;
            for (int i = 0, j = ring.Count - 1; i < ring.Count; j = i++)
            {
                Vec2d a = ring[i];
                Vec2d b = ring[j];
                if ((a.Y > y) != (b.Y > y) && x < (b.X - a.X) * (y - a.Y) / (b.Y - a.Y) + a.X) inside = !inside;
            }
            return inside;
        }

        /// <summary>
        /// The properties of requirement 2.3 / design.md E4 for one extruded polygon:
        /// no degenerate triangle, caps sum to the polygon area, cap normals +y, wall normals point away
        /// from the solid, and every ring edge has exactly one wall quad (two triangles).
        /// </summary>
        public static void AssertExtrusion(PreparedPolygon polygon, MeshData mesh, float heightM)
        {
            for (int t = 0; t < mesh.TriangleCount; t++)
            {
                Assert.GreaterOrEqual(mesh.TriangleArea(t), Extruder.MinTriangleAreaM2, "triangle " + t + " is degenerate");
            }

            // The mesh stores float32 positions, so the caps tile the polygon as stored, not the
            // double-precision polygon. At 500 m from the origin one float step is 3e-5 m, which moves
            // a 1300 m2 polygon's area by about 1e-6 relative. Compare against the rounded polygon so
            // the 1e-6 bound checks the triangulation and not the storage format.
            double expected = StoredPolygonArea(polygon);
            double capArea = CapArea(mesh);
            Assert.LessOrEqual(
                Math.Abs(capArea - expected),
                1e-6 * expected,
                "cap area " + capArea + " vs stored polygon area " + expected + " (double polygon area " + PolygonArea(polygon) + ")");

            int wallTriangles = 0;
            for (int t = 0; t < mesh.TriangleCount; t++)
            {
                if (IsCap(mesh, t))
                {
                    Assert.Greater(mesh.TriangleNormal(t).y, 0.999f, "cap triangle " + t + " does not face up");
                    continue;
                }

                Assert.IsTrue(IsWall(mesh, t), "triangle " + t + " is neither a cap nor a wall");
                wallTriangles++;

                Vector3 a, b, c;
                mesh.GetTriangle(t, out a, out b, out c);
                Vector3 centroid = (a + b + c) / 3f;
                Vector3 n = mesh.TriangleNormal(t);
                double edgeLength = Math.Max(
                    Math.Max(Vector2.Distance(new Vector2(a.x, a.z), new Vector2(b.x, b.z)), Vector2.Distance(new Vector2(b.x, b.z), new Vector2(c.x, c.z))),
                    Vector2.Distance(new Vector2(a.x, a.z), new Vector2(c.x, c.z)));
                if (edgeLength < 0.01) continue;

                const double step = 1e-3;
                Assert.IsFalse(
                    InsideSolid(polygon, centroid.x + n.x * step, centroid.z + n.z * step),
                    "wall triangle " + t + " faces into the solid");
                Assert.IsTrue(
                    InsideSolid(polygon, centroid.x - n.x * step, centroid.z - n.z * step),
                    "wall triangle " + t + " has no solid behind it");
            }

            int edges = polygon.Outer.Count;
            foreach (List<Vec2d> hole in polygon.Holes) edges += hole.Count;
            Assert.AreEqual(2 * edges, wallTriangles, "each ring edge needs exactly one wall quad");

            AssertEachEdgeHasOneQuad(polygon.Outer, mesh);
            foreach (List<Vec2d> hole in polygon.Holes) AssertEachEdgeHasOneQuad(hole, mesh);
        }

        private static void AssertEachEdgeHasOneQuad(List<Vec2d> ring, MeshData mesh)
        {
            for (int i = 0; i < ring.Count; i++)
            {
                Vec2d p = ring[i];
                Vec2d q = ring[(i + 1) % ring.Count];
                int count = 0;
                for (int t = 0; t < mesh.TriangleCount; t++)
                {
                    if (!IsWall(mesh, t)) continue;
                    Vector3 a, b, c;
                    mesh.GetTriangle(t, out a, out b, out c);
                    if (OnlyAt(p, q, a, b, c) && Touches(p, a, b, c) && Touches(q, a, b, c)) count++;
                }
                Assert.AreEqual(2, count, "edge " + i + " of a ring has " + count + " wall triangles instead of 2");
            }
        }

        private static bool Near(Vec2d p, Vector3 v)
        {
            return Math.Abs(p.X - v.x) < 1e-3 && Math.Abs(p.Y - v.z) < 1e-3;
        }

        private static bool Touches(Vec2d p, Vector3 a, Vector3 b, Vector3 c)
        {
            return Near(p, a) || Near(p, b) || Near(p, c);
        }

        private static bool OnlyAt(Vec2d p, Vec2d q, Vector3 a, Vector3 b, Vector3 c)
        {
            return (Near(p, a) || Near(q, a)) && (Near(p, b) || Near(q, b)) && (Near(p, c) || Near(q, c));
        }
    }
}
