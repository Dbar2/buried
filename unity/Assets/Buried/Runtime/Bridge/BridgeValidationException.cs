using System;

namespace Buried.Interop
{
    /// <summary>A bridge message was malformed. Carries the error code to report to the Shell.</summary>
    public sealed class BridgeValidationException : Exception
    {
        public string Code { get; }

        public BridgeValidationException(string message)
            : this(BridgeErrorCodes.InvalidMessage, message)
        {
        }

        public BridgeValidationException(string code, string message)
            : base(message)
        {
            Code = code;
        }
    }
}
