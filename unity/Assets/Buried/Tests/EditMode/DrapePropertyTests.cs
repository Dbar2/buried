using System;
using Buried.Geo;
using Buried.Meshing;
using NUnit.Framework;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>
    /// Property E9: drape meshes follow the corners. For convex quads of 50 to 2000 m, the corner
    /// vertices equal the corners (after ToWorld) within 1 mm, every grid vertex equals the bilinear
    /// interpolation of the corners within 1 mm, and for a parallelogram every interior point of every
    /// triangle equals the affine mapping within 1 mm.
    /// </summary>
    public class DrapePropertyTests
    {
        private const double Tolerance = 0.001;

        private struct Quad
        {
            public Vec2d TopLeft, TopRight, BottomRight, BottomLeft;
            public bool Parallelogram;
        }

        private static Vec2d Add(Vec2d a, Vec2d b)
        {
            return new Vec2d(a.X + b.X, a.Y + b.Y);
        }

        private static Quad RandomQuad(System.Random rng)
        {
            double lengthA = PropertyRunner.Uniform(rng, 50.0, 1500.0);
            double lengthB = PropertyRunner.Uniform(rng, 50.0, 1500.0);
            double heading = PropertyRunner.Uniform(rng, 0.0, 2.0 * Math.PI);
            double between = PropertyRunner.Uniform(rng, Math.PI * 0.35, Math.PI * 0.65);

            var a = new Vec2d(lengthA * Math.Cos(heading), lengthA * Math.Sin(heading));
            var b = new Vec2d(lengthB * Math.Cos(heading + between), lengthB * Math.Sin(heading + between));
            var topLeft = new Vec2d(PropertyRunner.Uniform(rng, -1500.0, 1500.0), PropertyRunner.Uniform(rng, -1500.0, 1500.0));

            bool parallelogram = rng.NextDouble() < 0.5;
            Vec2d bottomRight = Add(Add(topLeft, a), b);
            if (!parallelogram)
            {
                // Pull the far corner in or out a little; the quad stays convex.
                double pull = PropertyRunner.Uniform(rng, -0.1, 0.1) * Math.Min(lengthA, lengthB);
                bottomRight = new Vec2d(bottomRight.X + pull * Math.Cos(heading + between / 2.0), bottomRight.Y + pull * Math.Sin(heading + between / 2.0));
            }
            return new Quad
            {
                TopLeft = topLeft,
                TopRight = Add(topLeft, a),
                BottomRight = bottomRight,
                BottomLeft = Add(topLeft, b),
                Parallelogram = parallelogram,
            };
        }

        private static Vec2d Bilinear(Quad q, double u, double v)
        {
            double x = (1 - v) * ((1 - u) * q.TopLeft.X + u * q.TopRight.X) + v * ((1 - u) * q.BottomLeft.X + u * q.BottomRight.X);
            double y = (1 - v) * ((1 - u) * q.TopLeft.Y + u * q.TopRight.Y) + v * ((1 - u) * q.BottomLeft.Y + u * q.BottomRight.Y);
            return new Vec2d(x, y);
        }

        [Test]
        public void DrapeMeshesFollowTheCorners()
        {
            PropertyRunner.Run("E9 drape", 901, (rng, caseIndex) =>
            {
                Quad q = RandomQuad(rng);
                MeshData mesh = DrapeMeshBuilder.Build(q.TopLeft, q.TopRight, q.BottomRight, q.BottomLeft);
                int grid = DrapeMeshBuilder.DefaultGrid;
                int stride = grid + 1;

                AssertNear(mesh.vertices[0], q.TopLeft, "top-left corner");
                AssertNear(mesh.vertices[grid], q.TopRight, "top-right corner");
                AssertNear(mesh.vertices[grid * stride + grid], q.BottomRight, "bottom-right corner");
                AssertNear(mesh.vertices[grid * stride], q.BottomLeft, "bottom-left corner");

                for (int j = 0; j <= grid; j++)
                {
                    for (int i = 0; i <= grid; i++)
                    {
                        AssertNear(mesh.vertices[j * stride + i], Bilinear(q, (double)i / grid, (double)j / grid), "grid vertex " + i + "," + j);
                    }
                }

                if (!q.Parallelogram) return;
                // Interior points: the mesh is linear in each triangle, the affine mapping is linear,
                // and they agree at the vertices, so they agree everywhere inside.
                for (int sample = 0; sample < 5; sample++)
                {
                    int t = rng.Next(mesh.TriangleCount);
                    double w1 = rng.NextDouble();
                    double w2 = rng.NextDouble() * (1.0 - w1);
                    double w0 = 1.0 - w1 - w2;
                    int i0 = mesh.triangles[3 * t], i1 = mesh.triangles[3 * t + 1], i2 = mesh.triangles[3 * t + 2];

                    double px = w0 * mesh.vertices[i0].x + w1 * mesh.vertices[i1].x + w2 * mesh.vertices[i2].x;
                    double pz = w0 * mesh.vertices[i0].z + w1 * mesh.vertices[i1].z + w2 * mesh.vertices[i2].z;
                    double u = w0 * mesh.uvs[i0].x + w1 * mesh.uvs[i1].x + w2 * mesh.uvs[i2].x;
                    double v = 1.0 - (w0 * mesh.uvs[i0].y + w1 * mesh.uvs[i1].y + w2 * mesh.uvs[i2].y);

                    double ex = q.TopLeft.X + u * (q.TopRight.X - q.TopLeft.X) + v * (q.BottomLeft.X - q.TopLeft.X);
                    double ey = q.TopLeft.Y + u * (q.TopRight.Y - q.TopLeft.Y) + v * (q.BottomLeft.Y - q.TopLeft.Y);
                    Assert.LessOrEqual(Math.Abs(px - ex), Tolerance, "interior x");
                    Assert.LessOrEqual(Math.Abs(pz - ey), Tolerance, "interior z");
                }
            });
        }

        private static void AssertNear(Vector3 actual, Vec2d expected, string what)
        {
            Assert.LessOrEqual(Math.Abs(actual.x - expected.X), Tolerance, what + " x");
            Assert.LessOrEqual(Math.Abs(actual.z - expected.Y), Tolerance, what + " z");
            Assert.AreEqual(0f, actual.y, what + " y");
        }
    }
}
