using System;
using Buried.Geo;
using NUnit.Framework;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>Property E3: world and data coordinates round-trip within 1 mm.</summary>
    public class ProjectFramePropertyTests
    {
        private const double Limit = 4000.0;
        private const double Tolerance = 0.001;

        private static ProjectFrame RandomFrame(System.Random rng)
        {
            // Any origin inside UTM zone 17N's valid range, with room for the 4000 m radius.
            double e0 = PropertyRunner.Uniform(rng, 166000.0 + Limit, 834000.0 - Limit);
            double n0 = PropertyRunner.Uniform(rng, Limit, 9400000.0 - Limit);
            return new ProjectFrame(e0, n0);
        }

        [Test]
        public void DataToWorldToDataWithin1mm()
        {
            PropertyRunner.Run("E3 data to world to data", 301, (rng, i) =>
            {
                ProjectFrame frame = RandomFrame(rng);
                double e = frame.E0 + PropertyRunner.Uniform(rng, -Limit, Limit);
                double n = frame.N0 + PropertyRunner.Uniform(rng, -Limit, Limit);
                double h = PropertyRunner.Uniform(rng, 0.0, 500.0);

                GeoPosition back = frame.ToData(frame.ToWorld(e, n, h));
                Assert.LessOrEqual(Math.Abs(back.Easting - e), Tolerance, "easting");
                Assert.LessOrEqual(Math.Abs(back.Northing - n), Tolerance, "northing");
                Assert.LessOrEqual(Math.Abs(back.HeightM - h), Tolerance, "height");
            });
        }

        [Test]
        public void WorldToDataToWorldWithin1mm()
        {
            PropertyRunner.Run("E3 world to data to world", 302, (rng, i) =>
            {
                ProjectFrame frame = RandomFrame(rng);
                var v = new Vector3(
                    (float)PropertyRunner.Uniform(rng, -Limit, Limit),
                    (float)PropertyRunner.Uniform(rng, 0.0, 500.0),
                    (float)PropertyRunner.Uniform(rng, -Limit, Limit));

                Vector3 back = frame.ToWorld(frame.ToData(v));
                Assert.LessOrEqual(Math.Abs(back.x - v.x), Tolerance, "x");
                Assert.LessOrEqual(Math.Abs(back.y - v.y), Tolerance, "y");
                Assert.LessOrEqual(Math.Abs(back.z - v.z), Tolerance, "z");
            });
        }
    }
}
