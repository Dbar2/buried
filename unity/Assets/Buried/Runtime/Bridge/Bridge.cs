using System;
using UnityEngine;

namespace Buried.Interop
{
    /// <summary>
    /// The one GameObject in the Bootstrap scene. The Shell calls SendMessage("Bridge", "Receive", json).
    /// Every message is validated before anything acts on it; a malformed or unknown message is logged,
    /// dropped, and answered with an error message.
    /// </summary>
    public sealed class Bridge : MonoBehaviour
    {
        private const int MaxErrorMessageLength = 2000;

        /// <summary>Raised for each valid Shell-to-Player message.</summary>
        public event Action<ParsedMessage> MessageReceived;

        /// <summary>Called by the Shell through SendMessage. Do not call from anywhere else.</summary>
        public void Receive(string json)
        {
            ParsedMessage message;
            try
            {
                message = BridgeParser.Parse(json);
                if (!BridgeMessageTypes.IsShellToPlayer(message.type))
                {
                    throw new BridgeValidationException(
                        BridgeErrorCodes.UnknownType, "message.type: \"" + message.type + "\" is not a Shell-to-Player message");
                }
            }
            catch (BridgeValidationException e)
            {
                Debug.LogWarning("[bridge] dropped a message: " + e.Message);
                SendError(e.Code, e.Message, TryReadType(json));
                return;
            }

            var handler = MessageReceived;
            if (handler != null) handler(message);
        }

        /// <summary>Raised for each Player-to-Shell message just before it is sent (the type and its payload DTO). For tests and diagnostics.</summary>
        public event Action<string, object> Sent;

        public void Send(string type, object payload)
        {
            var handler = Sent;
            if (handler != null) handler(type, payload);
            JsBridge.Send(BridgeWriter.Write(type, payload));
        }

        public void SendError(string code, string message, string messageType)
        {
            if (message != null && message.Length > MaxErrorMessageLength)
            {
                message = message.Substring(0, MaxErrorMessageLength);
            }
            Debug.LogWarning("[bridge] error " + code + ": " + message);
            Send(BridgeMessageTypes.Error, new ErrorPayload { code = code, message = message ?? "", messageType = messageType });
        }

        /// <summary>Best effort: the "type" of a message that failed validation, for the error report.</summary>
        private static string TryReadType(string json)
        {
            try
            {
                var token = Newtonsoft.Json.Linq.JToken.Parse(json) as Newtonsoft.Json.Linq.JObject;
                var type = token == null ? null : token["type"];
                if (type != null && type.Type == Newtonsoft.Json.Linq.JTokenType.String)
                {
                    string s = (string)((Newtonsoft.Json.Linq.JValue)type).Value;
                    return s.Length <= 64 ? s : null;
                }
            }
            catch (Exception)
            {
                // Not JSON at all. There is no type to report.
            }
            return null;
        }
    }
}
