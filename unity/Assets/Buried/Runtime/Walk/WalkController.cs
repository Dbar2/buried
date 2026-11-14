using System;
using System.Collections.Generic;
using UnityEngine;

namespace Buried.Walk
{
    /// <summary>
    /// The first-person visitor (spec 07 requirement 3): a capsule of radius 0.3 m on a <see cref="CharacterController"/> with a
    /// 0.3 m step, an eye at 1.62 m, gravity and no jump. W A S D and the arrow keys move, Shift runs, the mouse looks under
    /// pointer lock. Unlocked, or while an exhibit is open, nothing moves. The visitor never leaves the manifest's
    /// `walk_bounds` (the arithmetic is <see cref="WalkMath.KeepInside"/>). The camera is a child, with a slight bob and the
    /// lantern sways; both stop under reduced motion.
    /// </summary>
    public sealed class WalkController : MonoBehaviour
    {
        private WalkWorld _world;
        private CharacterController _body;
        private Camera _camera;
        private readonly List<WalkMath.PlaqueTarget> _plaques = new List<WalkMath.PlaqueTarget>();

        private float _yaw;
        private float _pitch;
        private float _verticalSpeed;
        private float _bobPhase;
        private float _bobAmount;
        private float _lastSpeed;
        private bool _wasLocked;
        private string _nearPlaque;

        /// <summary>True while an exhibit is open: the pointer is free and nothing moves.</summary>
        public bool Frozen;
        public bool Active { get; private set; }

        /// <summary>The pointer lock changed.</summary>
        public event Action<bool> LockChanged;
        /// <summary>The plaque the visitor is near and looking at changed (null for none).</summary>
        public event Action<string> NearPlaqueChanged;
        /// <summary>The visitor opened a plaque.</summary>
        public event Action<string> ExhibitRequested;

        public float YawDeg
        {
            get { return WalkMath.WrapYaw(_yaw); }
        }

        public Vector3 Feet
        {
            get { return transform.position; }
        }

        public Vector3 Eye
        {
            get { return _camera.transform.position; }
        }

        public bool Moving
        {
            get { return _lastSpeed > 0.1f; }
        }

        public void Begin(WalkWorld world)
        {
            _world = world;
            _camera = world.Camera;
            gameObject.layer = 0;

            _body = gameObject.GetComponent<CharacterController>();
            if (_body == null) _body = gameObject.AddComponent<CharacterController>();
            _body.radius = WalkSettings.CapsuleRadiusM;
            _body.height = WalkSettings.CapsuleHeightM;
            _body.center = new Vector3(0f, WalkSettings.CapsuleHeightM * 0.5f, 0f);
            _body.stepOffset = WalkSettings.StepHeightM;
            _body.slopeLimit = 45f;
            _body.skinWidth = 0.03f;
            _body.minMoveDistance = 0f;

            _plaques.Clear();
            foreach (WalkManifest.Plaque p in world.Manifest.plaques)
            {
                _plaques.Add(new WalkMath.PlaqueTarget { Slug = p.slug, Position = p.pos });
            }

            _camera.transform.SetParent(transform, false);
            _camera.transform.localPosition = new Vector3(0f, WalkSettings.EyeHeightM, 0f);
            _camera.transform.localRotation = Quaternion.identity;

            Vector3 spawn = world.Manifest.spawnPos;
            Vector3 look = world.Manifest.spawnLookAt - (spawn + Vector3.up * WalkSettings.EyeHeightM);
            float yaw = Mathf.Atan2(look.x, look.z) * Mathf.Rad2Deg;
            float pitch = -Mathf.Atan2(look.y, new Vector2(look.x, look.z).magnitude) * Mathf.Rad2Deg;
            PlaceAt(spawn.x, spawn.z, yaw, pitch);

            Active = true;
            Frozen = false;
            _wasLocked = false;
            _nearPlaque = null;
        }

        public void End()
        {
            Active = false;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }

        /// <summary>Puts the visitor at east, north (project-local metres) facing <paramref name="yawDeg"/>; a point outside the bounds goes to the nearest point inside.</summary>
        public void PlaceAt(float east, float north, float yawDeg, float pitchDeg = 0f)
        {
            Vector2 p = WalkMath.Clamp(_world.Manifest.walkBounds, new Vector2(east, north));
            float ground = GroundHeight(p.x, p.y, _world.Manifest.spawnPos.y);
            _body.enabled = false;
            transform.position = new Vector3(p.x, ground + 0.02f, p.y);
            _body.enabled = true;
            _yaw = yawDeg;
            _pitch = WalkMath.ClampPitch(pitchDeg);
            _verticalSpeed = 0f;
            ApplyLook();
            Physics.SyncTransforms();
        }

        private static float GroundHeight(float east, float north, float fallback)
        {
            RaycastHit hit;
            if (Physics.Raycast(new Vector3(east, fallback + 12f, north), Vector3.down, out hit, 40f)) return hit.point.y;
            return fallback;
        }

        private void ApplyLook()
        {
            transform.rotation = Quaternion.Euler(0f, _yaw, 0f);
            _camera.transform.localRotation = Quaternion.Euler(_pitch, 0f, 0f);
        }

        private void Update()
        {
            if (!Active) return;

            bool locked = Cursor.lockState == CursorLockMode.Locked;
            if (locked != _wasLocked)
            {
                bool wasLocked = _wasLocked;
                _wasLocked = locked;
                var handler = LockChanged;
                if (handler != null) handler(locked);
                if (!wasLocked) return; // the click that locked the pointer is not a click on a plaque
            }
            if (!locked || Frozen)
            {
                _lastSpeed = 0f;
                UpdateLantern(0f);
                return;
            }

            Look();
            Walk(Time.deltaTime);
            UpdatePlaque();
        }

        private void Look()
        {
            float dx = Mathf.Clamp(Input.GetAxisRaw("Mouse X"), -WalkSettings.MaxLookStepPx, WalkSettings.MaxLookStepPx);
            float dy = Mathf.Clamp(Input.GetAxisRaw("Mouse Y"), -WalkSettings.MaxLookStepPx, WalkSettings.MaxLookStepPx);
            _yaw = WalkMath.WrapYaw(_yaw + dx * WalkSettings.LookDegPerPx);
            _pitch = WalkMath.ClampPitch(_pitch - dy * WalkSettings.LookDegPerPx);
            ApplyLook();
        }

        private static float Axis(KeyCode positive, KeyCode positiveAlt, KeyCode negative, KeyCode negativeAlt)
        {
            float v = 0f;
            if (Input.GetKey(positive) || Input.GetKey(positiveAlt)) v += 1f;
            if (Input.GetKey(negative) || Input.GetKey(negativeAlt)) v -= 1f;
            return v;
        }

        private void Walk(float dt)
        {
            var input = new Vector2(
                Axis(KeyCode.D, KeyCode.RightArrow, KeyCode.A, KeyCode.LeftArrow),
                Axis(KeyCode.W, KeyCode.UpArrow, KeyCode.S, KeyCode.DownArrow));
            bool run = Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift);
            Vector2 velocity = WalkMath.Velocity(input, _yaw, run);

            _verticalSpeed = _body.isGrounded ? -2f : _verticalSpeed + WalkSettings.GravityMs2 * dt;
            Vector3 before = transform.position;
            _body.Move(new Vector3(velocity.x, _verticalSpeed, velocity.y) * dt);

            Vector3 after = transform.position;
            Vector2 from = new Vector2(before.x, before.z);
            Vector2 to = new Vector2(after.x, after.z);
            Vector2 kept = WalkMath.KeepInside(_world.Manifest.walkBounds, from, to);
            if ((kept - to).sqrMagnitude > 0f)
            {
                _body.enabled = false;
                transform.position = new Vector3(kept.x, after.y, kept.y);
                _body.enabled = true;
            }

            float moved = new Vector2(transform.position.x - before.x, transform.position.z - before.z).magnitude;
            _lastSpeed = dt > 0f ? moved / dt : 0f;
            UpdateBob(moved, dt);
            UpdateLantern(dt);
        }

        private void UpdateBob(float moved, float dt)
        {
            if (_world.ReducedMotion)
            {
                _camera.transform.localPosition = new Vector3(0f, WalkSettings.EyeHeightM, 0f);
                return;
            }
            _bobPhase += moved * WalkSettings.BobStepsPerMetre * Mathf.PI * 2f;
            float target = Moving ? 1f : 0f;
            _bobAmount = Mathf.MoveTowards(_bobAmount, target, dt * 6f);
            float y = Mathf.Sin(_bobPhase) * WalkSettings.BobAmplitudeM * _bobAmount;
            float x = Mathf.Sin(_bobPhase * 0.5f) * WalkSettings.BobAmplitudeM * 0.5f * _bobAmount;
            _camera.transform.localPosition = new Vector3(x, WalkSettings.EyeHeightM + y, 0f);
        }

        /// <summary>The lantern sways a little as you walk and its light flickers slightly; under reduced motion it does neither.</summary>
        private void UpdateLantern(float dt)
        {
            if (_world.LanternPivot == null) return;
            if (_world.ReducedMotion)
            {
                _world.LanternPivot.localRotation = Quaternion.identity;
                _world.Lantern.intensity = WalkSettings.LanternIntensity;
                return;
            }
            float t = Time.time;
            float walking = _bobAmount;
            float roll = Mathf.Sin(_bobPhase * 0.5f) * WalkSettings.LanternSwayDeg * walking + Mathf.Sin(t * 1.3f) * 0.6f;
            float pitch = Mathf.Sin(_bobPhase) * WalkSettings.LanternSwayDeg * 0.5f * walking + Mathf.Sin(t * 0.9f + 1f) * 0.4f;
            _world.LanternPivot.localRotation = Quaternion.Euler(pitch, 0f, roll);
            float flicker = (Mathf.PerlinNoise(t * 7f, 0.31f) - 0.5f) * 2f * WalkSettings.LanternFlicker;
            _world.Lantern.intensity = WalkSettings.LanternIntensity * (1f + flicker);
        }

        private void UpdatePlaque()
        {
            string near = WalkMath.NearestPlaque(
                Eye, _camera.transform.forward, _plaques, WalkSettings.PlaqueRangeM, WalkSettings.PlaqueConeDeg);
            if (near != _nearPlaque)
            {
                _nearPlaque = near;
                _world.SetPlaqueGlow(near);
                var handler = NearPlaqueChanged;
                if (handler != null) handler(near);
            }
            if (near != null && (Input.GetKeyDown(KeyCode.E) || Input.GetMouseButtonDown(0)))
            {
                var handler = ExhibitRequested;
                if (handler != null) handler(near);
            }
        }

        /// <summary>The Shell closed the panel: the plaque prompt is asked afresh.</summary>
        public void ForgetPlaque()
        {
            _nearPlaque = null;
        }
    }
}
