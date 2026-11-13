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
        private bool _userMoved;
        private bool _dragging;
        private Vector3 _anchor;
        private float _lastPinch;

        private CameraRigMath.Pose _defaultPose;
        private bool _flying;
        private CameraRigMath.Pose _flightFrom;
        private CameraRigMath.Pose _flightTo;
        private float _flightT;
        private float _flightDuration = 1f;

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
            _flying = false;
            _userMoved = false;
            _defaultPose = CameraRigMath.ClampPose(_pose, _minX, _minZ, _maxX, _maxZ);
            Apply(_defaultPose);
        }

        /// <summary>The pose scene/init set, which clearing a pinned lot flies back to.</summary>
        public CameraRigMath.Pose DefaultPose
        {
            get { return _defaultPose; }
        }

        /// <summary>True while an eased flight is under way.</summary>
        public bool IsFlying
        {
            get { return _flying; }
        }

        /// <summary>
        /// Flies the camera to <paramref name="target"/> over <paramref name="durationS"/> seconds with an
        /// ease in and out. A duration of 0 (or less) is a cut: reduced motion, and a test. The flight
        /// ends the moment the user moves the view (a drag, the wheel, a pinch, + or -), so the camera
        /// never moves against a hand on it. It is the only automatic camera movement (design.md "Motion").
        /// </summary>
        public void FlyTo(CameraRigMath.Pose target, float durationS)
        {
            target = CameraRigMath.ClampPose(target, _minX, _minZ, _maxX, _maxZ);
            _ready = true;
            _dragging = false;
            if (durationS <= 0f)
            {
                _flying = false;
                Apply(target);
                return;
            }
            _flightFrom = _pose;
            _flightTo = target;
            _flightDuration = durationS;
            _flightT = 0f;
            _flying = true;
        }

        /// <summary>debug/setCamera: the pose exactly, inside the limits of requirement 16.3.</summary>
        public void SetPose(float targetX, float targetZ, float distance, float pitchDeg, float headingDeg)
        {
            _ready = true;
            _flying = false;
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

        /// <summary>True once the visitor has moved the view (a drag, the wheel, a pinch, + or -). A pose the Player sets itself does not count.</summary>
        public bool HasBeenMoved
        {
            get { return _userMoved; }
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

            if (changed)
            {
                _flying = false; // the user moved the view: the flight stops where it is
                _userMoved = true;
                Apply(CameraRigMath.ClampPose(pose, _minX, _minZ, _maxX, _maxZ));
            }
            else if (_flying)
            {
                _flightT = Mathf.Min(1f, _flightT + Time.unscaledDeltaTime / _flightDuration);
                Apply(CameraRigMath.Lerp(_flightFrom, _flightTo, CameraRigMath.Ease(_flightT)));
                if (_flightT >= 1f) _flying = false;
            }
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
