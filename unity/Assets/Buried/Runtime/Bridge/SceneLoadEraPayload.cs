using System.Collections.Generic;

namespace Buried.Interop
{
    [SchemaDef("sceneLoadEraPayload")]
    public sealed class SceneLoadEraPayload
    {
        public string eraId;
        public List<SceneFeatureDto> features;
        public List<DrapeDto> drapes;

        /// <summary>Bridge 0.8.0, optional (absent is false): the landing look, see the schema.</summary>
        public bool held;
    }
}
