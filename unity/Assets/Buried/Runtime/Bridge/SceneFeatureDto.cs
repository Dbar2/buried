namespace Buried.Interop
{
    [SchemaDef("sceneFeature")]
    public sealed class SceneFeatureDto
    {
        public const string KindBuilding = "building";
        public const string KindWater = "water";
        /// <summary>A land-use area (bridge 0.7.0): polygon geometry, drawn flat on the ground.</summary>
        public const string KindLandUse = "land_use";

        public string id;
        public string kind;
        public GeometryDto geometry;
        public string confidence;
        public double heightM;

        /// <summary>The recorded storey count (bridge 0.5.0), or 0 when none is recorded: the schema's minimum is 1.</summary>
        public int storeys;
    }
}
