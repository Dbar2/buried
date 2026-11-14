using System.Collections;
using Buried.Interop;
using Buried.Look;
using Buried.Walk;
using UnityEngine;
using UnityEngine.Rendering;

namespace Buried.Scene
{
    /// <summary>
    /// The only component besides Bridge in the Bootstrap scene. At startup it creates the camera, the
    /// sun and the controller at runtime; the ground, the sky colours, the fog and everything else are
    /// built when scene/init arrives. The shaders and the palette are references stored in the scene by
    /// Buried.Editor.Setup, so the build includes them without Shader.Find.
    /// </summary>
    [RequireComponent(typeof(Bridge))]
    public sealed class SceneBootstrap : MonoBehaviour
    {
        public BuriedPalette palette;
        public ShaderSet shaders = new ShaderSet();
        /// <summary>The corner of the walk test (spec 07), recorded by Buried.Editor.Setup; null when the model is not in the project.</summary>
        public WalkAsset walk;

        private Bridge _bridge;

        private void Awake()
        {
            _bridge = GetComponent<Bridge>();
            if (palette == null || shaders == null || !shaders.Complete)
            {
                Debug.LogError("[bootstrap] the palette or a shader reference is missing. Run Buried.Editor.Setup.Run.");
                enabled = false;
                return;
            }

#if UNITY_WEBGL && !UNITY_EDITOR
            // Let the page keep the keyboard: the search box must still receive typing.
            WebGLInput.captureAllKeyboardInput = false;
#endif

            Built built = Build(palette, shaders, _bridge);

            // The walk test (spec 07) sleeps until walk/enter. A Player built without the model answers walk/enter with an error.
            gameObject.AddComponent<WalkMode>().Configure(_bridge, built.Camera, built.Rig, walk);
        }

        /// <summary>What <see cref="Build"/> creates.</summary>
        public sealed class Built
        {
            public GameObject Root;
            public Camera Camera;
            public CameraRig Rig;
            public SceneController Controller;
        }

        /// <summary>
        /// The camera, the light and the controller, exactly as the Player has them. The editor builds the same thing
        /// for the Stills (`Buried.Editor.Still.Render`), so a Still is a picture of what the Player draws.
        /// </summary>
        public static Built Build(BuriedPalette palette, ShaderSet shaders, Bridge bridge)
        {
            var root = new GameObject("Root");

            var cameraObject = new GameObject("Camera") { tag = "MainCamera" };
            cameraObject.transform.SetParent(root.transform, false);
            Camera camera = cameraObject.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.Skybox;
            camera.backgroundColor = palette.soot;
            camera.fieldOfView = LookSettings.CameraFovDeg;
            camera.nearClipPlane = LookSettings.NearClipM;
            camera.farClipPlane = LookSettings.FarClipM;
            camera.allowHDR = true;
            camera.allowMSAA = false;
            PostProcessing.Install(root.transform, camera);

            CameraRig rig = cameraObject.AddComponent<CameraRig>();
            rig.Attach(camera);

            // One warm key light from the upper left, off frame, as if from a desk lamp (light only: no lamp is
            // drawn), and a low cool ambient. No shadows.
            var sunObject = new GameObject("Lamp");
            sunObject.transform.SetParent(root.transform, false);
            sunObject.transform.rotation = Quaternion.Euler(LookSettings.SunElevationDeg, LookSettings.SunTravelHeadingDeg, 0f);
            Light sun = sunObject.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = Color.Lerp(palette.parchment, palette.lantern, LookSettings.LampWarmth);
            sun.intensity = LookSettings.SunIntensity;
            sun.shadows = LightShadows.None;
            RenderSettings.sun = sun;
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = (Color)palette.haze * LookSettings.AmbientIntensity;
            RenderSettings.fog = false; // the shaders do their own fog

            SceneController controller = root.AddComponent<SceneController>();
            controller.Configure(bridge, palette, shaders, rig);
            return new Built { Root = root, Camera = camera, Rig = rig, Controller = controller };
        }

        // Start as a coroutine: wait for the end of the first rendered frame, then say ready.
        private IEnumerator Start()
        {
            if (!enabled) yield break;
            yield return new WaitForEndOfFrame();
            _bridge.Send(BridgeMessageTypes.Ready, new ReadyPayload
            {
                bridgeVersion = BridgeVersion.Value,
                unityVersion = Application.unityVersion,
            });
        }
    }
}
