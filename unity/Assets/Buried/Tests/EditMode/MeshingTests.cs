using System.Collections.Generic;
using System.Linq;
using Buried.Geo;
using Buried.Meshing;
using NUnit.Framework;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>Example tests for PolygonPrep, Triangulator, Extruder and DrapeMeshBuilder.</summary>
    public class MeshingTests
    {
        private static List<Vec2d> Ring(params double[] xy)
        {
            var ring = new List<Vec2d>();
            for (int i = 0; i + 1 < xy.Length; i += 2) ring.Add(new Vec2d(xy[i], xy[i + 1]));
            return ring;
        }

        private static PreparedPolygon Prepared(List<Vec2d> outer, params List<Vec2d>[] holes)
        {
            PreparedPolygon p = PolygonPrep.Prepare(outer, holes.Cast<IList<Vec2d>>().ToList());
            Assert.IsNotNull(p, "the polygon should survive preparation");
            return p;
        }

        // ---- PolygonPrep ----

        [Test]
        public void PrepDropsTheClosingVertex()
        {
            List<Vec2d> ring = PolygonPrep.CleanRing(Ring(0, 0, 10, 0, 10, 10, 0, 10, 0, 0), true);
            Assert.AreEqual(4, ring.Count);
        }

        [Test]
        public void PrepDropsConsecutiveDuplicatesAndCollinearVertices()
        {
            List<Vec2d> ring = PolygonPrep.CleanRing(
                Ring(0, 0, 5, 0, 5, 0, 10, 0, 10, 10, 0, 10, 0, 5, 0, 0), true);
            Assert.AreEqual(4, ring.Count, "a square has four corners");
        }

        [Test]
        public void PrepOrientsExteriorsCounterClockwiseAndHolesClockwise()
        {
            List<Vec2d> clockwise = Ring(0, 0, 0, 10, 10, 10, 10, 0);
            Assert.Greater(PolygonPrep.SignedArea(PolygonPrep.CleanRing(clockwise, true)), 0.0);
            Assert.Less(PolygonPrep.SignedArea(PolygonPrep.CleanRing(Ring(0, 0, 10, 0, 10, 10, 0, 10), false)), 0.0);
        }

        [Test]
        public void PrepRejectsARingWithNoArea()
        {
            Assert.IsNull(PolygonPrep.CleanRing(Ring(0, 0, 10, 0, 20, 0), true));
            Assert.IsNull(PolygonPrep.CleanRing(Ring(0, 0, 10, 0), true));
        }

        // ---- Triangulator and Extruder ----

        [Test]
        public void ASquareMakesTwoCapTriangles()
        {
            PreparedPolygon square = Prepared(Ring(0, 0, 10, 0, 10, 10, 0, 10));
            List<Vec2d> vertices;
            Assert.AreEqual(6, Triangulator.Triangulate(square, out vertices).Count);
        }

        [Test]
        public void AnLShapeIsExtrudedWithTheRightAreaAndWalls()
        {
            PreparedPolygon l = Prepared(Ring(0, 0, 10, 0, 10, 4, 4, 4, 4, 10, 0, 10));
            MeshData mesh = Extruder.Extrude(l, 7f);
            Assert.AreEqual(10 * 4 + 4 * 6, MeshAssertions.CapArea(mesh), 1e-6);
            MeshAssertions.AssertExtrusion(l, mesh, 7f);
        }

        [Test]
        public void AnLShapeHasFourCapTrianglesAndTwelveWallTriangles()
        {
            PreparedPolygon l = Prepared(Ring(0, 0, 10, 0, 10, 4, 4, 4, 4, 10, 0, 10));
            MeshData mesh = Extruder.Extrude(l, 7f);
            int caps = Enumerable.Range(0, mesh.TriangleCount).Count(t => MeshAssertions.IsCap(mesh, t));
            int walls = Enumerable.Range(0, mesh.TriangleCount).Count(t => MeshAssertions.IsWall(mesh, t));
            Assert.AreEqual(4, caps);
            Assert.AreEqual(12, walls);
        }

        [Test]
        public void ThePolygonTopIsAtTheGivenHeightAndTheWallsStandOnTheGround()
        {
            PreparedPolygon square = Prepared(Ring(0, 0, 10, 0, 10, 10, 0, 10));
            MeshData mesh = Extruder.Extrude(square, 7f);
            Assert.AreEqual(7f, mesh.vertices.Max(v => v.y), 1e-6f);
            Assert.AreEqual(0f, mesh.vertices.Min(v => v.y), 1e-6f);
        }

        [Test]
        public void APolygonWithAHoleKeepsTheHoleOpen()
        {
            PreparedPolygon p = Prepared(Ring(0, 0, 20, 0, 20, 20, 0, 20), Ring(8, 8, 12, 8, 12, 12, 8, 12));
            MeshData mesh = Extruder.Extrude(p, 5f);
            Assert.AreEqual(400.0 - 16.0, MeshAssertions.CapArea(mesh), 1e-6);
            MeshAssertions.AssertExtrusion(p, mesh, 5f);
        }

        [Test]
        public void AMultiPolygonIsTwoIndependentExtrusions()
        {
            PreparedPolygon a = Prepared(Ring(0, 0, 10, 0, 10, 10, 0, 10));
            PreparedPolygon b = Prepared(Ring(30, 0, 40, 0, 40, 6, 30, 6));
            var combined = new MeshData();
            combined.Append(Extruder.Extrude(a, 4f));
            combined.Append(Extruder.Extrude(b, 9f));
            Assert.AreEqual(100.0 + 60.0, MeshAssertions.CapArea(combined), 1e-6);
            Assert.AreEqual(9f, combined.vertices.Max(v => v.y), 1e-6f);
        }

        [Test]
        public void ACounterClockwiseAndAClockwiseInputGiveTheSameMesh()
        {
            PreparedPolygon ccw = Prepared(Ring(0, 0, 10, 0, 10, 5, 0, 5));
            PreparedPolygon cw = Prepared(Ring(0, 0, 0, 5, 10, 5, 10, 0));
            Assert.AreEqual(MeshAssertions.CapArea(Extruder.Extrude(ccw, 3f)), MeshAssertions.CapArea(Extruder.Extrude(cw, 3f)), 1e-9);
            MeshAssertions.AssertExtrusion(cw, Extruder.Extrude(cw, 3f), 3f);
        }

        // ---- Drape mesh ----

        [Test]
        public void ARotatedParallelogramDrapeFollowsTheAffineMapping()
        {
            // Corners of a tile turned 30 degrees: top-left, top-right, bottom-right, bottom-left.
            double c = System.Math.Cos(System.Math.PI / 6.0);
            double s = System.Math.Sin(System.Math.PI / 6.0);
            var u = new Vec2d(300.0 * c, 300.0 * s);        // along the top edge
            var v = new Vec2d(-400.0 * s, 400.0 * c);       // down the left edge (north-west here)
            var tl = new Vec2d(-120.0, 80.0);
            var tr = new Vec2d(tl.X + u.X, tl.Y + u.Y);
            var bl = new Vec2d(tl.X + v.X, tl.Y + v.Y);
            var br = new Vec2d(tl.X + u.X + v.X, tl.Y + u.Y + v.Y);

            MeshData mesh = DrapeMeshBuilder.Build(tl, tr, br, bl);
            int stride = DrapeMeshBuilder.DefaultGrid + 1;
            Assert.AreEqual(stride * stride, mesh.VertexCount);

            for (int j = 0; j <= DrapeMeshBuilder.DefaultGrid; j++)
            {
                for (int i = 0; i <= DrapeMeshBuilder.DefaultGrid; i++)
                {
                    double fu = (double)i / DrapeMeshBuilder.DefaultGrid;
                    double fv = (double)j / DrapeMeshBuilder.DefaultGrid;
                    Vector3 p = mesh.vertices[j * stride + i];
                    Assert.AreEqual(tl.X + fu * u.X + fv * v.X, p.x, 1e-3);
                    Assert.AreEqual(tl.Y + fu * u.Y + fv * v.Y, p.z, 1e-3);
                    Assert.AreEqual(0f, p.y);
                    Vector2 uv = mesh.uvs[j * stride + i];
                    Assert.AreEqual(fu, uv.x, 1e-6);
                    Assert.AreEqual(1.0 - fv, uv.y, 1e-6);
                }
            }
        }

        [Test]
        public void TheDrapeFacesUp()
        {
            MeshData mesh = DrapeMeshBuilder.Build(
                new Vec2d(0, 100), new Vec2d(100, 100), new Vec2d(100, 0), new Vec2d(0, 0));
            for (int t = 0; t < mesh.TriangleCount; t++) Assert.Greater(mesh.TriangleNormal(t).y, 0.99f);
        }
    }
}
