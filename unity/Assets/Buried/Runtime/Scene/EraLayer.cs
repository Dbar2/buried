using System;
using System.Collections.Generic;
using Buried.Geo;
using Buried.Interop;
using Buried.Meshing;
using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// What one era draws: the extruded ghosts it was sent and its drapes. It draws exactly the
    /// features it received; it never filters or adds any by a rule of its own.
    /// Gate version: one plain material. The confidence treatments come in task group 4.
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
        private readonly List<GameObject> _chunkObjects = new List<GameObject>();
        private readonly List<Mesh> _meshes = new List<Mesh>();
        private readonly List<DrapeLayer> _drapes = new List<DrapeLayer>();

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
        /// Builds a mesh for each building feature. A feature that cannot be built is reported through
        /// <paramref name="onFailure"/> and skipped; the others are still drawn. Water is not drawn yet.
        /// </summary>
        public void AddFeatures(
            IEnumerable<SceneFeatureDto> features, ProjectFrame frame, Material material, Action<string, string> onFailure)
        {
            MeshChunk chunk = null;
            foreach (SceneFeatureDto feature in features)
            {
                if (feature.kind != SceneFeatureDto.KindBuilding) continue;

                MeshData data;
                try
                {
                    data = BuildBuilding(feature, frame);
                }
                catch (InvalidOperationException e)
                {
                    onFailure(feature.id, e.Message);
                    continue;
                }
                if (data == null)
                {
                    onFailure(feature.id, "the footprint has no area after cleaning");
                    continue;
                }

                if (chunk == null || !chunk.CanTake(data))
                {
                    chunk = new MeshChunk();
                    _chunks.Add(chunk);
                }
                chunk.Add(feature.id, data);
                FeatureCount++;
            }

            int n = 0;
            foreach (MeshChunk c in _chunks)
            {
                Mesh mesh = c.BuildMesh("Ghosts " + EraId + " " + n);
                var go = new GameObject("Ghosts " + n);
                go.transform.SetParent(_root.transform, false);
                go.AddComponent<MeshFilter>().sharedMesh = mesh;
                MeshRenderer renderer = go.AddComponent<MeshRenderer>();
                renderer.sharedMaterial = material;
                renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                renderer.receiveShadows = false;
                _meshes.Add(mesh);
                _chunkObjects.Add(go);
                n++;
            }
        }

        private static MeshData BuildBuilding(SceneFeatureDto feature, ProjectFrame frame)
        {
            var combined = new MeshData();
            bool any = false;
            foreach (List<List<double[]>> polygon in feature.geometry.polygons)
            {
                List<Vec2d> exterior = ToLocal(polygon[0], frame);
                var holes = new List<IList<Vec2d>>();
                for (int i = 1; i < polygon.Count; i++) holes.Add(ToLocal(polygon[i], frame));

                PreparedPolygon prepared = PolygonPrep.Prepare(exterior, holes);
                if (prepared == null) continue;
                combined.Append(Extruder.Extrude(prepared, (float)feature.heightM));
                any = true;
            }
            return any ? combined : null;
        }

        private static List<Vec2d> ToLocal(List<double[]> ring, ProjectFrame frame)
        {
            var result = new List<Vec2d>(ring.Count);
            foreach (double[] p in ring) result.Add(frame.ToLocal(p[0], p[1]));
            return result;
        }

        public void AddDrape(DrapeLayer drape)
        {
            _drapes.Add(drape);
        }

        public void SetVisible(bool visible)
        {
            _root.SetActive(visible);
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
            if (_root != null) UnityEngine.Object.Destroy(_root);
        }
    }
}
