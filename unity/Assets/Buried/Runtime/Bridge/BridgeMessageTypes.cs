using System;

namespace Buried.Interop
{
    /// <summary>Message type strings, as in the Bridge Schema.</summary>
    public static class BridgeMessageTypes
    {
        // Shell to Player
        public const string SceneInit = "scene/init";
        public const string SceneLoadEra = "scene/loadEra";
        public const string SceneSetDepth = "scene/setDepth";
        public const string DebugMarkers = "debug/markers";
        public const string DebugSetCamera = "debug/setCamera";

        // Player to Shell
        public const string Ready = "ready";
        public const string EraLoaded = "eraLoaded";
        public const string FeatureClicked = "featureClicked";
        public const string CameraChanged = "cameraChanged";
        public const string Error = "error";

        public static readonly string[] ShellToPlayer = { SceneInit, SceneLoadEra, SceneSetDepth, DebugMarkers, DebugSetCamera };
        public static readonly string[] PlayerToShell = { Ready, EraLoaded, FeatureClicked, CameraChanged, Error };

        public static bool IsShellToPlayer(string type)
        {
            return Array.IndexOf(ShellToPlayer, type) >= 0;
        }

        public static bool IsKnown(string type)
        {
            return IsShellToPlayer(type) || Array.IndexOf(PlayerToShell, type) >= 0;
        }
    }
}
