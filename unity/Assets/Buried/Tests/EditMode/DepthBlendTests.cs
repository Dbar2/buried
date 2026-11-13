using Buried.Look;
using Buried.Scene;
using NUnit.Framework;

namespace Buried.Tests
{
    /// <summary>
    /// Task 3.3: DepthBlend at d = 0, 0.25, 0.5, 0.75, 1 and 2.5 in both motion modes (requirements 10.4
    /// to 10.6, design.md "Depth blend").
    /// </summary>
    public class DepthBlendTests
    {
        private const float Tol = 1e-5f;

        private static readonly double[] Depths = { 0.0, 0.25, 0.5, 0.75, 1.0, 2.5 };

        [Test]
        public void TwoNeighbouringErasShareTheWeightAndNoOtherEraDraws()
        {
            // era weights at each depth for eras 0..4: expected[depthIndex][era]
            float[][] expected =
            {
                new[] { 1f, 0f, 0f, 0f, 0f },
                new[] { 0.75f, 0.25f, 0f, 0f, 0f },
                new[] { 0.5f, 0.5f, 0f, 0f, 0f },
                new[] { 0.25f, 0.75f, 0f, 0f, 0f },
                new[] { 0f, 1f, 0f, 0f, 0f },
                new[] { 0f, 0f, 0.5f, 0.5f, 0f },
            };
            for (int d = 0; d < Depths.Length; d++)
            {
                for (int era = 0; era < 5; era++)
                {
                    Assert.AreEqual(expected[d][era], DepthBlend.EraWeight(Depths[d], era), Tol, "depth " + Depths[d] + " era " + era);
                }
            }
        }

        [Test]
        public void TheWeightsOfTheTwoErasAddUpToOne()
        {
            for (double d = 0.0; d <= 3.0; d += 0.05)
            {
                float sum = 0f;
                for (int era = 0; era < 5; era++) sum += DepthBlend.EraWeight(d, era);
                Assert.AreEqual(1f, sum, 1e-5f, "depth " + d);
            }
        }

        [Test]
        public void TheLastEraHasFullWeightAtItsOwnDepth()
        {
            Assert.AreEqual(1f, DepthBlend.EraWeight(3.0, 3), Tol);
            Assert.AreEqual(0f, DepthBlend.EraWeight(3.0, 2), Tol);
        }

        [Test]
        public void ThePresentDrainsToWireframeThenToAFaintOutlineInNormalMotion()
        {
            for (int d = 0; d < Depths.Length; d++)
            {
                PresentLayer.Stage s = DepthBlend.Present(Depths[d], false);
                if (Depths[d] == 0.25)
                {
                    // smoothstep(0, 0.5, 0.25) = 0.5, so the fill is half drained
                    Assert.AreEqual(0.5f, s.FillAlpha, Tol);
                    Assert.AreEqual(0.5f, s.EdgeAlpha, Tol);
                }
                else if (Depths[d] == 0.5)
                {
                    Assert.AreEqual(0f, s.FillAlpha, Tol, "wireframe: no fill");
                    Assert.AreEqual(1f, s.EdgeAlpha, Tol, "wireframe: full edges");
                }
                else if (Depths[d] >= 1.0)
                {
                    Assert.AreEqual(0f, s.FillAlpha, Tol);
                    Assert.AreEqual(LookSettings.PresentFaintEdgeAlpha, s.EdgeAlpha, Tol, "depth " + Depths[d]);
                }
                else if (Depths[d] == 0.0)
                {
                    Assert.AreEqual(1f, s.FillAlpha, Tol);
                    Assert.AreEqual(0f, s.EdgeAlpha, Tol);
                }
            }

            // 0.75 is between wireframe and the faint outline: no fill, edges between 1 and the faint alpha
            PresentLayer.Stage late = DepthBlend.Present(0.75, false);
            Assert.AreEqual(0f, late.FillAlpha, Tol);
            Assert.Less(late.EdgeAlpha, 1f);
            Assert.Greater(late.EdgeAlpha, LookSettings.PresentFaintEdgeAlpha);
        }

        [Test]
        public void ThePresentCrossfadesToTheFaintOutlineInReducedMotion()
        {
            foreach (double d in Depths)
            {
                PresentLayer.Stage s = DepthBlend.Present(d, true);
                float p = (float)System.Math.Min(d, 1.0);
                Assert.AreEqual(1f - p, s.FillAlpha, Tol, "fill at " + d);
                Assert.AreEqual(LookSettings.PresentFaintEdgeAlpha * p, s.EdgeAlpha, Tol, "edge at " + d);
            }
        }

        [Test]
        public void AddedFeaturesRiseOverNineHundredMillisecondsAndOnlyFadeUnderReducedMotion()
        {
            Assert.AreEqual(0f, DepthBlend.AddedProgress(0f), Tol);
            Assert.AreEqual(0.5f, DepthBlend.AddedProgress(0.45f), Tol);
            Assert.AreEqual(1f, DepthBlend.AddedProgress(5f), Tol);
            Assert.AreEqual(0f, DepthBlend.AddedRise(0f, false), Tol);
            Assert.AreEqual(0.5f, DepthBlend.AddedRise(0.5f, false), Tol);
            Assert.AreEqual(1f, DepthBlend.AddedRise(1f, false), Tol);
            Assert.AreEqual(1f, DepthBlend.AddedRise(0f, true), Tol, "reduced motion: no rise");
            Assert.AreEqual(0f, DepthBlend.AddedAlpha(0f), Tol);
            Assert.AreEqual(0.25f, DepthBlend.AddedAlpha(0.25f), Tol, "reduced motion still fades");
            Assert.AreEqual(1f, DepthBlend.AddedAlpha(1f), Tol);
        }

        [Test]
        public void GhostsRiseFromTheGroundInNormalMotion()
        {
            Assert.AreEqual(0f, DepthBlend.Rise(0f, false), Tol);
            Assert.AreEqual(0.15625f, DepthBlend.Rise(0.25f, false), Tol); // smoothstep(0.25)
            Assert.AreEqual(0.5f, DepthBlend.Rise(0.5f, false), Tol);
            Assert.AreEqual(0.84375f, DepthBlend.Rise(0.75f, false), Tol);
            Assert.AreEqual(1f, DepthBlend.Rise(1f, false), Tol);
        }

        [Test]
        public void GhostsDoNotRiseInReducedMotionAndOnlyFade()
        {
            foreach (float w in new[] { 0f, 0.25f, 0.5f, 0.75f, 1f })
            {
                Assert.AreEqual(1f, DepthBlend.Rise(w, true), Tol);
                Assert.AreEqual(w, DepthBlend.GhostAlpha(w), Tol);
                Assert.AreEqual(w, DepthBlend.DrapeOpacity(w), Tol);
            }
        }

        [Test]
        public void ARestingEraIsDrawnAtFullHeightAndFullAlpha()
        {
            // At an integer depth the era's weight is exactly 1, so nothing is left half drawn.
            foreach (int era in new[] { 0, 1, 2, 3 })
            {
                float w = DepthBlend.EraWeight(era, era);
                Assert.AreEqual(1f, DepthBlend.Rise(w, false));
                Assert.AreEqual(1f, DepthBlend.GhostAlpha(w));
                Assert.AreEqual(1f, DepthBlend.DrapeOpacity(w));
            }
        }

        [Test]
        public void SettledMeansAnEraToWithinAHair()
        {
            Assert.IsTrue(DepthBlend.IsSettled(0.0));
            Assert.IsTrue(DepthBlend.IsSettled(2.0));
            Assert.IsFalse(DepthBlend.IsSettled(0.25));
            Assert.IsFalse(DepthBlend.IsSettled(2.5));
        }
    }
}
