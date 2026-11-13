using System.Collections.Generic;

namespace Buried.Interop
{
    [SchemaDef("sceneAddFeaturesPayload")]
    public sealed class SceneAddFeaturesPayload
    {
        public string eraId;
        public List<SceneFeatureDto> features;
    }
}
