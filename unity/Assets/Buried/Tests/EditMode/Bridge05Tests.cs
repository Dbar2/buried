using System.IO;
using Buried.Interop;
using NUnit.Framework;

namespace Buried.Tests
{
    /// <summary>
    /// Bridge 0.5.0 (session 023): the optional storeys of a feature, the optional kind of a drape,
    /// scene/focusLot, scene/clearLot and scene/setDrapeMode, read from the shared fixtures. The
    /// conformance tests cover that every fixture parses (valid) or is refused (invalid) and that the
    /// writer round-trips; these check what the parser puts in the DTOs.
    /// </summary>
    public class Bridge05Tests
    {
        private static ParsedMessage Valid(string folder, string name)
        {
            return BridgeParser.Parse(File.ReadAllText(Path.Combine(TestPaths.FixturesRoot, "valid", folder, name + ".json")));
        }

        [Test]
        public void ARecordedStoreyCountIsReadAndAnAbsentOneIsZero()
        {
            var payload = (SceneLoadEraPayload)Valid("scene_loadEra", "storeys_and_aerial_kind").payload;
            Assert.AreEqual(2, payload.features[0].storeys);
            Assert.AreEqual(0, payload.features[1].storeys, "no count recorded: none is invented");
        }

        [Test]
        public void ADrapeKindIsReadAndAnAbsentOneIsNull()
        {
            var aerial = (SceneLoadEraPayload)Valid("scene_loadEra", "storeys_and_aerial_kind").payload;
            Assert.AreEqual(DrapeDto.KindAerial, aerial.drapes[0].kind);
            var plate = (SceneLoadEraPayload)Valid("scene_loadEra", "building_and_drape").payload;
            Assert.IsNull(plate.drapes[0].kind);
        }

        [Test]
        public void FocusLotCarriesThePolygonAndAMultiPolygonWithAHole()
        {
            var polygon = (SceneFocusLotPayload)Valid("scene_focusLot", "polygon").payload;
            Assert.AreEqual(GeometryDto.Polygon, polygon.lot.type);
            Assert.AreEqual(5, polygon.lot.polygons[0][0].Count);

            var multi = (SceneFocusLotPayload)Valid("scene_focusLot", "multipolygon_with_hole").payload;
            Assert.AreEqual(2, multi.lot.polygons.Count);
            Assert.AreEqual(2, multi.lot.polygons[0].Count, "an exterior and a hole");
        }

        [Test]
        public void ClearLotHasNoPayloadFields()
        {
            ParsedMessage message = Valid("scene_clearLot", "empty");
            Assert.AreEqual(BridgeMessageTypes.SceneClearLot, message.type);
            Assert.IsInstanceOf<SceneClearLotPayload>(message.payload);
        }

        [Test]
        public void SetDrapeModeNamesOneDrapeOrAll()
        {
            var all = (SceneSetDrapeModePayload)Valid("scene_setDrapeMode", "all_original").payload;
            Assert.AreEqual(SceneSetDrapeModePayload.Original, all.mode);
            Assert.IsNull(all.sourceId);

            var one = (SceneSetDrapeModePayload)Valid("scene_setDrapeMode", "one_lit").payload;
            Assert.AreEqual(SceneSetDrapeModePayload.Lit, one.mode);
            Assert.AreEqual("fip_v3_1911_229", one.sourceId);
        }

        [Test]
        public void ThePlayerSpeaksTheCurrentBridgeAndKnowsTheBridge05Messages()
        {
            Assert.AreEqual("0.6.0", BridgeVersion.Value);
            Assert.Contains(BridgeMessageTypes.SceneFocusLot, BridgeMessageTypes.ShellToPlayer);
            Assert.Contains(BridgeMessageTypes.SceneClearLot, BridgeMessageTypes.ShellToPlayer);
            Assert.Contains(BridgeMessageTypes.SceneSetDrapeMode, BridgeMessageTypes.ShellToPlayer);
        }
    }
}
