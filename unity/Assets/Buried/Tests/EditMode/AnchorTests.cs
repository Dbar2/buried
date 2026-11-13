using Buried.Look;
using Buried.Scene;
using NUnit.Framework;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>
    /// Session 040, U8: where an anchor lands on the canvas (scene/anchors, bridge 0.8.0). The projection is the one
    /// scene/cameraChanged reports: projection times view, in CSS pixels from the top left.
    /// </summary>
    public class AnchorTests
    {
        private const float Width = 1280f;
        private const float Height = 800f;

        private static CameraRigMath.Pose Pose()
        {
            return CameraRigMath.MakePose(100f, 200f, 300f, 35f, 22.5f);
        }

        private static Matrix4x4 ViewProjection()
        {
            return CameraRigMath.ViewProjection(Pose(), LookSettings.CameraFovDeg, Width / Height);
        }

        [Test]
        public void ThePointTheCameraLooksAtIsAtTheCentreOfTheCanvas()
        {
            float x, y;
            Assert.IsTrue(AnchorProjection.Project(ViewProjection(), new Vector3(100f, 0f, 200f), Width, Height, out x, out y));
            Assert.AreEqual(Width * 0.5f, x, 0.01f);
            Assert.AreEqual(Height * 0.5f, y, 0.01f);
        }

        [Test]
        public void ItAgreesWithTheRigMathWithTheYAxisFlippedToTheTopLeft()
        {
            var random = new System.Random(8);
            for (int i = 0; i < 300; i++)
            {
                var world = new Vector3(100f + (float)random.NextDouble() * 60f - 30f, (float)random.NextDouble() * 20f, 200f + (float)random.NextDouble() * 60f - 30f);
                Vector2 bottomLeft;
                Assert.IsTrue(CameraRigMath.ProjectToPixel(Pose(), LookSettings.CameraFovDeg, Width, Height, world, out bottomLeft));
                float x, y;
                AnchorProjection.Project(ViewProjection(), world, Width, Height, out x, out y);
                Assert.AreEqual(bottomLeft.x, x, 0.01f);
                Assert.AreEqual(Height - bottomLeft.y, y, 0.01f);
            }
        }

        [Test]
        public void ApointAboveAnotherLandsHigherOnTheCanvas()
        {
            float x0, y0, x1, y1;
            AnchorProjection.Project(ViewProjection(), new Vector3(100f, 0f, 200f), Width, Height, out x0, out y0);
            AnchorProjection.Project(ViewProjection(), new Vector3(100f, 12f, 200f), Width, Height, out x1, out y1);
            Assert.Less(y1, y0, "a roof is above its foot, so nearer the top of the canvas (a smaller y)");
        }

        [Test]
        public void APointOutsideTheCanvasIsNotOnScreenButKeepsItsPosition()
        {
            float x, y;
            bool on = AnchorProjection.Project(ViewProjection(), new Vector3(100f + 600f, 0f, 200f), Width, Height, out x, out y);
            Assert.IsFalse(on);
            Assert.Greater(x, Width, "off to the right");
        }

        [Test]
        public void APointBehindTheCameraIsNotOnScreenAndIsAtZero()
        {
            CameraRigMath.Pose pose = Pose();
            Vector3 behind = CameraRigMath.Position(pose) - CameraRigMath.Rotation(pose) * Vector3.forward * 50f;
            float x, y;
            Assert.IsFalse(AnchorProjection.Project(ViewProjection(), behind, Width, Height, out x, out y));
            Assert.AreEqual(0f, x);
            Assert.AreEqual(0f, y);
        }

        [Test]
        public void TheReportedPositionIsClampedToWhatTheSchemaAllows()
        {
            float x, y;
            // Just in front of the camera and far to the side: the projected position would be enormous.
            CameraRigMath.Pose pose = Pose();
            Vector3 nearSide = CameraRigMath.Position(pose) + CameraRigMath.Rotation(pose) * new Vector3(1000f, 0f, 5.01f);
            AnchorProjection.Project(ViewProjection(), nearSide, Width, Height, out x, out y);
            Assert.LessOrEqual(Mathf.Abs(x), AnchorProjection.LimitPx);
            Assert.LessOrEqual(Mathf.Abs(y), AnchorProjection.LimitPx);
        }

        [Test]
        public void TheCanvasSizeScalesThePositionAndNothingElse()
        {
            float x1, y1, x2, y2;
            AnchorProjection.Project(ViewProjection(), new Vector3(110f, 5f, 215f), Width, Height, out x1, out y1);
            AnchorProjection.Project(ViewProjection(), new Vector3(110f, 5f, 215f), Width * 0.5f, Height * 0.5f, out x2, out y2);
            Assert.AreEqual(x1 * 0.5f, x2, 0.01f);
            Assert.AreEqual(y1 * 0.5f, y2, 0.01f);
        }
    }
}
