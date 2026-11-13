using System.Collections.Generic;
using System.Linq;
using Buried.Editor;
using Buried.Geo;
using Buried.Interop;
using Buried.Look;
using Buried.Scene;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>
    /// Session 023, item 1: the three confidence classes differ by pattern. Documented has a solid
    /// outline, estimated a dashed outline over a lighter fill, and unknown a soft volume with no
    /// outline at all (design.md "Confidence encoding").
    /// </summary>
    public class GhostClassTests
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
            _holder = new GameObject("ghost class tests");
            _frame = new ProjectFrame(632500.0, 4835000.0);
        }

        [TearDown]
        public void TearDown()
        {
            _materials.Dispose();
            Object.DestroyImmediate(_holder);
        }

        private static SceneFeatureDto Building(string id, string confidence, double e, double n, double heightM = 7.0)
        {
            var ring = new List<double[]>
            {
                new[] { e, n }, new[] { e + 12.0, n }, new[] { e + 12.0, n + 9.0 }, new[] { e, n + 9.0 }, new[] { e, n },
            };
            return new SceneFeatureDto
            {
                id = id,
                kind = SceneFeatureDto.KindBuilding,
                confidence = confidence,
                heightM = heightM,
                geometry = new GeometryDto
                {
                    type = GeometryDto.Polygon,
                    polygons = new List<List<List<double[]>>> { new List<List<double[]>> { ring } },
                },
            };
        }

        private EraLayer Layer(params SceneFeatureDto[] features)
        {
            var layer = new EraLayer("test", 1, _holder.transform);
            layer.AddFeatures(features, _frame, _materials, (id, reason) => Assert.Fail(id + ": " + reason));
            return layer;
        }

        private static string[] ChildNames(EraLayer layer)
        {
            return Enumerable.Range(0, layer.Parent.childCount).Select(i => layer.Parent.GetChild(i).name).ToArray();
        }

        [Test]
        public void ADocumentedFeatureHasAFillAndAnOutline()
        {
            EraLayer layer = Layer(Building("bld_a_0001", "documented", 632510, 4835010));
            string[] names = ChildNames(layer);
            Assert.AreEqual(new[] { "Ghosts documented 0", "Edges documented 0" }, names);
            layer.Dispose();
        }

        [Test]
        public void AnEstimatedFeatureHasAFillAndAnOutlineOfItsOwn()
        {
            EraLayer layer = Layer(Building("bld_a_0001", "estimated", 632510, 4835010));
            Assert.AreEqual(new[] { "Ghosts estimated 0", "Edges estimated 0" }, ChildNames(layer));
            layer.Dispose();
        }

        [Test]
        public void AnUnknownFeatureHasAVolumeAndNoOutline()
        {
            EraLayer layer = Layer(Building("bld_a_0001", "unknown", 632510, 4835010));
            Assert.AreEqual(new[] { "Ghosts unknown 0" }, ChildNames(layer));
            layer.Dispose();
        }

        [Test]
        public void MixedClassesAreDrawnAsOneRendererPerClassAndPart()
        {
            EraLayer layer = Layer(
                Building("bld_a_0001", "documented", 632510, 4835010),
                Building("bld_a_0002", "estimated", 632540, 4835010),
                Building("bld_a_0003", "estimated", 632570, 4835010),
                Building("bld_a_0004", "unknown", 632600, 4835010));
            Assert.AreEqual(4, layer.FeatureCount);
            Assert.AreEqual(
                new[] { "Ghosts documented 0", "Edges documented 0", "Ghosts estimated 0", "Edges estimated 0", "Ghosts unknown 0" },
                ChildNames(layer));
            layer.Dispose();
        }

        [Test]
        public void EveryClassCanBePicked()
        {
            EraLayer layer = Layer(
                Building("bld_a_0001", "documented", 632510, 4835010),
                Building("bld_a_0002", "estimated", 632540, 4835010),
                Building("bld_a_0003", "unknown", 632570, 4835010));
            foreach (string id in new[] { "bld_a_0001", "bld_a_0002", "bld_a_0003" })
            {
                int index = int.Parse(id.Substring(id.Length - 4)) - 1;
                // Straight down onto the middle of the footprint's roof.
                Vector3 roof = new Vector3(10f + 30f * index + 6f, 7f, 10f + 4.5f);
                float distance;
                string hit;
                Assert.IsTrue(layer.Raycast(new Ray(roof + Vector3.up * 50f, Vector3.down), out distance, out hit), id);
                Assert.AreEqual(id, hit);
            }
            layer.Dispose();
        }

        [Test]
        public void TheClassesDifferInTheirMaterialsByPatternAndNotOnlyByValue()
        {
            // Documented: solid outline. Estimated: dashed outline. Unknown: no outline, a soft volume.
            Assert.AreEqual(0f, _materials.EdgeOf("documented").GetFloat("_DashPeriod"), "documented is solid");
            Assert.Greater(_materials.EdgeOf("estimated").GetFloat("_DashPeriod"), 0f, "estimated is dashed");
            Assert.IsNull(_materials.EdgeOf("unknown"), "unknown has no outline");
            Assert.AreEqual(0f, _materials.FillOf("documented").GetFloat("_Soft"));
            Assert.AreEqual(0f, _materials.FillOf("estimated").GetFloat("_Soft"));
            Assert.AreEqual(1f, _materials.FillOf("unknown").GetFloat("_Soft"));

            // Estimated is lighter than documented.
            Assert.Less(_materials.FillOf("estimated").GetColor("_Color").a, _materials.FillOf("documented").GetColor("_Color").a);
            Assert.AreEqual(LookSettings.GhostFillAlpha, _materials.FillOf("documented").GetColor("_Color").a, 1e-6f);
            Assert.AreEqual(LookSettings.EstimatedFillAlpha, _materials.FillOf("estimated").GetColor("_Color").a, 1e-6f);
        }

        [Test]
        public void ADashIsLessThanAWholePeriodAndTheClassesKeepToTheNarrowGlow()
        {
            Assert.Greater(LookSettings.DashOnFraction, 0.2f);
            Assert.Less(LookSettings.DashOnFraction, 0.8f);
            Assert.Greater(LookSettings.DashPeriodCssPx, 2f * LookSettings.EdgeWidthCssPx, "a dash is longer than the line is wide");
            Assert.LessOrEqual(LookSettings.GhostEdgeCasingPx, 2f, "requirement 26.4");
        }

        [Test]
        public void AnUnrecognisedConfidenceIsDrawnAsUnknownTheLeastClaim()
        {
            Assert.AreEqual("unknown", GhostMaterials.ClassOf("certain"));
            Assert.AreEqual("unknown", GhostMaterials.ClassOf(null));
            Assert.AreEqual("documented", GhostMaterials.ClassOf("documented"));
            Assert.AreEqual("estimated", GhostMaterials.ClassOf("estimated"));
        }
    }
}
