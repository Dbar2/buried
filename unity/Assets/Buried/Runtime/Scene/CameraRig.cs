using Buried.Look;
using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// The camera as a target point on the ground, a distance, a pitch and a heading. It changes only
    /// in response to user input on the view (drag to pan, the wheel, pinch, Ctrl/Shift with the wheel
    /// and the + and - keys to zoom), a debug/setCamera when debug is on, and (later) a flight. It
    /// never spins, orbits or drifts, a depth change never moves it, and a drag stops the camera the
    /// moment the pointer stops or is released (no inertia). The maths is in CameraRigMath.
    /// </summary>
    public sealed class CameraRig : MonoBehaviour
    {
        private Camera _camera;
        private bool _ready;
        private float _minX, _maxX, _minZ, _maxZ;
        private CameraRigMath.Pose _pose;
        private bool _moved;
        private bool _dragging;
        private Vector3 _anchor;
        private float _lastPinch;

        /// <summary>The ground point the camera looks at, in Unity world coordinates.</summary>
        public Vector3 Target
        {
            get { return _pose.Target; }
        }

        public CameraRigMath.Pose Pose
        {
            get { return _pose; }
        }

        public Camera Camera
        {
            get { return _camera; }
        }

        public void Attach(Camera camera)
        {
            _camera = camera;
        }

        /// <summary>The ground the camera target may roam over: the project bounds.</summary>
        public void SetLimits(float minX, float minZ, float maxX, float maxZ)
        {
            _minX = minX;
            _maxX = maxX;
            _minZ = minZ;
            _maxZ = maxZ;
        }

        /// <summary>
        /// The default pose after scene/init (requirement 16.8): looking north-north-east at the default
        /// pitch, with
        /// the target at the centre of the view rectangle and the smallest distance at which the whole
        /// rectangle is in view for the canvas's aspect ratio.
        /// </summary>
        public void SetDefaultPose(float minX, float minZ, float maxX, float maxZ)
        {
            float aspect = _camera.aspect > 0f ? _camera.aspect : 1f;
            float distance = CameraRigMath.FitDistance(
                minX, minZ, maxX, maxZ, LookSettings.DefaultPitchDeg, LookSettings.DefaultHeadingDeg, LookSettings.CameraFovDeg, aspect);
            _pose = CameraRigMath.MakePose(
                (minX + maxX) * 0.5f, (minZ + maxZ) * 0.5f, distance, LookSettings.DefaultPitchDeg, LookSettings.DefaultHeadingDeg);
            _ready = true;
            Apply(CameraRigMath.ClampPose(_pose, _minX, _minZ, _maxX, _maxZ));
        }

        /// <summary>debug/setCamera: the pose exactly, inside the limits of requirement 16.3.</summary>
        public void SetPose(float targetX, float targetZ, float distance, float pitchDeg, float headingDeg)
        {
            _ready = true;
            Apply(CameraRigMath.ClampPose(
                CameraRigMath.MakePose(targetX, targetZ, distance, pitchDeg, headingDeg), _minX, _minZ, _maxX, _maxZ));
        }

        private void Apply(CameraRigMath.Pose pose)
        {
            _pose = pose;
            _camera.transform.rotation = CameraRigMath.Rotation(pose);
            _camera.transform.position = CameraRigMath.Position(pose);
            _moved = true;
        }

        /// <summary>True once if the camera moved since the last call.</summary>
        public bool ConsumeMoved()
        {
            bool moved = _moved;
            _moved = false;
            return moved;
        }

        private void Update()
        {
            if (!_ready || _camera == null) return;

            float w = _camera.pixelWidth;
            float h = _camera.pixelHeight;
            float fov = _camera.fieldOfView;
            CameraRigMath.Pose pose = _pose;
            bool changed = false;

            // Pan: keep the ground point that was under the pointer when the drag began under it.
            if (Input.touchCount < 2)
            {
                if (Input.GetMouseButtonDown(0))
                {
                    _dragging = CameraRigMath.GroundUnderPixel(pose, fov, w, h, Input.mousePosition, out _anchor);
                }
                else if (Input.GetMouseButtonUp(0))
                {
                    _dragging = false;
                }

                if (_dragging && Input.GetMouseButton(0))
                {
                    Vector3 target;
                    if (CameraRigMath.TargetKeepingUnder(pose, fov, w, h, Input.mousePosition, _anchor, out target)
                        && (target - pose.Target).sqrMagnitude > 0f)
                    {
                        pose.Target = target;
                        changed = true;
                    }
                }
            }
            else
            {
                _dragging = false;
            }

            // Zoom about the pointer: every wheel event that reaches the Player, and pinch. The Shell takes
            // the unmodified wheel for Dig before it gets here (requirement 16.5), so what arrives is Ctrl,
            // Cmd or Shift with the wheel, and a trackpad pinch (the browser sends it as a wheel event with
            // Ctrl set, which the Player cannot read from the keys because the page keeps the keyboard).
            float wheel = Input.mouseScrollDelta.y;
            if (wheel != 0f && CameraInputMap.WheelEventsZoom)
            {
                changed |= ZoomAbout(ref pose, wheel, Input.mousePosition, w, h, fov);
            }

            if (Input.touchCount == 2)
            {
                Touch a = Input.GetTouch(0);
                Touch b = Input.GetTouch(1);
                float spread = Vector2.Distance(a.position, b.position);
                if (a.phase == TouchPhase.Began || b.phase == TouchPhase.Began)
                {
                    _lastPinch = spread;
                }
                else if (_lastPinch > 1f && spread > 1f)
                {
                    float notches = Mathf.Log(spread / _lastPinch) / Mathf.Log(1f / 0.85f);
                    _lastPinch = spread;
                    changed |= ZoomAbout(ref pose, notches, (a.position + b.position) * 0.5f, w, h, fov);
                }
            }

            // + and - zoom about the centre of the canvas, at about two notches a second.
            float keys = 0f;
            if (Input.GetKey(KeyCode.Equals) || Input.GetKey(KeyCode.Plus) || Input.GetKey(KeyCode.KeypadPlus)) keys += 1f;
            if (Input.GetKey(KeyCode.Minus) || Input.GetKey(KeyCode.KeypadMinus)) keys -= 1f;
            if (keys != 0f)
            {
                changed |= ZoomAbout(ref pose, keys * 2f * Time.unscaledDeltaTime, new Vector2(w * 0.5f, h * 0.5f), w, h, fov);
            }

            if (changed) Apply(CameraRigMath.ClampPose(pose, _minX, _minZ, _maxX, _maxZ));
        }

        private static bool ZoomAbout(ref CameraRigMath.Pose pose, float notches, Vector2 pixel, float w, float h, float fov)
        {
            if (notches == 0f) return false;
            Vector3 anchor;
            if (!CameraRigMath.GroundUnderPixel(pose, fov, w, h, pixel, out anchor)) return false;
            float lo, hi;
            CameraRigMath.DistanceLimits(pose.PitchDeg, out lo, out hi);
            pose.Distance = Mathf.Clamp(pose.Distance * CameraRigMath.ZoomFactor(notches), lo, hi);
            Vector3 target;
            if (CameraRigMath.TargetKeepingUnder(pose, fov, w, h, pixel, anchor, out target)) pose.Target = target;
            return true;
        }
    }
}
