using System;
using System.Collections.Generic;
using Buried.Geo;
using Buried.Meshing;
using NUnit.Framework;

namespace Buried.Tests
{
    /// <summary>
    /// Property E13: the drape mask hides what is outside and keeps what is inside. For random simple
    /// polygons (star-shaped, so often concave), a point more than one mask texel outside the boundary
    /// has coverage 0 and fade 0; a point more than one texel inside has coverage 1; a point deeper
    /// than the feather plus one texel has fade 1; and fade is never below 0 or above 1. Task 17.1
    /// extends the generator to concave clip polygons inside a quad, which this one already includes.
    /// </summary>
    public class DrapeMaskPropertyTests
    {
        private static List<Vec2d> RandomStar(Random rng, out double minX, out double minZ, out double maxX, out double maxZ)
        {
            int n = PropertyRunner.Between(rng, 3, 9);
            double cx = PropertyRunner.Uniform(rng, -500, 500);
            double cz = PropertyRunner.Uniform(rng, -500, 500);
            double baseRadius = PropertyRunner.Uniform(rng, 60, 400);
            var polygon = new List<Vec2d>();
            minX = minZ = double.PositiveInfinity;
            maxX = maxZ = double.NegativeInfinity;
            for (int i = 0; i < n; i++)
            {
                // Angles strictly increasing around the centre, radii varying: always a simple polygon.
                double angle = (i + PropertyRunner.Uniform(rng, 0.05, 0.95)) / n * 2.0 * Math.PI;
                double radius = baseRadius * PropertyRunner.Uniform(rng, 0.35, 1.0);
                double x = cx + radius * Math.Cos(angle);
                double z = cz + radius * Math.Sin(angle);
                polygon.Add(new Vec2d(x, z));
                minX = Math.Min(minX, x);
                maxX = Math.Max(maxX, x);
                minZ = Math.Min(minZ, z);
                maxZ = Math.Max(maxZ, z);
            }
            return polygon;
        }

        [Test]
        public void E13_TheMaskHidesWhatIsOutsideAndKeepsWhatIsInside()
        {
            PropertyRunner.Run("E13", 13013, 150, (rng, caseIndex) =>
            {
                double minX, minZ, maxX, maxZ;
                List<Vec2d> polygon = RandomStar(rng, out minX, out minZ, out maxX, out maxZ);
                CheckMask(rng, polygon, minX, minZ, maxX, maxZ);
            });
        }

        /// <summary>
        /// Task 17.1: the boundary is a concave clip polygon inside a rotated quad, taken through the
        /// DrapeDto and DrapeLayer.Boundary as the Player does. The clip hides everything outside it,
        /// including the part of the quad outside the clip; with no clip the quad's four corners bound the drape.
        /// </summary>
        [Test]
        public void E13_AConcaveClipInsideTheQuadHidesTheRestOfTheQuad()
        {
            var frame = new ProjectFrame(632500.0, 4835000.0);
            PropertyRunner.Run("E13-clip", 13014, 150, (rng, caseIndex) =>
            {
                // A rotated quad about 700 m across, and a star inside its inscribed circle (so inside the quad).
                double cx = PropertyRunner.Uniform(rng, -300, 300);
                double cz = PropertyRunner.Uniform(rng, -300, 300);
                double half = PropertyRunner.Uniform(rng, 250, 400);
                double turn = PropertyRunner.Uniform(rng, 0, Math.PI);
                var quad = new List<Vec2d>();
                foreach (double[] corner in new[] { new[] { -1.0, 1.0 }, new[] { 1.0, 1.0 }, new[] { 1.0, -1.0 }, new[] { -1.0, -1.0 } })
                {
                    double x = corner[0] * half;
                    double z = corner[1] * half;
                    quad.Add(new Vec2d(cx + x * Math.Cos(turn) - z * Math.Sin(turn), cz + x * Math.Sin(turn) + z * Math.Cos(turn)));
                }

                int n = PropertyRunner.Between(rng, 5, 11);
                var star = new List<Vec2d>();
                for (int i = 0; i < n; i++)
                {
                    double angle = (i + PropertyRunner.Uniform(rng, 0.05, 0.95)) / n * 2.0 * Math.PI;
                    double radius = half * PropertyRunner.Uniform(rng, 0.2, 0.95);
                    star.Add(new Vec2d(cx + radius * Math.Cos(angle), cz + radius * Math.Sin(angle)));
                }

                var drape = new Buried.Interop.DrapeDto
                {
                    sourceId = "fip_test",
                    url = "/data/tiles/fip_test.jpg",
                    corners = new Buried.Interop.DrapeCornersDto
                    {
                        topLeft = ToEpsg(quad[0]), topRight = ToEpsg(quad[1]), bottomRight = ToEpsg(quad[2]), bottomLeft = ToEpsg(quad[3]),
                    },
                    widthPx = 100,
                    heightPx = 100,
                };

                // Without a clip the corners bound it.
                List<Vec2d> corners = Buried.Scene.DrapeLayer.Boundary(frame, drape);
                Assert.AreEqual(4, corners.Count);

                var ring = new List<double[]>();
                foreach (Vec2d p in star) ring.Add(ToEpsg(p));
                ring.Add(ToEpsg(star[0]));
                drape.clip = new Buried.Interop.GeometryDto
                {
                    type = Buried.Interop.GeometryDto.Polygon,
                    polygons = new List<List<List<double[]>>> { new List<List<double[]>> { ring } },
                };
                List<Vec2d> boundary = Buried.Scene.DrapeLayer.Boundary(frame, drape);
                Assert.AreEqual(star.Count, boundary.Count, "the closing vertex is dropped");
                for (int i = 0; i < star.Count; i++)
                {
                    Assert.AreEqual(star[i].X, boundary[i].X, 1e-6);
                    Assert.AreEqual(star[i].Y, boundary[i].Y, 1e-6);
                }

                double minX = double.PositiveInfinity, minZ = double.PositiveInfinity, maxX = double.NegativeInfinity, maxZ = double.NegativeInfinity;
                foreach (Vec2d p in boundary)
                {
                    minX = Math.Min(minX, p.X);
                    maxX = Math.Max(maxX, p.X);
                    minZ = Math.Min(minZ, p.Y);
                    maxZ = Math.Max(maxZ, p.Y);
                }
                CheckMask(rng, boundary, minX, minZ, maxX, maxZ);

                // The quad's own corners, which lie outside the clip, are hidden.
                DrapeMask mask = DrapeMaskBuilder.Build(boundary);
                foreach (Vec2d corner in quad) Assert.AreEqual(0f, mask.SampleCoverage(corner.X, corner.Y), 1e-6f, "a quad corner outside the clip");
            });
        }

        private static double[] ToEpsg(Vec2d local)
        {
            return new[] { 632500.0 + local.X, 4835000.0 + local.Y };
        }

        private static void CheckMask(Random rng, List<Vec2d> polygon, double minX, double minZ, double maxX, double maxZ)
        {
            double extentX = Math.Max(maxX - minX, 1e-3);
            double extentZ = Math.Max(maxZ - minZ, 1e-3);
            double texel = Math.Max(extentX, extentZ) / (DrapeMaskBuilder.MaxPx - 4);
            if (extentX < 4 * texel || extentZ < 4 * texel) return; // a sliver: nothing to judge

            DrapeMask mask = DrapeMaskBuilder.Build(polygon);

            for (int k = 0; k < 400; k++)
            {
                double x = PropertyRunner.Uniform(rng, minX - 40, maxX + 40);
                double z = PropertyRunner.Uniform(rng, minZ - 40, maxZ + 40);
                double d = DrapeMaskBuilder.SignedDistance(polygon, x, z);
                float fade = mask.SampleFade(x, z);
                float coverage = mask.SampleCoverage(x, z);

                Assert.GreaterOrEqual(fade, -1e-6f);
                Assert.LessOrEqual(fade, 1f + 1e-6f);
                Assert.LessOrEqual(fade, coverage + 1e-6f, "the fade never shows what the coverage hides");
                if (d < -1.5 * texel)
                {
                    Assert.AreEqual(0f, coverage, 1e-6f, "outside by " + d + " (texel " + texel + ") at " + x + ", " + z);
                    Assert.AreEqual(0f, fade, 1e-6f);
                }
                if (d > 1.5 * texel) Assert.AreEqual(1f, coverage, 1e-6f, "inside by " + d + " at " + x + ", " + z);
                if (d > DrapeMaskBuilder.FeatherM + 1.5 * texel) Assert.AreEqual(1f, fade, 1e-5f, "deep inside by " + d);
            }
        }
    }
}
