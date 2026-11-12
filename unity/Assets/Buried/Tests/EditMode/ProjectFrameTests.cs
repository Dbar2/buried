using Buried.Geo;
using NUnit.Framework;
using UnityEngine;

namespace Buried.Tests
{
    public class ProjectFrameTests
    {
        // The project origin from data/project.json. Tests may use it; the runtime may not.
        private static ProjectFrame Frame()
        {
            return new ProjectFrame(632500.0, 4835000.0);
        }

        [Test]
        public void ConvertsAPositionToWorldAsEastHeightNorth()
        {
            Vector3 world = Frame().ToWorld(632600.5, 4835100.25, 7.0);
            Assert.AreEqual(100.5f, world.x, 1e-4f);
            Assert.AreEqual(7.0f, world.y, 1e-4f);
            Assert.AreEqual(100.25f, world.z, 1e-4f);
        }

        [Test]
        public void TheOriginIsTheWorldZero()
        {
            Vector3 world = Frame().ToWorld(632500.0, 4835000.0, 0.0);
            Assert.AreEqual(Vector3.zero, world);
        }

        [Test]
        public void ConvertsBackToDataByAddingTheOriginInDouble()
        {
            GeoPosition p = Frame().ToData(new Vector3(-250.5f, 12f, 99.75f));
            Assert.AreEqual(632249.5, p.Easting, 1e-6);
            Assert.AreEqual(4835099.75, p.Northing, 1e-6);
            Assert.AreEqual(12.0, p.HeightM, 1e-6);
        }

        [Test]
        public void SubtractsInDoubleBeforeNarrowingToFloat()
        {
            // A float cannot hold 632500.123 to a millimetre (its spacing there is 0.0625 m).
            // The offset from the origin must still be exact to about a float's precision near 0.
            Vector3 world = Frame().ToWorld(632500.123, 4835000.456, 0.0);
            Assert.AreEqual(0.123f, world.x, 1e-6f);
            Assert.AreEqual(0.456f, world.z, 1e-6f);
        }

        [Test]
        public void TheProjectBoundsAreWithinRange()
        {
            Assert.IsTrue(Frame().BoundsWithinRange(631900, 4834400, 633200, 4835600));
        }

        [Test]
        public void ABoundsCornerMoreThan4000MetresAwayIsRefused()
        {
            Assert.IsFalse(Frame().BoundsWithinRange(631900, 4834400, 633200, 4839600));
            Assert.IsFalse(Frame().BoundsWithinRange(627000, 4831000, 633200, 4835600));
        }

        [Test]
        public void ACornerExactlyAtTheLimitIsAccepted()
        {
            Assert.IsTrue(Frame().BoundsWithinRange(632500, 4835000, 632500 + 4000, 4835000));
            Assert.IsFalse(Frame().BoundsWithinRange(632500, 4835000, 632500 + 4000.001, 4835000));
        }
    }
}
