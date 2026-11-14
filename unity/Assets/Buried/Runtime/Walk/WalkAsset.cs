using UnityEngine;

namespace Buried.Walk
{
    /// <summary>
    /// The walk's two inputs in one asset the Player can load without a Resources call: the corner model (a prefab of the
    /// imported glTF, placed and given its colliders by `Buried.Editor.WalkSetup`) and the manifest text. Written by
    /// `Buried.Editor.Setup`; referenced from `SceneBootstrap`.
    /// </summary>
    public sealed class WalkAsset : ScriptableObject
    {
        public GameObject model;
        public TextAsset manifest;
    }
}
