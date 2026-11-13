using System.Collections.Generic;

namespace Buried.Interop
{
    /// <summary>scene/setAnchors (bridge 0.8.0): the features whose screen anchors the Shell wants, in find order.</summary>
    [SchemaDef("sceneSetAnchorsPayload")]
    public sealed class SceneSetAnchorsPayload
    {
        public List<string> feature_ids;
    }
}
