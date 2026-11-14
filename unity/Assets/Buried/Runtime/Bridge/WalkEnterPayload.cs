namespace Buried.Interop
{
    /// <summary>walk/enter (bridge 0.9.0, the walk test): enter the walk. With reduced_motion there is no head bob, no sway and no flicker.</summary>
    [SchemaDef("walkEnterPayload")]
    public sealed class WalkEnterPayload
    {
        public bool reduced_motion;
    }
}
