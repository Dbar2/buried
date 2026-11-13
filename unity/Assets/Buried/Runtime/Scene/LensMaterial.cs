using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// Sets how a material meets the Lantern's lens. The mode (0 everywhere, 1 only inside, 2 only outside) is the
    /// shader's _LensMode, and the clip itself is compiled into the _BURIED_LENS variant only: a material that is
    /// drawn everywhere uses the variant with no discard (see BuriedCommon.hlsl for why).
    /// </summary>
    public static class LensMaterial
    {
        public const string Keyword = "_BURIED_LENS";

        public static void SetMode(Material material, int mode)
        {
            if (material == null) return;
            material.SetFloat("_LensMode", mode);
            if (mode > 0) material.EnableKeyword(Keyword);
            else material.DisableKeyword(Keyword);
        }
    }
}
