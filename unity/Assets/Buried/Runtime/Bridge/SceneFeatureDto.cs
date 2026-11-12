namespace Buried.Interop
{
    [SchemaDef("sceneFeature")]
    public sealed class SceneFeatureDto
    {
        public const string KindBuilding = "building";
        public const string KindWater = "water";

        public string id;
        public string kind;
        public GeometryDto geometry;
        public string confidence;
        public double heightM;
    }
}
