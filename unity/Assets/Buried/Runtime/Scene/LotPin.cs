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
    /// era and over everything, and one small warm light beside it. That is the only `lantern` and the
    /// only warm light in the scene. The Player draws the polygon it is given; which lot it is, and
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

        /// <summary>Where the lamp stands (world x and z); its post rises from y = 0.</summary>
        public Vector2 Lamp { get; private set; }

        private readonly GameObject _root;
        private readonly List<Mesh> _meshes = new List<Mesh>();
        private readonly List<Material> _materials = new List<Material>();

        /// <summary>
        /// Where the lamp stands: <see cref="LookSettings.LampOffsetM"/> outside the lot's southernmost
        /// corner, on the line from the middle of the corners through it (ties go to the westmost). Pure, so
        /// it can be tested; "south" because the default view looks north-north-east, so the lamp is on the
        /// near side of the lot and in front of it.
        /// </summary>
        public static Vec2d LampPosition(IList<Vec2d> corners)
        {
            if (corners == null || corners.Count == 0) throw new ArgumentException("a lot has at least one corner");
            Vec2d south = corners[0];
            double sumX = 0.0;
            double sumY = 0.0;
            foreach (Vec2d p in corners)
            {
                sumX += p.X;
                sumY += p.Y;
                if (p.Y < south.Y || (p.Y == south.Y && p.X < south.X)) south = p;
            }
            double dx = south.X - sumX / corners.Count;
            double dy = south.Y - sumY / corners.Count;
            double length = Math.Sqrt(dx * dx + dy * dy);
            if (length < 1e-9)
            {
                dx = 0.0;
                dy = -1.0;
                length = 1.0;
            }
            return new Vec2d(south.X + dx / length * LookSettings.LampOffsetM, south.Y + dy / length * LookSettings.LampOffsetM);
        }

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
            Vec2d lamp = LampPosition(corners);
            Lamp = new Vector2((float)lamp.X, (float)lamp.Y);

            _root = new GameObject("Pinned lot");
            _root.transform.SetParent(parent, false);

            // The outline: `lantern` over a `night` casing, on top of everything (ZTest Always) and with no fog, so
            // it is `lantern` wherever it is on screen.
            Material line = EdgeMaterial(shaders.edge, palette, pixelScale, LookSettings.LotOutlineWidthCssPx, 1f);
            line.SetColor("_GlowColor", palette.night);
            line.SetFloat("_GlowPx", LookSettings.LotOutlineCasingCssPx);
            line.SetFloat("_GlowAlpha", 1f);
            line.SetFloat("_GlowMix", 1f);
            line.SetFloat("_ZTest", (float)CompareFunction.Always);
            line.renderQueue = 3020;
            AddRenderer("Outline", outline.ToMesh("Pinned lot outline"), line);

            // The lamp: a thin post and a lit head, in the same `lantern`. The head's emission is above 1 so it glows.
            var base3 = new Vector3(Lamp.x, 0f, Lamp.y);
            var top = new Vector3(Lamp.x, LookSettings.LampPostHeightM, Lamp.y);
            var tip = new Vector3(Lamp.x, LookSettings.LampPostHeightM + LookSettings.LampHeadLengthM, Lamp.y);
            Material post = EdgeMaterial(shaders.edge, palette, pixelScale, LookSettings.LampPostWidthCssPx, 1f);
            post.SetFloat("_GlowAlpha", 0f);
            post.renderQueue = 3021;
            AddRenderer("Lamp post", EdgeMeshBuilder.BuildLine(base3, top).ToMesh("Lamp post"), post);
            Material head = EdgeMaterial(shaders.edge, palette, pixelScale, LookSettings.LampHeadWidthCssPx, LookSettings.LampHeadEmission);
            head.SetFloat("_GlowPx", 3f);
            head.SetFloat("_GlowAlpha", 0.45f);
            head.renderQueue = 3022;
            AddRenderer("Lamp head", EdgeMeshBuilder.BuildLine(top, tip).ToMesh("Lamp head"), head);
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
