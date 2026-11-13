using System.Collections.Generic;
using Buried.Geo;
using Buried.Interop;
using Buried.Meshing;

namespace Buried.Scene
{
    /// <summary>
    /// A polygon or MultiPolygon footprint as an extruded volume and its outline. Shared by the era
    /// layers (ghosts) and the present layer.
    /// </summary>
    public static class FootprintBuilder
    {
        public sealed class Result
        {
            public MeshData Fill;
            public MeshData Edges;
        }

        /// <summary>The meshes for a footprint, or null when no ring survives cleaning.</summary>
        public static Result Build(GeometryDto geometry, float heightM, ProjectFrame frame)
        {
            var fill = new MeshData();
            var edges = new MeshData();
            bool any = false;
            foreach (List<List<double[]>> polygon in geometry.polygons)
            {
                List<Vec2d> exterior = ToLocal(polygon[0], frame);
                var holes = new List<IList<Vec2d>>();
                for (int i = 1; i < polygon.Count; i++) holes.Add(ToLocal(polygon[i], frame));

                PreparedPolygon prepared = PolygonPrep.Prepare(exterior, holes);
                if (prepared == null) continue;
                fill.Append(Extruder.Extrude(prepared, heightM));
                edges.Append(EdgeMeshBuilder.Build(prepared, heightM));
                any = true;
            }
            return any ? new Result { Fill = fill, Edges = edges } : null;
        }

        private static List<Vec2d> ToLocal(List<double[]> ring, ProjectFrame frame)
        {
            var result = new List<Vec2d>(ring.Count);
            foreach (double[] p in ring) result.Add(frame.ToLocal(p[0], p[1]));
            return result;
        }
    }
}
