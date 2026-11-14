namespace Buried.Interop
{
    /// <summary>walk/teleport (bridge 0.9.0, tests only): east and north in project-local metres, yaw_deg clockwise from north.</summary>
    [SchemaDef("walkTeleportPayload")]
    public sealed class WalkTeleportPayload
    {
        public double east;
        public double north;
        public double yaw_deg;
    }
}
