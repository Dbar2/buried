using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Buried.Editor;
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
    /// Session 040, U6 and U8: scene/raise, scene/raised, scene/setAnchors, scene/anchors and scene/frameFeature driven
    /// through the bridge the way the Shell drives them. The coroutine of scene/loadEra does not run in EditMode, so
    /// the tests run it by hand (it only waits for textures, and these eras have none).
    /// </summary>
    public class RaiseSceneTests
    {
        private GameObject _root;
        private Bridge _bridge;
        private CameraRig _rig;
        private Camera _camera;
        private SceneController _controller;
        private readonly List<KeyValuePair<string, object>> _sent = new List<KeyValuePair<string, object>>();

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

            _root = new GameObject("raise scene test");
            _bridge = _root.AddComponent<Bridge>();
            _bridge.Sent += (type, payload) => _sent.Add(new KeyValuePair<string, object>(type, payload));
            var cameraObject = new GameObject("camera");
            cameraObject.transform.SetParent(_root.transform, false);
            _camera = cameraObject.AddComponent<Camera>();
            _camera.fieldOfView = LookSettings.CameraFovDeg;
            _camera.aspect = 1.6f;
            _rig = cameraObject.AddComponent<CameraRig>();
            _rig.Attach(_camera);
            _controller = _root.AddComponent<SceneController>();
            _controller.Configure(_bridge, palette, shaders, _rig);
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_root);
        }

        private void Init(bool reducedMotion)
        {
            JObject message = JObject.Parse(File.ReadAllText(Path.Combine(TestPaths.FixturesRoot, "valid", "scene_init", "gate.json")));
            message["payload"]["reducedMotion"] = reducedMotion;
            message["payload"]["debug"] = false;
            _bridge.Receive(message.ToString(Newtonsoft.Json.Formatting.None));
            _sent.Clear();
        }

        private static string Building(string id, double e, double n)
        {
            return "{\"id\":\"" + id + "\",\"kind\":\"building\",\"confidence\":\"documented\",\"heightM\":12,\"geometry\":{\"type\":\"Polygon\",\"coordinates\":"
                + "[[[" + e + "," + n + "],[" + (e + 10) + "," + n + "],[" + (e + 10) + "," + (n + 10) + "],[" + e + "," + (n + 10) + "],[" + e + "," + n + "]]]}}";
        }

        private void LoadEra(bool held)
        {
            string json = "{\"type\":\"scene/loadEra\",\"payload\":{\"eraId\":\"1911\",\"features\":["
                + Building("bld_x_0001", 632500, 4835000) + "," + Building("bld_x_0002", 632540, 4835000) + ","
                + Building("bld_x_0003", 632600, 4835000) + "],\"drapes\":[]" + (held ? ",\"held\":true" : "") + "}}";
            ParsedMessage parsed = BridgeParser.Parse(json);
            IEnumerator steps = _controller.LoadEra((SceneLoadEraPayload)parsed.payload);
            while (steps.MoveNext())
            {
            }
        }

        private void Step(string name)
        {
            typeof(SceneController).GetMethod(name, BindingFlags.NonPublic | BindingFlags.Instance).Invoke(_controller, null);
        }

        private static string Raise(bool animate)
        {
            return "{\"type\":\"scene/raise\",\"payload\":{\"era_id\":\"1911\",\"first_feature_id\":\"bld_x_0001\",\"animate\":" + (animate ? "true" : "false") + "}}";
        }

        private Material Fill()
        {
            return _root.transform.Find("Era 1911/Ghosts documented 0").GetComponent<MeshRenderer>().sharedMaterial;
        }

        private Material PresentFill()
        {
            return _root.transform.Find("Present/Fill 0").GetComponent<MeshRenderer>().sharedMaterial;
        }

        private IEnumerable<SceneRaisedPayload> Raised()
        {
            return _sent.Where(s => s.Key == BridgeMessageTypes.SceneRaised).Select(s => (SceneRaisedPayload)s.Value);
        }

        [Test]
        public void ARaiseWithoutAnimationIsOverAtOnceAndAnswersWithSceneRaised()
        {
            Init(false);
            LoadEra(true);
            Assert.AreEqual(1f, Fill().GetFloat("_RaiseOn"), "held: the ghosts are down");
            Assert.AreEqual(0f, PresentFill().GetFloat("_Sink"), "held: Today's blocks are solid");

            _bridge.Receive(Raise(false));
            SceneRaisedPayload[] raised = Raised().ToArray();
            Assert.AreEqual(1, raised.Length);
            Assert.AreEqual("1911", raised[0].era_id);
            Assert.AreEqual(0f, Fill().GetFloat("_RaiseOn"), "every ghost is whole");
            Assert.AreEqual(1f, PresentFill().GetFloat("_Sink"), "Today's blocks are plinths");
        }

        [Test]
        public void ReducedMotionCutsEvenWhenTheShellAsksForTheAnimation()
        {
            Init(true);
            LoadEra(true);
            _bridge.Receive(Raise(true));
            Assert.AreEqual(1, Raised().Count());
            Assert.AreEqual(1f, PresentFill().GetFloat("_Sink"));
        }

        [Test]
        public void AnAnimatedRaiseRunsOnItsClockAndSettlesOnceByTwoPointTwoSeconds()
        {
            Init(false);
            LoadEra(true);
            _bridge.Receive(Raise(true));
            Assert.AreEqual(0, Raised().Count(), "nothing is reported until it has settled");
            Assert.AreEqual(0f, Fill().GetVector("_RaiseParams").z, 1e-6f);

            MethodInfo tick = typeof(SceneController).GetMethod("TickRaise", BindingFlags.NonPublic | BindingFlags.Instance);
            tick.Invoke(_controller, new object[] { 0.6f });
            Assert.AreEqual(0.6f, Fill().GetVector("_RaiseParams").z, 1e-5f);
            Assert.AreEqual(1f, PresentFill().GetFloat("_Sink"), 1e-5f, "the plinths have sunk after 600 ms");
            Assert.AreEqual(0, Raised().Count());

            tick.Invoke(_controller, new object[] { 1.0f });
            Assert.AreEqual(0, Raised().Count(), "1.6 s: the last ghost is still rising");
            tick.Invoke(_controller, new object[] { 0.7f });
            Assert.AreEqual(1, Raised().Count());
            tick.Invoke(_controller, new object[] { 1.0f });
            Assert.AreEqual(1, Raised().Count(), "it is reported once");
            Assert.AreEqual(0f, Fill().GetFloat("_RaiseOn"));
        }

        [Test]
        public void ARaiseOfAnEraThatIsNotLoadedIsRefused()
        {
            Init(false);
            _bridge.Receive(Raise(false));
            Assert.AreEqual(0, Raised().Count());
            var error = _sent.Where(s => s.Key == BridgeMessageTypes.Error).Select(s => (ErrorPayload)s.Value).ToArray();
            Assert.AreEqual(1, error.Length);
            Assert.AreEqual(BridgeErrorCodes.EraNotInitialised, error[0].code);
        }

        [Test]
        public void TheCameraDoesNotMoveDuringARaise()
        {
            Init(false);
            LoadEra(true);
            CameraRigMath.Pose before = _rig.Pose;
            _bridge.Receive(Raise(true));
            typeof(SceneController).GetMethod("TickRaise", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(_controller, new object[] { 1.1f });
            Assert.AreEqual(before.Target, _rig.Pose.Target);
            Assert.AreEqual(before.Distance, _rig.Pose.Distance);
            Assert.IsFalse(_rig.IsFlying);
        }

        [Test]
        public void SetAnchorsAnswersOnceInTheOrderAskedAndNotAgainWhileNothingChanges()
        {
            Init(false);
            LoadEra(false);
            _bridge.Receive("{\"type\":\"scene/setAnchors\",\"payload\":{\"feature_ids\":[\"bld_x_0003\",\"bld_x_0001\",\"bld_x_9999\"]}}");
            Step("LateUpdate");
            SceneAnchorsPayload[] first = _sent.Where(s => s.Key == BridgeMessageTypes.SceneAnchors).Select(s => (SceneAnchorsPayload)s.Value).ToArray();
            Assert.AreEqual(1, first.Length);
            Assert.AreEqual(new[] { "bld_x_0003", "bld_x_0001", "bld_x_9999" }, first[0].anchors.Select(a => a.feature_id).ToArray());
            Assert.IsFalse(first[0].anchors[2].on_screen, "a feature the scene does not hold is never on screen");
            Assert.AreEqual(0.0, first[0].anchors[2].x);

            Step("LateUpdate");
            Step("LateUpdate");
            Assert.AreEqual(1, _sent.Count(s => s.Key == BridgeMessageTypes.SceneAnchors), "nothing changed, so nothing is sent");
        }

        [Test]
        public void AnchorsAreSentAgainAfterTheRaiseHasSettled()
        {
            Init(false);
            LoadEra(true);
            _bridge.Receive("{\"type\":\"scene/setAnchors\",\"payload\":{\"feature_ids\":[\"bld_x_0001\"]}}");
            Step("LateUpdate");
            _bridge.Receive(Raise(false));
            Step("LateUpdate");
            Assert.AreEqual(2, _sent.Count(s => s.Key == BridgeMessageTypes.SceneAnchors), "one for scene/setAnchors, one after scene/raised");
        }

        [Test]
        public void FrameFeatureCutsToAViewThatHasTheFeatureInUnderReducedMotionAndRefusesAnUnknownOne()
        {
            Init(true);
            LoadEra(false);
            _bridge.Receive("{\"type\":\"scene/frameFeature\",\"payload\":{\"feature_id\":\"bld_x_0003\"}}");
            Assert.IsFalse(_rig.IsFlying);
            Assert.AreEqual(105f, _rig.Pose.Target.x, 0.5f);
            Assert.AreEqual(5f, _rig.Pose.Target.z, 0.5f);
            Vector2 ndc;
            Assert.IsTrue(CameraRigMath.ProjectToNdc(_rig.Pose, LookSettings.CameraFovDeg, 1.6f, new Vector3(105f, 12f, 5f), out ndc));
            Assert.LessOrEqual(Mathf.Abs(ndc.x), 1f);
            Assert.LessOrEqual(Mathf.Abs(ndc.y), 1f);

            _sent.Clear();
            _bridge.Receive("{\"type\":\"scene/frameFeature\",\"payload\":{\"feature_id\":\"bld_x_9999\"}}");
            Assert.AreEqual(1, _sent.Count(s => s.Key == BridgeMessageTypes.Error));
        }
    }
}
