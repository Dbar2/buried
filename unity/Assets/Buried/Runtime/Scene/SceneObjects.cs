namespace Buried.Scene
{
    /// <summary>
    /// Destroys an engine object the right way for where the code runs: Destroy in the Player, and
    /// DestroyImmediate in the editor outside play mode (EditMode tests), where Destroy is an error.
    /// </summary>
    public static class SceneObjects
    {
        public static void Destroy(UnityEngine.Object obj)
        {
            if (obj == null) return;
            if (UnityEngine.Application.isPlaying) UnityEngine.Object.Destroy(obj);
            else UnityEngine.Object.DestroyImmediate(obj);
        }
    }
}
