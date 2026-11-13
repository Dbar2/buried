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
    /// Session 023, item 4: the pinned lot. The outline in `lantern`, the light
    /// pool that follows it and the camera flight that frames it (eased, 900 ms; a cut under reduced
    /// motion), driven through the bridge as the Shell drives them.
    /// </summary>
    public class PinnedLotTests
    {
        private GameObject _root;
        private Bridge _bridge;
        private CameraRig _rig;
        private Camera _camera;
        private BuriedPalette _palette;

        private static Shader Load(string name)
        {
            return AssetDatabase.LoadAssetAtPath<Shader>("Assets/Buried/Runtime/Look/Shaders/" + name);
        }

        [SetUp]
        public void SetUp()
        {
            _palette = AssetDatabase.LoadAssetAtPath<BuriedPalette>(Setup.PalettePath);
            Assert.IsNotNull(_palette, "Run `tools/unity.sh exec Buried.Editor.Setup.Run` first.");
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

            _root = new GameObject("pinned lot test");
            _bridge = _root.AddComponent<Bridge>();
            var cameraObject = new GameObject("camera");
            cameraObject.transform.SetParent(_root.transform, false);
            _camera = cameraObject.AddComponent<Camera>();
            _camera.fieldOfView = LookSettings.CameraFovDeg;
            _camera.aspect = 1.6f;
            _rig = cameraObject.AddComponent<CameraRig>();
            _rig.Attach(_camera);
            _root.AddComponent<SceneController>().Configure(_bridge, _palette, shaders, _rig);
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_root);
        }

        private static string Init(bool reducedMotion)
        {
            JObject message = JObject.Parse(File.ReadAllText(Path.Combine(TestPaths.FixturesRoot, "valid", "scene_init", "gate.json")));
            message["payload"]["reducedMotion"] = reducedMotion;
            message["payload"]["debug"] = false;
            return message.ToString(Newtonsoft.Json.Formatting.None);
        }

        // The gate fixture's origin is 632500, 4835000. This lot is 12 m by 20 m, 90 m east and 60 m north of it.
        private const string Lot =
            "{\"type\":\"scene/focusLot\",\"payload\":{\"lot\":{\"type\":\"Polygon\",\"coordinates\":"
            + "[[[632590,4835060],[632602,4835060],[632602,4835080],[632590,4835080],[632590,4835060]]]}}}";

        private const string Clear = "{\"type\":\"scene/clearLot\",\"payload\":{}}";

        [Test]
        public void UnderReducedMotionFocusLotCutsToAViewThatFramesTheLotAndClearLotCutsBack()
        {
            _bridge.Receive(Init(true));
            CameraRigMath.Pose before = _rig.Pose;

            _bridge.Receive(Lot);
            Assert.IsFalse(_rig.IsFlying, "a cut is not a flight");
            Vector3 lotCentre = new Vector3(96f, 0f, 70f);
            Assert.AreEqual(lotCentre.x, _rig.Pose.Target.x, 0.01f);
            Assert.AreEqual(lotCentre.z, _rig.Pose.Target.z, 0.01f);
            Assert.AreEqual(LookSettings.LotPitchDeg, _rig.Pose.PitchDeg, 1e-3f);
            Assert.Less(_rig.Pose.Distance, before.Distance, "closer than the default view");

            // The lot's four corners, and the padding around them, are all in view.
            foreach (Vector3 corner in new[] { new Vector3(90f, 0f, 60f), new Vector3(102f, 0f, 60f), new Vector3(102f, 0f, 80f), new Vector3(90f, 0f, 80f) })
            {
                Vector2 ndc;
                Assert.IsTrue(CameraRigMath.ProjectToNdc(_rig.Pose, LookSettings.CameraFovDeg, 1.6f, corner, out ndc));
                Assert.LessOrEqual(Mathf.Abs(ndc.x), 0.9f);
                Assert.LessOrEqual(Mathf.Abs(ndc.y), 0.9f);
            }

            // The light pool moved to the lot.
            Vector4 pool = Shader.GetGlobalVector("_BuriedLightPool");
            Assert.AreEqual(lotCentre.x, pool.x, 0.01f);
            Assert.AreEqual(lotCentre.z, pool.y, 0.01f);
            Assert.AreEqual(LookSettings.LightPoolRadiusPinnedM, pool.z, 1e-3f);

            _bridge.Receive(Clear);
            Assert.AreEqual(before.Target.x, _rig.Pose.Target.x, 0.01f);
            Assert.AreEqual(before.Target.z, _rig.Pose.Target.z, 0.01f);
            Assert.AreEqual(before.Distance, _rig.Pose.Distance, 0.01f);
            Assert.AreEqual(before.PitchDeg, _rig.Pose.PitchDeg, 1e-3f);
            Assert.AreEqual(LookSettings.LightPoolRadiusM, Shader.GetGlobalVector("_BuriedLightPool").z, 1e-3f);
        }

        [Test]
        public void WithMotionFocusLotStartsAnEasedFlightAndTheCameraHasNotMovedYet()
        {
            _bridge.Receive(Init(false));
            CameraRigMath.Pose before = _rig.Pose;
            _bridge.Receive(Lot);
            Assert.IsTrue(_rig.IsFlying);
            Assert.AreEqual(before.Distance, _rig.Pose.Distance, 1e-3f, "the first frame of a flight is where it started");
        }

        [Test]
        public void ClearLotWithNothingPinnedDoesNothing()
        {
            _bridge.Receive(Init(true));
            CameraRigMath.Pose before = _rig.Pose;
            _bridge.Receive(Clear);
            Assert.AreEqual(before.Distance, _rig.Pose.Distance, 1e-4f);
            Assert.IsFalse(_rig.IsFlying);
        }

        [Test]
        public void ALotBeforeSceneInitIsRefused()
        {
            UnityEngine.TestTools.LogAssert.Expect(LogType.Warning, new System.Text.RegularExpressions.Regex(@"\[bridge\] error era_not_initialised"));
            _bridge.Receive(Lot);
        }

        [Test]
        public void ThePinIsDrawnAsAnOutlineOnlyAndIsLantern()
        {
            var shaders = new ShaderSet { edge = Load("Edge.shader") };
            var frame = new ProjectFrame(632500.0, 4835000.0);
            var ring = new List<double[]>
            {
                new[] { 632590.0, 4835060.0 }, new[] { 632602.0, 4835060.0 }, new[] { 632602.0, 4835080.0 },
                new[] { 632590.0, 4835080.0 }, new[] { 632590.0, 4835060.0 },
            };
            var lot = new GeometryDto
            {
                type = GeometryDto.Polygon,
                polygons = new List<List<List<double[]>>> { new List<List<double[]>> { ring } },
            };
            var holder = new GameObject("pin test");
            LotPin pin = new LotPin(holder.transform, lot, frame, _palette, shaders, 1f);
            try
            {
                Assert.AreEqual(new[] { "Outline" }, pin.PartNames.ToArray(), "no lamp or other marker");
                Assert.AreEqual(90f, pin.Bounds.xMin, 1e-3f);
                Assert.AreEqual(102f, pin.Bounds.xMax, 1e-3f);
                Assert.AreEqual(60f, pin.Bounds.yMin, 1e-3f);
                Assert.AreEqual(80f, pin.Bounds.yMax, 1e-3f);

                foreach (MeshRenderer renderer in holder.GetComponentsInChildren<MeshRenderer>())
                {
                    Color32 drawn = renderer.sharedMaterial.GetColor("_Color");
                    Color32 lantern = _palette.lantern;
                    Assert.AreEqual(lantern.r, drawn.r, 1, renderer.name + " is lantern (red)");
                    Assert.AreEqual(lantern.g, drawn.g, 1, renderer.name + " is lantern (green)");
                    Assert.AreEqual(lantern.b, drawn.b, 1, renderer.name + " is lantern (blue)");
                    Assert.AreEqual(0f, renderer.sharedMaterial.GetFloat("_Fogged"), renderer.name + " is not fogged");
                }
                MeshRenderer outline = holder.transform.Find("Pinned lot/Outline").GetComponent<MeshRenderer>();
                Assert.AreEqual((float)UnityEngine.Rendering.CompareFunction.Always, outline.sharedMaterial.GetFloat("_ZTest"), "drawn over the buildings");
            }
            finally
            {
                pin.Dispose();
                Object.DestroyImmediate(holder);
            }
        }

        // ---- Pure parts ----

        [Test]
        public void TheEaseIsFlatAtBothEndsAndMonotonic()
        {
            Assert.AreEqual(0f, CameraRigMath.Ease(0f), 0f);
            Assert.AreEqual(1f, CameraRigMath.Ease(1f), 1e-6f);
            Assert.AreEqual(0.5f, CameraRigMath.Ease(0.5f), 1e-6f);
            Assert.Less(CameraRigMath.Ease(0.05f), 0.05f, "slow at the start");
            Assert.Greater(CameraRigMath.Ease(0.95f), 0.95f, "slow at the end");
            float previous = -1f;
            for (int i = 0; i <= 100; i++)
            {
                float e = CameraRigMath.Ease(i / 100f);
                Assert.GreaterOrEqual(e, previous);
                previous = e;
            }
            Assert.AreEqual(0.9f, LookSettings.LotFlightS, 0f, "design.md \"Motion\": a flight is 900 ms");
        }

        [Test]
        public void ALerpedPoseHasTheEndsAtTheEndsAndTurnsTheShortWayRound()
        {
            var a = CameraRigMath.MakePose(0f, 0f, 100f, 21f, 350f);
            var b = CameraRigMath.MakePose(100f, 50f, 400f, 41f, 10f);
            CameraRigMath.Pose start = CameraRigMath.Lerp(a, b, 0f);
            CameraRigMath.Pose end = CameraRigMath.Lerp(a, b, 1f);
            Assert.AreEqual(100f, start.Distance, 1e-3f);
            Assert.AreEqual(400f, end.Distance, 1e-2f);
            Assert.AreEqual(100f, end.Target.x, 1e-4f);
            Assert.AreEqual(41f, end.PitchDeg, 1e-4f);
            CameraRigMath.Pose half = CameraRigMath.Lerp(a, b, 0.5f);
            Assert.AreEqual(200f, half.Distance, 1e-2f, "the distance is halfway on a log scale");
            Assert.AreEqual(0f, Mathf.DeltaAngle(half.HeadingDeg, 0f), 1e-3f, "350 to 10 passes through north, not through south");
        }

        [Test]
        public void FramePoseKeepsTheWholePaddedRectangleInView()
        {
            CameraRigMath.Pose pose = CameraRigMath.FramePose(90f, 60f, 102f, 80f, 40f, 40f, 22.5f, LookSettings.CameraFovDeg, 1.6f);
            Assert.AreEqual(96f, pose.Target.x, 1e-4f);
            Assert.AreEqual(70f, pose.Target.z, 1e-4f);
            foreach (Vector3 corner in new[] { new Vector3(50f, 0f, 20f), new Vector3(142f, 0f, 20f), new Vector3(142f, 0f, 120f), new Vector3(50f, 0f, 120f) })
            {
                Vector2 ndc;
                Assert.IsTrue(CameraRigMath.ProjectToNdc(pose, LookSettings.CameraFovDeg, 1.6f, corner, out ndc));
                Assert.LessOrEqual(Mathf.Abs(ndc.x), 1.001f);
                Assert.LessOrEqual(Mathf.Abs(ndc.y), 1.001f);
            }
        }
    }
}
