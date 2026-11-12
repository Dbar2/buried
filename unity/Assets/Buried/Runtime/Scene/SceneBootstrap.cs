using System.Collections;
using Buried.Interop;
using Buried.Look;
using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// The only component besides Bridge in the Bootstrap scene. At startup it creates the camera, the
    /// sun and the controller at runtime; the ground and everything else is built when scene/init
    /// arrives. The shaders and the palette are references stored in the scene by Buried.Editor.Setup,
    /// so the build includes them without Shader.Find.
    /// </summary>
    [RequireComponent(typeof(Bridge))]
    public sealed class SceneBootstrap : MonoBehaviour
    {
        public BuriedPalette palette;
        public Shader ghostShader;
        public Shader drapeShader;
        public Shader markerShader;

        private Bridge _bridge;

        private void Awake()
        {
            _bridge = GetComponent<Bridge>();
            if (palette == null || ghostShader == null || drapeShader == null || markerShader == null)
            {
                Debug.LogError("[bootstrap] the palette or a shader reference is missing. Run Buried.Editor.Setup.Run.");
                enabled = false;
                return;
            }

#if UNITY_WEBGL && !UNITY_EDITOR
            // Let the page keep the keyboard: the search box must still receive typing.
            WebGLInput.captureAllKeyboardInput = false;
#endif

            var root = new GameObject("Root");

            var cameraObject = new GameObject("Camera") { tag = "MainCamera" };
            cameraObject.transform.SetParent(root.transform, false);
            Camera camera = cameraObject.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = palette.night;
            camera.fieldOfView = LookSettings.CameraFovDeg;
            camera.nearClipPlane = LookSettings.NearClipM;
            camera.farClipPlane = LookSettings.FarClipM;
            camera.allowHDR = false;
            camera.allowMSAA = false;

            CameraRig rig = cameraObject.AddComponent<CameraRig>();
            rig.Attach(camera);

            // Dusk: a low sun from the west. The gate shaders are unlit; the light is here for the
            // lit materials that arrive in later task groups.
            var sunObject = new GameObject("Sun");
            sunObject.transform.SetParent(root.transform, false);
            sunObject.transform.rotation = Quaternion.Euler(8f, 90f, 0f);
            Light sun = sunObject.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = palette.muted;
            sun.intensity = 0.6f;
            sun.shadows = LightShadows.None;

            SceneController controller = root.AddComponent<SceneController>();
            controller.Configure(_bridge, palette, ghostShader, drapeShader, markerShader, rig);
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
