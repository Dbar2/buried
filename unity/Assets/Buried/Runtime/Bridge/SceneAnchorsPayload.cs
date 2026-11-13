using System.Collections.Generic;

namespace Buried.Interop
{
    /// <summary>scene/anchors (bridge 0.8.0): the canvas size in CSS pixels and one anchor for each requested feature.</summary>
    [SchemaDef("sceneAnchorsPayload")]
    public sealed class SceneAnchorsPayload
    {
        public double width;
        public double height;
        public List<AnchorEntry> anchors;
    }
}
