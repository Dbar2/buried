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
        private readonly Material _documentedAreaFill;
        private readonly Material _documentedAreaEdge;
        private readonly Material _estimatedAreaFill;
        private readonly Material _estimatedAreaEdge;
        private readonly Material _unknownAreaFill;

        public GhostMaterials(BuriedPalette palette, ShaderSet shaders, float pixelScale)
        {
            Color parchment = palette.parchment;

            // Documented: a translucent `parchment` volume, faces away from the lamp tinted toward `copper`, with crisp
            // `ink` edges (and one `ink` line per recorded storey).
            _documentedFill = Fill("Ghost fill", shaders.ghost, parchment, LookSettings.GhostFillAlpha, palette);
            _documentedEdge = Edge("Ghost edge", shaders.edge, palette, pixelScale);

            // Estimated: the same line, dashed, over a lighter fill.
            _estimatedFill = Fill("Ghost fill (estimated)", shaders.ghost, parchment, LookSettings.EstimatedFillAlpha, palette);
            _estimatedEdge = Edge("Ghost edge (estimated)", shaders.edge, palette, pixelScale);
            _estimatedEdge.SetColor("_Color", palette.rule); // the 162 rule-drawn drafts are quieter than the hand-traced buildings
            _estimatedEdge.SetFloat("_DashPeriod", LookSettings.DashPeriodM);
            _estimatedEdge.SetFloat("_DashPeriodPx", LookSettings.DashPeriodCssPx);
            _estimatedEdge.SetFloat("_DashOn", LookSettings.DashOnFraction);

            // Unknown: a fog volume. No edge material: an unknown ghost is drawn without an outline.
            _unknownFill = Fill("Ghost fill (unknown)", shaders.ghost, parchment, LookSettings.UnknownFillAlpha, palette);
            _unknownFill.SetFloat("_Shade", 0.15f);
            _unknownFill.SetFloat("_Soft", 1f);
            _unknownFill.SetFloat("_SoftHeight", LookSettings.UnknownFadeHeightM);
            _unknownFill.SetFloat("_SoftRoofShare", LookSettings.UnknownRoofShare);

            // Land-use areas (bridge 0.7.0): the same classes drawn flat as hatched sheets, with the class's outline.
            _documentedAreaFill = AreaFill("Area fill", shaders.ghost, palette, LookSettings.AreaDocumentedAlpha, pixelScale);
            _documentedAreaEdge = Edge("Area edge", shaders.edge, palette, pixelScale);
            _documentedAreaEdge.SetColor("_Color", palette.copper);
            _documentedAreaEdge.renderQueue = LookSettings.AreaEdgeQueue;
            _estimatedAreaFill = AreaFill("Area fill (estimated)", shaders.ghost, palette, LookSettings.AreaEstimatedAlpha, pixelScale);
            _estimatedAreaEdge = Edge("Area edge (estimated)", shaders.edge, palette, pixelScale);
            _estimatedAreaEdge.SetColor("_Color", palette.copper);
            _estimatedAreaEdge.renderQueue = LookSettings.AreaEdgeQueue;
            _estimatedAreaEdge.SetFloat("_DashPeriod", LookSettings.DashPeriodM);
            _estimatedAreaEdge.SetFloat("_DashPeriodPx", LookSettings.DashPeriodCssPx);
            _estimatedAreaEdge.SetFloat("_DashOn", LookSettings.DashOnFraction);
            _unknownAreaFill = AreaFill("Area fill (unknown)", shaders.ghost, palette, LookSettings.AreaUnknownAlpha, pixelScale);

            // The selected find (spec 06 requirement 4.1): `lantern` edges, thicker, with an emission above 1 (the one thing
            // that blooms), and a faint `lantern` tint over the volume. Never colour alone: the edge is also thicker.
            _selectedEdge = Edge("Selected edge", shaders.edge, palette, pixelScale);
            _selectedEdge.SetColor("_Color", palette.lantern);
            _selectedEdge.SetFloat("_WidthPx", LookSettings.EdgeWidthCssPx * LookSettings.SelectedEdgeWidthFactor);
            _selectedEdge.SetFloat("_Emission", LookSettings.SelectedEmission);
            _selectedEdge.SetFloat("_GlowAlpha", 0f);
            _selectedEdge.renderQueue = LookSettings.SelectedQueue;
            Color tint = palette.lantern;
            _selectedFill = Fill("Selected fill", shaders.ghost, tint, LookSettings.SelectedFillAlpha, palette);
            _selectedFill.SetFloat("_Shade", 0f);
            _selectedFill.SetFloat("_ShadeMix", 0f);
            _selectedFill.SetFloat("_Emission", LookSettings.SelectedFillEmission);
            _selectedFill.renderQueue = LookSettings.SelectedQueue - 5;

            // The soft pool of `lantern` light on the paper around the selected find's foot (session 043).
            Color glow = palette.lantern;
            glow.a = LookSettings.SelectedGlowAlpha;
            _selectedGlow = Fill("Selected glow", shaders.ghost, glow, LookSettings.SelectedGlowAlpha, palette);
            _selectedGlow.SetColor("_Color", glow);
            _selectedGlow.SetFloat("_Shade", 0f);
            _selectedGlow.SetFloat("_ShadeMix", 0f);
            _selectedGlow.SetFloat("_Emission", 0.25f);
            _selectedGlow.SetFloat("_Glow", 1f);
            _selectedGlow.SetFloat("_Cull", (float)CullMode.Off);
            _selectedGlow.renderQueue = LookSettings.SelectedGlowQueue;
        }

        private readonly Material _selectedGlow;
        private readonly Material _selectedFill;
        private readonly Material _selectedEdge;

        /// <summary>The base material of the pool of light under the selected feature (the ghost shader's glow mode).</summary>
        public Material SelectedGlow
        {
            get { return _selectedGlow; }
        }

        /// <summary>The base materials of the selected feature's overlay: a faint `lantern` tint and its thick `lantern` edge.</summary>
        public Material SelectedFill
        {
            get { return _selectedFill; }
        }

        public Material SelectedEdge
        {
            get { return _selectedEdge; }
        }

        /// <summary>
        /// A hatched sheet: the ghost shader with _Hatch on. Stripes in `ink` with a `parchment` casing over a faint tint,
        /// flat shading (no normal shading), under the ghosts and above the drapes.
        /// </summary>
        private static Material AreaFill(string name, Shader shader, BuriedPalette palette, float alpha, float pixelScale)
        {
            Material material = Fill(name, shader, palette.ink, alpha, palette);
            material.SetFloat("_Shade", 0f);
            material.SetFloat("_ShadeMix", 0f);
            material.SetFloat("_Hatch", 1f);
            material.SetFloat("_HatchPeriodM", LookSettings.AreaHatchPeriodM);
            material.SetFloat("_HatchPeriodPx", LookSettings.AreaHatchPeriodCssPx * pixelScale);
            material.SetFloat("_HatchInk", LookSettings.AreaHatchInkShare);
            material.SetFloat("_HatchCasing", LookSettings.AreaHatchCasingShare);
            material.SetFloat("_HatchGap", LookSettings.AreaHatchGapShare);
            material.SetColor("_CasingColor", palette.parchment);
            material.SetFloat("_Cull", (float)CullMode.Off);
            material.renderQueue = LookSettings.AreaFillQueue;
            return material;
        }

        private static Material Fill(string name, Shader shader, Color colour, float alpha, BuriedPalette palette)
        {
            Color fill = colour;
            fill.a = alpha;
            var material = new Material(shader) { name = name };
            material.SetColor("_Color", fill);
            material.SetColor("_ShadeColor", palette.copper);
            material.SetFloat("_Shade", 0.5f);
            material.SetFloat("_ShadeMix", LookSettings.GhostCopperShade);
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
            // A faint `parchment` casing inside the glow width keeps the `ink` line crisp where a ghost passes over the
            // table's edge; on the sheet itself it is the colour of the paper.
            material.SetColor("_GlowColor", palette.parchment);
            material.SetFloat("_GlowMix", 1f);
            material.SetFloat("_PixelScale", pixelScale);
            // Storey lines are hairlines that fade with distance; before Raise a ghost's edges lie flat as `copper` outlines.
            material.SetFloat("_StoreyAlpha", LookSettings.StoreyLineAlpha);
            material.SetVector("_StoreyFade", new Vector4(LookSettings.StoreyFadeNearM, LookSettings.StoreyFadeFarM, 0f, 0f));
            material.SetFloat("_HeldAlpha", LookSettings.HeldOutlineAlpha);
            material.SetColor("_HeldColor", palette.copper);
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

        /// <summary>The hatched sheet of a class, for a land-use area.</summary>
        public Material AreaFillOf(string confidence)
        {
            switch (ClassOf(confidence))
            {
                case Documented: return _documentedAreaFill;
                case Estimated: return _estimatedAreaFill;
                default: return _unknownAreaFill;
            }
        }

        /// <summary>The outline material of a class for a land-use area, or null for unknown.</summary>
        public Material AreaEdgeOf(string confidence)
        {
            switch (ClassOf(confidence))
            {
                case Documented: return _documentedAreaEdge;
                case Estimated: return _estimatedAreaEdge;
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
            Destroy(_documentedAreaFill);
            Destroy(_documentedAreaEdge);
            Destroy(_estimatedAreaFill);
            Destroy(_estimatedAreaEdge);
            Destroy(_unknownAreaFill);
            Destroy(_selectedFill);
            Destroy(_selectedEdge);
            Destroy(_selectedGlow);
        }

        private static void Destroy(Material material)
        {
            SceneObjects.Destroy(material);
        }
    }
}
