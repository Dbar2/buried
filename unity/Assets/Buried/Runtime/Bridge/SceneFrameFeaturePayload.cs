namespace Buried.Interop
{
    /// <summary>scene/frameFeature (bridge 0.8.0): fly the camera so the feature is on screen.</summary>
    [SchemaDef("sceneFrameFeaturePayload")]
    public sealed class SceneFrameFeaturePayload
    {
        public string feature_id;
    }
}
