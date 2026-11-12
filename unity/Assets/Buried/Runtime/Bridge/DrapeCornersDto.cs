namespace Buried.Interop
{
    /// <summary>The four corners of a drape, each [easting, northing] in EPSG:26917 metres.</summary>
    [SchemaDef("drapeCorners")]
    public sealed class DrapeCornersDto
    {
        public double[] topLeft;
        public double[] topRight;
        public double[] bottomRight;
        public double[] bottomLeft;
    }
}
