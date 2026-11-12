using System.Collections.Generic;

namespace Buried.Interop
{
    /// <summary>
    /// A GeoJSON Polygon, MultiPolygon, LineString or MultiLineString in EPSG:26917 metres.
    /// The schema entry is a oneOf, so the reflection test does not compare fields for it.
    /// For polygons, <see cref="polygons"/> holds one entry per polygon, each a list of rings
    /// (exterior first), each ring a list of [easting, northing] positions; <see cref="lines"/> is null.
    /// For lines, <see cref="lines"/> holds one entry per line; <see cref="polygons"/> is null.
    /// </summary>
    [SchemaDef("geometry")]
    public sealed class GeometryDto
    {
        public const string Polygon = "Polygon";
        public const string MultiPolygon = "MultiPolygon";
        public const string LineString = "LineString";
        public const string MultiLineString = "MultiLineString";

        public string type;
        public List<List<List<double[]>>> polygons;
        public List<List<double[]>> lines;

        public bool IsPolygonal
        {
            get { return type == Polygon || type == MultiPolygon; }
        }
    }
}
