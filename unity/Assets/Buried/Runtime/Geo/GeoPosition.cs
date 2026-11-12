namespace Buried.Geo
{
    /// <summary>An EPSG:26917 position in metres: easting, northing, and height above the ground plane.</summary>
    public readonly struct GeoPosition
    {
        public readonly double Easting;
        public readonly double Northing;
        public readonly double HeightM;

        public GeoPosition(double easting, double northing, double heightM)
        {
            Easting = easting;
            Northing = northing;
            HeightM = heightM;
        }
    }
}
