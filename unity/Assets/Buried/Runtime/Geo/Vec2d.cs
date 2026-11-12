namespace Buried.Geo
{
    /// <summary>
    /// A double-precision point in the ground plane, in metres relative to the project origin.
    /// X is east. Y is north, which is Unity's world z axis.
    /// </summary>
    public readonly struct Vec2d
    {
        public readonly double X;
        public readonly double Y;

        public Vec2d(double x, double y)
        {
            X = x;
            Y = y;
        }

        public override string ToString()
        {
            return "(" + X + ", " + Y + ")";
        }
    }
}
