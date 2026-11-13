namespace Buried.Interop
{
    /// <summary>scene/selectFeature (bridge 0.8.0): the selected feature, or null to clear the selection.</summary>
    [SchemaDef("sceneSelectFeaturePayload")]
    public sealed class SceneSelectFeaturePayload
    {
        public string feature_id;
    }
}
