namespace Buried.Interop
{
    /// <summary>
    /// scene/showEvidence (bridge 0.6.0): one ghost nearly transparent with the source's untouched scan beneath
    /// it (on), or the lit sheet restored (off). The drape is present when on is true and null when it is false.
    /// </summary>
    [SchemaDef("sceneShowEvidencePayload")]
    public sealed class SceneShowEvidencePayload
    {
        public string featureId;
        public bool on;
        public DrapeDto drape;
    }
}
