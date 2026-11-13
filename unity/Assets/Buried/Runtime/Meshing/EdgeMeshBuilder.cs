using System;
using System.Collections.Generic;
using Buried.Geo;
using UnityEngine;

namespace Buried.Meshing
{
    /// <summary>
    /// The outline of an extruded polygon as quads for the Buried/Edge shader: for each ring, the top
    /// ring at the building's height, the base ring at y = 0 and one vertical segment at each corner.
    /// Each ring edge therefore gives three segments, and every segment is one quad of four vertices.
    ///
    /// Vertex layout (read by Edge.shader): position is the vertex's own end of the segment;
    /// tangent.xyz is the other end; tangent.w is the side, +1 or -1; uv.x is the distance along the
    /// ring at this vertex, in metres, which the dashes of task group 4 will use; uv.y is -1 at the
    /// start of the segment and +1 at its end. Positions are the same floats the extruded mesh
    /// stores, so the outline sits on its corners.
    /// </summary>
    public static class EdgeMeshBuilder
    {
        public const int VerticesPerSegment = 4;

        /// <summary>Segments in a mesh built by this class.</summary>
        public static int SegmentCount(MeshData mesh)
        {
            return mesh.VertexCount / VerticesPerSegment;
        }

        /// <summary>Segments that <see cref="Build"/> makes for a polygon: 3 per ring vertex.</summary>
        public static int ExpectedSegments(PreparedPolygon polygon)
        {
            int n = polygon.Outer.Count;
            foreach (List<Vec2d> hole in polygon.Holes) n += hole.Count;
            return 3 * n;
        }

        public static MeshData Build(PreparedPolygon polygon, float heightM)
        {
            var mesh = new MeshData();
            AddRing(mesh, polygon.Outer, heightM);
            foreach (List<Vec2d> hole in polygon.Holes) AddRing(mesh, hole, heightM);
            return mesh;
        }

        private static void AddRing(MeshData mesh, List<Vec2d> ring, float heightM)
        {
            float along = 0f;
            for (int i = 0; i < ring.Count; i++)
            {
                Vec2d p = ring[i];
                Vec2d q = ring[(i + 1) % ring.Count];
                double dx = q.X - p.X;
                double dy = q.Y - p.Y;
                float length = (float)Math.Sqrt(dx * dx + dy * dy);
                float next = along + length;

                var pBase = new Vector3((float)p.X, 0f, (float)p.Y);
                var pTop = new Vector3((float)p.X, heightM, (float)p.Y);
                var qBase = new Vector3((float)q.X, 0f, (float)q.Y);
                var qTop = new Vector3((float)q.X, heightM, (float)q.Y);

                if (length >= 1e-6f)
                {
                    AddSegment(mesh, pTop, qTop, along, next);
                    AddSegment(mesh, pBase, qBase, along, next);
                }
                AddSegment(mesh, pBase, pTop, along, along);
                along = next;
            }
        }

        private static void AddSegment(MeshData mesh, Vector3 a, Vector3 b, float alongA, float alongB)
        {
            int a0 = mesh.AddVertex(a, Vector3.up, new Vector2(alongA, -1f), new Vector4(b.x, b.y, b.z, 1f));
            int a1 = mesh.AddVertex(a, Vector3.up, new Vector2(alongA, -1f), new Vector4(b.x, b.y, b.z, -1f));
            int b0 = mesh.AddVertex(b, Vector3.up, new Vector2(alongB, 1f), new Vector4(a.x, a.y, a.z, 1f));
            int b1 = mesh.AddVertex(b, Vector3.up, new Vector2(alongB, 1f), new Vector4(a.x, a.y, a.z, -1f));
            mesh.AddTriangle(a0, b0, a1);
            mesh.AddTriangle(a1, b0, b1);
        }
    }
}
