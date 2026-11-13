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
        private readonly Material _fill;
        private readonly Material _edge;

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

            _fill = new Material(fillShader) { name = "Present fill" };
            _fill.SetColor("_Color", palette.present);
            _fill.renderQueue = (int)RenderQueue.Geometry;

            // Outline: `present` lightened toward `muted`. Cold, like the fill.
            _edge = new Material(edgeShader) { name = "Present edge" };
            _edge.SetColor("_Color", Color.Lerp(palette.present, palette.muted, 0.5f));
            _edge.SetFloat("_Emission", 1f);
            _edge.SetFloat("_GlowAlpha", 0f);
            _edge.SetFloat("_PixelScale", pixelScale);
            _edge.renderQueue = (int)RenderQueue.Geometry + 800;

            var fills = new List<MeshData>();
            var edges = new List<MeshData>();
            MeshData fill = null;
            MeshData edge = null;
            foreach (PresentBuildingDto building in buildings)
            {
                FootprintBuilder.Result built;
                try
                {
                    built = FootprintBuilder.Build(building.geometry, (float)building.heightM, frame);
                }
                catch (InvalidOperationException e)
                {
                    onFailure(building.id, e.Message);
                    continue;
                }
                if (built == null)
                {
                    onFailure(building.id, "the footprint has no area after cleaning");
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
                BuildingCount++;
            }

            for (int i = 0; i < fills.Count; i++) _fillRenderers.Add(AddRenderer("Fill " + i, fills[i].ToMesh("Present fill " + i), _fill));
            for (int i = 0; i < edges.Count; i++) AddRenderer("Edges " + i, edges[i].ToMesh("Present edges " + i), _edge);

            SetStage(StageAt(0.0, false));
        }

        private MeshRenderer AddRenderer(string name, Mesh mesh, Material material)
        {
            var go = new GameObject(name);
            go.transform.SetParent(_root.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            MeshRenderer renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            _meshes.Add(mesh);
            return renderer;
        }

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
        }

        public void Dispose()
        {
            foreach (Mesh mesh in _meshes)
            {
                if (mesh != null) UnityEngine.Object.Destroy(mesh);
            }
            _meshes.Clear();
            if (_root != null) UnityEngine.Object.Destroy(_root);
            if (_fill != null) UnityEngine.Object.Destroy(_fill);
            if (_edge != null) UnityEngine.Object.Destroy(_edge);
        }
    }
}
