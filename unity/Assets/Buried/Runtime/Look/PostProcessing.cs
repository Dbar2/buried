using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Buried.Look
{
    /// <summary>
    /// The scene's one post-processing volume: bloom with threshold 1.0 and intensity 0.3, so that only
    /// emission above 1 (the ink edges) glows. Tone mapping stays None (there is no Tonemapping
    /// override), so every colour below 1, drapes included, reaches the screen unchanged. No other
    /// effect is ever added here (requirement 20.6).
    /// </summary>
    public static class PostProcessing
    {
        public static VolumeProfile CreateProfile()
        {
            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            profile.name = "Buried post-processing";
            var bloom = profile.Add<Bloom>(false);
            bloom.active = true;
            bloom.threshold.Override(LookSettings.BloomThreshold);
            bloom.intensity.Override(LookSettings.BloomIntensity);
            bloom.scatter.Override(LookSettings.BloomScatter);
            return profile;
        }

        /// <summary>Adds the global volume to <paramref name="parent"/> and switches post-processing on for the camera.</summary>
        public static Volume Install(Transform parent, Camera camera)
        {
            var go = new GameObject("Post-processing");
            go.transform.SetParent(parent, false);
            Volume volume = go.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.priority = 0f;
            volume.sharedProfile = CreateProfile();

            UniversalAdditionalCameraData data = camera.GetUniversalAdditionalCameraData();
            data.renderPostProcessing = true;
            data.antialiasing = AntialiasingMode.None;
            data.dithering = false;
            return volume;
        }
    }
}
