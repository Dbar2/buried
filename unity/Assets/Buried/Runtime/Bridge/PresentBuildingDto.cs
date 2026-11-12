namespace Buried.Interop
{
    [SchemaDef("presentBuilding")]
    public sealed class PresentBuildingDto
    {
        public string id;
        public GeometryDto geometry;
        public double heightM;
    }
}
