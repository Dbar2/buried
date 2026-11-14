using System.Collections.Generic;
using System.IO;
using Buried.Interop;
using Buried.Walk;
using NUnit.Framework;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>
    /// Bridge 0.9.0 (session 049, spec 07): the walk test's nine messages, read from the shared fixtures. The conformance tests
    /// cover that every fixture parses or is refused and that the writer round-trips; these check what the parser puts in the DTOs
    /// and how the walk mode answers a message it cannot act on.
    /// </summary>
    public class Bridge09Tests
    {
        private static ParsedMessage Valid(string folder, string name)
        {
            return BridgeParser.Parse(File.ReadAllText(Path.Combine(TestPaths.FixturesRoot, "valid", folder, name + ".json")));
        }

        [Test]
        public void ThePlayerSpeaksBridge090AndKnowsTheWalkMessagesInTheRightDirections()
        {
            Assert.AreEqual("0.9.0", BridgeVersion.Value);
            foreach (string type in new[] { "walk/enter", "walk/resume", "walk/exit", "walk/teleport" })
            {
                Assert.Contains(type, BridgeMessageTypes.ShellToPlayer);
                Assert.IsTrue(BridgeMessageTypes.IsWalk(type));
            }
            foreach (string type in new[] { "walk/ready", "walk/state", "walk/nearPlaque", "walk/exhibit", "walk/pointerLock" })
            {
                Assert.Contains(type, BridgeMessageTypes.PlayerToShell);
                Assert.IsTrue(BridgeMessageTypes.IsWalk(type));
            }
            Assert.IsFalse(BridgeMessageTypes.IsWalk("scene/raise"));
        }

        [Test]
        public void EnterCarriesReducedMotionAndTeleportCarriesAPlaceAndAHeading()
        {
            Assert.IsFalse(((WalkEnterPayload)Valid("walk_enter", "enter").payload).reduced_motion);
            Assert.IsTrue(((WalkEnterPayload)Valid("walk_enter", "reduced").payload).reduced_motion);
            var teleport = (WalkTeleportPayload)Valid("walk_teleport", "beside_plaque").payload;
            Assert.AreEqual(-7.562, teleport.east, 1e-12);
            Assert.AreEqual(112.0, teleport.north, 1e-12);
            Assert.AreEqual(17.5, teleport.yaw_deg, 1e-12);
        }

        [Test]
        public void StateNearPlaqueExhibitAndPointerLockAreReadIntoTheirFields()
        {
            var state = (WalkStatePayload)Valid("walk_state", "state").payload;
            Assert.AreEqual(-18.75, state.east, 1e-12);
            Assert.AreEqual(120.0, state.north, 1e-12);
            Assert.AreEqual(88.5, state.yaw_deg, 1e-12);

            Assert.AreEqual("overall-factory", ((WalkNearPlaquePayload)Valid("walk_nearPlaque", "near").payload).slug);
            Assert.IsNull(((WalkNearPlaquePayload)Valid("walk_nearPlaque", "none").payload).slug);
            Assert.AreEqual("machine-shop", ((WalkExhibitPayload)Valid("walk_exhibit", "exhibit").payload).slug);
            Assert.IsTrue(((WalkPointerLockPayload)Valid("walk_pointerLock", "locked").payload).locked);
            Assert.IsFalse(((WalkPointerLockPayload)Valid("walk_pointerLock", "released").payload).locked);
        }

        [Test]
        public void TheWalkModeRefusesATeleportBeforeItHasEntered()
        {
            var host = new GameObject("Walk bridge test");
            try
            {
                Bridge bridge = host.AddComponent<Bridge>();
                host.AddComponent<WalkMode>().Configure(bridge, null, null, null);
                var errors = new List<ErrorPayload>();
                bridge.Sent += (type, payload) =>
                {
                    if (type == BridgeMessageTypes.Error) errors.Add((ErrorPayload)payload);
                };
                bridge.Receive("{\"type\":\"walk/teleport\",\"payload\":{\"east\":0,\"north\":0,\"yaw_deg\":0}}");
                Assert.AreEqual(1, errors.Count);
                Assert.AreEqual(BridgeErrorCodes.InvalidMessage, errors[0].code);
                Assert.AreEqual("walk/teleport", errors[0].messageType);
            }
            finally
            {
                Object.DestroyImmediate(host);
            }
        }

        [Test]
        public void ThePlayerWithoutTheModelAnswersEnterWithAnErrorAndStaysOut()
        {
            var host = new GameObject("Walk bridge test");
            try
            {
                Bridge bridge = host.AddComponent<Bridge>();
                WalkMode mode = host.AddComponent<WalkMode>();
                mode.Configure(bridge, null, null, null);
                var errors = new List<ErrorPayload>();
                bridge.Sent += (type, payload) =>
                {
                    if (type == BridgeMessageTypes.Error) errors.Add((ErrorPayload)payload);
                };
                bridge.Receive("{\"type\":\"walk/enter\",\"payload\":{\"reduced_motion\":false}}");
                Assert.AreEqual(1, errors.Count);
                Assert.IsFalse(mode.Entered);
            }
            finally
            {
                Object.DestroyImmediate(host);
            }
        }
    }
}
