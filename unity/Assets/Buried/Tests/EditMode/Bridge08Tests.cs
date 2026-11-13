using System.IO;
using Buried.Interop;
using NUnit.Framework;

namespace Buried.Tests
{
    /// <summary>
    /// Bridge 0.8.0 (session 040): scene/setAnchors, scene/anchors, scene/raise, scene/raised and scene/frameFeature,
    /// read from the shared fixtures. The conformance tests cover that every fixture parses (valid) or is refused
    /// (invalid) and that the writer round-trips; these check what the parser puts in the DTOs.
    /// </summary>
    public class Bridge08Tests
    {
        private static ParsedMessage Valid(string folder, string name)
        {
            return BridgeParser.Parse(File.ReadAllText(Path.Combine(TestPaths.FixturesRoot, "valid", folder, name + ".json")));
        }

        [Test]
        public void SetAnchorsKeepsTheFindOrder()
        {
            var two = (SceneSetAnchorsPayload)Valid("scene_setAnchors", "two").payload;
            Assert.AreEqual(new[] { "bld_fip_v3_1911_229_0101", "bld_fip_v3_1911_229_0001" }, two.feature_ids.ToArray());

            var empty = (SceneSetAnchorsPayload)Valid("scene_setAnchors", "empty").payload;
            Assert.AreEqual(0, empty.feature_ids.Count);
        }

        [Test]
        public void AnchorsAreReadWithTheirScreenPositionAndVisibility()
        {
            var p = (SceneAnchorsPayload)Valid("scene_anchors", "on_and_off_screen").payload;
            Assert.AreEqual(1280.0, p.width, 1e-12);
            Assert.AreEqual(800.5, p.height, 1e-12);
            Assert.AreEqual(2, p.anchors.Count);
            Assert.AreEqual("bld_fip_v3_1911_229_0101", p.anchors[0].feature_id);
            Assert.AreEqual(812.25, p.anchors[0].x, 1e-12);
            Assert.AreEqual(301.5, p.anchors[0].y, 1e-12);
            Assert.IsTrue(p.anchors[0].on_screen);
            Assert.IsFalse(p.anchors[1].on_screen);
            Assert.AreEqual(-40.0, p.anchors[1].x, 1e-12);
        }

        [Test]
        public void RaiseCarriesTheEraTheFirstFeatureAndWhetherToAnimate()
        {
            var animated = (SceneRaisePayload)Valid("scene_raise", "animated").payload;
            Assert.AreEqual("fip_1911", animated.era_id);
            Assert.AreEqual("bld_fip_v3_1911_229_0101", animated.first_feature_id);
            Assert.IsTrue(animated.animate);

            var cut = (SceneRaisePayload)Valid("scene_raise", "cut").payload;
            Assert.IsFalse(cut.animate);
        }

        [Test]
        public void RaisedAndFrameFeatureCarryOneId()
        {
            Assert.AreEqual("fip_1911", ((SceneRaisedPayload)Valid("scene_raised", "raised").payload).era_id);
            Assert.AreEqual(
                "bld_fip_v3_1911_229_0001", ((SceneFrameFeaturePayload)Valid("scene_frameFeature", "frame").payload).feature_id);
        }

        [Test]
        public void ThePlayerSpeaksBridge080AndKnowsTheFiveMessagesInTheRightDirections()
        {
            Assert.AreEqual("0.8.0", BridgeVersion.Value);
            Assert.Contains(BridgeMessageTypes.SceneSetAnchors, BridgeMessageTypes.ShellToPlayer);
            Assert.Contains(BridgeMessageTypes.SceneRaise, BridgeMessageTypes.ShellToPlayer);
            Assert.Contains(BridgeMessageTypes.SceneFrameFeature, BridgeMessageTypes.ShellToPlayer);
            Assert.Contains(BridgeMessageTypes.SceneAnchors, BridgeMessageTypes.PlayerToShell);
            Assert.Contains(BridgeMessageTypes.SceneRaised, BridgeMessageTypes.PlayerToShell);
        }
    }
}
