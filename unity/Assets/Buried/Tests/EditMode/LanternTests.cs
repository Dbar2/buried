using System.Collections.Generic;
using System.IO;
using System.Linq;
using Buried.Editor;
using Buried.Geo;
using Buried.Interop;
using Buried.Look;
using Buried.Scene;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>
    /// Session 028: the Lantern's lens (pure maths and state), its rim, the scene's response to scene/setLantern, and
    /// Show Evidence on an era layer. The pictures are checked by e2e/lantern.spec.ts.
    /// </summary>
    public class LanternTests
    {
        private static ScreenPointDto Point(double x, double y)
        {
            return new ScreenPointDto { x = x, y = y };
        }

        // ---- The lens as maths ----

        [Test]
        public void TheRadiusIsAFractionOfTheCanvasHeight()
        {
            Assert.AreEqual(144f, LanternMask.RadiusPx(0.18, 800), 1e-3f);
        }

        [Test]
        public void APointIsInsideWhenItIsNearerThanTheRadiusAndTheLensStaysRoundOnAWideCanvas()
        {
            // Centre at (0.5, 0.4): 640 px from the left and 800 * 0.6 = 480 px from the bottom on a 1280 x 800 canvas.
            ScreenPointDto centre = Point(0.5, 0.4);
            Assert.IsTrue(LanternMask.Contains(new Vector2(640f, 480f), centre, 0.18, 1280, 800));
            Assert.IsTrue(LanternMask.Contains(new Vector2(640f + 143f, 480f), centre, 0.18, 1280, 800), "143 px along x, inside 144");
            Assert.IsFalse(LanternMask.Contains(new Vector2(640f + 145f, 480f), centre, 0.18, 1280, 800), "145 px along x, outside 144");
            Assert.IsTrue(LanternMask.Contains(new Vector2(640f, 480f - 143f), centre, 0.18, 1280, 800), "143 px along y, inside 144");
            Assert.IsFalse(LanternMask.Contains(new Vector2(640f, 480f + 145f), centre, 0.18, 1280, 800), "145 px along y, outside 144");
            Assert.IsFalse(LanternMask.Contains(new Vector2(640f + 110f, 480f + 110f), centre, 0.18, 1280, 800), "the corner of the square is outside the circle");
        }

        [Test]
        public void TheFragmentCentreFollowsTheGraphicsApisOrigin()
        {
            ScreenPointDto centre = Point(0.25, 0.1);
            Vector2 fromTop = LanternMask.FragmentCentre(centre, 1000, 500, true);
            Assert.AreEqual(250f, fromTop.x, 1e-3f);
            Assert.AreEqual(50f, fromTop.y, 1e-3f);
            Vector2 fromBottom = LanternMask.FragmentCentre(centre, 1000, 500, false);
            Assert.AreEqual(250f, fromBottom.x, 1e-3f);
            Assert.AreEqual(450f, fromBottom.y, 1e-3f);
            Vector2 screen = LanternMask.ScreenCentre(centre, 1000, 500);
            Assert.AreEqual(450f, screen.y, 1e-3f, "Unity screen coordinates run up from the bottom, as the pointer does");
        }

        [Test]
        public void TheLensOpensWithAnEaseAndReducedMotionHasNoEase()
        {
            Assert.AreEqual(0f, LanternMask.Openness(0f, false), 0f);
            Assert.AreEqual(1f, LanternMask.Openness(1f, false), 1e-6f);
            Assert.AreEqual(0.5f, LanternMask.Openness(0.5f, false), 1e-6f);
            float previous = -1f;
            for (int i = 0; i <= 50; i++)
            {
                float o = LanternMask.Openness(i / 50f, false);
                Assert.GreaterOrEqual(o, previous);
                previous = o;
            }
            Assert.AreEqual(0f, LanternMask.Openness(0.5f, true), 0f, "reduced motion: shut until fully open");
            Assert.AreEqual(1f, LanternMask.Openness(1f, true), 0f);
        }

        // ---- The lens as state ----

        private static SceneSetLanternPayload Lens(bool on)
        {
            return new SceneSetLanternPayload { on = on, center = Point(0.5, 0.5), radius = 0.18, eraId = "1911" };
        }

        [Test]
        public void UnderReducedMotionTheLensIsThereAtOnceAndGoneAtOnce()
        {
            var lantern = new LanternController();
            lantern.Set(Lens(true), true);
            Assert.IsTrue(lantern.Active);
            Assert.AreEqual(1f, lantern.Open, 0f);
            lantern.Set(Lens(false), true);
            Assert.IsFalse(lantern.Active, "nothing eases the lens out");
            Assert.AreEqual(0f, lantern.Open, 0f);
        }

        [Test]
        public void WithMotionTheLensOpensAndClosesOverTheLensOpenTime()
        {
            var lantern = new LanternController();
            lantern.Set(Lens(true), false);
            Assert.IsTrue(lantern.Active);
            Assert.AreEqual(0f, lantern.Open, 0f, "asked for, not yet open");
            lantern.Tick(LookSettings.LensOpenS * 0.5f, false);
            Assert.That(lantern.Open, Is.GreaterThan(0.3f).And.LessThan(0.7f));
            lantern.Tick(LookSettings.LensOpenS, false);
            Assert.AreEqual(1f, lantern.Open, 1e-6f);

            lantern.Set(Lens(false), false);
            Assert.IsTrue(lantern.Active, "still closing");
            lantern.Tick(LookSettings.LensOpenS * 2f, false);
            Assert.IsFalse(lantern.Active);
            Assert.AreEqual(0f, lantern.Open, 0f);
        }

        [Test]
        public void ResetShutsTheLensAtOnce()
        {
            var lantern = new LanternController();
            lantern.Set(Lens(true), true);
            lantern.Reset();
            Assert.IsFalse(lantern.Active);
            Assert.AreEqual(0f, lantern.Open, 0f);
        }

        [Test]
        public void TheClipIsCompiledOnlyIntoTheVariantOfAMaterialThatMeetsTheLens()
        {
            foreach (string shader in new[] { "Ghost.shader", "Edge.shader", "Present.shader", "Drape.shader" })
            {
                var material = new Material(Load(shader));
                try
                {
                    Assert.IsFalse(material.IsKeywordEnabled(LensMaterial.Keyword), shader + ": no clip by default");
                    LensMaterial.SetMode(material, 1);
                    Assert.IsTrue(material.IsKeywordEnabled(LensMaterial.Keyword), shader + ": inside only");
                    Assert.AreEqual(1f, material.GetFloat("_LensMode"));
                    LensMaterial.SetMode(material, 2);
                    Assert.IsTrue(material.IsKeywordEnabled(LensMaterial.Keyword), shader + ": outside only");
                    Assert.AreEqual(2f, material.GetFloat("_LensMode"));
                    LensMaterial.SetMode(material, 0);
                    Assert.IsFalse(material.IsKeywordEnabled(LensMaterial.Keyword), shader + ": back to no clip");
                }
                finally
                {
                    Object.DestroyImmediate(material);
                }
            }
        }

        // ---- The rim ----

        [Test]
        public void TheRimIsARingAtTheLensRadius()
        {
            Vector2[] points = LanternRim.RingPoints(new Vector2(640f, 400f), 144f, LookSettings.LensRimSegments);
            Assert.AreEqual(LookSettings.LensRimSegments, points.Length);
            foreach (Vector2 p in points) Assert.AreEqual(144f, Vector2.Distance(p, new Vector2(640f, 400f)), 1e-3f);
        }

        // ---- The scene's response ----

        private GameObject _root;
        private Bridge _bridge;
        private BuriedPalette _palette;

        private static Shader Load(string name)
        {
            return AssetDatabase.LoadAssetAtPath<Shader>("Assets/Buried/Runtime/Look/Shaders/" + name);
        }

        private ShaderSet Shaders()
        {
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
            return shaders;
        }

        [SetUp]
        public void SetUp()
        {
            _palette = AssetDatabase.LoadAssetAtPath<BuriedPalette>(Setup.PalettePath);
            Assert.IsNotNull(_palette, "Run `tools/unity.sh exec Buried.Editor.Setup.Run` first.");
        }

        [TearDown]
        public void TearDown()
        {
            if (_root != null) Object.DestroyImmediate(_root);
            Shader.SetGlobalVector("_BuriedLens", Vector4.zero);
        }

        private void StartScene()
        {
            _root = new GameObject("lantern test");
            _bridge = _root.AddComponent<Bridge>();
            var cameraObject = new GameObject("camera");
            cameraObject.transform.SetParent(_root.transform, false);
            Camera camera = cameraObject.AddComponent<Camera>();
            camera.fieldOfView = LookSettings.CameraFovDeg;
            camera.aspect = 1.6f;
            var rig = cameraObject.AddComponent<CameraRig>();
            rig.Attach(camera);
            _root.AddComponent<SceneController>().Configure(_bridge, _palette, Shaders(), rig);

            JObject init = JObject.Parse(File.ReadAllText(Path.Combine(TestPaths.FixturesRoot, "valid", "scene_init", "gate.json")));
            init["payload"]["reducedMotion"] = true;
            init["payload"]["debug"] = false;
            _bridge.Receive(init.ToString(Newtonsoft.Json.Formatting.None));
        }

        private const string On =
            "{\"type\":\"scene/setLantern\",\"payload\":{\"on\":true,\"center\":{\"x\":0.5,\"y\":0.4},\"radius\":0.18,\"eraId\":\"1911\"}}";

        private const string Off =
            "{\"type\":\"scene/setLantern\",\"payload\":{\"on\":false,\"center\":{\"x\":0.5,\"y\":0.4},\"radius\":0.18,\"eraId\":\"1911\"}}";

        [Test]
        public void TheLensUniformIsSetWhileTheLanternIsOnAndClearedWhenItIsOff()
        {
            StartScene();
            Assert.AreEqual(0f, Shader.GetGlobalVector("_BuriedLens").w, "no lens before the Shell asks");

            _bridge.Receive(On);
            Assert.AreEqual(1f, Shader.GetGlobalVector("_BuriedLens").w);

            _bridge.Receive(Off);
            Assert.AreEqual(0f, Shader.GetGlobalVector("_BuriedLens").w, "under reduced motion it is gone at once");
        }

        [Test]
        public void ALensForAnEraThatWasNotListedIsRefused()
        {
            StartScene();
            UnityEngine.TestTools.LogAssert.Expect(LogType.Warning, new System.Text.RegularExpressions.Regex(@"\[bridge\] error era_not_initialised"));
            _bridge.Receive(On.Replace("\"1911\"", "\"1850\""));
            Assert.AreEqual(0f, Shader.GetGlobalVector("_BuriedLens").w);
        }

        [Test]
        public void TheLanternWorksFromTodayOnly()
        {
            StartScene();
            _bridge.Receive("{\"type\":\"scene/setDepth\",\"payload\":{\"depth\":2}}");
            UnityEngine.TestTools.LogAssert.Expect(LogType.Warning, new System.Text.RegularExpressions.Regex(@"scene/setLantern ignored"));
            _bridge.Receive(On);
            Assert.AreEqual(0f, Shader.GetGlobalVector("_BuriedLens").w);
        }

        [Test]
        public void LeavingTodayShutsTheLens()
        {
            StartScene();
            _bridge.Receive(On);
            Assert.AreEqual(1f, Shader.GetGlobalVector("_BuriedLens").w);
            _bridge.Receive("{\"type\":\"scene/setDepth\",\"payload\":{\"depth\":0.25}}");
            Assert.AreEqual(0f, Shader.GetGlobalVector("_BuriedLens").w, "the lens goes with the depth that left Today");
        }

        // ---- Show Evidence on an era layer ----

        private static SceneFeatureDto Building(string id, double e, double n)
        {
            var ring = new List<double[]>
            {
                new[] { e, n }, new[] { e + 12.0, n }, new[] { e + 12.0, n + 9.0 }, new[] { e, n + 9.0 }, new[] { e, n },
            };
            return new SceneFeatureDto
            {
                id = id,
                kind = SceneFeatureDto.KindBuilding,
                confidence = "documented",
                heightM = 7.0,
                geometry = new GeometryDto
                {
                    type = GeometryDto.Polygon,
                    polygons = new List<List<List<double[]>>> { new List<List<double[]>> { ring } },
                },
            };
        }

        [Test]
        public void ShowEvidenceDrawsOneGhostNearlyTransparentAndLeavesTheOthersAndTheOutlines()
        {
            var materials = new GhostMaterials(_palette, Shaders(), 1f);
            var holder = new GameObject("evidence test");
            var frame = new ProjectFrame(632500.0, 4835000.0);
            var layer = new EraLayer("test", 3, holder.transform);
            layer.AddFeatures(
                new[] { Building("bld_a_0001", 632510, 4835010), Building("bld_a_0002", 632540, 4835010) },
                frame, materials, (id, reason) => Assert.Fail(id + ": " + reason));
            try
            {
                Transform fill = layer.Parent.Find("Ghosts documented 0");
                int before = fill.GetComponent<MeshFilter>().sharedMesh.triangles.Length / 3;
                int edgeBefore = layer.Parent.Find("Edges documented 0").GetComponent<MeshFilter>().sharedMesh.triangles.Length / 3;

                Assert.IsTrue(layer.HasFeature("bld_a_0001"));
                Assert.IsFalse(layer.HasFeature("bld_nothing_0001"));
                Assert.IsTrue(layer.SetEvidence("bld_a_0001", frame));
                Assert.AreEqual("bld_a_0001", layer.EvidenceFeatureId);

                int after = fill.GetComponent<MeshFilter>().sharedMesh.triangles.Length / 3;
                Assert.AreEqual(before / 2, after, "one of two equal boxes leaves the chunk");
                Assert.AreEqual(
                    edgeBefore,
                    layer.Parent.Find("Edges documented 0").GetComponent<MeshFilter>().sharedMesh.triangles.Length / 3,
                    "its outline stays");

                Transform evidence = layer.Parent.Find("Evidence bld_a_0001");
                Assert.IsNotNull(evidence);
                Material m = evidence.GetComponent<MeshRenderer>().sharedMaterial;
                Assert.AreEqual(LookSettings.EvidenceFillAlpha, m.GetColor("_Color").a, 1e-6f);
                Assert.AreEqual(before / 2, evidence.GetComponent<MeshFilter>().sharedMesh.triangles.Length / 3);

                layer.ClearEvidence();
                Assert.IsNull(layer.EvidenceFeatureId);
                Assert.IsNull(layer.Parent.Find("Evidence bld_a_0001"));
                Assert.AreEqual(before, fill.GetComponent<MeshFilter>().sharedMesh.triangles.Length / 3, "the lit sheet's ghost is whole again");
            }
            finally
            {
                layer.Dispose();
                materials.Dispose();
                Object.DestroyImmediate(holder);
            }
        }

        [Test]
        public void ShowEvidenceForAFeatureTheEraDoesNotDrawChangesNothing()
        {
            var materials = new GhostMaterials(_palette, Shaders(), 1f);
            var holder = new GameObject("evidence test");
            var frame = new ProjectFrame(632500.0, 4835000.0);
            var layer = new EraLayer("test", 3, holder.transform);
            layer.AddFeatures(new[] { Building("bld_a_0001", 632510, 4835010) }, frame, materials, (id, reason) => Assert.Fail(id + ": " + reason));
            try
            {
                Assert.IsFalse(layer.SetEvidence("bld_b_0001", frame));
                Assert.IsNull(layer.EvidenceFeatureId);
                Assert.AreEqual(new[] { "Ghosts documented 0", "Edges documented 0" }, Enumerable.Range(0, layer.Parent.childCount).Select(i => layer.Parent.GetChild(i).name).ToArray());
            }
            finally
            {
                layer.Dispose();
                materials.Dispose();
                Object.DestroyImmediate(holder);
            }
        }

        [Test]
        public void TheFootprintBoxIsTheBoundsOfItsRings()
        {
            var materials = new GhostMaterials(_palette, Shaders(), 1f);
            var holder = new GameObject("evidence test");
            var layer = new EraLayer("test", 3, holder.transform);
            layer.AddFeatures(new[] { Building("bld_a_0001", 632510, 4835010) }, new ProjectFrame(632500.0, 4835000.0), materials, (id, reason) => Assert.Fail(id + ": " + reason));
            try
            {
                double minE, minN, maxE, maxN;
                Assert.IsTrue(layer.TryGetFeatureBox("bld_a_0001", out minE, out minN, out maxE, out maxN));
                Assert.AreEqual(632510.0, minE, 1e-9);
                Assert.AreEqual(4835010.0, minN, 1e-9);
                Assert.AreEqual(632522.0, maxE, 1e-9);
                Assert.AreEqual(4835019.0, maxN, 1e-9);
            }
            finally
            {
                layer.Dispose();
                materials.Dispose();
                Object.DestroyImmediate(holder);
            }
        }
    }
}
