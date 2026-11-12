using System.Collections.Generic;

namespace Buried.Interop
{
    [SchemaDef("eraLoadedPayload")]
    public sealed class EraLoadedPayload
    {
        public string eraId;
        public int featureCount;
        public int drapeCount;
        public List<string> failedDrapes;
    }
}
