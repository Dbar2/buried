namespace Buried.Interop
{
    /// <summary>An axis-aligned rectangle in EPSG:26917 metres, with minE &lt; maxE and minN &lt; maxN.</summary>
    [SchemaDef("rect")]
    public sealed class RectDto
    {
        public double minE;
        public double minN;
        public double maxE;
        public double maxN;
    }
}
