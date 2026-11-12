using Buried.Geo;
using UnityEngine;

namespace Buried.Meshing
{
    /// <summary>
    /// The mesh a raster is draped on: a grid whose vertices are the bilinear interpolation of the
    /// four corners it was sent. For a parallelogram (an affine tile) this equals the affine mapping
    /// exactly. Corners are local positions (relative to the project origin), top-left first, then
    /// clockwise. The mesh lies at y = 0 and faces up.
    /// </summary>
    public static class DrapeMeshBuilder
    {
        public const int DefaultGrid = 16;

        public static MeshData Build(Vec2d topLeft, Vec2d topRight, Vec2d bottomRight, Vec2d bottomLeft, int grid = DefaultGrid)
        {
            var mesh = new MeshData();
            for (int j = 0; j <= grid; j++)
            {
                double v = (double)j / grid;
                for (int i = 0; i <= grid; i++)
                {
                    double u = (double)i / grid;
                    double x = (1.0 - v) * ((1.0 - u) * topLeft.X + u * topRight.X)
                             + v * ((1.0 - u) * bottomLeft.X + u * bottomRight.X);
                    double y = (1.0 - v) * ((1.0 - u) * topLeft.Y + u * topRight.Y)
                             + v * ((1.0 - u) * bottomLeft.Y + u * bottomRight.Y);
                    mesh.AddVertex(new Vector3((float)x, 0f, (float)y), Vector3.up, new Vector2((float)u, (float)(1.0 - v)));
                }
            }

            int stride = grid + 1;
            for (int j = 0; j < grid; j++)
            {
                for (int i = 0; i < grid; i++)
                {
                    int a = j * stride + i;
                    int b = a + 1;
                    int c = a + stride;
                    int d = c + 1;
                    mesh.AddTriangle(a, b, c);
                    mesh.AddTriangle(b, d, c);
                }
            }
            return mesh;
        }
    }
}
