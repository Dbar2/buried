using System.Collections.Generic;
using Buried.Editor;
using Buried.Geo;
using Buried.Interop;
using Buried.Look;
using Buried.Meshing;
using Buried.Scene;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>
    /// Session 046: a ghost is a pale solid first. Display heights (3.6 m a storey, 4.5 m when none is read), the opacity of a
    /// documented and an estimated ghost, and the small drafts that draw only their roof outline.
    /// </summary>
    public class GhostBodyTests
    {
        private GhostMaterials _materials;
        private GameObject _holder;
        private ProjectFrame _frame;

        private static Shader Load(string name)
        {
            return AssetDatabase.LoadAssetAtPath<Shader>("Assets/Buried/Runtime/Look/Shaders/" + name);
        }

        [SetUp]
        public void SetUp()
        {
            var palette = AssetDatabase.LoadAssetAtPath<BuriedPalette>(Setup.PalettePath);
            Assert.IsNotNull(palette, "Run `tools/unity.sh exec Buried.Editor.Setup.Run` first.");
            var shaders = new ShaderSet
            {
                ghost = Load("Ghost.shader"),
                drape = Load("Drape.shader"),
                marker = Load("Marker.shader"),
                sky = Load("Sky.shader"),
                present = Load("Present.shader"),
                edge = Load("Edge.shader"),
            };
            Assert.IsTrue(shaders.Complete);
            _materials = new GhostMaterials(palette, shaders, 1f);
            _holder = new GameObject("ghost body tests");
            _frame = new ProjectFrame(632500.0, 4835000.0);
        }

        [TearDown]
        public void TearDown()
        {
            _materials.Dispose();
            Object.DestroyImmediate(_holder);
        }

        private static GeometryDto Square(double e, double n, double side)
        {
            var ring = new List<double[]>
            {
                new[] { e, n }, new[] { e + side, n }, new[] { e + side, n + side }, new[] { e, n + side }, new[] { e, n },
            };
            return new GeometryDto
            {
                type = GeometryDto.Polygon,
                polygons = new List<List<List<double[]>>> { new List<List<double[]>> { ring } },
            };
        }

        private static SceneFeatureDto Feature(string id, string confidence, double side, int storeys)
        {
            return new SceneFeatureDto
            {
                id = id,
                kind = SceneFeatureDto.KindBuilding,
                confidence = confidence,
                heightM = 3.5, // what the Shell sends; the Player does not read it for a building
                storeys = storeys,
                geometry = Square(632500.0, 4835000.0, side),
            };
        }

        [Test]
        public void ABuildingIs3Point6MetresAStoreyAnd4Point5WhenNoneIsRead()
        {
            Assert.AreEqual(3.6f, LookSettings.StoreyHeightM, 0f);
            Assert.AreEqual(4.5f, LookSettings.UnreadStoreysHeightM, 0f);
            Assert.AreEqual(4.5f, LookSettings.BuildingHeightM(0), 0f);
            Assert.AreEqual(3.6f, LookSettings.BuildingHeightM(1), 1e-5f);
            Assert.AreEqual(10.8f, LookSettings.BuildingHeightM(3), 1e-5f);

            var layer = new EraLayer("fip_1911", 1, _holder.transform);
            layer.AddFeatures(
                new[] { Feature("bld_x_0001", "documented", 10.0, 0), Feature("bld_x_0002", "documented", 10.0, 3) },
                _frame, _materials, (id, reason) => Assert.Fail(id + ": " + reason));
            Vector3 anchor;
            Assert.IsTrue(layer.TryGetAnchor("bld_x_0001", out anchor));
            Assert.AreEqual(4.5f, anchor.y, 1e-4f, "no storeys read");
            Assert.IsTrue(layer.TryGetAnchor("bld_x_0002", out anchor));
            Assert.AreEqual(10.8f, anchor.y, 1e-4f, "three storeys");
            layer.Dispose();
        }

        [Test]
        public void ADocumentedGhostIsAboutSeventyPerCentOpaqueAndAnEstimatedOneAboutFortyFive()
        {
            Assert.AreEqual(0.70f, _materials.FillOf("documented").GetColor("_Color").a, 0.02f);
            Assert.AreEqual(0.45f, _materials.FillOf("estimated").GetColor("_Color").a, 0.02f);
            Assert.Greater(_materials.FillOf("documented").GetFloat("_TopLift"), 0f, "a roof is lifted lighter than the paper");
        }

        [Test]
        public void AFootprintsAreaIsInSquareMetres()
        {
            Assert.AreEqual(100.0, FootprintBuilder.AreaM2(Square(632500.0, 4835000.0, 10.0)), 1e-6);
            Assert.AreEqual(25.0, FootprintBuilder.AreaM2(Square(632500.0, 4835000.0, 5.0)), 1e-6);
        }

        [Test]
        public void ASmallEstimatedDraftDrawsOnlyItsRoofOutline()
        {
            Assert.AreEqual(60f, LookSettings.SmallFeatureAreaM2, 0f);
            // A 6 m square (36 m2) and a 10 m square (100 m2), both estimated, no storeys: the small one has the roof ring only.
            int Segments(double side)
            {
                var layer = new EraLayer("fip_1911", 1, _holder.transform);
                layer.AddFeatures(new[] { Feature("bld_x_0001", "estimated", side, 0) }, _frame, _materials, (id, reason) => Assert.Fail(id + ": " + reason));
                Mesh edges = _holder.transform.Find("Era fip_1911/Edges estimated 0").GetComponent<MeshFilter>().sharedMesh;
                int count = edges.vertexCount / EdgeMeshBuilder.VerticesPerSegment;
                layer.Dispose();
                return count;
            }

            Assert.AreEqual(4, Segments(6.0), "a small draft: the four sides of its roof and nothing else");
            Assert.AreEqual(12, Segments(10.0), "a larger draft keeps its roof ring, base ring and corners");
        }

        [Test]
        public void AnEstimatedEdgeIsInkAndOnlyDashesALongSegment()
        {
            Material edge = _materials.EdgeOf("estimated");
            Assert.Greater(edge.GetFloat("_DashPeriod"), 0f, "dashed");
            Assert.AreEqual(LookSettings.DashMinSegmentCssPx, edge.GetFloat("_DashMinSegPx"), 1e-6f);
            Assert.Greater(edge.GetFloat("_DashMinSegPx"), 0f, "a short segment is solid");
            Assert.AreEqual(0f, _materials.EdgeOf("documented").GetFloat("_DashPeriod"), "documented stays solid");
        }
    }
}
