using System.Collections.Generic;

namespace Buried.Interop
{
    [SchemaDef("sceneInitPayload")]
    public sealed class SceneInitPayload
    {
        public string bridgeVersion;
        public OriginPoint origin;
        public SceneBounds bounds;
        public List<EraRef> eras;
        public List<PresentBuildingDto> present;
        public bool reducedMotion;
        public bool debug;
    }
}
