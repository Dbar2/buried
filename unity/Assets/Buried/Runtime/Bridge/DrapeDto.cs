namespace Buried.Interop
{
    [SchemaDef("drape")]
    public sealed class DrapeDto
    {
        public const string KindPlate = "plate";
        public const string KindAerial = "aerial";

        public string sourceId;
        public string url;
        public DrapeCornersDto corners;
        public int widthPx;
        public int heightPx;
        /// <summary>The plate's map area as a closed Polygon (bridge 0.3.0), or null: the four corners then bound the drape.</summary>
        public GeometryDto clip;
        /// <summary>plate or aerial (bridge 0.5.0), or null for a plate.</summary>
        public string kind;
    }
}
