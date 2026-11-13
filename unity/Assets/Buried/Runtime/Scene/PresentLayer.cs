using System;
using System.Collections.Generic;
using Buried.Geo;
using Buried.Interop;
using Buried.Look;
using Buried.Meshing;
using UnityEngine;
using UnityEngine.Rendering;

namespace Buried.Scene
{
    /// <summary>
    /// Today's buildings: matte `present` volumes with a faint outline, drawn from the footprints in
    /// scene/init at their fixed display height. They are context, not evidence, and are not pickable.
    /// </summary>
    public sealed class PresentLayer
    {
        /// <summary>The fill and outline alpha at a depth (design.md "Depth blend", present stage).</summary>
        public struct Stage
        {
            public float FillAlpha;
            public float EdgeAlpha;
        }

        /// <summary>
        /// The present stage p = min(depth, 1). Normal motion: the fill drains to wireframe, then to a
        /// faint outline. Reduced motion: a crossfade straight to the faint outline.
        /// </summary>
        public static Stage StageAt(double depth, bool reducedMotion)
        {
            float p = (float)Math.Min(Math.Max(depth, 0.0), 1.0);
            if (reducedMotion)
            {
                return new Stage { FillAlpha = 1f - p, EdgeAlpha = LookSettings.PresentFaintEdgeAlpha * p };
            }
            float fill = 1f - SmoothStep(0f, 0.5f, p);
            float edge = p <= 0.5f
                ? SmoothStep(0f, 0.5f, p)
                : Mathf.Lerp(1f, LookSettings.PresentFaintEdgeAlpha, SmoothStep(0.5f, 1f, p));
            return new Stage { FillAlpha = fill, EdgeAlpha = edge };
        }

        private static float SmoothStep(float a, float b, float x)
        {
            float t = Mathf.Clamp01((x - a) / (b - a));
            return t * t * (3f - 2f * t);
        }

        public int BuildingCount { get; private set; }

        private readonly GameObject _root;
        private readonly List<Mesh> _meshes = new List<Mesh>();
        private readonly List<MeshRenderer> _fillRenderers = new List<MeshRenderer>();
        private readonly List<MeshRenderer> _shadowRenderers = new List<MeshRenderer>();
        private readonly List<GameObject> _parts = new List<GameObject>();
        private readonly Material _fill;
        private readonly Material _edge;
        private readonly Material _roofEdge;
        private readonly Material _shadow;
        private readonly Color _edgeColor;
        private readonly Color _sunkColor;
        private readonly List<PresentBuildingDto> _buildings;
        private readonly ProjectFrame _frame;
        private readonly Action<string, string> _onFailure;

        public PresentLayer(
            Transform parent,
            IEnumerable<PresentBuildingDto> buildings,
            ProjectFrame frame,
            BuriedPalette palette,
            Shader fillShader,
            Shader edgeShader,
            float pixelScale,
            Action<string, string> onFailure)
        {
            _root = new GameObject("Present");
            _root.transform.SetParent(parent, false);
            _buildings = new List<PresentBuildingDto>(buildings);
            _frame = frame;
            _onFailure = onFailure;

            _fill = new Material(fillShader) { name = "Present fill" };
            _fill.SetColor("_Color", palette.block);
            _fill.SetFloat("_TopWarm", LookSettings.PresentTopWarm);
            _fill.renderQueue = (int)RenderQueue.Geometry;

            // The shadow of a standing block: the same volumes flattened along the lamp's travel onto the paper, `soot`, soft.
            _shadow = new Material(fillShader) { name = "Present shadow" };
            _shadow.SetColor("_Color", palette.soot);
            _shadow.SetFloat("_ShadowMode", 1f);
            _shadow.SetFloat("_ShadowAlpha", LookSettings.PresentShadowAlpha);
            _shadow.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            _shadow.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            _shadow.SetFloat("_ZWrite", 0f);
            _shadow.SetFloat("_Cull", (float)CullMode.Off);
            _shadow.renderQueue = LookSettings.PresentShadowQueue;

            // Outline: `block` lightened toward `parchment-dim`. Cold, like the fill. Once the blocks have sunk it is `block` itself.
            _edgeColor = Color.Lerp(palette.block, palette.parchmentDim, 0.5f);
            _sunkColor = palette.block;
            _edge = new Material(edgeShader) { name = "Present edge" };
            _edge.SetColor("_Color", _edgeColor);
            _edge.SetFloat("_Emission", 1f);
            _edge.SetFloat("_GlowAlpha", 0f);
            _edge.SetFloat("_PixelScale", pixelScale);
            _edge.renderQueue = (int)RenderQueue.Geometry + 800;

            // The roof line: a thin line of the same cold colour, lighter again, along the top of each
            // building. It is what keeps a dark, matte volume legible (design.md "The present").
            _roofEdge = new Material(edgeShader) { name = "Present roof edge" };
            _roofEdge.SetColor("_Color", Color.Lerp(palette.block, palette.parchmentDim, 0.6f));
            _roofEdge.SetFloat("_Emission", 1f);
            _roofEdge.SetFloat("_GlowAlpha", 0f);
            _roofEdge.SetFloat("_WidthPx", LookSettings.PresentRoofEdgeWidthCssPx);
            _roofEdge.SetFloat("_PixelScale", pixelScale);
            _roofEdge.renderQueue = (int)RenderQueue.Geometry + 801;

            Build(null);
            SetStage(StageAt(0.0, false));
        }

        /// <summary>
        /// Draws only the buildings whose whole footprint lies inside the quadrilateral (the first visit's page: nothing is drawn
        /// outside the sheet). Corners are in EPSG:26917, in order around the quad, as the sidecar gives them. The Shell sends every
        /// building of the project; this keeps the table empty.
        /// </summary>
        public void RestrictTo(IList<double[]> quad)
        {
            Build(quad);
            _shadowsOn = true;
            ApplyShadowVisibility();
            // On the page the blocks are dark matte volumes against bright paper: the roof takes less sky light than elsewhere.
            _fill.SetFloat("_RoofGain", LookSettings.PresentPageRoofGain);
            _fill.SetFloat("_Ambient", LookSettings.PresentPageWallLight);
            SetStage(StageAt(0.0, false));
        }

        private static bool Inside(IList<double[]> quad, double e, double n)
        {
            bool positive = false, negative = false;
            for (int i = 0; i < quad.Count; i++)
            {
                double[] a = quad[i];
                double[] b = quad[(i + 1) % quad.Count];
                double cross = (b[0] - a[0]) * (n - a[1]) - (b[1] - a[1]) * (e - a[0]);
                if (cross > 0) positive = true;
                if (cross < 0) negative = true;
            }
            return !(positive && negative);
        }

        private static bool WithinQuad(IList<double[]> quad, PresentBuildingDto building)
        {
            if (building.geometry == null || building.geometry.polygons == null) return false;
            foreach (List<List<double[]>> polygon in building.geometry.polygons)
            {
                foreach (double[] p in polygon[0])
                {
                    if (!Inside(quad, p[0], p[1])) return false;
                }
            }
            return true;
        }

        private void Build(IList<double[]> quad)
        {
            foreach (GameObject part in _parts) SceneObjects.Destroy(part);
            _parts.Clear();
            foreach (Mesh mesh in _meshes) SceneObjects.Destroy(mesh);
            _meshes.Clear();
            _fillRenderers.Clear();
            _shadowRenderers.Clear();
            BuildingCount = 0;

            var fills = new List<MeshData>();
            var edges = new List<MeshData>();
            var roofs = new List<MeshData>();
            MeshData fill = null;
            MeshData edge = null;
            MeshData roof = null;
            var options = FootprintBuilder.Options.Default;
            options.RoofLine = true;
            foreach (PresentBuildingDto building in _buildings)
            {
                if (quad != null && !WithinQuad(quad, building)) continue;
                FootprintBuilder.Result built;
                try
                {
                    built = FootprintBuilder.Build(building.geometry, (float)building.heightM, _frame, options);
                }
                catch (InvalidOperationException e)
                {
                    _onFailure(building.id, e.Message);
                    continue;
                }
                if (built == null)
                {
                    _onFailure(building.id, "the footprint has no area after cleaning");
                    continue;
                }
                if (fill == null || fill.VertexCount + built.Fill.VertexCount > MeshChunk.MaxVertices)
                {
                    fill = new MeshData();
                    fills.Add(fill);
                }
                fill.Append(built.Fill);
                if (edge == null || edge.VertexCount + built.Edges.VertexCount > MeshChunk.MaxVertices)
                {
                    edge = new MeshData();
                    edges.Add(edge);
                }
                edge.Append(built.Edges);
                if (roof == null || roof.VertexCount + built.Roof.VertexCount > MeshChunk.MaxVertices)
                {
                    roof = new MeshData();
                    roofs.Add(roof);
                }
                roof.Append(built.Roof);
                BuildingCount++;
            }

            for (int i = 0; i < fills.Count; i++)
            {
                Mesh mesh = fills[i].ToMesh("Present fill " + i);
                _fillRenderers.Add(AddRenderer("Fill " + i, mesh, _fill));
                _shadowRenderers.Add(AddRenderer("Shadow " + i, mesh, _shadow, false));
            }
            for (int i = 0; i < edges.Count; i++) AddRenderer("Edges " + i, edges[i].ToMesh("Present edges " + i), _edge);
            for (int i = 0; i < roofs.Count; i++) AddRenderer("Roof edges " + i, roofs[i].ToMesh("Present roof edges " + i), _roofEdge);
            ApplyShadowVisibility();
        }

        private MeshRenderer AddRenderer(string name, Mesh mesh, Material material, bool ownsMesh = true)
        {
            var go = new GameObject(name);
            go.transform.SetParent(_root.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            MeshRenderer renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            _parts.Add(go);
            if (ownsMesh) _meshes.Add(mesh);
            return renderer;
        }

        /// <summary>0 draws everywhere, 1 only inside the Lantern's lens, 2 only outside it (the Lantern keeps Today to the outside).</summary>
        public void SetLensMode(int mode)
        {
            LensMaterial.SetMode(_fill, mode);
            LensMaterial.SetMode(_edge, mode);
            LensMaterial.SetMode(_roofEdge, mode);
            LensMaterial.SetMode(_shadow, mode);
        }

        /// <summary>
        /// How far today's buildings have sunk toward 1 m plinths (0 full height, 1 plinths). The shaders pull every height
        /// above <see cref="RaiseSchedule.PlinthM"/> down to it, so a block of any height ends 1 m high.
        /// </summary>
        public void SetSink(float sink)
        {
            SetSink(sink, RaiseSchedule.PlinthM);
        }

        private void SetSink(float sink, float plinthM)
        {
            Sink = Mathf.Clamp01(sink);
            foreach (Material m in new[] { _fill, _edge, _roofEdge, _shadow })
            {
                m.SetFloat("_Sink", Sink);
                m.SetFloat("_PlinthM", plinthM);
            }
        }

        /// <summary>
        /// The look after Raise (session 043, replacing the 1 m plinth): the blocks sink flat to
        /// <see cref="LookSettings.PresentSunkHeightM"/>, their fill and shadow draining as they go, and what stays is a thin `block`
        /// outline on the paper at <see cref="LookSettings.PresentSunkEdgeAlpha"/>, so the plan and the ghosts read.
        /// </summary>
        public void SetSunk(float sink)
        {
            sink = Mathf.Clamp01(sink);
            SetSink(sink, LookSettings.PresentSunkHeightM);
            var stage = new Stage { FillAlpha = 1f - sink, EdgeAlpha = LookSettings.PresentSunkEdgeAlpha * sink };
            SetStage(stage);
            // While a block still stands its roof line shows; once it lies flat the one outline is the whole look.
            _roofEdge.SetFloat("_Alpha", LookSettings.PresentRoofEdgeAlpha * stage.FillAlpha);
            _edge.SetColor("_Color", Color.Lerp(_edgeColor, _sunkColor, sink));
            _shadow.SetFloat("_ShadowAlpha", LookSettings.PresentShadowAlpha * (1f - sink));
            ApplyShadowVisibility();
        }

        private void ApplyShadowVisibility()
        {
            // Shadows belong to the first visit's page (RestrictTo); the place page draws none.
            bool visible = _shadowsOn && _shadow.GetFloat("_ShadowAlpha") > 0.001f && _fill.GetFloat("_Alpha") > 0.001f;
            foreach (MeshRenderer renderer in _shadowRenderers) renderer.enabled = visible;
        }

        private bool _shadowsOn;

        public float Sink { get; private set; }

        public void SetStage(Stage stage)
        {
            bool opaque = stage.FillAlpha >= 0.999f;
            _fill.SetFloat("_Alpha", stage.FillAlpha);
            _fill.SetFloat("_SrcBlend", (float)(opaque ? BlendMode.One : BlendMode.SrcAlpha));
            _fill.SetFloat("_DstBlend", (float)(opaque ? BlendMode.Zero : BlendMode.OneMinusSrcAlpha));
            _fill.SetFloat("_ZWrite", opaque ? 1f : 0f);
            _fill.renderQueue = opaque ? (int)RenderQueue.Geometry : (int)RenderQueue.Transparent - 600;
            foreach (MeshRenderer renderer in _fillRenderers) renderer.enabled = stage.FillAlpha > 0.001f;
            _edge.SetFloat("_Alpha", stage.EdgeAlpha);
            _roofEdge.SetFloat("_Alpha", RoofEdgeAlpha(stage));
            ApplyShadowVisibility();
        }

        /// <summary>The roof line's alpha at a stage: solid-fill strength while the fill is drawn, then the wireframe's own edge alpha.</summary>
        public static float RoofEdgeAlpha(Stage stage)
        {
            return Mathf.Max(stage.EdgeAlpha, LookSettings.PresentRoofEdgeAlpha * stage.FillAlpha);
        }

        public void Dispose()
        {
            foreach (Mesh mesh in _meshes) SceneObjects.Destroy(mesh);
            _meshes.Clear();
            SceneObjects.Destroy(_root);
            SceneObjects.Destroy(_fill);
            SceneObjects.Destroy(_edge);
            SceneObjects.Destroy(_roofEdge);
            SceneObjects.Destroy(_shadow);
        }
    }
}
