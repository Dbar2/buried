using System;
using System.Collections.Generic;
using System.Linq;
using Buried.Geo;
using Buried.Meshing;
using NUnit.Framework;

namespace Buried.Tests
{
    /// <summary>
    /// Property E4: extrusion never produces degenerate triangles. For generated star-shaped and
    /// rectilinear polygons (3 to 64 vertices, building scale 2 to 200 m, up to 3 disjoint holes
    /// strictly inside, with optional collinear and duplicate vertices) and heights of 1 to 100 m:
    /// no triangle is degenerate, caps sum to the polygon's area, cap normals are +y, wall normals
    /// point away from the solid, and every ring edge has exactly one wall quad.
    /// </summary>
    public class ExtrusionPropertyTests
    {
        private const double TwoPi = 2.0 * Math.PI;

        private struct Shape
        {
            public List<Vec2d> Outer;
            public List<List<Vec2d>> Holes;
        }

        // ---- Generators ----

        private static Shape Star(System.Random rng, bool withHoles)
        {
            int n = PropertyRunner.Between(rng, withHoles ? 8 : 3, 64);
            double radius = PropertyRunner.Uniform(rng, 1.0, 100.0);
            double cx = PropertyRunner.Uniform(rng, -500.0, 500.0);
            double cy = PropertyRunner.Uniform(rng, -500.0, 500.0);

            var outer = new List<Vec2d>();
            for (int i = 0; i < n; i++)
            {
                double step = TwoPi / n;
                double angle = i * step + PropertyRunner.Uniform(rng, -0.2, 0.2) * step;
                double r = PropertyRunner.Uniform(rng, 0.4 * radius, radius);
                outer.Add(new Vec2d(cx + r * Math.Cos(angle), cy + r * Math.Sin(angle)));
            }

            var holes = new List<List<Vec2d>>();
            if (withHoles)
            {
                int count = PropertyRunner.Between(rng, 1, 3);
                for (int k = 0; k < count; k++)
                {
                    double angle = k * TwoPi / 3.0;
                    double half = PropertyRunner.Uniform(rng, 0.02, 0.06) * radius;
                    double hx = cx + 0.12 * radius * Math.Cos(angle);
                    double hy = cy + 0.12 * radius * Math.Sin(angle);
                    holes.Add(Square(hx, hy, half));
                }
            }
            return new Shape { Outer = outer, Holes = holes };
        }

        private static List<Vec2d> Square(double cx, double cy, double half)
        {
            return new List<Vec2d>
            {
                new Vec2d(cx - half, cy - half),
                new Vec2d(cx + half, cy - half),
                new Vec2d(cx + half, cy + half),
                new Vec2d(cx - half, cy + half),
            };
        }

        /// <summary>A histogram polygon: columns of random width and height standing on y = 0.</summary>
        private static Shape Rectilinear(System.Random rng, bool withHoles)
        {
            int columns = PropertyRunner.Between(rng, 1, 12);
            double ox = PropertyRunner.Uniform(rng, -500.0, 500.0);
            double oy = PropertyRunner.Uniform(rng, -500.0, 500.0);

            var x = new List<double> { 0.0 };
            var h = new List<double>();
            for (int i = 0; i < columns; i++)
            {
                x.Add(x[i] + PropertyRunner.Uniform(rng, 3.0, 20.0));
                bool sameAsPrevious = i > 0 && rng.NextDouble() < 0.2;
                h.Add(sameAsPrevious ? h[i - 1] : PropertyRunner.Uniform(rng, 3.0, 30.0));
            }
            double width = x[columns];

            var outer = new List<Vec2d> { new Vec2d(ox, oy), new Vec2d(ox + width, oy) };
            for (int i = columns - 1; i >= 0; i--)
            {
                outer.Add(new Vec2d(ox + x[i + 1], oy + h[i]));
                outer.Add(new Vec2d(ox + x[i], oy + h[i]));
            }

            var holes = new List<List<Vec2d>>();
            if (withHoles)
            {
                double minHeight = h.Min();
                double cell = width / 3.0;
                int count = PropertyRunner.Between(rng, 1, 3);
                for (int k = 0; k < count; k++)
                {
                    double side = PropertyRunner.Uniform(rng, 0.15, 0.4) * Math.Min(cell, minHeight);
                    double hx = ox + (k + 0.5) * cell + PropertyRunner.Uniform(rng, -0.1, 0.1) * cell;
                    double hy = oy + minHeight * 0.5 + PropertyRunner.Uniform(rng, -0.1, 0.1) * minHeight;
                    holes.Add(Square(hx, hy, side * 0.5));
                }
            }
            return new Shape { Outer = outer, Holes = holes };
        }

        /// <summary>Adds the clutter real data has: a repeated closing vertex, collinear and duplicate vertices, either winding.</summary>
        private static List<Vec2d> Messy(System.Random rng, List<Vec2d> ring)
        {
            var result = new List<Vec2d>();
            int start = rng.Next(ring.Count);
            for (int k = 0; k < ring.Count; k++)
            {
                Vec2d a = ring[(start + k) % ring.Count];
                Vec2d b = ring[(start + k + 1) % ring.Count];
                result.Add(a);
                if (rng.NextDouble() < 0.1) result.Add(a);
                if (rng.NextDouble() < 0.2)
                {
                    double t = PropertyRunner.Uniform(rng, 0.2, 0.8);
                    result.Add(new Vec2d(a.X + t * (b.X - a.X), a.Y + t * (b.Y - a.Y)));
                }
            }
            if (rng.NextDouble() < 0.5) result.Reverse();
            if (rng.NextDouble() < 0.5) result.Add(result[0]);
            return result;
        }

        // ---- Property ----

        [Test]
        public void ExtrusionNeverProducesDegenerateTriangles()
        {
            PropertyRunner.Run("E4 extrusion", 401, (rng, i) =>
            {
                bool star = rng.NextDouble() < 0.5;
                bool holes = rng.NextDouble() < 0.5;
                Shape shape = star ? Star(rng, holes) : Rectilinear(rng, holes);

                List<Vec2d> outer = Messy(rng, shape.Outer);
                var innerRings = shape.Holes.Select(hole => (IList<Vec2d>)Messy(rng, hole)).ToList();

                PreparedPolygon polygon = PolygonPrep.Prepare(outer, innerRings);
                Assert.IsNotNull(polygon, "a generated polygon must survive preparation");
                Assert.AreEqual(shape.Holes.Count, polygon.Holes.Count, "no hole may be lost");

                float height = (float)PropertyRunner.Uniform(rng, 1.0, 100.0);
                MeshData mesh = Extruder.Extrude(polygon, height);
                MeshAssertions.AssertExtrusion(polygon, mesh, height);
            });
        }
    }
}
