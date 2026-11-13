namespace Buried.Interop
{
    /// <summary>scene/setDrapeMode (bridge 0.5.0): lit display or the untouched scan, for one drape or all.</summary>
    [SchemaDef("sceneSetDrapeModePayload")]
    public sealed class SceneSetDrapeModePayload
    {
        public const string Lit = "lit";
        public const string Original = "original";

        public string mode;

        /// <summary>The drape to switch, or null for every drape.</summary>
        public string sourceId;
    }
}
