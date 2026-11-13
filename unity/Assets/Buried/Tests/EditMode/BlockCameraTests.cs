using Buried.Look;
using Buried.Scene;
using NUnit.Framework;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>
    /// Session 040 U9 and session 043: the opening camera of the first visit. A long lens, low and close, looking along the
    /// plate's own up (turned by no more than 25 degrees) so the lettering reads the right way up. In a 16:10 frame the
    /// overall factory is in the right-centre and at least 120 px across in a 1600 px picture, with the sheet's top edge and
    /// right edge in frame; on a phone (39:80) the corner is in the upper 55 per cent of the frame.
    /// </summary>
    public class BlockCameraTests
    {
        // The sheet's corners in metres from the project origin (data/tiles/fip_v3_1911_229.json minus 632500, 4835000).
        private static readonly Vector2 TopLeft = new Vector2(-187.731742f, 87.454831f);
        private static readonly Vector2 TopRight = new Vector2(96.468841f, 177.219139f);
        private static readonly Vector2 BottomRight = new Vector2(199.789441f, -150.101713f);
        private static readonly Vector2 BottomLeft = new Vector2(-84.411142f, -239.866021f);

        // The overall factory's footprint box, from data/evidence/fip_v3_1911_229.geojson (`bld_fip_v3_1911_229_0101`).
        private const float FactoryMinX = -15.5f, FactoryMaxX = 10.7f, FactoryMinZ = 85.5f, FactoryMaxZ = 112.6f;

        private static Vector2 Ndc(BlockCamera.Spec spec, float aspect, Vector3 world)
        {
            Vector2 ndc;
            Assert.IsTrue(CameraRigMath.ProjectToNdc(BlockCamera.ToPose(spec), BlockCamera.FovDeg, aspect, world, out ndc), "in front of the camera");
            return ndc;
        }

        private static Vector2 Ndc(BlockCamera.Spec spec, float aspect, float height)
        {
            return Ndc(spec, aspect, new Vector3(BlockCamera.CornerX, height, BlockCamera.CornerZ));
        }

        private static Vector2 Closest(Vector2 a, Vector2 b, Vector2 p)
        {
            Vector2 ab = b - a;
            float t = Mathf.Clamp01(Vector2.Dot(p - a, ab) / ab.sqrMagnitude);
            return a + ab * t;
        }

        [Test]
        public void ThePlayerPicksAPoseByTheShapeOfTheCanvas()
        {
            Assert.AreEqual(BlockCamera.Wide.DistanceM, BlockCamera.For(1.6f).DistanceM);
            Assert.AreEqual(BlockCamera.Wide.DistanceM, BlockCamera.For(1f).DistanceM, "square is wide");
            Assert.AreEqual(BlockCamera.Tall.DistanceM, BlockCamera.For(39f / 80f).DistanceM);
        }

        [Test]
        public void TheLensIsLongEnoughToMakeAMiniature()
        {
            Assert.GreaterOrEqual(BlockCamera.FovDeg, 30f);
            Assert.LessOrEqual(BlockCamera.FovDeg, 35f);
        }

        [Test]
        public void ThePlateReadsTheRightWayUp()
        {
            // The plate's up runs from the bottom edge to the top edge of the sheet.
            Vector2 up = TopLeft - BottomLeft;
            float bearing = Mathf.Atan2(up.x, up.y) * Mathf.Rad2Deg;
            if (bearing < 0f) bearing += 360f;
            Assert.AreEqual(BlockCamera.PlateUpHeadingDeg, bearing, 0.5f, "the constant is the bearing of the sheet's own up");
            foreach (BlockCamera.Spec spec in new[] { BlockCamera.Wide, BlockCamera.Tall })
            {
                float turn = Mathf.Abs(Mathf.DeltaAngle(spec.HeadingDeg, bearing));
                Assert.LessOrEqual(turn, 25f, "turned from the plate's up by no more than 25 degrees");
            }
        }

        [Test]
        public void TheFactoryIsLargeInTheRightCentreOfTheWideFrame()
        {
            BlockCamera.Spec spec = BlockCamera.Wide;
            float minX = float.MaxValue, maxX = float.MinValue;
            foreach (Vector2 corner in new[]
            {
                new Vector2(FactoryMinX, FactoryMinZ), new Vector2(FactoryMaxX, FactoryMinZ),
                new Vector2(FactoryMaxX, FactoryMaxZ), new Vector2(FactoryMinX, FactoryMaxZ),
            })
            {
                Vector2 ndc = Ndc(spec, BlockCamera.WideAspect, new Vector3(corner.x, 0f, corner.y));
                minX = Mathf.Min(minX, ndc.x);
                maxX = Mathf.Max(maxX, ndc.x);
            }
            float widthPx = (maxX - minX) * 0.5f * 1600f;
            Assert.GreaterOrEqual(widthPx, 120f, "the factory's footprint is at least 120 px across in a 1600 px picture");

            Vector2 centre = Ndc(spec, BlockCamera.WideAspect, new Vector3(BlockCamera.FactoryX, 0f, BlockCamera.FactoryZ));
            float fromLeft = centre.x * 0.5f + 0.5f;
            float fromTop = 0.5f - centre.y * 0.5f;
            Assert.GreaterOrEqual(fromLeft, 0.5f, "right of centre");
            Assert.LessOrEqual(fromLeft, 0.75f, "and not at the edge");
            Assert.GreaterOrEqual(fromTop, 0.3f);
            Assert.LessOrEqual(fromTop, 0.7f);
        }

        [Test]
        public void TheSheetsTopEdgeAndRightEdgeAreInTheWideFrame()
        {
            Vector2 factory = new Vector2(BlockCamera.FactoryX, BlockCamera.FactoryZ);
            foreach (Vector2 p in new[] { Closest(TopLeft, TopRight, factory), Closest(TopRight, BottomRight, factory) })
            {
                Vector2 ndc = Ndc(BlockCamera.Wide, BlockCamera.WideAspect, new Vector3(p.x, 0f, p.y));
                Assert.LessOrEqual(Mathf.Abs(ndc.x), 0.98f, "inside the frame");
                Assert.LessOrEqual(Mathf.Abs(ndc.y), 0.98f);
            }
        }

        [Test]
        public void TheCornerIsInTheRightTwoThirdsOfTheWideFrameAndInsideIt()
        {
            foreach (float height in new[] { 0f, 8f })
            {
                Vector2 ndc = Ndc(BlockCamera.Wide, BlockCamera.WideAspect, height);
                float fromLeft = ndc.x * 0.5f + 0.5f;
                Assert.GreaterOrEqual(fromLeft, 1f / 3f + 0.05f, "right of the first third, with room for the headline");
                Assert.LessOrEqual(fromLeft, 0.9f, "inside the frame with a margin");
                float fromTop = 0.5f - ndc.y * 0.5f;
                Assert.GreaterOrEqual(fromTop, 0.15f);
                Assert.LessOrEqual(fromTop, 0.75f);
            }
        }

        [Test]
        public void TheCornerIsInTheUpperFiftyFivePerCentOfTheTallFrameAndInsideIt()
        {
            foreach (float height in new[] { 0f, 8f })
            {
                Vector2 ndc = Ndc(BlockCamera.Tall, BlockCamera.TallAspect, height);
                float fromTop = 0.5f - ndc.y * 0.5f;
                Assert.LessOrEqual(fromTop, 0.55f);
                Assert.GreaterOrEqual(fromTop, 0.1f);
                float fromLeft = ndc.x * 0.5f + 0.5f;
                Assert.GreaterOrEqual(fromLeft, 0.15f);
                Assert.LessOrEqual(fromLeft, 0.85f);
            }
        }

        [Test]
        public void BothPosesStayLowAndInsideTheRigsLimits()
        {
            foreach (BlockCamera.Spec spec in new[] { BlockCamera.Wide, BlockCamera.Tall })
            {
                Assert.GreaterOrEqual(spec.PitchDeg, LookSettings.MinPitchDeg);
                Assert.LessOrEqual(spec.PitchDeg, 40f, "low and oblique");
                CameraRigMath.Pose clamped = CameraRigMath.ClampPose(BlockCamera.ToPose(spec), -1000f, -1000f, 1000f, 1000f);
                Assert.AreEqual(spec.DistanceM, clamped.Distance, 1e-3f, "the camera is within the height limits");
                Assert.AreEqual(spec.TargetX, clamped.Target.x, 1e-3f);
            }
        }
    }
}
