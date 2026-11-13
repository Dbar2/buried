namespace Buried.Interop
{
    /// <summary>scene/focusLot (bridge 0.5.0): the pinned lot, a Polygon or MultiPolygon in EPSG:26917 metres.</summary>
    [SchemaDef("sceneFocusLotPayload")]
    public sealed class SceneFocusLotPayload
    {
        public GeometryDto lot;
    }
}
