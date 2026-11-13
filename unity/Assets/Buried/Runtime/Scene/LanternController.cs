using Buried.Interop;
using Buried.Look;
using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// The state of the Lantern: what the Shell last asked for and how far the lens has opened. The lens opens and
    /// closes over <see cref="LookSettings.LensOpenS"/>, except under reduced motion, where it is there or it is not.
    /// Nothing here draws; SceneController turns the state into shader values and layer modes.
    /// </summary>
    public sealed class LanternController
    {
        private float _t; // 0 shut, 1 open: the linear progress that Openness eases

        /// <summary>The Shell's last scene/setLantern said on.</summary>
        public bool Requested { get; private set; }

        public ScreenPointDto Centre { get; private set; }
        public double Radius { get; private set; }
        public string EraId { get; private set; }

        /// <summary>True while the lens is wanted or still closing: layers keep their lens modes.</summary>
        public bool Active
        {
            get { return Requested || _t > 0f; }
        }

        /// <summary>The ease of the lens's opening, 0 to 1. The lens is drawn at this share of its radius.</summary>
        public float Open { get; private set; }

        public void Set(SceneSetLanternPayload payload, bool reducedMotion)
        {
            Requested = payload.on;
            Centre = payload.center;
            Radius = payload.radius;
            EraId = payload.eraId;
            if (reducedMotion) _t = payload.on ? 1f : 0f;
            Open = LanternMask.Openness(_t, reducedMotion);
        }

        /// <summary>Moves the lens toward open or shut. Call once a frame while <see cref="Active"/>.</summary>
        public void Tick(float deltaSeconds, bool reducedMotion)
        {
            float step = deltaSeconds / LookSettings.LensOpenS;
            _t = Mathf.Clamp01(_t + (Requested ? step : -step));
            Open = LanternMask.Openness(_t, reducedMotion);
        }

        /// <summary>Shuts the lens at once, with no easing and nothing asked for (the depth left Today).</summary>
        public void Reset()
        {
            Requested = false;
            _t = 0f;
            Open = 0f;
        }
    }
}
