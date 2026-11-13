using System.Collections.Generic;
using Buried.Geo;
using Buried.Meshing;
using NUnit.Framework;

namespace Buried.Tests
{
    /// <summary>Task 16.4: example tests for the drape mask (design.md "Drape mask").</summary>
    public class DrapeMaskTests
    {
        private static List<Vec2d> Square(double min, double max)
        {
            return new List<Vec2d> { new Vec2d(min, min), new Vec2d(min, max), new Vec2d(max, max), new Vec2d(max, min) };
        }

        [Test]
        public void TheMaskIsZeroOutsideTheQuadOneDeepInsideAndRisesAcrossTheBand()
        {
            DrapeMask mask = DrapeMaskBuilder.Build(Square(0, 400));
            double texel = 400.0 / (DrapeMaskBuilder.MaxPx - 4);

            Assert.AreEqual(0f, mask.SampleFade(-30, 200), 0f, "outside");
            Assert.AreEqual(0f, mask.SampleFade(200, 450), 0f, "outside");
            Assert.AreEqual(0f, mask.SampleCoverage(-30, 200), 0f);
            Assert.AreEqual(0f, mask.SampleFade(-texel * 3, -texel * 3), 0f, "beyond the zero border");

            Assert.AreEqual(1f, mask.SampleFade(200, 200), 1e-6f, "deep inside");
            Assert.AreEqual(1f, mask.SampleFade(DrapeMaskBuilder.FeatherM + 2 * texel, 200), 1e-6f, "just past the feather");
            Assert.AreEqual(1f, mask.SampleCoverage(200, 200), 1e-6f);

            // Rising monotonically across the band from the left edge.
            float previous = -1f;
            for (double d = 0.0; d <= DrapeMaskBuilder.FeatherM + 2 * texel; d += 0.25)
            {
                float value = mask.SampleFade(d, 200);
                Assert.GreaterOrEqual(value, previous - 1e-6f, "monotonic at depth " + d);
                previous = value;
            }
            Assert.Less(mask.SampleFade(1.0, 200), 0.1f, "near the boundary the drape is almost gone");
            Assert.AreEqual(0.5f, mask.SampleFade(DrapeMaskBuilder.FeatherM / 2.0, 200), 0.05f, "half way through the band");
        }

        [Test]
        public void ARotatedParallelogramMaskFollowsItsSlantedEdges()
        {
            var boundary = new List<Vec2d> { new Vec2d(0, 0), new Vec2d(100, 40), new Vec2d(180, 340), new Vec2d(80, 300) };
            DrapeMask mask = DrapeMaskBuilder.Build(boundary);
            Assert.AreEqual(1f, mask.SampleFade(90, 170), 1e-6f);
            Assert.AreEqual(0f, mask.SampleFade(5, 200), 0f, "left of the slanted left edge");
            Assert.AreEqual(0f, mask.SampleFade(170, 100), 0f, "right of the slanted right edge");
        }

        [Test]
        public void AConcaveBoundaryLeavesItsNotchOut()
        {
            // A square with a deep notch cut into the top from the middle.
            var boundary = new List<Vec2d>
            {
                new Vec2d(0, 0), new Vec2d(0, 300), new Vec2d(120, 300), new Vec2d(120, 100),
                new Vec2d(180, 100), new Vec2d(180, 300), new Vec2d(300, 300), new Vec2d(300, 0),
            };
            DrapeMask mask = DrapeMaskBuilder.Build(boundary);
            Assert.AreEqual(0f, mask.SampleCoverage(150, 250), 0f, "inside the notch");
            Assert.AreEqual(1f, mask.SampleCoverage(60, 250), 1e-6f);
            Assert.AreEqual(1f, mask.SampleCoverage(240, 250), 1e-6f);
            Assert.AreEqual(1f, mask.SampleCoverage(150, 40), 1e-6f, "below the notch");
        }

        [Test]
        public void TheMaskIsNoBiggerThanItsLongEdge()
        {
            DrapeMask wide = DrapeMaskBuilder.Build(new List<Vec2d> { new Vec2d(0, 0), new Vec2d(0, 100), new Vec2d(900, 100), new Vec2d(900, 0) });
            Assert.LessOrEqual(wide.Width, DrapeMaskBuilder.MaxPx);
            Assert.Less(wide.Height, wide.Width);
        }

        [Test]
        public void ADegenerateBoundaryIsRefused()
        {
            Assert.Throws<System.ArgumentException>(() => DrapeMaskBuilder.Build(new List<Vec2d> { new Vec2d(0, 0), new Vec2d(1, 1) }));
        }
    }
}
