namespace Buried.Interop
{
    /// <summary>One feature's anchor on the canvas, in CSS pixels from the top left (bridge 0.8.0).</summary>
    [SchemaDef("anchorEntry")]
    public sealed class AnchorEntry
    {
        public string feature_id;
        public double x;
        public double y;
        public bool on_screen;
    }
}
