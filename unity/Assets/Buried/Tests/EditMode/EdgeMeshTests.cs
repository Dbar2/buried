using System;
using System.Collections.Generic;
using System.Linq;
using Buried.Geo;
using Buried.Meshing;
using NUnit.Framework;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>Task 16.3: the outline mesh (top ring, base ring, vertical corners) for the Buried/Edge shader.</summary>
    public class EdgeMeshTests
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
            Assert.IsNotNull(p);
            return p;
        }

        private static PreparedPolygon LShape()
        {
            return Prepared(Ring(0, 0, 10, 0, 10, 4, 4, 4, 4, 10, 0, 10));
        }

        private static PreparedPolygon SquareWithHole()
        {
            return Prepared(Ring(0, 0, 20, 0, 20, 20, 0, 20), Ring(5, 5, 5, 15, 15, 15, 15, 5));
        }

        [Test]
        public void AnLShapeHasThreeSegmentsForEachOfItsSixCorners()
        {
            PreparedPolygon l = LShape();
            MeshData edges = EdgeMeshBuilder.Build(l, 7f);
            Assert.AreEqual(18, EdgeMeshBuilder.SegmentCount(edges));
            Assert.AreEqual(EdgeMeshBuilder.ExpectedSegments(l), EdgeMeshBuilder.SegmentCount(edges));
            Assert.AreEqual(4 * 18, edges.VertexCount);
            Assert.AreEqual(2 * 18, edges.TriangleCount);
        }

        [Test]
        public void ASquareWithAHoleOutlinesBothRings()
        {
            PreparedPolygon p = SquareWithHole();
            MeshData edges = EdgeMeshBuilder.Build(p, 3.5f);
            Assert.AreEqual(3 * (4 + 4), EdgeMeshBuilder.SegmentCount(edges));
        }

        [Test]
        public void EveryVertexCarriesItsSegmentsOtherEndAndAUnitSide()
        {
            MeshData edges = EdgeMeshBuilder.Build(LShape(), 7f);
            Assert.AreEqual(edges.VertexCount, edges.tangents.Count);
            foreach (Vector4 t in edges.tangents) Assert.AreEqual(1f, Mathf.Abs(t.w), 0f);
            for (int s = 0; s < EdgeMeshBuilder.SegmentCount(edges); s++)
            {
                int i = s * EdgeMeshBuilder.VerticesPerSegment;
                // Vertex 0 and 1 are the start with sides +1 and -1; 2 and 3 are the end.
                Assert.AreEqual(1f, edges.tangents[i].w);
                Assert.AreEqual(-1f, edges.tangents[i + 1].w);
                Assert.AreEqual(1f, edges.tangents[i + 2].w);
                Assert.AreEqual(-1f, edges.tangents[i + 3].w);
                Assert.AreEqual(-1f, edges.uvs[i].y);
                Assert.AreEqual(1f, edges.uvs[i + 2].y);
                // The start vertex names the end as its other end, and the other way round.
                Assert.AreEqual(edges.vertices[i + 2], new Vector3(edges.tangents[i].x, edges.tangents[i].y, edges.tangents[i].z));
                Assert.AreEqual(edges.vertices[i], new Vector3(edges.tangents[i + 2].x, edges.tangents[i + 2].y, edges.tangents[i + 2].z));
            }
        }

        [Test]
        public void DistanceAlongTheRingIsContinuousFromSegmentToSegmentAndEndsAtThePerimeter()
        {
            PreparedPolygon l = LShape();
            MeshData edges = EdgeMeshBuilder.Build(l, 7f);
            // Segments are emitted per ring edge as: top, base, vertical. Compare each top segment's
            // end with the next top segment's start.
            var tops = new List<int>();
            for (int s = 0; s < EdgeMeshBuilder.SegmentCount(edges); s++)
            {
                int i = s * EdgeMeshBuilder.VerticesPerSegment;
                if (Mathf.Abs(edges.vertices[i].y - 7f) < 1e-4f && Mathf.Abs(edges.vertices[i + 2].y - 7f) < 1e-4f) tops.Add(i);
            }
            Assert.AreEqual(l.Outer.Count, tops.Count);
            Assert.AreEqual(0f, edges.uvs[tops[0]].x, 0f);
            for (int k = 0; k + 1 < tops.Count; k++)
            {
                Assert.AreEqual(edges.uvs[tops[k] + 2].x, edges.uvs[tops[k + 1]].x, 1e-4f, "segment " + k + " ends where the next starts");
                float length = Vector3.Distance(edges.vertices[tops[k]], edges.vertices[tops[k] + 2]);
                Assert.AreEqual(edges.uvs[tops[k]].x + length, edges.uvs[tops[k] + 2].x, 1e-4f, "the distance grows by the segment length");
            }
            float perimeter = 10 + 4 + 6 + 6 + 4 + 10;
            Assert.AreEqual(perimeter, edges.uvs[tops[tops.Count - 1] + 2].x, 1e-3f);
        }

        [Test]
        public void EdgeVerticesSitOnTheExtrudedMeshCornersWithinOneMillimetre()
        {
            foreach (PreparedPolygon polygon in new[] { LShape(), SquareWithHole() })
            {
                const float height = 7f;
                MeshData fill = Extruder.Extrude(polygon, height);
                MeshData edges = EdgeMeshBuilder.Build(polygon, height);
                foreach (Vector3 v in edges.vertices)
                {
                    bool found = fill.vertices.Any(f => Vector3.Distance(f, v) < 0.001f);
                    Assert.IsTrue(found, "edge vertex " + v + " is not a corner of the extruded mesh");
                }
            }
        }

        // ---- Session 023, item 2: one line per recorded storey ----

        private static float[] FloorHeights(MeshData edges, float heightM)
        {
            // A floor line is a segment that is neither at the roof (heightM) nor at the base (0) and is horizontal.
            var heights = new SortedSet<float>();
            for (int s = 0; s < EdgeMeshBuilder.SegmentCount(edges); s++)
            {
                int i = s * EdgeMeshBuilder.VerticesPerSegment;
                float y0 = edges.vertices[i].y;
                float y1 = edges.vertices[i + 2].y;
                if (Mathf.Abs(y0 - y1) > 1e-4f) continue; // a vertical corner
                if (y0 > 1e-4f && y0 < heightM - 1e-4f) heights.Add((float)Math.Round(y0, 3));
            }
            return heights.ToArray();
        }

        [Test]
        public void ABuildingWithNoRecordedStoreysHasNoFloorLines()
        {
            PreparedPolygon l = LShape();
            Assert.IsEmpty(FloorHeights(EdgeMeshBuilder.Build(l, 7f, 0), 7f), "no count, no lines: none is invented");
            Assert.AreEqual(EdgeMeshBuilder.SegmentCount(EdgeMeshBuilder.Build(l, 7f)), EdgeMeshBuilder.SegmentCount(EdgeMeshBuilder.Build(l, 7f, 0)));
            Assert.IsEmpty(FloorHeights(EdgeMeshBuilder.Build(l, 3.5f, 1), 3.5f), "one storey is the roof line alone");
        }

        [Test]
        public void ABuildingOfThreeStoreysHasALineAtEachFloorBetweenTheBaseAndTheRoof()
        {
            PreparedPolygon l = LShape();
            MeshData edges = EdgeMeshBuilder.Build(l, 10.5f, 3);
            Assert.AreEqual(new[] { 3.5f, 7f }, FloorHeights(edges, 10.5f));
            Assert.AreEqual(EdgeMeshBuilder.ExpectedSegments(l, 3), EdgeMeshBuilder.SegmentCount(edges));
            Assert.AreEqual((3 + 2) * l.Outer.Count, EdgeMeshBuilder.SegmentCount(edges));
        }

        [Test]
        public void FloorLinesRunAroundEveryRingIncludingHoles()
        {
            PreparedPolygon p = SquareWithHole();
            MeshData edges = EdgeMeshBuilder.Build(p, 7f, 2);
            Assert.AreEqual(new[] { 3.5f }, FloorHeights(edges, 7f));
            Assert.AreEqual((3 + 1) * (4 + 4), EdgeMeshBuilder.SegmentCount(edges));
        }

        [Test]
        public void FloorLinesSitOnTheWallsAndNeverMoveTheRoofLine()
        {
            PreparedPolygon l = LShape();
            MeshData plain = EdgeMeshBuilder.Build(l, 7f, 0);
            MeshData floors = EdgeMeshBuilder.Build(l, 7f, 2);
            foreach (Vector3 v in plain.vertices) Assert.IsTrue(floors.vertices.Contains(v), "every roof, base and corner vertex is kept");
            MeshData fill = Extruder.Extrude(l, 7f);
            foreach (Vector3 v in floors.vertices)
            {
                // Each vertex is above a corner of the footprint: its x and z match one of the extruded mesh's corners.
                Assert.IsTrue(fill.vertices.Any(f => Mathf.Abs(f.x - v.x) < 1e-3f && Mathf.Abs(f.z - v.z) < 1e-3f), "floor line vertex " + v + " is off the footprint");
            }
        }

        [Test]
        public void TheStoreyCountIsCappedAtTheSchemaMaximum()
        {
            Assert.AreEqual(99, EdgeMeshBuilder.FloorLines(100));
            Assert.AreEqual(99, EdgeMeshBuilder.FloorLines(5000));
            Assert.AreEqual(0, EdgeMeshBuilder.FloorLines(0));
            Assert.AreEqual(0, EdgeMeshBuilder.FloorLines(-3));
        }

        // ---- Session 023: the roof line and the flat outline ----

        [Test]
        public void TheRoofLineIsTheTopRingAloneAndTheFlatOutlineIsOneRingAtOneHeight()
        {
            PreparedPolygon l = LShape();
            MeshData roof = EdgeMeshBuilder.BuildRoof(l, 7f);
            Assert.AreEqual(l.Outer.Count, EdgeMeshBuilder.SegmentCount(roof));
            Assert.IsTrue(roof.vertices.All(v => Mathf.Abs(v.y - 7f) < 1e-4f));

            MeshData flat = EdgeMeshBuilder.BuildFlat(SquareWithHole(), 0.1f);
            Assert.AreEqual(8, EdgeMeshBuilder.SegmentCount(flat));
            Assert.IsTrue(flat.vertices.All(v => Mathf.Abs(v.y - 0.1f) < 1e-5f));
        }

        [Test]
        public void MeshesWithAndWithoutTangentsCannotBeMixed()
        {
            MeshData edges = EdgeMeshBuilder.Build(LShape(), 7f);
            MeshData fill = Extruder.Extrude(LShape(), 7f);
            var combined = new MeshData();
            combined.Append(fill);
            Assert.Throws<InvalidOperationException>(() => combined.Append(edges));
        }
    }
}
