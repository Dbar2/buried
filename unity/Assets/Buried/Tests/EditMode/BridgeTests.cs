using System.IO;
using System.Linq;
using Buried.Interop;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>Example tests for the Player side of the bridge. Property-style coverage is in BridgeConformanceTests.</summary>
    public class BridgeTests
    {
        private static JObject Schema()
        {
            return JObject.Parse(File.ReadAllText(TestPaths.BridgeSchema));
        }

        private static string Fixture(string kind, string directory, string name)
        {
            return File.ReadAllText(Path.Combine(TestPaths.FixturesRoot, kind, directory, name + ".json"));
        }

        [Test]
        public void TheBridgeVersionEqualsTheSchemaConst()
        {
            JObject defs = (JObject)Schema()["$defs"];
            Assert.AreEqual(BridgeVersion.Value, (string)defs["sceneInitPayload"]["properties"]["bridgeVersion"]["const"]);
            Assert.AreEqual(BridgeVersion.Value, (string)defs["readyPayload"]["properties"]["bridgeVersion"]["const"]);
        }

        [Test]
        public void TheErrorCodesEqualTheSchemaEnum()
        {
            JObject defs = (JObject)Schema()["$defs"];
            string[] fromSchema = defs["errorPayload"]["properties"]["code"]["enum"].Select(c => (string)c).OrderBy(c => c).ToArray();
            Assert.AreEqual(BridgeErrorCodes.All.OrderBy(c => c).ToArray(), fromSchema);
        }

        [Test]
        public void TheMessageTypesEqualTheSchemaCatalogue()
        {
            JObject defs = (JObject)Schema()["$defs"];
            string[] fromSchema = defs["bridgeMessage"]["oneOf"]
                .Select(r => ((string)r["$ref"]).Substring("#/$defs/".Length))
                .Select(name => (string)defs[name]["properties"]["type"]["const"])
                .OrderBy(t => t)
                .ToArray();
            string[] fromCode = BridgeMessageTypes.ShellToPlayer.Concat(BridgeMessageTypes.PlayerToShell).OrderBy(t => t).ToArray();
            Assert.AreEqual(fromCode, fromSchema);
        }

        [Test]
        public void ParsesASceneInit()
        {
            ParsedMessage message = BridgeParser.Parse(Fixture("valid", "scene_init", "gate"));
            Assert.AreEqual("scene/init", message.type);
            var init = (SceneInitPayload)message.payload;
            Assert.AreEqual(4, init.eras.Count);
            Assert.AreEqual("today", init.eras.First(e => e.index == 0).id);
            Assert.AreEqual(1, init.present.Count);
            Assert.IsTrue(init.debug);
        }

        [Test]
        public void ParsingTheSameMessageTwiceGivesTheSameJson()
        {
            string text = Fixture("valid", "scene_loadEra", "building_and_drape");
            string a = BridgeWriter.Write(BridgeParser.Parse(text));
            string b = BridgeWriter.Write(BridgeParser.Parse(a));
            Assert.AreEqual(a, b);
        }

        [Test]
        public void ARingThatIsNotClosedIsRefused()
        {
            var e = Assert.Throws<BridgeValidationException>(
                () => BridgeParser.Parse(Fixture("invalid", "scene_init", "present_ring_open")));
            StringAssert.Contains("not closed", e.Message);
        }

        [Test]
        public void AnUnknownTypeCarriesTheUnknownTypeCode()
        {
            var e = Assert.Throws<BridgeValidationException>(
                () => BridgeParser.Parse(Fixture("invalid", "envelope", "unknown_type")));
            Assert.AreEqual(BridgeErrorCodes.UnknownType, e.Code);
        }

        [Test]
        public void AWrongBridgeVersionCarriesTheMismatchCode()
        {
            var e = Assert.Throws<BridgeValidationException>(
                () => BridgeParser.Parse(Fixture("invalid", "scene_init", "wrong_bridge_version")));
            Assert.AreEqual(BridgeErrorCodes.BridgeVersionMismatch, e.Code);
        }

        [Test]
        public void ANonFiniteNumberCannotBeWritten()
        {
            var payload = new SceneSetDepthPayload { depth = double.NaN };
            Assert.Throws<System.ArgumentException>(() => BridgeWriter.Write("scene/setDepth", payload));
        }

        [Test]
        public void ReceiveDropsMalformedAndMisdirectedMessagesAndPassesValidOnes()
        {
            var go = new GameObject("Bridge test");
            try
            {
                var bridge = go.AddComponent<Bridge>();
                int received = 0;
                bridge.MessageReceived += _ => received++;

                bridge.Receive("{ not json");
                bridge.Receive(Fixture("valid", "ready", "ready"));          // Player-to-Shell: not accepted here
                bridge.Receive(Fixture("invalid", "scene_setDepth", "depth_negative"));
                Assert.AreEqual(0, received);

                bridge.Receive(Fixture("valid", "scene_setDepth", "depth_two"));
                Assert.AreEqual(1, received);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }
    }
}
