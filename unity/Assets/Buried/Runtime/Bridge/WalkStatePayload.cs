namespace Buried.Interop
{
    /// <summary>walk/state (bridge 0.9.0): where the visitor stands (project-local metres) and which way they face (degrees clockwise from north).</summary>
    [SchemaDef("walkStatePayload")]
    public sealed class WalkStatePayload
    {
        public double east;
        public double north;
        public double yaw_deg;
    }
}
