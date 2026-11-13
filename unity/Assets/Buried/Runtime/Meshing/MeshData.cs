using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Buried.Meshing
{
    /// <summary>Plain mesh buffers, so builders can be tested without creating a UnityEngine.Mesh.</summary>
    public sealed class MeshData
    {
        public readonly List<Vector3> vertices = new List<Vector3>();
        public readonly List<Vector3> normals = new List<Vector3>();
        public readonly List<Vector2> uvs = new List<Vector2>();
        public readonly List<int> triangles = new List<int>();

        /// <summary>
        /// Optional fourth vertex stream, used by edge meshes (the other end of the segment and the side).
        /// Either every vertex has one or none does.
        /// </summary>
        public readonly List<Vector4> tangents = new List<Vector4>();

        public int VertexCount
        {
            get { return vertices.Count; }
        }

        public int TriangleCount
        {
            get { return triangles.Count / 3; }
        }

        public int AddVertex(Vector3 position, Vector3 normal, Vector2 uv)
        {
            vertices.Add(position);
            normals.Add(normal);
            uvs.Add(uv);
            return vertices.Count - 1;
        }

        public int AddVertex(Vector3 position, Vector3 normal, Vector2 uv, Vector4 tangent)
        {
            tangents.Add(tangent);
            return AddVertex(position, normal, uv);
        }

        public void AddTriangle(int a, int b, int c)
        {
            triangles.Add(a);
            triangles.Add(b);
            triangles.Add(c);
        }

        public void Append(MeshData other)
        {
            if (vertices.Count > 0 && (tangents.Count > 0) != (other.tangents.Count > 0))
            {
                throw new System.InvalidOperationException("Cannot combine a mesh with tangents and one without.");
            }
            int offset = vertices.Count;
            vertices.AddRange(other.vertices);
            normals.AddRange(other.normals);
            uvs.AddRange(other.uvs);
            tangents.AddRange(other.tangents);
            foreach (int index in other.triangles) triangles.Add(index + offset);
        }

        /// <summary>Corner positions of triangle t.</summary>
        public void GetTriangle(int t, out Vector3 a, out Vector3 b, out Vector3 c)
        {
            a = vertices[triangles[3 * t]];
            b = vertices[triangles[3 * t + 1]];
            c = vertices[triangles[3 * t + 2]];
        }

        /// <summary>Normal of triangle t by the cross product of its edges (Unity's front-face rule).</summary>
        public Vector3 TriangleNormal(int t)
        {
            Vector3 a, b, c;
            GetTriangle(t, out a, out b, out c);
            return Vector3.Cross(b - a, c - a).normalized;
        }

        public double TriangleArea(int t)
        {
            Vector3 a, b, c;
            GetTriangle(t, out a, out b, out c);
            return 0.5 * Vector3.Cross(b - a, c - a).magnitude;
        }

        public Mesh ToMesh(string name)
        {
            var mesh = new Mesh { name = name, indexFormat = IndexFormat.UInt32 };
            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            if (tangents.Count == vertices.Count && tangents.Count > 0) mesh.SetTangents(tangents);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}
