using System;
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
            /// <summary>The top ring only (see <see cref="EdgeMeshBuilder.BuildRoof"/>); empty unless asked for.</summary>
            public MeshData Roof;
        }

        /// <summary>What to build besides the volume.</summary>
        public struct Options
        {
            /// <summary>Recorded storeys, or 0 for none: floor lines are drawn only when it is above 1.</summary>
            public int Storeys;
            /// <summary>False for a volume with no outline (unknown confidence): <see cref="Result.Edges"/> is then empty.</summary>
            public bool Outline;
            /// <summary>True to also build the roof line, for today's buildings.</summary>
            public bool RoofLine;
            /// <summary>True for an outline of the top ring only: no base ring, no corners, no storey lines (a small draft, session 046).</summary>
            public bool RoofOnly;

            public static Options Default
            {
                get { return new Options { Storeys = 0, Outline = true, RoofLine = false }; }
            }
        }

        /// <summary>The meshes for a footprint, or null when no ring survives cleaning.</summary>
        public static Result Build(GeometryDto geometry, float heightM, ProjectFrame frame)
        {
            return Build(geometry, heightM, frame, Options.Default);
        }

        public static Result Build(GeometryDto geometry, float heightM, ProjectFrame frame, Options options)
        {
            var fill = new MeshData();
            var edges = new MeshData();
            var roof = new MeshData();
            bool any = false;
            foreach (List<List<double[]>> polygon in geometry.polygons)
            {
                List<Vec2d> exterior = ToLocal(polygon[0], frame);
                var holes = new List<IList<Vec2d>>();
                for (int i = 1; i < polygon.Count; i++) holes.Add(ToLocal(polygon[i], frame));

                PreparedPolygon prepared = PolygonPrep.Prepare(exterior, holes);
                if (prepared == null) continue;
                fill.Append(Extruder.Extrude(prepared, heightM));
                if (options.Outline)
                {
                    edges.Append(options.RoofOnly ? EdgeMeshBuilder.BuildRoof(prepared, heightM) : EdgeMeshBuilder.Build(prepared, heightM, options.Storeys));
                }
                if (options.RoofLine) roof.Append(EdgeMeshBuilder.BuildRoof(prepared, heightM));
                any = true;
            }
            return any ? new Result { Fill = fill, Edges = edges, Roof = roof } : null;
        }

        /// <summary>
        /// The ground outline of a polygon or MultiPolygon at height <paramref name="y"/>: one flat ring
        /// per ring of the geometry. Null when no ring survives cleaning.
        /// </summary>
        public static MeshData BuildFlatOutline(GeometryDto geometry, float y, ProjectFrame frame)
        {
            var outline = new MeshData();
            bool any = false;
            foreach (List<List<double[]>> polygon in geometry.polygons)
            {
                var holes = new List<IList<Vec2d>>();
                for (int i = 1; i < polygon.Count; i++) holes.Add(ToLocal(polygon[i], frame));
                PreparedPolygon prepared = PolygonPrep.Prepare(ToLocal(polygon[0], frame), holes);
                if (prepared == null) continue;
                outline.Append(EdgeMeshBuilder.BuildFlat(prepared, y));
                any = true;
            }
            return any ? outline : null;
        }

        /// <summary>
        /// The area of a polygon or MultiPolygon footprint in square metres: each exterior ring less its holes, by the shoelace formula on
        /// the EPSG:26917 coordinates it carries.
        /// </summary>
        public static double AreaM2(GeometryDto geometry)
        {
            double total = 0.0;
            foreach (List<List<double[]>> polygon in geometry.polygons)
            {
                for (int i = 0; i < polygon.Count; i++)
                {
                    double ring = Math.Abs(RingArea(polygon[i]));
                    total += i == 0 ? ring : -ring;
                }
            }
            return total;
        }

        private static double RingArea(List<double[]> ring)
        {
            double sum = 0.0;
            if (ring.Count < 3) return 0.0;
            double e0 = ring[0][0], n0 = ring[0][1]; // from the first point, so the products stay small
            for (int i = 0; i < ring.Count; i++)
            {
                double[] a = ring[i];
                double[] b = ring[(i + 1) % ring.Count];
                sum += (a[0] - e0) * (b[1] - n0) - (b[0] - e0) * (a[1] - n0);
            }
            return 0.5 * sum;
        }

        private static List<Vec2d> ToLocal(List<double[]> ring, ProjectFrame frame)
        {
            var result = new List<Vec2d>(ring.Count);
            foreach (double[] p in ring) result.Add(frame.ToLocal(p[0], p[1]));
            return result;
        }
    }
}
