using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Buried.Walk
{
    /// <summary>
    /// The corner at night (spec 07 requirement 4): the placed model, the moon, a warm light at every lamp, the lantern in the
    /// hand, the fog, the wet road, the post-processing volume and one reflection probe. The editor's Still tool builds the same
    /// thing, so a Still is a picture of what the Player draws. <see cref="Dispose"/> puts the scene's settings back.
    /// </summary>
    public sealed class WalkWorld
    {
        /// <summary>The URP renderer the walk draws with (Forward+, so every lamp and the lantern light each pixel).</summary>
        public const int WalkRendererIndex = 1;
        /// <summary>A layer of its own for the lantern in the hand, so the lantern's light does not wash it out.</summary>
        public const int LanternLayer = 8;

        public GameObject Root;
        public GameObject Model;
        public WalkManifest Manifest;
        public Camera Camera;
        public Light Moon;
        public Light Lantern;
        public Transform LanternPivot;
        public readonly List<Light> Lamps = new List<Light>();
        public readonly Dictionary<string, Light> PlaqueGlows = new Dictionary<string, Light>();
        public bool ReducedMotion;

        private Transform _cameraParent;
        private float _oldNear;
        private float _oldFar;
        private bool _oldFog;
        private FogMode _oldFogMode;
        private Color _oldFogColor;
        private float _oldFogDensity;
        private AmbientMode _oldAmbientMode;
        private Color _oldAmbient;
        private CameraClearFlags _oldClear;
        private Color _oldBackground;
        private int _oldRenderer;
        private Light _oldSun;
        private LightShadows _oldSunShadows;

        public static WalkWorld Build(WalkAsset asset, Camera camera, bool reducedMotion)
        {
            if (asset == null || asset.model == null || asset.manifest == null)
            {
                throw new InvalidOperationException("the walk model is not in this Player; run Buried.Editor.Setup.Run");
            }
            var world = new WalkWorld { Camera = camera, ReducedMotion = reducedMotion };
            world.Manifest = WalkManifest.Parse(asset.manifest.text);
            world.Root = new GameObject("Walk");

            world.Model = UnityEngine.Object.Instantiate(asset.model, world.Root.transform);
            world.Model.name = "corner_1911";
            WalkPlacement.Place(world.Model, world.Manifest);
            WalkPlacement.AddColliders(world.Model);

            world.RememberScene();
            world.BuildNight();
            world.BuildLights();
            world.BuildLantern();
            world.MakeRoadWet();
            world.BuildVolume();
            world.BuildProbe();
            return world;
        }

        // ---- Scene settings ----

        private void RememberScene()
        {
            _oldFog = RenderSettings.fog;
            _oldFogMode = RenderSettings.fogMode;
            _oldFogColor = RenderSettings.fogColor;
            _oldFogDensity = RenderSettings.fogDensity;
            _oldAmbientMode = RenderSettings.ambientMode;
            _oldAmbient = RenderSettings.ambientLight;
            _oldSun = RenderSettings.sun;
            _oldClear = Camera.clearFlags;
            _oldBackground = Camera.backgroundColor;
            _cameraParent = Camera.transform.parent;
            UniversalAdditionalCameraData data = Camera.GetUniversalAdditionalCameraData();
            _oldRenderer = 0;
            if (_oldSun != null) _oldSunShadows = _oldSun.shadows;
            data.SetRenderer(WalkRendererIndex);
        }

        private void BuildNight()
        {
            // Deep blue-green fog and sky of one colour, so there is no horizon (requirement 4.1).
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = WalkSettings.FogColor;
            RenderSettings.fogDensity = WalkSettings.FogDensity;
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = WalkSettings.AmbientColor;
            Camera.clearFlags = CameraClearFlags.SolidColor;
            Camera.backgroundColor = WalkSettings.FogColor;
            // The Block camera looks from hundreds of metres and keeps a near plane of metres; the walk looks at a wall 0.3 m away.
            _oldNear = Camera.nearClipPlane;
            _oldFar = Camera.farClipPlane;
            Camera.nearClipPlane = WalkSettings.NearClipM;
            Camera.farClipPlane = WalkSettings.FarClipM;

            var moonObject = new GameObject("Moon");
            moonObject.transform.SetParent(Root.transform, false);
            moonObject.transform.rotation = Quaternion.Euler(WalkSettings.MoonPitchDeg, WalkSettings.MoonYawDeg, 0f);
            Moon = moonObject.AddComponent<Light>();
            Moon.type = LightType.Directional;
            Moon.color = WalkSettings.MoonColor;
            Moon.intensity = WalkSettings.MoonIntensity;
            Moon.shadows = LightShadows.Soft;
            Moon.shadowStrength = 0.85f;
            Moon.shadowBias = 0.05f;
            Moon.shadowNormalBias = 0.4f;
            RenderSettings.sun = Moon;
            if (_oldSun != null) _oldSun.shadows = LightShadows.None;
            if (GraphicsSettings.currentRenderPipeline is UniversalRenderPipelineAsset urp) urp.shadowDistance = WalkSettings.ShadowDistanceM;
        }

        private void BuildLights()
        {
            foreach (WalkManifest.Named lamp in Manifest.lamps)
            {
                var go = new GameObject(lamp.name + "_light");
                go.transform.SetParent(Root.transform, false);
                go.transform.position = lamp.pos + Vector3.down * 0.2f;
                Light light = go.AddComponent<Light>();
                light.type = LightType.Point;
                light.color = WalkSettings.LampColor;
                light.intensity = WalkSettings.LampIntensity;
                light.range = WalkSettings.LampRangeM;
                light.shadows = LightShadows.None;
                Lamps.Add(light);
            }

            // A plaque brightens when the visitor reads it (requirement 5.1): a small warm light in front of it, off until then.
            foreach (WalkManifest.Plaque plaque in Manifest.plaques)
            {
                var go = new GameObject("plaque_glow_" + plaque.slug);
                go.transform.SetParent(Root.transform, false);
                go.transform.position = plaque.pos + plaque.facing.normalized * 0.45f + Vector3.up * 0.25f;
                Light light = go.AddComponent<Light>();
                light.type = LightType.Point;
                light.color = WalkSettings.LanternColor;
                light.intensity = 0f;
                light.range = 2.2f;
                light.shadows = LightShadows.None;
                light.enabled = false;
                PlaqueGlows[plaque.slug] = light;
            }
        }

        public void SetPlaqueGlow(string slug)
        {
            foreach (KeyValuePair<string, Light> pair in PlaqueGlows)
            {
                bool on = pair.Key == slug;
                pair.Value.enabled = on;
                pair.Value.intensity = on ? 2.5f : 0f;
            }
        }

        private void BuildLantern()
        {
            var pivotObject = new GameObject("LanternPivot");
            LanternPivot = pivotObject.transform;
            LanternPivot.SetParent(Camera.transform, false);
            LanternPivot.localPosition = WalkSettings.LanternOffset;
            LanternPivot.localRotation = Quaternion.identity;

            Transform hand;
            if (WalkPlacement.Index(Model.transform).TryGetValue(WalkPlacement.HandLanternName, out hand))
            {
                // The lantern's vertices are modelled where the Blender object stood, not at its node origin, so its
                // middle is found first and the node is set so that the middle sits on the pivot (the brief's offset
                // is where the lantern hangs in the view).
                Bounds bounds = new Bounds(hand.position, Vector3.zero);
                bool any = false;
                foreach (Renderer r in hand.GetComponentsInChildren<Renderer>(true))
                {
                    if (!any) bounds = r.bounds;
                    else bounds.Encapsulate(r.bounds);
                    any = true;
                }
                Vector3 centreLocal = any ? hand.InverseTransformPoint(bounds.center) : Vector3.zero;
                hand.SetParent(LanternPivot, false);
                hand.localRotation = Quaternion.identity;
                hand.localScale = hand.localScale * WalkSettings.LanternScale;
                hand.localPosition = -centreLocal * WalkSettings.LanternScale;
                foreach (Renderer r in hand.GetComponentsInChildren<Renderer>(true))
                {
                    r.shadowCastingMode = ShadowCastingMode.Off;
                    r.receiveShadows = false;
                    r.gameObject.layer = LanternLayer; // the lantern's own light skips it, so the glass is not blown out
                    foreach (Material material in r.materials)
                    {
                        // Its glass and flame are emissive; at 0.6 m, with bloom, they wash out to white, so they are held down.
                        if (material.HasProperty("emissiveFactor")) material.SetColor("emissiveFactor", material.GetColor("emissiveFactor") * WalkSettings.LanternGlow);
                    }
                }
            }
            else
            {
                Debug.LogWarning("[walk] the model has no hand_lantern node; the light is drawn with no lantern.");
            }

            var lightObject = new GameObject("LanternLight");
            lightObject.transform.SetParent(LanternPivot, false);
            lightObject.transform.localPosition = new Vector3(0f, 0.06f, -0.12f);
            Lantern = lightObject.AddComponent<Light>();
            Lantern.type = LightType.Point;
            Lantern.color = WalkSettings.LanternColor;
            Lantern.intensity = WalkSettings.LanternIntensity;
            Lantern.range = WalkSettings.LanternRangeM;
            Lantern.shadows = LightShadows.None;
            Lantern.cullingMask = ~(1 << LanternLayer);
        }

        /// <summary>The road is wet: its roughness is capped, so the lamps and the lantern leave streaks on it (requirement 4.4).</summary>
        private void MakeRoadWet()
        {
            foreach (Transform node in Model.GetComponentsInChildren<Transform>(true))
            {
                string name = node.name.ToLowerInvariant();
                if (!name.StartsWith("ground_", StringComparison.Ordinal) || !name.Contains("road")) continue;
                foreach (Renderer r in node.GetComponentsInChildren<Renderer>(true))
                {
                    foreach (Material material in r.materials)
                    {
                        if (material.HasProperty("roughnessFactor"))
                        {
                            material.SetFloat("roughnessFactor", Mathf.Min(material.GetFloat("roughnessFactor"), WalkSettings.WetRoughness));
                        }
                        if (material.HasProperty("_Smoothness")) material.SetFloat("_Smoothness", 1f - WalkSettings.WetRoughness);
                    }
                }
            }
        }

        private void BuildVolume()
        {
            var go = new GameObject("Walk post-processing");
            go.transform.SetParent(Root.transform, false);
            Volume volume = go.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.priority = 10f;
            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            profile.name = "Walk post-processing";

            var tone = profile.Add<Tonemapping>(false);
            tone.active = true;
            tone.mode.Override(TonemappingMode.Neutral);

            var bloom = profile.Add<Bloom>(false);
            bloom.active = true;
            bloom.threshold.Override(WalkSettings.BloomThreshold);
            bloom.intensity.Override(WalkSettings.BloomIntensity);
            bloom.scatter.Override(WalkSettings.BloomScatter);

            var vignette = profile.Add<Vignette>(false);
            vignette.active = true;
            vignette.intensity.Override(WalkSettings.VignetteIntensity);
            vignette.smoothness.Override(WalkSettings.VignetteSmoothness);

            volume.sharedProfile = profile;
        }

        /// <summary>One reflection probe, rendered once after the model is placed (requirement 4.4). A platform that cannot do it keeps the ambient look.</summary>
        private void BuildProbe()
        {
            try
            {
                var go = new GameObject("Reflection probe");
                go.transform.SetParent(Root.transform, false);
                go.transform.position = Manifest.spawnPos + new Vector3(10f, 3f, 0f);
                ReflectionProbe probe = go.AddComponent<ReflectionProbe>();
                probe.mode = ReflectionProbeMode.Realtime;
                probe.refreshMode = ReflectionProbeRefreshMode.ViaScripting;
                probe.timeSlicingMode = ReflectionProbeTimeSlicingMode.NoTimeSlicing;
                probe.resolution = 128;
                probe.size = new Vector3(160f, 40f, 160f);
                probe.boxProjection = false;
                probe.intensity = 1f;
                probe.RenderProbe();
            }
            catch (Exception e)
            {
                Debug.LogWarning("[walk] the reflection probe was not rendered: " + e.Message);
            }
        }

        /// <summary>Puts every scene setting the walk changed back where it was and removes the corner.</summary>
        public void Dispose()
        {
            RenderSettings.fog = _oldFog;
            RenderSettings.fogMode = _oldFogMode;
            RenderSettings.fogColor = _oldFogColor;
            RenderSettings.fogDensity = _oldFogDensity;
            RenderSettings.ambientMode = _oldAmbientMode;
            RenderSettings.ambientLight = _oldAmbient;
            RenderSettings.sun = _oldSun;
            if (_oldSun != null) _oldSun.shadows = _oldSunShadows;
            if (Camera != null)
            {
                Camera.clearFlags = _oldClear;
                Camera.backgroundColor = _oldBackground;
                Camera.nearClipPlane = _oldNear;
                Camera.farClipPlane = _oldFar;
                Camera.transform.SetParent(_cameraParent, false);
                Camera.GetUniversalAdditionalCameraData().SetRenderer(_oldRenderer);
            }
            if (LanternPivot != null) DestroyObject(LanternPivot.gameObject);
            if (Root != null) DestroyObject(Root);
        }

        private static void DestroyObject(UnityEngine.Object o)
        {
            if (Application.isPlaying) UnityEngine.Object.Destroy(o);
            else UnityEngine.Object.DestroyImmediate(o);
        }
    }
}
