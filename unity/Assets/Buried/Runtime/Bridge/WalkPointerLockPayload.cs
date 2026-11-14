namespace Buried.Interop
{
    /// <summary>walk/pointerLock (bridge 0.9.0): whether the pointer is locked to the canvas.</summary>
    [SchemaDef("walkPointerLockPayload")]
    public sealed class WalkPointerLockPayload
    {
        public bool locked;
    }
}
