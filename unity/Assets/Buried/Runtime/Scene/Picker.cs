using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// Finds the feature under a click. Gate version: one era layer (the one shown). The Lantern's
    /// lens-aware picking comes in task group 7.
    /// </summary>
    public sealed class Picker
    {
        /// <summary>A click is a pointer up within this many pixels of the pointer down.</summary>
        public const float ClickSlopPx = 4f;

        public bool TryPick(Camera camera, Vector2 screenPoint, EraLayer layer, out string featureId)
        {
            featureId = null;
            if (camera == null || layer == null) return false;
            float distance;
            return layer.Raycast(camera.ScreenPointToRay(screenPoint), out distance, out featureId);
        }
    }
}
