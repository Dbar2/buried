using Buried.Look;
using UnityEngine;
using UnityEngine.Rendering;

namespace Buried.Scene
{
    /// <summary>
    /// The materials of the three confidence classes (design.md "Confidence encoding"). The classes
    /// differ by pattern as well as by value, so they stay apart in a greyscale screenshot:
    /// <list type="bullet">
    /// <item><b>documented</b>: a solid `ink` outline and the full fill;</item>
    /// <item><b>estimated</b>: a dashed `ink` outline and a lighter fill;</item>
    /// <item><b>unknown</b>: no outline, and a soft volume that thins toward its roof and its silhouette.</item>
    /// </list>
    /// Each era copies these, so an era's weight can change without touching another era's.
    /// </summary>
    public sealed class GhostMaterials
    {
        public const string Documented = "documented";
        public const string Estimated = "estimated";
        public const string Unknown = "unknown";

        public static readonly string[] Classes = { Documented, Estimated, Unknown };

        private readonly Material _documentedFill;
        private readonly Material _documentedEdge;
        private readonly Material _estimatedFill;
        private readonly Material _estimatedEdge;
        private readonly Material _unknownFill;

        public GhostMaterials(BuriedPalette palette, ShaderSet shaders, float pixelScale)
        {
            Color ink = palette.ink;

            // Documented: `ink` with a little self-illumination, thin `ink` edges with emission above 1.
            _documentedFill = Fill("Ghost fill", shaders.ghost, ink, LookSettings.GhostFillAlpha);
            _documentedEdge = Edge("Ghost edge", shaders.edge, palette, pixelScale);

            // Estimated: the same line, dashed, over a lighter fill.
            _estimatedFill = Fill("Ghost fill (estimated)", shaders.ghost, ink, LookSettings.EstimatedFillAlpha);
            _estimatedEdge = Edge("Ghost edge (estimated)", shaders.edge, palette, pixelScale);
            _estimatedEdge.SetFloat("_DashPeriod", LookSettings.DashPeriodM);
            _estimatedEdge.SetFloat("_DashPeriodPx", LookSettings.DashPeriodCssPx);
            _estimatedEdge.SetFloat("_DashOn", LookSettings.DashOnFraction);

            // Unknown: a fog volume. No edge material: an unknown ghost is drawn without an outline.
            _unknownFill = Fill("Ghost fill (unknown)", shaders.ghost, ink, LookSettings.UnknownFillAlpha);
            _unknownFill.SetFloat("_Shade", 0.15f);
            _unknownFill.SetFloat("_Soft", 1f);
            _unknownFill.SetFloat("_SoftHeight", LookSettings.UnknownFadeHeightM);
            _unknownFill.SetFloat("_SoftRoofShare", LookSettings.UnknownRoofShare);
        }

        private static Material Fill(string name, Shader shader, Color ink, float alpha)
        {
            Color fill = ink;
            fill.a = alpha;
            var material = new Material(shader) { name = name };
            material.SetColor("_Color", fill);
            material.SetFloat("_Shade", 0.35f);
            material.SetFloat("_Emission", LookSettings.GhostEmission);
            material.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            material.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            material.SetFloat("_ZWrite", 0f);
            material.SetFloat("_Cull", (float)CullMode.Back);
            material.renderQueue = 3000;
            return material;
        }

        private static Material Edge(string name, Shader shader, BuriedPalette palette, float pixelScale)
        {
            var material = new Material(shader) { name = name };
            material.SetColor("_Color", palette.ink);
            material.SetFloat("_Alpha", 1f);
            material.SetFloat("_Emission", LookSettings.EdgeEmission);
            material.SetFloat("_WidthPx", LookSettings.EdgeWidthCssPx);
            material.SetFloat("_GlowPx", LookSettings.GhostEdgeCasingPx);
            material.SetFloat("_GlowAlpha", LookSettings.GhostEdgeCasingAlpha);
            // A `night` casing inside the glow width keeps the `ink` line readable over a pale plate.
            material.SetColor("_GlowColor", palette.night);
            material.SetFloat("_GlowMix", 1f);
            material.SetFloat("_PixelScale", pixelScale);
            material.renderQueue = 3010;
            return material;
        }

        /// <summary>True when the class draws an outline (every class but unknown).</summary>
        public static bool HasOutline(string confidence)
        {
            return confidence != Unknown;
        }

        /// <summary>The class a feature is drawn as: an unrecognised value is drawn as unknown, the least claim.</summary>
        public static string ClassOf(string confidence)
        {
            return confidence == Documented || confidence == Estimated ? confidence : Unknown;
        }

        public Material FillOf(string confidence)
        {
            switch (ClassOf(confidence))
            {
                case Documented: return _documentedFill;
                case Estimated: return _estimatedFill;
                default: return _unknownFill;
            }
        }

        /// <summary>The outline material of a class, or null for unknown.</summary>
        public Material EdgeOf(string confidence)
        {
            switch (ClassOf(confidence))
            {
                case Documented: return _documentedEdge;
                case Estimated: return _estimatedEdge;
                default: return null;
            }
        }

        public void Dispose()
        {
            Destroy(_documentedFill);
            Destroy(_documentedEdge);
            Destroy(_estimatedFill);
            Destroy(_estimatedEdge);
            Destroy(_unknownFill);
        }

        private static void Destroy(Material material)
        {
            SceneObjects.Destroy(material);
        }
    }
}
