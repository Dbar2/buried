using System;
using System.Linq;
using Buried.Look;
using Buried.Meshing;
using Buried.Scene;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Buried.Tests
{
    /// <summary>Task 16.2: the numbers of the dusk look (design.md "Look"). The palette is tested in PaletteTests.</summary>
    public class LookTests
    {
        [Test]
        public void TheFogRadiusIsTheFarthestCornerPlus300Metres()
        {
            // The showcase bounds are 1300 m by 1200 m, so the centre is 884.6 m from a corner.
            double corner = Math.Sqrt(650.0 * 650.0 + 600.0 * 600.0);
            Assert.AreEqual((float)corner + 300f, LookSettings.FogRadius(corner), 1e-3f);
        }

        [Test]
        public void TheFogDensityIsLnFiftyOverTheRadius()
        {
            float radius = LookSettings.FogRadius(Math.Sqrt(650.0 * 650.0 + 600.0 * 600.0));
            Assert.AreEqual(Mathf.Log(50f) / radius, LookSettings.FogDensity(radius), 1e-9f);
            // Two in a hundred of the light is left at the fog radius.
            Assert.AreEqual(1f / 50f, Mathf.Exp(-LookSettings.FogDensity(radius) * radius), 1e-5f);
        }

        [Test]
        public void TheGroundReachesFourFogRadiiInEveryDirection()
        {
            float radius = LookSettings.FogRadius(884.6);
            float half = LookSettings.GroundHalfExtent(radius);
            Assert.AreEqual(4f * radius, half, 1e-3f);

            MeshData ground = GroundBuilder.Build(100f, -50f, half);
            Assert.AreEqual(2, ground.TriangleCount);
            Assert.AreEqual(100f - half, ground.vertices.Min(v => v.x), 1e-2f);
            Assert.AreEqual(100f + half, ground.vertices.Max(v => v.x), 1e-2f);
            Assert.AreEqual(-50f - half, ground.vertices.Min(v => v.z), 1e-2f);
            Assert.AreEqual(-50f + half, ground.vertices.Max(v => v.z), 1e-2f);
            Assert.IsTrue(ground.vertices.All(v => v.y == 0f), "the ground lies at y = 0");
        }

        [Test]
        public void TheOnlyPostEffectIsBloomWithThresholdOneAndIntensityPointThree()
        {
            VolumeProfile profile = PostProcessing.CreateProfile();
            try
            {
                Assert.AreEqual(1, profile.components.Count, "exactly one override");
                Assert.IsInstanceOf<Bloom>(profile.components[0]);
                Assert.IsFalse(profile.Has<Tonemapping>(), "tone mapping stays None");

                Assert.IsTrue(profile.TryGet(out Bloom bloom));
                Assert.AreEqual(1.0f, bloom.threshold.value, 0f);
                Assert.AreEqual(0.3f, bloom.intensity.value, 0f);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(profile);
            }
        }

        [Test]
        public void TheHorizonBandIsAQuarterOfTheWayFromNightToMutedAndTheGlowIsNarrow()
        {
            Assert.AreEqual(0.25f, LookSettings.HorizonMix, 0f);
            Assert.LessOrEqual(LookSettings.EdgeGlowPx, 2f, "requirement 26.4: any glow is no wider than about 2 px");
            Assert.LessOrEqual(LookSettings.GhostEdgeCasingPx, 2f, "requirement 26.4: the ghost casing is no wider than about 2 px");
            Assert.AreEqual(2.5f, LookSettings.EdgeWidthCssPx, 0f);
            Assert.AreEqual(0.45f, LookSettings.GhostFillAlpha, 0f);
            Assert.Less(LookSettings.GhostFillAlpha, 0.6f, "the fill stays translucent so the plate's lines show through (26.4)");
        }

        [Test]
        public void OnlyEdgeEmissionExceedsOneSoOnlyTheEdgesBloom()
        {
            Assert.Greater(LookSettings.EdgeEmission, LookSettings.BloomThreshold);
        }

        [Test]
        public void ThePresentStageDrainsFromSolidToWireframeToAFaintOutline()
        {
            PresentLayer.Stage today = PresentLayer.StageAt(0.0, false);
            Assert.AreEqual(1f, today.FillAlpha, 1e-6f);
            Assert.AreEqual(0f, today.EdgeAlpha, 1e-6f);

            PresentLayer.Stage wire = PresentLayer.StageAt(0.5, false);
            Assert.AreEqual(0f, wire.FillAlpha, 1e-6f);
            Assert.AreEqual(1f, wire.EdgeAlpha, 1e-6f);

            PresentLayer.Stage faint = PresentLayer.StageAt(1.0, false);
            Assert.AreEqual(0f, faint.FillAlpha, 1e-6f);
            Assert.AreEqual(LookSettings.PresentFaintEdgeAlpha, faint.EdgeAlpha, 1e-6f);

            // Past the next era it stays a faint outline.
            PresentLayer.Stage deep = PresentLayer.StageAt(2.5, false);
            Assert.AreEqual(faint.FillAlpha, deep.FillAlpha, 1e-6f);
            Assert.AreEqual(faint.EdgeAlpha, deep.EdgeAlpha, 1e-6f);
        }

        [Test]
        public void ReducedMotionCrossfadesStraightToTheFaintOutline()
        {
            PresentLayer.Stage half = PresentLayer.StageAt(0.5, true);
            Assert.AreEqual(0.5f, half.FillAlpha, 1e-6f);
            Assert.AreEqual(0.1f, half.EdgeAlpha, 1e-6f);
            PresentLayer.Stage one = PresentLayer.StageAt(1.0, true);
            Assert.AreEqual(0f, one.FillAlpha, 1e-6f);
            Assert.AreEqual(LookSettings.PresentFaintEdgeAlpha, one.EdgeAlpha, 1e-6f);
        }
    }
}
