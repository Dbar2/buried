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

        /// <summary>
        /// Optional second UV stream: for a ghost, the ground position (x, z in scene metres) of the centre of its
        /// feature's footprint, the same for every vertex of the feature. The shader reads it to stagger the raise.
        /// Either every vertex has one or none does.
        /// </summary>
        public readonly List<Vector2> uvs2 = new List<Vector2>();

        /// <summary>Gives every vertex the same second UV.</summary>
        public void SetUv2ForAll(Vector2 value)
        {
            uvs2.Clear();
            for (int i = 0; i < vertices.Count; i++) uvs2.Add(value);
        }

        /// <summary>The centre of the box of the vertices on the ground plane (x, z), or zero for no vertices.</summary>
        public Vector2 BoxCentreXZ()
        {
            if (vertices.Count == 0) return Vector2.zero;
            float minX = float.PositiveInfinity, maxX = float.NegativeInfinity, minZ = float.PositiveInfinity, maxZ = float.NegativeInfinity;
            foreach (Vector3 v in vertices)
            {
                if (v.x < minX) minX = v.x;
                if (v.x > maxX) maxX = v.x;
                if (v.z < minZ) minZ = v.z;
                if (v.z > maxZ) maxZ = v.z;
            }
            return new Vector2((minX + maxX) * 0.5f, (minZ + maxZ) * 0.5f);
        }

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
            if (vertices.Count > 0 && (uvs2.Count > 0) != (other.uvs2.Count > 0))
            {
                throw new System.InvalidOperationException("Cannot combine a mesh with a second UV stream and one without.");
            }
            int offset = vertices.Count;
            vertices.AddRange(other.vertices);
            normals.AddRange(other.normals);
            uvs.AddRange(other.uvs);
            tangents.AddRange(other.tangents);
            uvs2.AddRange(other.uvs2);
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
            if (uvs2.Count == vertices.Count && uvs2.Count > 0) mesh.SetUVs(1, uvs2);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}
