using System.Collections.Generic;

namespace Buried.Interop
{
    [SchemaDef("sceneLoadEraPayload")]
    public sealed class SceneLoadEraPayload
    {
        public string eraId;
        public List<SceneFeatureDto> features;
        public List<DrapeDto> drapes;
    }
}
