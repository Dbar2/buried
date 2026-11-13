using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// The opening view of the first visit (spec 06 requirement 2.1 and task U9): a low oblique look at the sheet lying on
    /// the table, north-west, with the corner of Queen Street East and River Street in the right two thirds of the frame so
    /// the headline has the darker, emptier left third. The Player takes this pose when a held era is loaded
    /// (scene/loadEra with held true), and `Buried.Editor.Still.Render` renders the committed Stills from the same numbers,
    /// so the picture the Shell shows first is the scene the Player then draws. Raise does not move the camera.
    ///
    /// Positions are in Unity world metres from the project origin (x east, z north), not in EPSG:26917: the origin is read
    /// from scene/init and never written here. The wide pose is for a canvas wider than tall (16:10 is the Still); the tall
    /// pose is for a phone (39:80), where the same corner sits in the upper 60 per cent of the frame.
    /// </summary>
    public static class BlockCamera
    {
        /// <summary>A pose in the rig's terms: ground target, distance, pitch below the horizontal and heading clockwise from north.</summary>
        public struct Spec
        {
            public float TargetX;
            public float TargetZ;
            public float DistanceM;
            public float PitchDeg;
            public float HeadingDeg;
        }

        /// <summary>The aspect ratio (width over height) of the wide Still, and of the tall one.</summary>
        public const float WideAspect = 1.6f;
        public const float TallAspect = 39f / 80f;

        /// <summary>The corner the pose is built around, in metres from the origin: the middle of the bank's footprint.</summary>
        public const float CornerX = 8.5f;
        public const float CornerZ = 111f;

        public static readonly Spec Wide = new Spec { TargetX = -65f, TargetZ = 37f, DistanceM = 420f, PitchDeg = 30f, HeadingDeg = 315f };
        public static readonly Spec Tall = new Spec { TargetX = 2f, TargetZ = 97f, DistanceM = 260f, PitchDeg = 35f, HeadingDeg = 315f };

        /// <summary>The pose for a canvas of this shape: the tall one below square, the wide one otherwise.</summary>
        public static Spec For(float aspect)
        {
            return aspect < 1f ? Tall : Wide;
        }

        public static CameraRigMath.Pose ToPose(Spec spec)
        {
            return CameraRigMath.MakePose(spec.TargetX, spec.TargetZ, spec.DistanceM, spec.PitchDeg, spec.HeadingDeg);
        }
    }
}
