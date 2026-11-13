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

        /// <summary>
        /// The lens of the opening view (session 043): a long lens, so the block reads as a miniature on a desk. The Player sets
        /// it when it takes the pose and puts <see cref="Buried.Look.LookSettings.CameraFovDeg"/> back on the next scene/init.
        /// </summary>
        public const float FovDeg = 33f;

        /// <summary>The corner the pose is built around, in metres from the origin: the middle of the bank's footprint.</summary>
        public const float CornerX = 8.5f;
        public const float CornerZ = 111f;

        /// <summary>The middle of the overall factory's footprint (`bld_fip_v3_1911_229_0101`), a little south-west of the bank.</summary>
        public const float FactoryX = -2.4f;
        public const float FactoryZ = 99f;

        /// <summary>
        /// The heading that puts the plate's own "up" (from the sheet's bottom edge to its top edge) at the top of the frame:
        /// the bearing of `bottom_left` to `top_left` in data/tiles/fip_v3_1911_229.json, which is 342.5 degrees (17.5 degrees
        /// west of north). The lettering then reads the right way up, left to right.
        /// </summary>
        public const float PlateUpHeadingDeg = 342.5f;

        /// <summary>
        /// Session 046: 15 per cent closer than session 043's 300 m, with the target moved 8 m to the right of the frame so the sheet's
        /// right edge stays inside it (at 255 m on the old target that edge sat at 0.99 of the half-width).
        /// </summary>
        public static readonly Spec Wide = new Spec { TargetX = 2.2f, TargetZ = 63.7f, DistanceM = 255f, PitchDeg = 40f, HeadingDeg = PlateUpHeadingDeg };
        public static readonly Spec Tall = new Spec { TargetX = 27.3f, TargetZ = 4.6f, DistanceM = 480f, PitchDeg = 40f, HeadingDeg = PlateUpHeadingDeg };

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
