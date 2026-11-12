using UnityEngine;

namespace Buried.Geo
{
    /// <summary>
    /// The conversion between EPSG:26917 and Unity world coordinates. The origin (E0, N0) comes from
    /// scene/init, which the Shell reads from data/project.json; it is not a constant here.
    ///
    /// World position = (E - E0, h, N - N0). The subtraction is done in double precision and only
    /// then narrowed to float. Nothing in the Player adds an offset, nudge or correction.
    /// </summary>
    public sealed class ProjectFrame
    {
        /// <summary>
        /// Farthest a position may be from the origin. At 4096 m a float has a spacing of about 0.0005 m,
        /// so a position within 4000 m round-trips within 1 mm.
        /// </summary>
        public const double MaxDistanceM = 4000.0;

        public double E0 { get; }
        public double N0 { get; }

        public ProjectFrame(double e0, double n0)
        {
            E0 = e0;
            N0 = n0;
        }

        /// <summary>Position relative to the origin, in double precision (x east, y north).</summary>
        public Vec2d ToLocal(double easting, double northing)
        {
            return new Vec2d(easting - E0, northing - N0);
        }

        public Vector3 ToWorld(double easting, double northing, double heightM)
        {
            return new Vector3((float)(easting - E0), (float)heightM, (float)(northing - N0));
        }

        public Vector3 ToWorld(GeoPosition p)
        {
            return ToWorld(p.Easting, p.Northing, p.HeightM);
        }

        public GeoPosition ToData(Vector3 world)
        {
            return new GeoPosition(E0 + (double)world.x, N0 + (double)world.z, (double)world.y);
        }

        /// <summary>True when every corner of the rectangle is within <see cref="MaxDistanceM"/> of the origin.</summary>
        public bool BoundsWithinRange(double minE, double minN, double maxE, double maxN)
        {
            double[] es = { minE, maxE };
            double[] ns = { minN, maxN };
            foreach (double e in es)
            {
                foreach (double n in ns)
                {
                    double dx = e - E0;
                    double dy = n - N0;
                    if (System.Math.Sqrt(dx * dx + dy * dy) > MaxDistanceM) return false;
                }
            }
            return true;
        }
    }
}
