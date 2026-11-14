namespace Buried.Interop
{
    /// <summary>walk/nearPlaque (bridge 0.9.0): the slug of the plaque in reach and in view, or null.</summary>
    [SchemaDef("walkNearPlaquePayload")]
    public sealed class WalkNearPlaquePayload
    {
        public string slug;
    }
}
