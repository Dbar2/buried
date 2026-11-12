using System;
using System.Collections.Generic;
using Buried.Geo;
using UnityEngine;

namespace Buried.Meshing
{
    /// <summary>
    /// Extrudes a prepared polygon from the ground (y = 0) up to a height: a top cap (normals +y), no
    /// bottom cap, and one wall quad per ring edge with outward normals. Walls do not share vertices,
    /// so edges stay sharp. Triangles follow Unity's front-face rule (clockwise seen from the front).
    /// </summary>
    public static class Extruder
    {
        /// <summary>Cap triangles with less area than this are dropped.</summary>
        public const double MinTriangleAreaM2 = 1e-6;

        public static MeshData Extrude(PreparedPolygon polygon, float heightM)
        {
            var mesh = new MeshData();

            List<Vec2d> vertices;
            List<int> triangles = Triangulator.Triangulate(polygon, out vertices);

            int capBase = mesh.VertexCount;
            foreach (Vec2d p in vertices)
            {
                mesh.AddVertex(
                    new Vector3((float)p.X, heightM, (float)p.Y),
                    Vector3.up,
                    new Vector2((float)p.X, (float)p.Y));
            }
            for (int t = 0; t + 2 < triangles.Count; t += 3)
            {
                Vec2d a = vertices[triangles[t]];
                Vec2d b = vertices[triangles[t + 1]];
                Vec2d c = vertices[triangles[t + 2]];
                double area = 0.5 * ((b.X - a.X) * (c.Y - a.Y) - (b.Y - a.Y) * (c.X - a.X));
                if (area < MinTriangleAreaM2) continue;
                // The triangulator returns counter-clockwise (x, y) triangles; Unity wants the
                // top face clockwise seen from above, so the last two indices swap.
                mesh.AddTriangle(capBase + triangles[t], capBase + triangles[t + 2], capBase + triangles[t + 1]);
            }

            AddWalls(mesh, polygon.Outer, heightM);
            foreach (List<Vec2d> hole in polygon.Holes) AddWalls(mesh, hole, heightM);
            return mesh;
        }

        private static void AddWalls(MeshData mesh, List<Vec2d> ring, float heightM)
        {
            float along = 0f;
            for (int i = 0; i < ring.Count; i++)
            {
                Vec2d p = ring[i];
                Vec2d q = ring[(i + 1) % ring.Count];
                double dx = q.X - p.X;
                double dy = q.Y - p.Y;
                double length = Math.Sqrt(dx * dx + dy * dy);
                if (length < 1e-9) continue;

                // Right of the direction of travel: outward for a counter-clockwise exterior, and
                // into the hole for a clockwise hole. Both point away from the solid.
                var normal = new Vector3((float)(dy / length), 0f, (float)(-dx / length));
                float next = along + (float)length;

                int p0 = mesh.AddVertex(new Vector3((float)p.X, 0f, (float)p.Y), normal, new Vector2(along, 0f));
                int p1 = mesh.AddVertex(new Vector3((float)p.X, heightM, (float)p.Y), normal, new Vector2(along, heightM));
                int q1 = mesh.AddVertex(new Vector3((float)q.X, heightM, (float)q.Y), normal, new Vector2(next, heightM));
                int q0 = mesh.AddVertex(new Vector3((float)q.X, 0f, (float)q.Y), normal, new Vector2(next, 0f));
                mesh.AddTriangle(p0, p1, q1);
                mesh.AddTriangle(p0, q1, q0);
                along = next;
            }
        }
    }
}
