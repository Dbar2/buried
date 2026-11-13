namespace Buried.Interop
{
    /// <summary>
    /// scene/setLantern (bridge 0.6.0): the lens on or off, its centre (normalised canvas coordinates), its
    /// radius (a fraction of the canvas height) and the era shown inside it.
    /// </summary>
    [SchemaDef("sceneSetLanternPayload")]
    public sealed class SceneSetLanternPayload
    {
        public bool on;
        public ScreenPointDto center;
        public double radius;
        public string eraId;
    }
}
