namespace Buried.Interop
{
    /// <summary>The "code" values of the error message (enum in the Bridge Schema).</summary>
    public static class BridgeErrorCodes
    {
        public const string InvalidMessage = "invalid_message";
        public const string UnknownType = "unknown_type";
        public const string BridgeVersionMismatch = "bridge_version_mismatch";
        public const string BoundsTooFar = "bounds_too_far";
        public const string EraNotInitialised = "era_not_initialised";
        public const string TextureLoadFailed = "texture_load_failed";
        public const string MeshBuildFailed = "mesh_build_failed";
        public const string DebugDisabled = "debug_disabled";

        public static readonly string[] All =
        {
            InvalidMessage, UnknownType, BridgeVersionMismatch, BoundsTooFar,
            EraNotInitialised, TextureLoadFailed, MeshBuildFailed, DebugDisabled,
        };
    }
}
