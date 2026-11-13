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
            });
        }
    }
}
