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
    /// The pinned lot (design.md "The pinned lot"): its outline on the ground in `lantern`, drawn in every
    /// era and over everything. The warm light pool at the lot is the lit map sheet's (SceneController moves
    /// it); there is no lamp or other marker. That is the only `lantern` in the scene. The Player draws the polygon it is given; which lot it is, and
    /// whether anything stood on it, is decided outside (the Shell and the Evidence Library).
    /// </summary>
    public sealed class LotPin
    {
        /// <summary>The lot's bounding rectangle in Unity world x and z.</summary>
        public Rect Bounds { get; private set; }

        /// <summary>The middle of <see cref="Bounds"/>.</summary>
        public Vector2 Centre
        {
            get { return Bounds.center; }
        }

        private readonly GameObject _root;
        private readonly List<Mesh> _meshes = new List<Mesh>();
        private readonly List<Material> _materials = new List<Material>();

        public LotPin(Transform parent, GeometryDto lot, ProjectFrame frame, BuriedPalette palette, ShaderSet shaders, float pixelScale)
        {
            if (lot == null || !lot.IsPolygonal) throw new InvalidOperationException("a lot is a Polygon or a MultiPolygon");

            var corners = new List<Vec2d>();
            double minX = double.PositiveInfinity, minZ = double.PositiveInfinity, maxX = double.NegativeInfinity, maxZ = double.NegativeInfinity;
            foreach (List<List<double[]>> polygon in lot.polygons)
            {
                List<double[]> exterior = polygon[0];
                for (int i = 0; i < exterior.Count - 1; i++)
                {
                    Vec2d p = frame.ToLocal(exterior[i][0], exterior[i][1]);
                    corners.Add(p);
                    minX = Math.Min(minX, p.X);
                    maxX = Math.Max(maxX, p.X);
                    minZ = Math.Min(minZ, p.Y);
                    maxZ = Math.Max(maxZ, p.Y);
                }
            }
            MeshData outline = FootprintBuilder.BuildFlatOutline(lot, 0f, frame);
            if (outline == null || corners.Count == 0) throw new InvalidOperationException("the lot has no area after cleaning");

            Bounds = new Rect((float)minX, (float)minZ, (float)(maxX - minX), (float)(maxZ - minZ));

            _root = new GameObject("Pinned lot");
            _root.transform.SetParent(parent, false);

            // The outline: `lantern` over an `ink` casing, on top of everything (ZTest Always) and with no fog, so
            // it is `lantern` wherever it is on screen.
            Material line = EdgeMaterial(shaders.edge, palette, pixelScale, LookSettings.LotOutlineWidthCssPx, 1f);
            line.SetColor("_GlowColor", palette.ink);
            line.SetFloat("_GlowPx", LookSettings.LotOutlineCasingCssPx);
            line.SetFloat("_GlowAlpha", 1f);
            line.SetFloat("_GlowMix", 1f);
            line.SetFloat("_ZTest", (float)CompareFunction.Always);
            line.renderQueue = 3020;
            AddRenderer("Outline", outline.ToMesh("Pinned lot outline"), line);
        }

        private Material EdgeMaterial(Shader shader, BuriedPalette palette, float pixelScale, float widthPx, float emission)
        {
            var material = new Material(shader) { name = "Pinned lot" };
            material.SetColor("_Color", palette.lantern);
            material.SetFloat("_Alpha", 1f);
            material.SetFloat("_Emission", emission);
            material.SetFloat("_WidthPx", widthPx);
            material.SetFloat("_PixelScale", pixelScale);
            material.SetFloat("_Fogged", 0f);
            _materials.Add(material);
            return material;
        }

        private void AddRenderer(string name, Mesh mesh, Material material)
        {
            var go = new GameObject(name);
            go.transform.SetParent(_root.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            MeshRenderer renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            _meshes.Add(mesh);
        }

        /// <summary>Names of the drawn parts, for tests.</summary>
        public IEnumerable<string> PartNames
        {
            get
            {
                for (int i = 0; i < _root.transform.childCount; i++) yield return _root.transform.GetChild(i).name;
            }
        }

        public void Dispose()
        {
            foreach (Mesh mesh in _meshes) SceneObjects.Destroy(mesh);
            _meshes.Clear();
            foreach (Material material in _materials) SceneObjects.Destroy(material);
            _materials.Clear();
            SceneObjects.Destroy(_root);
        }
    }
}
