using System.Collections.Generic;

namespace Buried.Interop
{
    [SchemaDef("debugMarkersPayload")]
    public sealed class DebugMarkersPayload
    {
        public List<MarkerEntry> markers;
    }
}
