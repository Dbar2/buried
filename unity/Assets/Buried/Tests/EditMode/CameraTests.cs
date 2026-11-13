using Buried.Interop;
using Buried.Look;
using Buried.Scene;
using NUnit.Framework;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>Task 16.5: the camera rig's maths, tested without a scene (requirements 16.3, 16.6 to 16.8).</summary>
    public class CameraTests
    {
        private const float Fov = LookSettings.CameraFovDeg;
        private const float W = 1280f;
        private const float H = 800f;
        private const float Aspect = W / H;

        // ---- Default pose (requirement 16.8) ----

        [Test]
        public void TheDefaultPoseShowsTheWholeViewRectangleWithItsCentreAtTheCanvasCentre()
        {
            // A 200 m by 200 m rectangle and a long thin one, at an offset from the origin.
            foreach (float[] rect in new[]
            {
                new[] { -100f, -100f, 100f, 100f },
                new[] { 300f, -250f, 900f, -150f },
                new[] { -50f, 40f, 50f, 460f },
            })
            {
                float distance = CameraRigMath.FitDistance(rect[0], rect[1], rect[2], rect[3], LookSettings.DefaultPitchDeg, 0f, Fov, Aspect);
                var pose = CameraRigMath.MakePose((rect[0] + rect[2]) * 0.5f, (rect[1] + rect[3]) * 0.5f, distance, LookSettings.DefaultPitchDeg, 0f);

                var corners = new[]
                {
                    new Vector3(rect[0], 0f, rect[1]), new Vector3(rect[0], 0f, rect[3]),
                    new Vector3(rect[2], 0f, rect[3]), new Vector3(rect[2], 0f, rect[1]),
                };
                float worst = 0f;
                foreach (Vector3 corner in corners)
                {
                    Vector2 ndc;
                    Assert.IsTrue(CameraRigMath.ProjectToNdc(pose, Fov, Aspect, corner, out ndc));
                    worst = Mathf.Max(worst, Mathf.Abs(ndc.x), Mathf.Abs(ndc.y));
                }
                Assert.AreEqual(1f, worst, 1e-3f, "the smallest distance that shows the whole rectangle touches the canvas edge");

                Vector2 centre;
                Assert.IsTrue(CameraRigMath.ProjectToPixel(pose, Fov, W, H, pose.Target, out centre));
                Assert.AreEqual(W * 0.5f, centre.x, 0.01f);
                Assert.AreEqual(H * 0.5f, centre.y, 0.01f);
            }
        }

        [Test]
        public void TheDefaultPoseLooksNorthAtFiftyDegrees()
        {
            var pose = CameraRigMath.MakePose(0f, 0f, 300f, LookSettings.DefaultPitchDeg, 0f);
            Vector3 forward = CameraRigMath.Rotation(pose) * Vector3.forward;
            Assert.Greater(forward.z, 0f, "looking north (+z)");
            Assert.AreEqual(0f, forward.x, 1e-6f);
            Assert.AreEqual(-Mathf.Sin(50f * Mathf.Deg2Rad), forward.y, 1e-5f, "50 degrees below the horizontal");
        }

        [Test]
        public void TheRigMathAgreesWithUnitysOwnCamera()
        {
            var go = new GameObject("camera test");
            try
            {
                Camera camera = go.AddComponent<Camera>();
                camera.fieldOfView = Fov;
                camera.aspect = Aspect;
                camera.nearClipPlane = LookSettings.NearClipM;
                camera.farClipPlane = LookSettings.FarClipM;
                var pose = CameraRigMath.MakePose(120f, -80f, 275f, 50f, 20f);
                camera.transform.rotation = CameraRigMath.Rotation(pose);
                camera.transform.position = CameraRigMath.Position(pose);

                Matrix4x4 theirs = camera.projectionMatrix * camera.worldToCameraMatrix;
                Matrix4x4 ours = CameraRigMath.ViewProjection(pose, Fov, Aspect);
                for (int r = 0; r < 4; r++)
                {
                    for (int c = 0; c < 4; c++) Assert.AreEqual(theirs[r, c], ours[r, c], 1e-4f, "element " + r + "," + c);
                }
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        // ---- Pan (requirement 16.7) ----

        [Test]
        public void ADragMovesTheGroundPointUnderThePointerWithItAtThreePitches()
        {
            foreach (float pitch in new[] { 20f, 50f, 80f })
            {
                var pose = CameraRigMath.MakePose(40f, 60f, 300f, pitch, 0f);
                var a = new Vector2(500f, 300f);
                var b = new Vector2(700f, 420f);

                Vector3 anchor;
                Assert.IsTrue(CameraRigMath.GroundUnderPixel(pose, Fov, W, H, a, out anchor));

                Vector3 target;
                Assert.IsTrue(CameraRigMath.TargetKeepingUnder(pose, Fov, W, H, b, anchor, out target));
                CameraRigMath.Pose moved = pose;
                moved.Target = target;

                // After the drag the point that was under A is under B, within a pixel.
                Vector2 pixel;
                Assert.IsTrue(CameraRigMath.ProjectToPixel(moved, Fov, W, H, anchor, out pixel));
                Assert.AreEqual(b.x, pixel.x, 1f, "pitch " + pitch);
                Assert.AreEqual(b.y, pixel.y, 1f, "pitch " + pitch);
            }
        }

        [Test]
        public void AStillPointerLeavesTheCameraWhereItIs()
        {
            // Holding the pointer at B for more frames asks for the same target: no drift, no inertia.
            var pose = CameraRigMath.MakePose(0f, 0f, 300f, 50f, 0f);
            Vector3 anchor;
            Assert.IsTrue(CameraRigMath.GroundUnderPixel(pose, Fov, W, H, new Vector2(400f, 400f), out anchor));
            Vector3 first;
            Assert.IsTrue(CameraRigMath.TargetKeepingUnder(pose, Fov, W, H, new Vector2(600f, 400f), anchor, out first));
            pose.Target = first;
            Vector3 second;
            Assert.IsTrue(CameraRigMath.TargetKeepingUnder(pose, Fov, W, H, new Vector2(600f, 400f), anchor, out second));
            Assert.AreEqual(0f, Vector3.Distance(first, second), 1e-3f);
        }

        // ---- Limits (requirement 16.3) ----

        [Test]
        public void TheLimitsKeepPitchHeightAndTargetInside()
        {
            PropertyRunner.Run("camera limits", 16005, 500, (rng, i) =>
            {
                var wild = CameraRigMath.MakePose(
                    (float)PropertyRunner.Uniform(rng, -5000, 5000),
                    (float)PropertyRunner.Uniform(rng, -5000, 5000),
                    (float)PropertyRunner.Uniform(rng, 0.1, 10000),
                    (float)PropertyRunner.Uniform(rng, -90, 170),
                    (float)PropertyRunner.Uniform(rng, 0, 360));
                CameraRigMath.Pose clamped = CameraRigMath.ClampPose(wild, -650f, -600f, 650f, 600f);

                Assert.GreaterOrEqual(clamped.PitchDeg, LookSettings.MinPitchDeg);
                Assert.LessOrEqual(clamped.PitchDeg, LookSettings.MaxPitchDeg);
                float height = CameraRigMath.Position(clamped).y;
                Assert.GreaterOrEqual(height, LookSettings.MinCameraHeightM - 1e-2f);
                Assert.LessOrEqual(height, LookSettings.MaxCameraHeightM + 1e-2f);
                Assert.GreaterOrEqual(clamped.Target.x, -650f);
                Assert.LessOrEqual(clamped.Target.x, 650f);
                Assert.GreaterOrEqual(clamped.Target.z, -600f);
                Assert.LessOrEqual(clamped.Target.z, 600f);
            });
        }

        [Test]
        public void ZoomingKeepsThePointUnderThePointerAndStaysInsideTheLimits()
        {
            var pose = CameraRigMath.MakePose(0f, 0f, 400f, 50f, 0f);
            var pointer = new Vector2(900f, 250f);
            Vector3 anchor;
            Assert.IsTrue(CameraRigMath.GroundUnderPixel(pose, Fov, W, H, pointer, out anchor));

            pose.Distance *= CameraRigMath.ZoomFactor(3f);
            Vector3 target;
            Assert.IsTrue(CameraRigMath.TargetKeepingUnder(pose, Fov, W, H, pointer, anchor, out target));
            pose.Target = target;

            Vector2 pixel;
            Assert.IsTrue(CameraRigMath.ProjectToPixel(pose, Fov, W, H, anchor, out pixel));
            Assert.AreEqual(pointer.x, pixel.x, 0.5f);
            Assert.AreEqual(pointer.y, pixel.y, 0.5f);
            Assert.Less(pose.Distance, 400f, "a positive turn of the wheel zooms in");
        }

        // ---- The wheel mapping (requirement 16.6) ----

        [Test]
        public void TheInterimMappingLetsThePlainWheelZoomAndTheModifiedWheelAlways()
        {
            Assert.IsTrue(CameraInputMap.PlainWheelZooms, "interim: until Dig (task 3.1) takes the plain wheel");
            Assert.IsTrue(CameraRigMath.WheelZooms(false));
            Assert.IsTrue(CameraRigMath.WheelZooms(true));
        }

        // ---- debug/setCamera (requirement 16.1) is tested against a real controller in SceneControllerTests ----
    }
}
