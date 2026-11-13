namespace Buried.Interop
{
    /// <summary>A point on the canvas, normalised: x from the left edge, y from the top edge, each 0 to 1.</summary>
    [SchemaDef("screenPoint")]
    public sealed class ScreenPointDto
    {
        public double x;
        public double y;
    }
}
