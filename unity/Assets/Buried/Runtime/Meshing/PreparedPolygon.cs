using System.Collections.Generic;
using Buried.Geo;

namespace Buried.Meshing
{
    /// <summary>
    /// A polygon ready to triangulate: no closing vertex, no duplicates or collinear vertices,
    /// the exterior counter-clockwise and the holes clockwise (seen from above, x east, y north).
    /// </summary>
    public sealed class PreparedPolygon
    {
        public List<Vec2d> Outer;
        public List<List<Vec2d>> Holes = new List<List<Vec2d>>();
    }
}
