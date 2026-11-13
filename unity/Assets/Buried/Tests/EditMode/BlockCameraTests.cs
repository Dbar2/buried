using Buried.Look;
using Buried.Scene;
using NUnit.Framework;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>
    /// Session 040, U9: the opening camera of the first visit. The corner of Queen Street East and River Street is in the
    /// right two thirds of a 16:10 frame, so the headline has the left third; on a phone (39:80) it is in the upper 60
    /// per cent of the frame. The camera is looking north-west and is low enough to read as a sheet lying on a table.
    /// </summary>
    public class BlockCameraTests
    {
        private static Vector2 Ndc(BlockCamera.Spec spec, float aspect, float height)
        {
            Vector2 ndc;
            Assert.IsTrue(
                CameraRigMath.ProjectToNdc(
                    BlockCamera.ToPose(spec), LookSettings.CameraFovDeg, aspect, new Vector3(BlockCamera.CornerX, height, BlockCamera.CornerZ), out ndc),
                "the corner is in front of the camera");
            return ndc;
        }

        [Test]
        public void ThePlayerPicksAPoseByTheShapeOfTheCanvas()
        {
            Assert.AreEqual(BlockCamera.Wide.DistanceM, BlockCamera.For(1.6f).DistanceM);
            Assert.AreEqual(BlockCamera.Wide.DistanceM, BlockCamera.For(1f).DistanceM, "square is wide");
            Assert.AreEqual(BlockCamera.Tall.DistanceM, BlockCamera.For(39f / 80f).DistanceM);
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
        public void TheCornerIsInTheUpperSixtyPerCentOfTheTallFrameAndInsideIt()
        {
            foreach (float height in new[] { 0f, 8f })
            {
                Vector2 ndc = Ndc(BlockCamera.Tall, BlockCamera.TallAspect, height);
                float fromTop = 0.5f - ndc.y * 0.5f;
                Assert.LessOrEqual(fromTop, 0.6f);
                Assert.GreaterOrEqual(fromTop, 0.1f);
                float fromLeft = ndc.x * 0.5f + 0.5f;
                Assert.GreaterOrEqual(fromLeft, 0.15f);
                Assert.LessOrEqual(fromLeft, 0.85f);
            }
        }

        [Test]
        public void BothPosesLookNorthWestAndStayInsideTheRigsLimits()
        {
            foreach (BlockCamera.Spec spec in new[] { BlockCamera.Wide, BlockCamera.Tall })
            {
                Assert.AreEqual(315f, spec.HeadingDeg, 1e-3f, "north-west");
                Assert.GreaterOrEqual(spec.PitchDeg, LookSettings.MinPitchDeg);
                Assert.LessOrEqual(spec.PitchDeg, 40f, "low and oblique");
                CameraRigMath.Pose clamped = CameraRigMath.ClampPose(BlockCamera.ToPose(spec), -1000f, -1000f, 1000f, 1000f);
                Assert.AreEqual(spec.DistanceM, clamped.Distance, 1e-3f, "the camera is within the height limits");
                Assert.AreEqual(spec.TargetX, clamped.Target.x, 1e-3f);
            }
        }
    }
}
