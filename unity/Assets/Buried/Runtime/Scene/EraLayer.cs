using System;
using System.Collections.Generic;
using Buried.Geo;
using Buried.Interop;
using Buried.Meshing;
using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// What one era draws: the extruded ghosts it was sent, their outlines and its drapes. It draws
    /// exactly the features it received; it never filters or adds any by a rule of its own.
    /// Every confidence class has the documented treatment until task 4.1 adds the other two.
    /// </summary>
    public sealed class EraLayer
    {
        public string EraId { get; private set; }
        public int Index { get; private set; }

        /// <summary>Features that were drawn (buildings that built without error).</summary>
        public int FeatureCount { get; private set; }

        public int DrapeCount
        {
            get { return _drapes.Count; }
        }

        private readonly GameObject _root;
        private readonly List<MeshChunk> _chunks = new List<MeshChunk>();
        private readonly List<MeshData> _edgeChunks = new List<MeshData>();
        private readonly List<Mesh> _meshes = new List<Mesh>();
        private readonly List<DrapeLayer> _drapes = new List<DrapeLayer>();

        // This era's own copies of the ghost materials, so that its weight can change without touching
        // another era's (two eras are drawn at once between them).
        private Material _fill;
        private Material _edge;

        /// <summary>The weight last set (0 to 1); 1 at rest on this era.</summary>
        public float Weight { get; private set; }

        public EraLayer(string eraId, int index, Transform parent)
        {
            EraId = eraId;
            Index = index;
            _root = new GameObject("Era " + eraId);
            _root.transform.SetParent(parent, false);
        }

        public Transform Parent
        {
            get { return _root.transform; }
        }

        /// <summary>
        /// Builds a volume and an outline for each building feature. A feature that cannot be built is
        /// reported through <paramref name="onFailure"/> and skipped; the others are still drawn. Water
        /// is not drawn yet. The layer draws with its own copies of the two materials.
        /// </summary>
        public void AddFeatures(
            IEnumerable<SceneFeatureDto> features,
            ProjectFrame frame,
            Material fillMaterial,
            Material edgeMaterial,
            Action<string, string> onFailure)
        {
            _fill = new Material(fillMaterial) { name = fillMaterial.name + " " + EraId };
            _edge = new Material(edgeMaterial) { name = edgeMaterial.name + " " + EraId };
            MeshChunk chunk = null;
            MeshData edgeChunk = null;
            foreach (SceneFeatureDto feature in features)
            {
                if (feature.kind != SceneFeatureDto.KindBuilding) continue;

                FootprintBuilder.Result built;
                try
                {
                    built = FootprintBuilder.Build(feature.geometry, (float)feature.heightM, frame);
                }
                catch (InvalidOperationException e)
                {
                    onFailure(feature.id, e.Message);
                    continue;
                }
                if (built == null)
                {
                    onFailure(feature.id, "the footprint has no area after cleaning");
                    continue;
                }

                if (chunk == null || !chunk.CanTake(built.Fill))
                {
                    chunk = new MeshChunk();
                    _chunks.Add(chunk);
                }
                chunk.Add(feature.id, built.Fill);

                if (edgeChunk == null || edgeChunk.VertexCount + built.Edges.VertexCount > MeshChunk.MaxVertices)
                {
                    edgeChunk = new MeshData();
                    _edgeChunks.Add(edgeChunk);
                }
                edgeChunk.Append(built.Edges);
                FeatureCount++;
            }

            int n = 0;
            foreach (MeshChunk c in _chunks)
            {
                AddRenderer("Ghosts " + n, c.BuildMesh("Ghosts " + EraId + " " + n), _fill);
                n++;
            }
            n = 0;
            foreach (MeshData e in _edgeChunks)
            {
                AddRenderer("Edges " + n, e.ToMesh("Edges " + EraId + " " + n), _edge);
                n++;
            }
        }

        private void AddRenderer(string name, Mesh mesh, Material material)
        {
            var go = new GameObject(name);
            go.transform.SetParent(_root.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            MeshRenderer renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            _meshes.Add(mesh);
        }

        public void AddDrape(DrapeLayer drape)
        {
            _drapes.Add(drape);
        }

        public void SetVisible(bool visible)
        {
            _root.SetActive(visible);
        }

        /// <summary>
        /// Draws the era at <paramref name="weight"/> (requirements 10.5 and 10.6): ghosts rise from the
        /// ground and fade in, drapes fade in, and an era with no weight draws nothing. Reduced motion
        /// skips the rise and only fades.
        /// </summary>
        public void SetWeight(float weight, bool reducedMotion)
        {
            Weight = Mathf.Clamp01(weight);
            _root.SetActive(Weight > DepthBlend.VisibleWeight);
            float alpha = DepthBlend.GhostAlpha(Weight);
            float rise = DepthBlend.Rise(Weight, reducedMotion);
            if (_fill != null)
            {
                _fill.SetFloat("_Weight", alpha);
                _fill.SetFloat("_Rise", rise);
            }
            if (_edge != null)
            {
                _edge.SetFloat("_Alpha", alpha);
                _edge.SetFloat("_Rise", rise);
            }
            float opacity = DepthBlend.DrapeOpacity(Weight);
            foreach (DrapeLayer drape in _drapes) drape.SetOpacity(opacity);
        }

        public bool Raycast(Ray ray, out float distance, out string featureId)
        {
            distance = float.PositiveInfinity;
            featureId = null;
            foreach (MeshChunk chunk in _chunks)
            {
                float d;
                string id;
                if (chunk.Raycast(ray, out d, out id) && d < distance)
                {
                    distance = d;
                    featureId = id;
                }
            }
            return featureId != null;
        }

        public void Dispose()
        {
            foreach (DrapeLayer drape in _drapes) drape.Dispose();
            _drapes.Clear();
            foreach (Mesh mesh in _meshes)
            {
                if (mesh != null) UnityEngine.Object.Destroy(mesh);
            }
            _meshes.Clear();
            if (_fill != null) UnityEngine.Object.Destroy(_fill);
            if (_edge != null) UnityEngine.Object.Destroy(_edge);
            if (_root != null) UnityEngine.Object.Destroy(_root);
        }
    }
}
