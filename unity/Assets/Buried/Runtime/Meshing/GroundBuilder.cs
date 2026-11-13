using UnityEngine;

namespace Buried.Meshing
{
    /// <summary>The ground: one big quad at y = 0 in the fog colour, so the edge of the coverage area dissolves.</summary>
    public static class GroundBuilder
    {
        /// <summary>A square quad centred on (cx, cz) that reaches <paramref name="halfExtent"/> metres in each direction.</summary>
        public static MeshData Build(float cx, float cz, float halfExtent)
        {
            var ground = new MeshData();
            int a = ground.AddVertex(new Vector3(cx - halfExtent, 0f, cz - halfExtent), Vector3.up, Vector2.zero);
            int b = ground.AddVertex(new Vector3(cx - halfExtent, 0f, cz + halfExtent), Vector3.up, Vector2.zero);
            int c = ground.AddVertex(new Vector3(cx + halfExtent, 0f, cz + halfExtent), Vector3.up, Vector2.zero);
            int d = ground.AddVertex(new Vector3(cx + halfExtent, 0f, cz - halfExtent), Vector3.up, Vector2.zero);
            ground.AddTriangle(a, b, c);
            ground.AddTriangle(a, c, d);
            return ground;
        }
    }
}
