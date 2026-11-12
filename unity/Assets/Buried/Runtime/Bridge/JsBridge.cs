#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif
using UnityEngine;

namespace Buried.Interop
{
    /// <summary>
    /// The Player-to-Shell channel: the .jslib function that calls window.buriedBridge.onMessage.
    /// The only DllImport("__Internal") in the runtime. In the editor and on other platforms it logs.
    /// </summary>
    internal static class JsBridge
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void BuriedBridge_Send(string json);

        public static void Send(string json)
        {
            BuriedBridge_Send(json);
        }
#else
        public static void Send(string json)
        {
            Debug.Log("[bridge to shell] " + json);
        }
#endif
    }
}
