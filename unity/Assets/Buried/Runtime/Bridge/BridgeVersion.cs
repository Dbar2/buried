namespace Buried.Interop
{
    /// <summary>
    /// The bridge version this Player speaks. An EditMode test reads data/schema/bridge.schema.json
    /// and fails if this differs from the "const" of bridgeVersion there.
    /// </summary>
    public static class BridgeVersion
    {
        public const string Value = "0.7.0";
    }
}
