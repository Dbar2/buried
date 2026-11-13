using System.IO;
using Buried.Interop;
using NUnit.Framework;

namespace Buried.Tests
{
    /// <summary>
    /// Bridge 0.6.0 (session 028): scene/setLantern and scene/showEvidence, read from the shared fixtures. The
    /// conformance tests cover that every fixture parses (valid) or is refused (invalid) and that the writer
    /// round-trips; these check what the parser puts in the DTOs.
    /// </summary>
    public class Bridge06Tests
    {
        private static ParsedMessage Valid(string folder, string name)
        {
            return BridgeParser.Parse(File.ReadAllText(Path.Combine(TestPaths.FixturesRoot, "valid", folder, name + ".json")));
        }

        [Test]
        public void TheLensIsReadWithItsCentreRadiusAndEra()
        {
            var on = (SceneSetLanternPayload)Valid("scene_setLantern", "on").payload;
            Assert.IsTrue(on.on);
            Assert.AreEqual(0.5, on.center.x, 1e-12);
            Assert.AreEqual(0.4, on.center.y, 1e-12);
            Assert.AreEqual(0.18, on.radius, 1e-12);
            Assert.AreEqual("1911", on.eraId);

            var off = (SceneSetLanternPayload)Valid("scene_setLantern", "off").payload;
            Assert.IsFalse(off.on);
            Assert.AreEqual(0.5, off.radius, 1e-12, "the largest radius the schema allows");
        }

        [Test]
        public void ShowEvidenceCarriesTheDrapeWhenOnAndNoneWhenOff()
        {
            var on = (SceneShowEvidencePayload)Valid("scene_showEvidence", "on").payload;
            Assert.IsTrue(on.on);
            Assert.AreEqual("bld_fip_v3_1911_229_0001", on.featureId);
            Assert.AreEqual("fip_v3_1911_229", on.drape.sourceId);

            var off = (SceneShowEvidencePayload)Valid("scene_showEvidence", "off").payload;
            Assert.IsFalse(off.on);
            Assert.IsNull(off.drape);
        }

        [Test]
        public void ThePlayerKnowsTheBridge06Messages()
        {
            Assert.Contains(BridgeMessageTypes.SceneSetLantern, BridgeMessageTypes.ShellToPlayer);
            Assert.Contains(BridgeMessageTypes.SceneShowEvidence, BridgeMessageTypes.ShellToPlayer);
        }
    }
}
