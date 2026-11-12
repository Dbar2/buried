using Buried.Look;
using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// The camera as a target point on the ground, a distance, a pitch and a heading. It changes only
    /// in response to user input on the view (drag to pan, + and - or Ctrl/Shift with the wheel to
    /// zoom). It never spins, orbits or drifts on its own, and a depth change never moves it.
    /// </summary>
    public sealed class CameraRig : MonoBehaviour
    {
        private Camera _camera;
        private bool _ready;
        private float _minX, _maxX, _minZ, _maxZ;
        private Vector3 _target;
        private float _distance;
        private float _pitchDeg = LookSettings.DefaultPitchDeg;
        private float _headingDeg;
        private bool _moved;
        private bool _dragging;
        private Vector3 _anchor;

        /// <summary>The ground point the camera looks at, in Unity world coordinates.</summary>
        public Vector3 Target
        {
            get { return _target; }
        }

        public Camera Camera
        {
            get { return _camera; }
        }

        public void Attach(Camera camera)
        {
            _camera = camera;
        }

        /// <summary>Sets the limits and the default pose: target at the bounds centre, looking north, fitting the bounds.</summary>
        public void SetDefaultPose(float minX, float minZ, float maxX, float maxZ)
        {
            _minX = minX;
            _maxX = maxX;
            _minZ = minZ;
            _maxZ = maxZ;
            _target = new Vector3((minX + maxX) * 0.5f, 0f, (minZ + maxZ) * 0.5f);
            _pitchDeg = LookSettings.DefaultPitchDeg;
            _headingDeg = 0f;

            float extent = Mathf.Max(maxX - minX, maxZ - minZ);
            _distance = (extent * 0.5f) / Mathf.Tan(LookSettings.CameraFovDeg * 0.5f * Mathf.Deg2Rad);
            ClampDistance();
            _ready = true;
            ApplyPose();
        }

        private void ClampDistance()
        {
            float sin = Mathf.Sin(_pitchDeg * Mathf.Deg2Rad);
            _distance = Mathf.Clamp(
                _distance, LookSettings.MinCameraHeightM / sin, LookSettings.MaxCameraHeightM / sin);
        }

        private void ApplyPose()
        {
            _target.x = Mathf.Clamp(_target.x, _minX, _maxX);
            _target.z = Mathf.Clamp(_target.z, _minZ, _maxZ);
            Quaternion rotation = Quaternion.Euler(_pitchDeg, _headingDeg, 0f);
            _camera.transform.rotation = rotation;
            _camera.transform.position = _target - rotation * Vector3.forward * _distance;
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

            bool changed = false;

            if (Input.GetMouseButtonDown(0))
            {
                _dragging = TryGround(Input.mousePosition, out _anchor);
            }
            else if (Input.GetMouseButtonUp(0))
            {
                _dragging = false;
            }

            if (_dragging && Input.GetMouseButton(0))
            {
                Vector3 now;
                if (TryGround(Input.mousePosition, out now))
                {
                    Vector3 delta = _anchor - now;
                    delta.y = 0f;
                    if (delta.sqrMagnitude > 0f)
                    {
                        _target += delta;
                        changed = true;
                    }
                }
            }

            float zoom = 0f;
            if (Input.GetKey(KeyCode.Equals) || Input.GetKey(KeyCode.Plus) || Input.GetKey(KeyCode.KeypadPlus)) zoom -= 1f;
            if (Input.GetKey(KeyCode.Minus) || Input.GetKey(KeyCode.KeypadMinus)) zoom += 1f;
            if (zoom != 0f)
            {
                _distance *= Mathf.Pow(1.8f, zoom * Time.unscaledDeltaTime);
                changed = true;
            }

            bool modifier = Input.GetKey(KeyCode.LeftControl) || Input.GetKey(KeyCode.RightControl)
                            || Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift);
            float wheel = Input.mouseScrollDelta.y;
            if (modifier && wheel != 0f)
            {
                _distance *= Mathf.Pow(0.9f, wheel);
                changed = true;
            }

            if (changed)
            {
                ClampDistance();
                ApplyPose();
                _moved = true;
            }
        }

        private bool TryGround(Vector2 screen, out Vector3 point)
        {
            Ray ray = _camera.ScreenPointToRay(screen);
            if (Mathf.Abs(ray.direction.y) < 1e-6f)
            {
                point = Vector3.zero;
                return false;
            }
            float t = -ray.origin.y / ray.direction.y;
            if (t <= 0f)
            {
                point = Vector3.zero;
                return false;
            }
            point = ray.origin + ray.direction * t;
            return true;
        }
    }
}
