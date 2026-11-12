namespace Buried.Interop
{
    [SchemaDef("errorPayload")]
    public sealed class ErrorPayload
    {
        public string code;
        public string message;

        /// <summary>The type of the message that caused the error, or null.</summary>
        public string messageType;
    }
}
