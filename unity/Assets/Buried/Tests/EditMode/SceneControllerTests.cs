using System.IO;
using System.Text.RegularExpressions;
using Buried.Editor;
using Buried.Geo;
using Buried.Interop;
using Buried.Look;
using Buried.Scene;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.TestTools;

namespace Buried.Tests
{
    /// <summary>
    /// The scene controller driven through the bridge in the editor: scene/init builds the sky, fog,
    /// ground and the default camera pose, and debug/setCamera is honoured only when scene/init had
    /// debug: true (requirement 16.1).
    /// </summary>
    public class SceneControllerTests
    {
        private GameObject _root;
        private Bridge _bridge;
        private CameraRig _rig;
        private Camera _camera;

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

            _root = new GameObject("scene controller test");
            _bridge = _root.AddComponent<Bridge>();
            var cameraObject = new GameObject("camera");
            cameraObject.transform.SetParent(_root.transform, false);
            _camera = cameraObject.AddComponent<Camera>();
            _camera.fieldOfView = LookSettings.CameraFovDeg;
            _camera.aspect = 1.6f;
            _rig = cameraObject.AddComponent<CameraRig>();
            _rig.Attach(_camera);
            var controller = _root.AddComponent<SceneController>();
            controller.Configure(_bridge, palette, shaders, _rig);
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_root);
        }

        private static string Init(bool debug)
        {
            JObject message = JObject.Parse(File.ReadAllText(Path.Combine(TestPaths.FixturesRoot, "valid", "scene_init", "gate.json")));
            message["payload"]["debug"] = debug;
            return message.ToString(Newtonsoft.Json.Formatting.None);
        }

        private const string SetCamera =
            "{\"type\":\"debug/setCamera\",\"payload\":{\"target\":[632550,4835040],\"distanceM\":250,\"pitchDeg\":80,\"headingDeg\":0}}";

        [Test]
        public void SceneInitFramesTheInitialViewLookingNorthAtFiftyDegrees()
        {
            _bridge.Receive(Init(false));

            // The fixture's initial view is 632000..633100 east and 4834500..4835500 north, around the origin 632500, 4835000.
            Vector3 centre = _rig.Target;
            Assert.AreEqual(632550f - 632500f, centre.x, 0.01f);
            Assert.AreEqual(4835000f - 4835000f, centre.z, 0.01f);
            Assert.AreEqual(LookSettings.DefaultPitchDeg, _rig.Pose.PitchDeg, 0f);
            Assert.AreEqual(0f, _rig.Pose.HeadingDeg, 0f);

            // Every corner of the rectangle is in view, so the centre of the rectangle is at the canvas centre.
            var rect = new[] { new Vector3(-500f, 0f, -500f), new Vector3(-500f, 0f, 500f), new Vector3(600f, 0f, 500f), new Vector3(600f, 0f, -500f) };
            foreach (Vector3 corner in rect)
            {
                Vector2 ndc;
                Assert.IsTrue(CameraRigMath.ProjectToNdc(_rig.Pose, LookSettings.CameraFovDeg, 1.6f, corner, out ndc));
                Assert.LessOrEqual(Mathf.Abs(ndc.x), 1.001f);
                Assert.LessOrEqual(Mathf.Abs(ndc.y), 1.001f);
            }
        }

        [Test]
        public void SceneInitSetsTheFogDensityAndTheSky()
        {
            _bridge.Receive(Init(false));
            // Bounds 1300 m by 1200 m: the centre is 884.6 m from a corner, so R is 1184.6 m.
            float radius = LookSettings.FogRadius(System.Math.Sqrt(650.0 * 650.0 + 600.0 * 600.0));
            Assert.AreEqual(LookSettings.FogDensity(radius), Shader.GetGlobalFloat("_BuriedFogDensity"), 1e-9f);
            Assert.IsNotNull(RenderSettings.skybox);
            Assert.AreEqual("Buried/Sky", RenderSettings.skybox.shader.name);
        }

        [Test]
        public void DebugSetCameraWithoutDebugIsRefusedWithDebugDisabled()
        {
            _bridge.Receive(Init(false));
            Vector3 before = _camera.transform.position;

            LogAssert.Expect(LogType.Warning, new Regex(@"\[bridge\] error debug_disabled"));
            _bridge.Receive(SetCamera);

            Assert.AreEqual(0f, Vector3.Distance(before, _camera.transform.position), 0f, "the camera did not move");
        }

        [Test]
        public void DebugSetCameraWithDebugPlacesTheCameraExactly()
        {
            _bridge.Receive(Init(true));
            _bridge.Receive(SetCamera);

            CameraRigMath.Pose pose = _rig.Pose;
            Assert.AreEqual(50f, pose.Target.x, 0.001f);
            Assert.AreEqual(40f, pose.Target.z, 0.001f);
            Assert.AreEqual(250f, pose.Distance, 0.001f);
            Assert.AreEqual(80f, pose.PitchDeg, 0f);
            Assert.AreEqual(0f, pose.HeadingDeg, 0f);

            // The camera sits 250 m from the target along the view direction.
            Vector3 toTarget = pose.Target - _camera.transform.position;
            Assert.AreEqual(250f, toTarget.magnitude, 0.01f);
            Assert.AreEqual(250f * Mathf.Sin(80f * Mathf.Deg2Rad), _camera.transform.position.y, 0.01f);
        }

        [Test]
        public void ABoundsCornerBeyondFourKilometresIsRefused()
        {
            JObject message = JObject.Parse(Init(false));
            message["payload"]["bounds"]["maxE"] = 640000;
            LogAssert.Expect(LogType.Warning, new Regex(@"\[bridge\] error bounds_too_far"));
            _bridge.Receive(message.ToString(Newtonsoft.Json.Formatting.None));
        }
    }
}
