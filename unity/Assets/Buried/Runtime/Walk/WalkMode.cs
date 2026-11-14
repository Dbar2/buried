using System;
using System.Collections;
using Buried.Interop;
using Buried.Scene;
using UnityEngine;

namespace Buried.Walk
{
    /// <summary>
    /// The one component that handles the walk test's messages (bridge 0.9.0, spec 07). It does nothing until `walk/enter`:
    /// then it builds the corner at night, hands the camera to the first-person controller and reports back with
    /// `walk/ready`, `walk/state`, `walk/nearPlaque`, `walk/exhibit` and `walk/pointerLock`. The Block scene's
    /// <see cref="SceneController"/> ignores these messages; this component ignores everything else.
    /// </summary>
    public sealed class WalkMode : MonoBehaviour
    {
        private Bridge _bridge;
        private Camera _camera;
        private CameraRig _rig;
        private WalkAsset _asset;
        private WalkWorld _world;
        private WalkController _controller;
        private float _lastStateSent = float.NegativeInfinity;
        private Vector3 _lastStatePosition;
        private float _lastStateYaw = -1f;

        public bool Entered
        {
            get { return _world != null; }
        }

        public void Configure(Bridge bridge, Camera camera, CameraRig rig, WalkAsset asset)
        {
            _bridge = bridge;
            _camera = camera;
            _rig = rig;
            _asset = asset;
            _bridge.MessageReceived += OnMessage;
        }

        private void OnDestroy()
        {
            if (_bridge != null) _bridge.MessageReceived -= OnMessage;
        }

        private void OnMessage(ParsedMessage message)
        {
            if (!BridgeMessageTypes.IsWalk(message.type)) return;
            try
            {
                switch (message.type)
                {
                    case BridgeMessageTypes.WalkEnter:
                        Enter(((WalkEnterPayload)message.payload).reduced_motion);
                        break;
                    case BridgeMessageTypes.WalkResume:
                        Resume();
                        break;
                    case BridgeMessageTypes.WalkExit:
                        Exit();
                        break;
                    case BridgeMessageTypes.WalkTeleport:
                        Teleport((WalkTeleportPayload)message.payload);
                        break;
                    default:
                        _bridge.SendError(BridgeErrorCodes.UnknownType, "not handled by this Player: " + message.type, message.type);
                        break;
                }
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                _bridge.SendError(BridgeErrorCodes.MeshBuildFailed, "could not apply " + message.type + ": " + e.Message, message.type);
            }
        }

        private void Enter(bool reducedMotion)
        {
            if (_world != null) Exit();
            if (_asset == null || _asset.model == null || _asset.manifest == null)
            {
                _bridge.SendError(BridgeErrorCodes.MeshBuildFailed, "the walk model is not in this Player", BridgeMessageTypes.WalkEnter);
                return;
            }

            if (_rig != null) _rig.enabled = false; // the Block camera rig reads the mouse; the visitor's hands are busy
#if UNITY_WEBGL && !UNITY_EDITOR
            WebGLInput.captureAllKeyboardInput = true; // keys reach the Player whichever element has focus
#endif
            _world = WalkWorld.Build(_asset, _camera, reducedMotion);

            var walker = new GameObject("Walker");
            walker.transform.SetParent(_world.Root.transform, false);
            _controller = walker.AddComponent<WalkController>();
            _controller.Begin(_world);
            _controller.LockChanged += OnLockChanged;
            _controller.NearPlaqueChanged += OnNearPlaque;
            _controller.ExhibitRequested += OnExhibit;

            Cursor.lockState = CursorLockMode.Locked; // pending until the browser grants it (the Shell asks in the same click)
            Cursor.visible = false;
            StartCoroutine(AnnounceReady());
        }

        private IEnumerator AnnounceReady()
        {
            yield return new WaitForEndOfFrame();
            if (_world == null) yield break;
            _bridge.Send(BridgeMessageTypes.WalkReady, new WalkReadyPayload());
            SendState(true);
        }

        private void Resume()
        {
            if (_controller == null) return;
            _controller.Frozen = false;
            _controller.ForgetPlaque();
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
        }

        private void Exit()
        {
            if (_controller != null)
            {
                _controller.LockChanged -= OnLockChanged;
                _controller.NearPlaqueChanged -= OnNearPlaque;
                _controller.ExhibitRequested -= OnExhibit;
                _controller.End();
                Destroy(_controller.gameObject);
                _controller = null;
            }
            if (_world != null)
            {
                _world.Dispose();
                _world = null;
            }
            if (_rig != null) _rig.enabled = true;
#if UNITY_WEBGL && !UNITY_EDITOR
            WebGLInput.captureAllKeyboardInput = false;
#endif
        }

        private void Teleport(WalkTeleportPayload payload)
        {
            if (_controller == null)
            {
                _bridge.SendError(BridgeErrorCodes.InvalidMessage, "walk/enter has not been received", BridgeMessageTypes.WalkTeleport);
                return;
            }
            _controller.PlaceAt((float)payload.east, (float)payload.north, (float)payload.yaw_deg);
            SendState(true);
        }

        private void OnLockChanged(bool locked)
        {
            _bridge.Send(BridgeMessageTypes.WalkPointerLock, new WalkPointerLockPayload { locked = locked });
        }

        private void OnNearPlaque(string slug)
        {
            _bridge.Send(BridgeMessageTypes.WalkNearPlaque, new WalkNearPlaquePayload { slug = slug });
        }

        private void OnExhibit(string slug)
        {
            _controller.Frozen = true; // stop moving; the pointer is released for the panel
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
            _bridge.Send(BridgeMessageTypes.WalkExhibit, new WalkExhibitPayload { slug = slug });
        }

        private void Update()
        {
            if (_controller == null || !_controller.Active) return;
            SendState(false);
        }

        /// <summary>At most four a second, and only when the visitor moved or turned (<paramref name="force"/> sends now).</summary>
        private void SendState(bool force)
        {
            if (_controller == null) return;
            float now = Time.unscaledTime;
            if (!force && now - _lastStateSent < WalkSettings.StateIntervalS) return;
            Vector3 p = _controller.Feet;
            float yaw = _controller.YawDeg;
            bool changed = (p - _lastStatePosition).sqrMagnitude > 1e-4f || Mathf.Abs(Mathf.DeltaAngle(yaw, _lastStateYaw)) > 0.05f;
            if (!force && !changed) return;
            _lastStateSent = now;
            _lastStatePosition = p;
            _lastStateYaw = yaw;
            _bridge.Send(BridgeMessageTypes.WalkState, new WalkStatePayload { east = Round(p.x), north = Round(p.z), yaw_deg = Round(Mathf.Min(yaw, 359.999f)) });
        }

        private static double Round(float v)
        {
            return Math.Round(v, 3);
        }
    }
}
