namespace Buried.Interop
{
    /// <summary>scene/raise (bridge 0.8.0): raise the past of one era, staggered from the first feature.</summary>
    [SchemaDef("sceneRaisePayload")]
    public sealed class SceneRaisePayload
    {
        public string era_id;
        public string first_feature_id;
        public bool animate;
    }
}
