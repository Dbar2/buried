using System;
using NUnit.Framework;

namespace Buried.Tests
{
    /// <summary>
    /// A small seeded property runner (design.md "Correctness properties"): a fixed seed, 1000 cases by
    /// default, and the failing case printed with its seed so it can be replayed. It avoids adding
    /// FsCheck and FSharp.Core to the Unity project.
    /// </summary>
    public static class PropertyRunner
    {
        public const int DefaultCases = 1000;

        public static void Run(string name, int seed, int cases, Action<System.Random, int> body)
        {
            for (int i = 0; i < cases; i++)
            {
                int caseSeed = unchecked(seed * 7919 + i * 104729 + 17);
                var rng = new System.Random(caseSeed);
                try
                {
                    body(rng, i);
                }
                catch (Exception e)
                {
                    Assert.Fail(name + " failed on case " + i + " of " + cases + " (run seed " + seed
                                + ", case seed " + caseSeed + "): " + e.Message + "\n" + e.StackTrace);
                }
            }
        }

        public static void Run(string name, int seed, Action<System.Random, int> body)
        {
            Run(name, seed, DefaultCases, body);
        }

        public static double Uniform(System.Random rng, double min, double max)
        {
            return min + rng.NextDouble() * (max - min);
        }

        public static int Between(System.Random rng, int minInclusive, int maxInclusive)
        {
            return rng.Next(minInclusive, maxInclusive + 1);
        }
    }
}
