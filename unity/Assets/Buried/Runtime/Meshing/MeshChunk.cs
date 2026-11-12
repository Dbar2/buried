using System.Collections.Generic;
using UnityEngine;

namespace Buried.Meshing
{
    /// <summary>
    /// Per-feature meshes of one era and one material combined into one mesh, with a table from
    /// triangle ranges to feature ids so a ray hit maps back to a feature.
    /// Picking is done here by ray-triangle tests, so the Player needs no physics module.
    /// </summary>
    public sealed class MeshChunk
    {
        /// <summary>Most vertices in one chunk (design.md "Meshing").</summary>
        public const int MaxVertices = 500_000;

        private struct Range
        {
            public int FirstTriangle;
            public int TriangleCount;
            public string FeatureId;
        }

        private readonly MeshData _data = new MeshData();
        private readonly List<Range> _ranges = new List<Range>();

        public MeshData Data
        {
            get { return _data; }
        }

        public int VertexCount
        {
            get { return _data.VertexCount; }
        }

        public bool CanTake(MeshData part)
        {
            return _data.VertexCount == 0 || _data.VertexCount + part.VertexCount <= MaxVertices;
        }

        public void Add(string featureId, MeshData part)
        {
            _ranges.Add(new Range
            {
                FirstTriangle = _data.TriangleCount,
                TriangleCount = part.TriangleCount,
                FeatureId = featureId,
            });
            _data.Append(part);
        }

        public Mesh BuildMesh(string name)
        {
            return _data.ToMesh(name);
        }

        /// <summary>The id of the feature that owns triangle <paramref name="triangle"/>, or null.</summary>
        public string FeatureOfTriangle(int triangle)
        {
            foreach (Range r in _ranges)
            {
                if (triangle >= r.FirstTriangle && triangle < r.FirstTriangle + r.TriangleCount) return r.FeatureId;
            }
            return null;
        }

        /// <summary>Nearest hit of a world-space ray with any triangle. Both faces count.</summary>
        public bool Raycast(Ray ray, out float distance, out string featureId)
        {
            distance = float.PositiveInfinity;
            featureId = null;
            foreach (Range r in _ranges)
            {
                for (int t = r.FirstTriangle; t < r.FirstTriangle + r.TriangleCount; t++)
                {
                    Vector3 a, b, c;
                    _data.GetTriangle(t, out a, out b, out c);
                    float d;
                    if (RayTriangle(ray, a, b, c, out d) && d < distance)
                    {
                        distance = d;
                        featureId = r.FeatureId;
                    }
                }
            }
            return featureId != null;
        }

        /// <summary>Moeller-Trumbore, double sided.</summary>
        public static bool RayTriangle(Ray ray, Vector3 a, Vector3 b, Vector3 c, out float distance)
        {
            distance = 0f;
            Vector3 e1 = b - a;
            Vector3 e2 = c - a;
            Vector3 p = Vector3.Cross(ray.direction, e2);
            float det = Vector3.Dot(e1, p);
            if (det > -1e-9f && det < 1e-9f) return false;
            float inv = 1f / det;
            Vector3 s = ray.origin - a;
            float u = Vector3.Dot(s, p) * inv;
            if (u < 0f || u > 1f) return false;
            Vector3 q = Vector3.Cross(s, e1);
            float v = Vector3.Dot(ray.direction, q) * inv;
            if (v < 0f || u + v > 1f) return false;
            float t = Vector3.Dot(e2, q) * inv;
            if (t <= 0f) return false;
            distance = t;
            return true;
        }
    }
}
