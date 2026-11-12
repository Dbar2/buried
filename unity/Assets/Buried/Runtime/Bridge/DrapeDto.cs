namespace Buried.Interop
{
    [SchemaDef("drape")]
    public sealed class DrapeDto
    {
        public string sourceId;
        public string url;
        public DrapeCornersDto corners;
        public int widthPx;
        public int heightPx;
    }
}
