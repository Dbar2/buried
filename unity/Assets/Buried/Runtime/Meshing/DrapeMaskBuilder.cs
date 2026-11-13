using System;
using System.Collections.Generic;
using Buried.Geo;

namespace Buried.Meshing
{
    /// <summary>
    /// The mask of one drape (design.md "Drape mask"): it removes what is not map content and fades the
    /// drape into the ground. It changes opacity only. The texture covers the boundary's bounding box,
    /// grown by two texels so that clamping gives 0 outside, and has two channels:
    /// R = smoothstep(0, feather, d) and G = 1 where d &gt; 0, with d the signed distance to the
    /// boundary in metres (positive inside), computed in double precision. Axis-aligned in world x and z.
    /// </summary>
    public sealed class DrapeMask
    {
        public int Width;
        public int Height;
        public double MinX;
        public double MinZ;
        public double SizeX;
        public double SizeZ;
        /// <summary>Row-major, row 0 at MinZ. Values 0..1.</summary>
        public float[] Fade;
        public float[] Coverage;

        /// <summary>The fade channel at a world position, bilinear, 0 outside the texture.</summary>
        public float SampleFade(double x, double z)
        {
            return Sample(Fade, x, z);
        }

        /// <summary>The coverage channel at a world position, bilinear, 0 outside the texture.</summary>
        public float SampleCoverage(double x, double z)
        {
            return Sample(Coverage, x, z);
        }

        private float Sample(float[] channel, double x, double z)
        {
            double u = (x - MinX) / SizeX * Width - 0.5;
            double v = (z - MinZ) / SizeZ * Height - 0.5;
            int x0 = (int)Math.Floor(u);
            int y0 = (int)Math.Floor(v);
            float fx = (float)(u - x0);
            float fy = (float)(v - y0);
            float a = At(channel, x0, y0);
            float b = At(channel, x0 + 1, y0);
            float c = At(channel, x0, y0 + 1);
            float d = At(channel, x0 + 1, y0 + 1);
            return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
        }

        private float At(float[] channel, int x, int y)
        {
            if (x < 0 || y < 0 || x >= Width || y >= Height) return 0f; // clamp to the zero border
            return channel[y * Width + x];
        }
    }

    public static class DrapeMaskBuilder
    {
        /// <summary>The fade band inside the boundary, in metres.</summary>
        public const double FeatherM = 15.0;

        /// <summary>The mask's long edge, in texels.</summary>
        public const int MaxPx = 512;

        /// <summary>
        /// The mask for a boundary polygon (one ring, not closed: the first vertex is not repeated, in
        /// world x and z). The boundary may be concave.
        /// </summary>
        public static DrapeMask Build(IList<Vec2d> boundary, double featherM = FeatherM, int maxPx = MaxPx)
        {
            if (boundary == null || boundary.Count < 3) throw new ArgumentException("a drape boundary needs at least three vertices");

            double minX = double.PositiveInfinity, minZ = double.PositiveInfinity;
            double maxX = double.NegativeInfinity, maxZ = double.NegativeInfinity;
            foreach (Vec2d p in boundary)
            {
                minX = Math.Min(minX, p.X);
                maxX = Math.Max(maxX, p.X);
                minZ = Math.Min(minZ, p.Y);
                maxZ = Math.Max(maxZ, p.Y);
            }

            double extentX = Math.Max(maxX - minX, 1e-3);
            double extentZ = Math.Max(maxZ - minZ, 1e-3);
            // The long edge of the boundary box gets maxPx - 4 texels; two more on each side are the zero border.
            double texel = Math.Max(extentX, extentZ) / (maxPx - 4);
            int width = (int)Math.Ceiling(extentX / texel) + 4;
            int height = (int)Math.Ceiling(extentZ / texel) + 4;

            var mask = new DrapeMask
            {
                Width = width,
                Height = height,
                MinX = minX - 2 * texel,
                MinZ = minZ - 2 * texel,
                SizeX = width * texel,
                SizeZ = height * texel,
                Fade = new float[width * height],
                Coverage = new float[width * height],
            };

            for (int y = 0; y < height; y++)
            {
                double z = mask.MinZ + (y + 0.5) * texel;
                for (int x = 0; x < width; x++)
                {
                    double px = mask.MinX + (x + 0.5) * texel;
                    double d = SignedDistance(boundary, px, z);
                    if (d <= 0.0) continue;
                    mask.Fade[y * width + x] = (float)SmoothStep(0.0, featherM, d);
                    mask.Coverage[y * width + x] = 1f;
                }
            }
            return mask;
        }

        public static double SmoothStep(double edge0, double edge1, double x)
        {
            double t = Math.Min(Math.Max((x - edge0) / (edge1 - edge0), 0.0), 1.0);
            return t * t * (3.0 - 2.0 * t);
        }

        /// <summary>Distance from a point to the polygon's boundary, positive inside and negative outside (even-odd rule).</summary>
        public static double SignedDistance(IList<Vec2d> polygon, double x, double y)
        {
            bool inside = false;
            double best = double.PositiveInfinity;
            int n = polygon.Count;
            for (int i = 0, j = n - 1; i < n; j = i++)
            {
                Vec2d a = polygon[j];
                Vec2d b = polygon[i];
                if ((a.Y > y) != (b.Y > y) && x < (b.X - a.X) * (y - a.Y) / (b.Y - a.Y) + a.X) inside = !inside;

                double dx = b.X - a.X;
                double dy = b.Y - a.Y;
                double lengthSq = dx * dx + dy * dy;
                double t = lengthSq > 0.0 ? ((x - a.X) * dx + (y - a.Y) * dy) / lengthSq : 0.0;
                t = Math.Min(Math.Max(t, 0.0), 1.0);
                double cx = a.X + t * dx - x;
                double cy = a.Y + t * dy - y;
                best = Math.Min(best, Math.Sqrt(cx * cx + cy * cy));
            }
            return inside ? best : -best;
        }
    }
}
