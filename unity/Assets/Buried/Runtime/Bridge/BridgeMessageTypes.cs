using System;

namespace Buried.Interop
{
    /// <summary>Message type strings, as in the Bridge Schema.</summary>
    public static class BridgeMessageTypes
    {
        // Shell to Player
        public const string SceneInit = "scene/init";
        public const string SceneLoadEra = "scene/loadEra";
        public const string SceneAddFeatures = "scene/addFeatures";
        public const string SceneSetDepth = "scene/setDepth";
        public const string SceneFocusLot = "scene/focusLot";
        public const string SceneClearLot = "scene/clearLot";
        public const string SceneSetDrapeMode = "scene/setDrapeMode";
        public const string SceneSetLantern = "scene/setLantern";
        public const string SceneShowEvidence = "scene/showEvidence";
        public const string SceneSetAnchors = "scene/setAnchors";
        public const string SceneRaise = "scene/raise";
        public const string SceneFrameFeature = "scene/frameFeature";
        public const string SceneSelectFeature = "scene/selectFeature";
        public const string DebugMarkers = "debug/markers";
        public const string DebugSetCamera = "debug/setCamera";
        public const string WalkEnter = "walk/enter";
        public const string WalkResume = "walk/resume";
        public const string WalkExit = "walk/exit";
        public const string WalkTeleport = "walk/teleport";

        // Player to Shell
        public const string Ready = "ready";
        public const string EraLoaded = "eraLoaded";
        public const string SceneAnchors = "scene/anchors";
        public const string SceneRaised = "scene/raised";
        public const string FeatureClicked = "featureClicked";
        public const string CameraChanged = "cameraChanged";
        public const string Error = "error";
        public const string WalkReady = "walk/ready";
        public const string WalkState = "walk/state";
        public const string WalkNearPlaque = "walk/nearPlaque";
        public const string WalkExhibit = "walk/exhibit";
        public const string WalkPointerLock = "walk/pointerLock";

        public static readonly string[] ShellToPlayer =
        {
            SceneInit, SceneLoadEra, SceneAddFeatures, SceneSetDepth, SceneFocusLot, SceneClearLot, SceneSetDrapeMode, SceneSetLantern,
            SceneShowEvidence, SceneSetAnchors, SceneRaise, SceneFrameFeature, SceneSelectFeature, DebugMarkers, DebugSetCamera,
            WalkEnter, WalkResume, WalkExit, WalkTeleport,
        };
        public static readonly string[] PlayerToShell =
        {
            Ready, EraLoaded, SceneAnchors, SceneRaised, FeatureClicked, CameraChanged, Error,
            WalkReady, WalkState, WalkNearPlaque, WalkExhibit, WalkPointerLock,
        };

        /// <summary>The walk test's messages (bridge 0.9.0). The Block scene's controller ignores them; the walk mode handles them.</summary>
        public static bool IsWalk(string type)
        {
            return type != null && type.StartsWith("walk/", StringComparison.Ordinal);
        }

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
