using System.Collections.Generic;
using System.IO;
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
    /// Bridge 0.7.0 (session 034): land-use areas are sent with the era's features and drawn flat on the ground as a
    /// hatched `ink` sheet at low opacity with a thin outline, under the ghosts, and can be picked. The fixtures are
    /// the shared ones; the layer tests build an <see cref="EraLayer"/> the way the Player does.
    /// </summary>
    public class LandUseAreaTests
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
            _holder = new GameObject("land use tests");
            _frame = new ProjectFrame(632500.0, 4835000.0);
        }

        [TearDown]
        public void TearDown()
        {
            _materials.Dispose();
            Object.DestroyImmediate(_holder);
        }

        private static ParsedMessage Valid(string folder, string name)
        {
            return BridgeParser.Parse(File.ReadAllText(Path.Combine(TestPaths.FixturesRoot, "valid", folder, name + ".json")));
        }

        private static SceneFeatureDto Rectangle(string id, string kind, string confidence, double e, double n, double w, double h, double heightM)
        {
            var ring = new List<double[]>
            {
                new[] { e, n }, new[] { e + w, n }, new[] { e + w, n + h }, new[] { e, n + h }, new[] { e, n },
            };
            return new SceneFeatureDto
            {
                id = id,
                kind = kind,
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
            var layer = new EraLayer("test", 3, _holder.transform);
            layer.AddFeatures(features, _frame, _materials, (id, reason) => Assert.Fail(id + ": " + reason));
            return layer;
        }

        private static string[] ChildNames(EraLayer layer)
        {
            return Enumerable.Range(0, layer.Parent.childCount).Select(i => layer.Parent.GetChild(i).name).ToArray();
        }

        // ---- the bridge ----

        [Test]
        public void TheParserReadsLandUseAreasWithPolygonAndMultiPolygonGeometry()
        {
            var payload = (SceneLoadEraPayload)Valid("scene_loadEra", "land_use_area").payload;
            Assert.AreEqual(3, payload.features.Count);
            Assert.AreEqual(SceneFeatureDto.KindBuilding, payload.features[0].kind);
            Assert.AreEqual(SceneFeatureDto.KindLandUse, payload.features[1].kind);
            Assert.AreEqual(GeometryDto.Polygon, payload.features[1].geometry.type);
            Assert.AreEqual(SceneFeatureDto.KindLandUse, payload.features[2].kind);
            Assert.AreEqual(2, payload.features[2].geometry.polygons.Count);
            Assert.AreEqual("estimated", payload.features[2].confidence);
        }

        [TestCase("land_use_line_geometry")]
        [TestCase("land_use_ring_open")]
        [TestCase("kind_unknown")]
        public void TheParserRefusesAnAreaThatIsNotAClosedPolygon(string name)
        {
            string text = File.ReadAllText(Path.Combine(TestPaths.FixturesRoot, "invalid", "scene_loadEra", name + ".json"));
            Assert.Throws<BridgeValidationException>(() => BridgeParser.Parse(text));
        }

        [Test]
        public void ThePlayerSpeaksBridge070()
        {
            Assert.AreEqual("0.7.0", BridgeVersion.Value);
        }

        // ---- the sheet ----

        [Test]
        public void AnAreaIsOneFlatSheetWhateverHeightItWasSent()
        {
            foreach (double sent in new[] { 0.05, 7.0, 400.0 })
            {
                EraLayer layer = Layer(Rectangle("use_a_0001", SceneFeatureDto.KindLandUse, "documented", 632510, 4835010, 20, 12, sent));
                Mesh fill = layer.Parent.GetChild(0).GetComponent<MeshFilter>().sharedMesh;
                Assert.LessOrEqual(fill.bounds.max.y, LookSettings.AreaHeightM + 1e-4f, "sent " + sent);
                Assert.GreaterOrEqual(fill.bounds.min.y, 0f);
                layer.Dispose();
            }
        }

        [Test]
        public void AnAreaHasAHatchedFillAndAnOutlineOfItsClassUnderTheGhosts()
        {
            EraLayer layer = Layer(Rectangle("use_a_0001", SceneFeatureDto.KindLandUse, "documented", 632510, 4835010, 20, 12, 0.05));
            Assert.AreEqual(new[] { "Areas documented 0", "Area edges documented 0" }, ChildNames(layer));
            Material fill = layer.Parent.GetChild(0).GetComponent<MeshRenderer>().sharedMaterial;
            Material edge = layer.Parent.GetChild(1).GetComponent<MeshRenderer>().sharedMaterial;
            Assert.AreEqual(1f, fill.GetFloat("_Hatch"), "hatched");
            Assert.Less(fill.renderQueue, 3000, "under the ghosts");
            Assert.Greater(fill.renderQueue, 2900 + 10, "above the era drapes (a few per era, from 2900)");
            Assert.Less(fill.renderQueue, 2900 + DrapeLayer.EvidenceOrder, "under Show Evidence's patch, so the scan still shows over an area");
            Assert.Less(edge.renderQueue, 2900 + DrapeLayer.EvidenceOrder);
            Assert.Greater(edge.renderQueue, fill.renderQueue, "the outline over the sheet");
            layer.Dispose();
        }

        [Test]
        public void TheHatchIsInkOverACasingOfNightAtLowOpacity()
        {
            foreach (string cls in GhostMaterials.Classes)
            {
                Material fill = _materials.AreaFillOf(cls);
                Assert.AreEqual(1f, fill.GetFloat("_Hatch"), cls);
                Assert.Less(fill.GetColor("_Color").a, 0.7f, cls + ": low opacity");
                Assert.Greater(fill.GetColor("_Color").a, 0.1f, cls + ": visible");
                Color core = fill.GetColor("_Color");
                Color casing = fill.GetColor("_CasingColor");
                Assert.Greater(core.grayscale - casing.grayscale, 0.5f, cls + ": the stripe and its casing differ in grey, not only in hue");
                Assert.Greater(fill.GetFloat("_HatchPeriodPx"), 4f, cls + ": the stripes are never finer than the pixel grid allows");
            }
            Assert.Greater(_materials.AreaFillOf("documented").GetColor("_Color").a, _materials.AreaFillOf("estimated").GetColor("_Color").a);
            Assert.Greater(_materials.AreaFillOf("estimated").GetColor("_Color").a, _materials.AreaFillOf("unknown").GetColor("_Color").a);
        }

        [Test]
        public void TheClassesOfAnAreaDifferByOutlineAsTheBuildingsDo()
        {
            Assert.AreEqual(0f, _materials.AreaEdgeOf("documented").GetFloat("_DashPeriod"), "documented is solid");
            Assert.Greater(_materials.AreaEdgeOf("estimated").GetFloat("_DashPeriod"), 0f, "estimated is dashed");
            Assert.IsNull(_materials.AreaEdgeOf("unknown"), "unknown has no outline");
        }

        [Test]
        public void AreaMaterialsAreNotTheBuildingMaterials()
        {
            foreach (string cls in GhostMaterials.Classes)
            {
                Assert.AreNotSame(_materials.FillOf(cls), _materials.AreaFillOf(cls), cls);
                Assert.AreEqual(0f, _materials.FillOf(cls).GetFloat("_Hatch"), cls + ": a building is not hatched");
            }
        }

        [Test]
        public void BuildingsAndAreasOfOneEraAreDrawnAsSeparateRenderers()
        {
            EraLayer layer = Layer(
                Rectangle("bld_a_0001", SceneFeatureDto.KindBuilding, "documented", 632510, 4835010, 12, 9, 7.0),
                Rectangle("use_a_0001", SceneFeatureDto.KindLandUse, "documented", 632540, 4835010, 20, 12, 0.05),
                Rectangle("use_a_0002", SceneFeatureDto.KindLandUse, "unknown", 632580, 4835010, 20, 12, 0.05));
            Assert.AreEqual(3, layer.FeatureCount);
            Assert.AreEqual(
                new[] { "Ghosts documented 0", "Edges documented 0", "Areas documented 0", "Area edges documented 0", "Areas unknown 0" },
                ChildNames(layer));
            layer.Dispose();
        }

        // ---- picking ----

        [Test]
        public void AnAreaCanBePickedFromAbove()
        {
            EraLayer layer = Layer(Rectangle("use_a_0001", SceneFeatureDto.KindLandUse, "documented", 632510, 4835010, 20, 12, 0.05));
            float distance;
            string hit;
            // The area spans x 10 to 30 and z 10 to 22 in the Player's frame.
            Assert.IsTrue(layer.Raycast(new Ray(new Vector3(20f, 60f, 16f), Vector3.down), out distance, out hit));
            Assert.AreEqual("use_a_0001", hit);
            Assert.IsFalse(layer.Raycast(new Ray(new Vector3(60f, 60f, 16f), Vector3.down), out distance, out hit), "beside it there is nothing");
            layer.Dispose();
        }

        [Test]
        public void ABuildingOnAnAreaIsPickedBeforeTheAreaUnderIt()
        {
            EraLayer layer = Layer(
                Rectangle("use_a_0001", SceneFeatureDto.KindLandUse, "documented", 632510, 4835010, 40, 30, 0.05),
                Rectangle("bld_a_0001", SceneFeatureDto.KindBuilding, "documented", 632520, 4835020, 10, 8, 7.0));
            float distance;
            string hit;
            Assert.IsTrue(layer.Raycast(new Ray(new Vector3(25f, 60f, 24f), Vector3.down), out distance, out hit));
            Assert.AreEqual("bld_a_0001", hit, "the building's roof is nearer than the sheet under it");
            Assert.IsTrue(layer.Raycast(new Ray(new Vector3(15f, 60f, 15f), Vector3.down), out distance, out hit));
            Assert.AreEqual("use_a_0001", hit, "where no building stands, the area is picked");
            layer.Dispose();
        }

        [Test]
        public void ShowEvidenceWorksOnAnArea()
        {
            EraLayer layer = Layer(Rectangle("use_a_0001", SceneFeatureDto.KindLandUse, "documented", 632510, 4835010, 20, 12, 0.05));
            Assert.IsTrue(layer.SetEvidence("use_a_0001", _frame));
            Assert.AreEqual("use_a_0001", layer.EvidenceFeatureId);
            layer.ClearEvidence();
            Assert.IsNull(layer.EvidenceFeatureId);
            layer.Dispose();
        }
    }
}
