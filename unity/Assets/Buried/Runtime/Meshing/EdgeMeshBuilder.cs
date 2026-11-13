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
    /// A building with a recorded storey count also gets one ring at each floor line between the
    /// base and the top: <c>storeys - 1</c> more segments per ring edge, evenly spaced, so that with
    /// the roof line there is one line for each storey. With no storey count (0) none are added.
    ///
    /// Vertex layout (read by Edge.shader): position is the vertex's own end of the segment;
    /// tangent.xyz is the other end; tangent.w is the side, +1 or -1; uv.x is the distance along the
    /// ring at this vertex, in metres, which the dashes use; uv.y is -1 at the start of the segment
    /// and +1 at its end. Positions are the same floats the extruded mesh stores, so the outline sits
    /// on its corners.
    /// </summary>
    public static class EdgeMeshBuilder
    {
        public const int VerticesPerSegment = 4;

        /// <summary>The most storeys a building can be given, as in the Bridge Schema.</summary>
        public const int MaxStoreys = 100;

        /// <summary>Segments in a mesh built by this class.</summary>
        public static int SegmentCount(MeshData mesh)
        {
            return mesh.VertexCount / VerticesPerSegment;
        }

        /// <summary>Segments that <see cref="Build"/> makes for a polygon: 3 per ring vertex, and a ring vertex more for each floor line.</summary>
        public static int ExpectedSegments(PreparedPolygon polygon, int storeys = 0)
        {
            int n = polygon.Outer.Count;
            foreach (List<Vec2d> hole in polygon.Holes) n += hole.Count;
            return (3 + FloorLines(storeys)) * n;
        }

        /// <summary>The floor lines between the base and the roof line of a building with this many storeys.</summary>
        public static int FloorLines(int storeys)
        {
            return storeys > 1 ? Math.Min(storeys, MaxStoreys) - 1 : 0;
        }

        /// <summary>The height of floor line <paramref name="k"/> (1 to storeys - 1) of a building of this height.</summary>
        public static float FloorLineHeight(float heightM, int storeys, int k)
        {
            return heightM * k / Math.Min(storeys, MaxStoreys);
        }

        public static MeshData Build(PreparedPolygon polygon, float heightM, int storeys = 0)
        {
            var mesh = new MeshData();
            AddRing(mesh, polygon.Outer, heightM, storeys);
            foreach (List<Vec2d> hole in polygon.Holes) AddRing(mesh, hole, heightM, storeys);
            return mesh;
        }

        /// <summary>
        /// The roof line only: the top ring of the polygon and nothing else. Today's buildings use it
        /// for the thin lighter edge that keeps a dark volume legible.
        /// </summary>
        public static MeshData BuildRoof(PreparedPolygon polygon, float heightM)
        {
            var mesh = new MeshData();
            AddFlatRing(mesh, polygon.Outer, heightM);
            foreach (List<Vec2d> hole in polygon.Holes) AddFlatRing(mesh, hole, heightM);
            return mesh;
        }

        /// <summary>A ring at one height with no corners or base: the pinned lot's outline on the ground.</summary>
        public static MeshData BuildFlat(PreparedPolygon polygon, float y)
        {
            return BuildRoof(polygon, y);
        }

        private static void AddFlatRing(MeshData mesh, List<Vec2d> ring, float y)
        {
            float along = 0f;
            for (int i = 0; i < ring.Count; i++)
            {
                Vec2d p = ring[i];
                Vec2d q = ring[(i + 1) % ring.Count];
                float length = Length(p, q);
                float next = along + length;
                if (length >= 1e-6f)
                {
                    AddSegment(mesh, new Vector3((float)p.X, y, (float)p.Y), new Vector3((float)q.X, y, (float)q.Y), along, next);
                }
                along = next;
            }
        }

        private static float Length(Vec2d p, Vec2d q)
        {
            double dx = q.X - p.X;
            double dy = q.Y - p.Y;
            return (float)Math.Sqrt(dx * dx + dy * dy);
        }

        private static void AddRing(MeshData mesh, List<Vec2d> ring, float heightM, int storeys)
        {
            int floors = FloorLines(storeys);
            float along = 0f;
            for (int i = 0; i < ring.Count; i++)
            {
                Vec2d p = ring[i];
                Vec2d q = ring[(i + 1) % ring.Count];
                float length = Length(p, q);
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
                if (length >= 1e-6f)
                {
                    for (int k = 1; k <= floors; k++)
                    {
                        float y = FloorLineHeight(heightM, storeys, k);
                        AddSegment(mesh, new Vector3(pBase.x, y, pBase.z), new Vector3(qBase.x, y, qBase.z), along, next);
                    }
                }
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
