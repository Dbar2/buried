namespace Buried.Interop
{
    /// <summary>An envelope after validation: the type string and its payload DTO.</summary>
    public sealed class ParsedMessage
    {
        public readonly string type;
        public readonly object payload;

        public ParsedMessage(string type, object payload)
        {
            this.type = type;
            this.payload = payload;
        }
    }
}
