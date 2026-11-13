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
    /// The features are drawn by confidence class (<see cref="GhostMaterials"/>): each class has its own
    /// meshes and its own copy of the class's materials, so a class costs one renderer per chunk.
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
        private readonly List<Mesh> _meshes = new List<Mesh>();
        private readonly List<DrapeLayer> _drapes = new List<DrapeLayer>();
        private readonly HashSet<string> _ids = new HashSet<string>();
        private readonly List<AddedBatch> _batches = new List<AddedBatch>();
        private readonly List<ClassGroup> _groups = new List<ClassGroup>();
        private GhostMaterials _materials;
        private bool _reducedMotion;

        /// <summary>
        /// The features of one confidence class in one scene/loadEra or scene/addFeatures call: their
        /// meshes, chunked, and this group's own copies of the class's materials.
        /// </summary>
        private sealed class ClassGroup
        {
            public readonly string Class;
            public readonly List<MeshChunk> Chunks = new List<MeshChunk>();
            public readonly List<MeshData> EdgeChunks = new List<MeshData>();
            public readonly Material Fill;
            public readonly Material Edge;
            private MeshChunk _chunk;
            private MeshData _edgeChunk;

            public ClassGroup(string cls, GhostMaterials materials, string name)
            {
                Class = cls;
                Fill = new Material(materials.FillOf(cls)) { name = materials.FillOf(cls).name + " " + name };
                Material edge = materials.EdgeOf(cls);
                if (edge != null) Edge = new Material(edge) { name = edge.name + " " + name };
            }

            public void Add(string featureId, FootprintBuilder.Result built)
            {
                if (_chunk == null || !_chunk.CanTake(built.Fill))
                {
                    _chunk = new MeshChunk();
                    Chunks.Add(_chunk);
                }
                _chunk.Add(featureId, built.Fill);

                if (Edge == null || built.Edges.VertexCount == 0) return;
                if (_edgeChunk == null || _edgeChunk.VertexCount + built.Edges.VertexCount > MeshChunk.MaxVertices)
                {
                    _edgeChunk = new MeshData();
                    EdgeChunks.Add(_edgeChunk);
                }
                _edgeChunk.Append(built.Edges);
            }

            public void Apply(float alpha, float rise)
            {
                Fill.SetFloat("_Weight", alpha);
                Fill.SetFloat("_Rise", rise);
                if (Edge == null) return;
                Edge.SetFloat("_Alpha", alpha);
                Edge.SetFloat("_Rise", rise);
            }

            public void Dispose()
            {
                SceneObjects.Destroy(Fill);
                SceneObjects.Destroy(Edge);
            }
        }

        /// <summary>
        /// One scene/addFeatures call: its own meshes and material copies, so that it can rise on its
        /// own clock while the era sits at any weight (requirement 22.2).
        /// </summary>
        private sealed class AddedBatch
        {
            public readonly List<ClassGroup> Groups = new List<ClassGroup>();
            public float Start = float.NaN;
            public float Progress;
        }

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
        /// Builds a volume and, for every class but unknown, an outline for each building feature. A
        /// feature that cannot be built is reported through <paramref name="onFailure"/> and skipped; the
        /// others are still drawn. Water is not drawn yet. The layer draws with its own copies of the
        /// class materials.
        /// </summary>
        public void AddFeatures(
            IEnumerable<SceneFeatureDto> features,
            ProjectFrame frame,
            GhostMaterials materials,
            Action<string, string> onFailure)
        {
            _materials = materials;
            var groups = new Dictionary<string, ClassGroup>();
            FeatureCount += Build(features, frame, groups, EraId, onFailure, false);
            foreach (string cls in GhostMaterials.Classes)
            {
                ClassGroup group;
                if (!groups.TryGetValue(cls, out group)) continue;
                _groups.Add(group);
                AddRenderers(group, "");
            }
        }

        /// <summary>Builds the features into per-class groups. Returns how many were drawn.</summary>
        private int Build(
            IEnumerable<SceneFeatureDto> features,
            ProjectFrame frame,
            Dictionary<string, ClassGroup> groups,
            string groupName,
            Action<string, string> onFailure,
            bool skipKnownIds)
        {
            int added = 0;
            foreach (SceneFeatureDto feature in features)
            {
                if (feature.kind != SceneFeatureDto.KindBuilding) continue;
                if (skipKnownIds && _ids.Contains(feature.id))
                {
                    onFailure(feature.id, "the era already draws this feature");
                    continue;
                }

                string cls = GhostMaterials.ClassOf(feature.confidence);
                var options = FootprintBuilder.Options.Default;
                options.Outline = GhostMaterials.HasOutline(cls);

                FootprintBuilder.Result built;
                try
                {
                    built = FootprintBuilder.Build(feature.geometry, (float)feature.heightM, frame, options);
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

                ClassGroup group;
                if (!groups.TryGetValue(cls, out group))
                {
                    group = new ClassGroup(cls, _materials, groupName);
                    groups[cls] = group;
                }
                group.Add(feature.id, built);
                _ids.Add(feature.id);
                added++;
            }
            return added;
        }

        private void AddRenderers(ClassGroup group, string prefix)
        {
            int n = 0;
            foreach (MeshChunk c in group.Chunks)
            {
                AddRenderer(prefix + "Ghosts " + group.Class + " " + n, c.BuildMesh("Ghosts " + EraId + " " + group.Class + " " + n), group.Fill);
                n++;
            }
            n = 0;
            foreach (MeshData e in group.EdgeChunks)
            {
                AddRenderer(prefix + "Edges " + group.Class + " " + n, e.ToMesh("Edges " + EraId + " " + group.Class + " " + n), group.Edge);
                n++;
            }
        }

        /// <summary>
        /// Adds features to a loaded era (scene/addFeatures). They rise from the ground over 900 ms
        /// once the era is visible, or only fade under reduced motion. A feature whose id the era
        /// already draws is reported and skipped: the Shell sends only new features. Returns the number
        /// of features drawn.
        /// </summary>
        public int AddRising(
            IEnumerable<SceneFeatureDto> features,
            ProjectFrame frame,
            Action<string, string> onFailure)
        {
            var batch = new AddedBatch();
            var groups = new Dictionary<string, ClassGroup>();
            int added = Build(features, frame, groups, EraId + " added", onFailure, true);
            if (added == 0)
            {
                foreach (ClassGroup unused in groups.Values) unused.Dispose();
                return 0;
            }

            foreach (string cls in GhostMaterials.Classes)
            {
                ClassGroup group;
                if (!groups.TryGetValue(cls, out group)) continue;
                batch.Groups.Add(group);
                AddRenderers(group, "Added ");
            }
            _batches.Add(batch);
            FeatureCount += added;
            ApplyBatch(batch);
            return added;
        }

        /// <summary>True while a batch added by scene/addFeatures is still rising.</summary>
        public bool IsRising
        {
            get
            {
                foreach (AddedBatch b in _batches)
                {
                    if (b.Progress < 1f) return true;
                }
                return false;
            }
        }

        /// <summary>Advances the rise of added batches. A batch starts when the era first has weight.</summary>
        public void Tick(float now)
        {
            foreach (AddedBatch batch in _batches)
            {
                if (batch.Progress >= 1f) continue;
                if (float.IsNaN(batch.Start))
                {
                    if (Weight <= DepthBlend.VisibleWeight) continue;
                    batch.Start = now;
                }
                batch.Progress = DepthBlend.AddedProgress(now - batch.Start);
                ApplyBatch(batch);
            }
        }

        private void ApplyBatch(AddedBatch batch)
        {
            float alpha = DepthBlend.GhostAlpha(Weight) * DepthBlend.AddedAlpha(batch.Progress);
            float rise = DepthBlend.Rise(Weight, _reducedMotion) * DepthBlend.AddedRise(batch.Progress, _reducedMotion);
            foreach (ClassGroup group in batch.Groups) group.Apply(alpha, rise);
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

        /// <summary>The drapes of this era, in draw order.</summary>
        public IEnumerable<DrapeLayer> Drapes
        {
            get { return _drapes; }
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
            foreach (ClassGroup group in _groups) group.Apply(alpha, rise);
            float opacity = DepthBlend.DrapeOpacity(Weight);
            foreach (DrapeLayer drape in _drapes) drape.SetOpacity(opacity);
            _reducedMotion = reducedMotion;
            foreach (AddedBatch batch in _batches) ApplyBatch(batch);
        }

        public bool Raycast(Ray ray, out float distance, out string featureId)
        {
            distance = float.PositiveInfinity;
            featureId = null;
            foreach (ClassGroup group in _groups) RaycastGroup(group, ray, ref distance, ref featureId);
            foreach (AddedBatch batch in _batches)
            {
                foreach (ClassGroup group in batch.Groups) RaycastGroup(group, ray, ref distance, ref featureId);
            }
            return featureId != null;
        }

        private static void RaycastGroup(ClassGroup group, Ray ray, ref float distance, ref string featureId)
        {
            foreach (MeshChunk chunk in group.Chunks)
            {
                float d;
                string id;
                if (chunk.Raycast(ray, out d, out id) && d < distance)
                {
                    distance = d;
                    featureId = id;
                }
            }
        }

        public void Dispose()
        {
            foreach (DrapeLayer drape in _drapes) drape.Dispose();
            _drapes.Clear();
            foreach (Mesh mesh in _meshes) SceneObjects.Destroy(mesh);
            _meshes.Clear();
            foreach (ClassGroup group in _groups) group.Dispose();
            _groups.Clear();
            foreach (AddedBatch batch in _batches)
            {
                foreach (ClassGroup group in batch.Groups) group.Dispose();
            }
            _batches.Clear();
            SceneObjects.Destroy(_root);
        }
    }
}
