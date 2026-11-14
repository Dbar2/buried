using System.IO;
using Buried.Walk;
using UnityEditor;
using UnityEngine;

namespace Buried.Editor
{
    /// <summary>
    /// Records the walk test's corner (spec 07 requirement 1 and 2): the imported glTF, placed on the manifest and given its
    /// colliders, saved as a prefab, and the manifest text, both in one <see cref="WalkAsset"/> the Player loads. Called by
    /// <see cref="Setup.Run"/>. The glb is replaced while the model is being improved, so everything here is generated and
    /// nothing under `Assets/Buried/Walk/Generated/` is committed. With no glb in the project it says so and records nothing.
    /// </summary>
    public static class WalkSetup
    {
        public const string GlbPath = "Assets/Buried/Walk/corner_1911.glb";
        public const string ManifestPath = "Assets/Buried/Walk/corner_1911.json";
        public const string GeneratedFolder = "Assets/Buried/Walk/Generated";
        public const string PrefabPath = GeneratedFolder + "/corner_1911.prefab";
        public const string AssetPath = GeneratedFolder + "/WalkAsset.asset";

        public static WalkAsset Run()
        {
            AssetDatabase.ImportAsset(ManifestPath, ImportAssetOptions.ForceUpdate);
            AssetDatabase.ImportAsset(GlbPath, ImportAssetOptions.ForceUpdate);
            var glb = AssetDatabase.LoadAssetAtPath<GameObject>(GlbPath);
            var manifestText = AssetDatabase.LoadAssetAtPath<TextAsset>(ManifestPath);
            if (glb == null || manifestText == null)
            {
                Debug.LogWarning("[walk] " + GlbPath + " or " + ManifestPath + " is not in the project; the walk is not recorded.");
                return null;
            }

            WalkManifest manifest = WalkManifest.Parse(manifestText.text);
            Directory.CreateDirectory(Path.Combine(Path.GetFullPath(Path.Combine(Application.dataPath, "..")), GeneratedFolder));

            GameObject instance = Object.Instantiate(glb);
            try
            {
                float error = WalkPlacement.Place(instance, manifest);
                int colliders = WalkPlacement.AddColliders(instance);
                Debug.Log("[walk] placed the corner: worst marker error " + (error * 100f).ToString("F2") + " cm, " + colliders + " colliders added.");
                PrefabUtility.SaveAsPrefabAsset(instance, PrefabPath);
            }
            finally
            {
                Object.DestroyImmediate(instance);
            }

            var asset = AssetDatabase.LoadAssetAtPath<WalkAsset>(AssetPath);
            if (asset == null)
            {
                asset = ScriptableObject.CreateInstance<WalkAsset>();
                AssetDatabase.CreateAsset(asset, AssetPath);
            }
            asset.model = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
            asset.manifest = manifestText;
            EditorUtility.SetDirty(asset);
            AssetDatabase.SaveAssets();
            return asset;
        }

        /// <summary>The recorded asset, or null when Setup has not recorded one.</summary>
        public static WalkAsset Load()
        {
            return AssetDatabase.LoadAssetAtPath<WalkAsset>(AssetPath);
        }
    }
}
