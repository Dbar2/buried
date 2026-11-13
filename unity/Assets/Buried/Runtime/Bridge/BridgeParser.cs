using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace Buried.Interop
{
    /// <summary>
    /// Validates a bridge message and reads it into DTOs. Hand-written over JToken (no reflection),
    /// so it works under IL2CPP stripping and can reject unknown properties.
    ///
    /// It implements the same checks as data/schema/bridge.schema.json plus the semantic checks
    /// the schema cannot express (closed rings, era indexes 0..n-1 once each, unique ids). The
    /// TypeScript side (web/src/bridge/bridge.ts) implements the same semantic checks, and both
    /// are tested against the same fixtures.
    /// </summary>
    public static class BridgeParser
    {
        public static ParsedMessage Parse(string json)
        {
            JToken root = JsonFields.ReadJson(json);
            JObject envelope = JsonFields.Object(root, "message");

            JToken typeToken = envelope["type"];
            if (typeToken == null || typeToken.Type != JTokenType.String)
            {
                throw JsonFields.Fail("message.type", "must be a string");
            }
            string type = typeToken.Value<string>();
            if (!BridgeMessageTypes.IsKnown(type))
            {
                throw new BridgeValidationException(
                    BridgeErrorCodes.UnknownType, "message.type: \"" + type + "\" is not a known message type");
            }

            JsonFields.Exactly(envelope, "message", "type", "payload");
            JObject payload = JsonFields.ObjectAt(envelope, "payload", "message");

            switch (type)
            {
                case BridgeMessageTypes.SceneInit: return new ParsedMessage(type, ParseSceneInit(payload));
                case BridgeMessageTypes.SceneLoadEra: return new ParsedMessage(type, ParseSceneLoadEra(payload));
                case BridgeMessageTypes.SceneAddFeatures: return new ParsedMessage(type, ParseSceneAddFeatures(payload));
                case BridgeMessageTypes.SceneSetDepth: return new ParsedMessage(type, ParseSceneSetDepth(payload));
                case BridgeMessageTypes.SceneFocusLot: return new ParsedMessage(type, ParseSceneFocusLot(payload));
                case BridgeMessageTypes.SceneClearLot: return new ParsedMessage(type, ParseSceneClearLot(payload));
                case BridgeMessageTypes.SceneSetDrapeMode: return new ParsedMessage(type, ParseSceneSetDrapeMode(payload));
                case BridgeMessageTypes.DebugMarkers: return new ParsedMessage(type, ParseDebugMarkers(payload));
                case BridgeMessageTypes.DebugSetCamera: return new ParsedMessage(type, ParseDebugSetCamera(payload));
                case BridgeMessageTypes.Ready: return new ParsedMessage(type, ParseReady(payload));
                case BridgeMessageTypes.EraLoaded: return new ParsedMessage(type, ParseEraLoaded(payload));
                case BridgeMessageTypes.FeatureClicked: return new ParsedMessage(type, ParseFeatureClicked(payload));
                case BridgeMessageTypes.CameraChanged: return new ParsedMessage(type, ParseCameraChanged(payload));
                case BridgeMessageTypes.Error: return new ParsedMessage(type, ParseError(payload));
                default:
                    throw new BridgeValidationException(BridgeErrorCodes.UnknownType, "no parser for " + type);
            }
        }

        // ---- Shell to Player ----

        private static SceneInitPayload ParseSceneInit(JObject o)
        {
            const string p = "payload";
            JsonFields.Exactly(o, p, "bridgeVersion", "origin", "bounds", "initialView", "eras", "present", "reducedMotion", "debug");

            string version = JsonFields.String(o, "bridgeVersion", p);
            if (version != BridgeVersion.Value)
            {
                throw new BridgeValidationException(
                    BridgeErrorCodes.BridgeVersionMismatch,
                    p + ".bridgeVersion: the Player speaks " + BridgeVersion.Value + ", the message says " + version);
            }

            var result = new SceneInitPayload
            {
                bridgeVersion = version,
                origin = ParseOrigin(JsonFields.ObjectAt(o, "origin", p), p + ".origin"),
                bounds = ParseBounds(JsonFields.ObjectAt(o, "bounds", p), p + ".bounds"),
                initialView = ParseRect(JsonFields.ObjectAt(o, "initialView", p), p + ".initialView"),
                eras = new List<EraRef>(),
                present = new List<PresentBuildingDto>(),
                reducedMotion = JsonFields.Boolean(o, "reducedMotion", p),
                debug = JsonFields.Boolean(o, "debug", p),
            };

            RectDto v = result.initialView;
            SceneBounds b = result.bounds;
            if (v.minE < b.minE || v.minN < b.minN || v.maxE > b.maxE || v.maxN > b.maxN)
            {
                throw JsonFields.Fail(p + ".initialView", "must lie inside payload.bounds");
            }

            JArray eras = JsonFields.ArrayAt(o, "eras", p, 1, 64);
            for (int i = 0; i < eras.Count; i++) result.eras.Add(ParseEraRef(eras[i], p + ".eras[" + i + "]"));
            JsonFields.RequireUnique(result.eras.Select(e => e.id), p + ".eras", "era id");
            var indexes = result.eras.Select(e => e.index).OrderBy(i => i).ToList();
            for (int i = 0; i < indexes.Count; i++)
            {
                if (indexes[i] != i) throw JsonFields.Fail(p + ".eras", "indexes must be 0 to n-1, each once");
            }

            JArray present = JsonFields.ArrayAt(o, "present", p);
            for (int i = 0; i < present.Count; i++)
            {
                result.present.Add(ParsePresentBuilding(present[i], p + ".present[" + i + "]"));
            }
            JsonFields.RequireUnique(result.present.Select(b => b.id), p + ".present", "building id");
            return result;
        }

        private static OriginPoint ParseOrigin(JObject o, string p)
        {
            JsonFields.Exactly(o, p, "easting", "northing");
            return new OriginPoint
            {
                easting = JsonFields.NumberIn(o, "easting", p, JsonFields.MinEasting, JsonFields.MaxEasting),
                northing = JsonFields.NumberIn(o, "northing", p, JsonFields.MinNorthing, JsonFields.MaxNorthing),
            };
        }

        private static SceneBounds ParseBounds(JObject o, string p)
        {
            JsonFields.Exactly(o, p, "minE", "minN", "maxE", "maxN");
            return new SceneBounds
            {
                minE = JsonFields.NumberIn(o, "minE", p, JsonFields.MinEasting, JsonFields.MaxEasting),
                minN = JsonFields.NumberIn(o, "minN", p, JsonFields.MinNorthing, JsonFields.MaxNorthing),
                maxE = JsonFields.NumberIn(o, "maxE", p, JsonFields.MinEasting, JsonFields.MaxEasting),
                maxN = JsonFields.NumberIn(o, "maxN", p, JsonFields.MinNorthing, JsonFields.MaxNorthing),
            };
        }

        private static RectDto ParseRect(JObject o, string p)
        {
            JsonFields.Exactly(o, p, "minE", "minN", "maxE", "maxN");
            var rect = new RectDto
            {
                minE = JsonFields.NumberIn(o, "minE", p, JsonFields.MinEasting, JsonFields.MaxEasting),
                minN = JsonFields.NumberIn(o, "minN", p, JsonFields.MinNorthing, JsonFields.MaxNorthing),
                maxE = JsonFields.NumberIn(o, "maxE", p, JsonFields.MinEasting, JsonFields.MaxEasting),
                maxN = JsonFields.NumberIn(o, "maxN", p, JsonFields.MinNorthing, JsonFields.MaxNorthing),
            };
            if (!(rect.minE < rect.maxE) || !(rect.minN < rect.maxN))
            {
                throw JsonFields.Fail(p, "must have minE < maxE and minN < maxN");
            }
            return rect;
        }

        private static DebugSetCameraPayload ParseDebugSetCamera(JObject o)
        {
            const string p = "payload";
            JsonFields.Exactly(o, p, "target", "distanceM", "pitchDeg", "headingDeg");
            double heading = JsonFields.NumberIn(o, "headingDeg", p, 0.0, 360.0);
            if (heading >= 360.0) throw JsonFields.Fail(p + ".headingDeg", "must be below 360");
            return new DebugSetCameraPayload
            {
                target = JsonFields.PositionAt(o, "target", p),
                distanceM = JsonFields.NumberIn(o, "distanceM", p, 30.0, 3000.0),
                pitchDeg = JsonFields.NumberIn(o, "pitchDeg", p, 20.0, 80.0),
                headingDeg = heading,
            };
        }

        private static EraRef ParseEraRef(JToken t, string p)
        {
            JObject o = JsonFields.Object(t, p);
            JsonFields.Exactly(o, p, "id", "index");
            return new EraRef
            {
                id = JsonFields.Matching(o, "id", p, JsonFields.EraIdPattern),
                index = JsonFields.IntegerIn(o, "index", p, 0, 63),
            };
        }

        private static PresentBuildingDto ParsePresentBuilding(JToken t, string p)
        {
            JObject o = JsonFields.Object(t, p);
            JsonFields.Exactly(o, p, "id", "geometry", "heightM");
            return new PresentBuildingDto
            {
                id = JsonFields.String(o, "id", p, 1, 64),
                geometry = ParseGeometry(o["geometry"], p + ".geometry", true),
                heightM = JsonFields.NumberIn(o, "heightM", p, 0.0, 1000.0, true),
            };
        }

        private static SceneLoadEraPayload ParseSceneLoadEra(JObject o)
        {
            const string p = "payload";
            JsonFields.Exactly(o, p, "eraId", "features", "drapes");
            var result = new SceneLoadEraPayload
            {
                eraId = JsonFields.Matching(o, "eraId", p, JsonFields.EraIdPattern),
                features = new List<SceneFeatureDto>(),
                drapes = new List<DrapeDto>(),
            };
            JArray features = JsonFields.ArrayAt(o, "features", p);
            for (int i = 0; i < features.Count; i++)
            {
                result.features.Add(ParseSceneFeature(features[i], p + ".features[" + i + "]"));
            }
            JsonFields.RequireUnique(result.features.Select(f => f.id), p + ".features", "feature id");

            JArray drapes = JsonFields.ArrayAt(o, "drapes", p);
            for (int i = 0; i < drapes.Count; i++) result.drapes.Add(ParseDrape(drapes[i], p + ".drapes[" + i + "]"));
            JsonFields.RequireUnique(result.drapes.Select(d => d.sourceId), p + ".drapes", "source id");
            return result;
        }

        private static SceneAddFeaturesPayload ParseSceneAddFeatures(JObject o)
        {
            const string p = "payload";
            JsonFields.Exactly(o, p, "eraId", "features");
            var result = new SceneAddFeaturesPayload
            {
                eraId = JsonFields.Matching(o, "eraId", p, JsonFields.EraIdPattern),
                features = new List<SceneFeatureDto>(),
            };
            JArray features = JsonFields.ArrayAt(o, "features", p);
            for (int i = 0; i < features.Count; i++)
            {
                result.features.Add(ParseSceneFeature(features[i], p + ".features[" + i + "]"));
            }
            JsonFields.RequireUnique(result.features.Select(f => f.id), p + ".features", "feature id");
            return result;
        }

        private static SceneFeatureDto ParseSceneFeature(JToken t, string p)
        {
            JObject o = JsonFields.Object(t, p);
            JsonFields.ExactlyWithOptional(o, p, new[] { "id", "kind", "geometry", "confidence", "heightM" }, new[] { "storeys" });
            string kind = JsonFields.OneOf(o, "kind", p, SceneFeatureDto.KindBuilding, SceneFeatureDto.KindWater);
            return new SceneFeatureDto
            {
                id = JsonFields.Matching(o, "id", p, JsonFields.FeatureIdPattern),
                kind = kind,
                geometry = ParseGeometry(o["geometry"], p + ".geometry", kind == SceneFeatureDto.KindBuilding),
                confidence = JsonFields.OneOf(o, "confidence", p, "documented", "estimated", "unknown"),
                heightM = JsonFields.NumberIn(o, "heightM", p, 0.0, 1000.0, true),
                storeys = o["storeys"] == null ? 0 : JsonFields.IntegerIn(o, "storeys", p, 1, 100),
            };
        }

        private static DrapeDto ParseDrape(JToken t, string p)
        {
            JObject o = JsonFields.Object(t, p);
            JsonFields.ExactlyWithOptional(o, p, new[] { "sourceId", "url", "corners", "widthPx", "heightPx" }, new[] { "clip", "kind" });
            GeometryDto clip = null;
            if (o["clip"] != null)
            {
                clip = ParseGeometry(o["clip"], p + ".clip", true);
                if (clip.type != GeometryDto.Polygon) throw JsonFields.Fail(p + ".clip.type", "must be Polygon");
            }
            return new DrapeDto
            {
                sourceId = JsonFields.Matching(o, "sourceId", p, JsonFields.SourceIdPattern),
                url = JsonFields.Matching(o, "url", p, JsonFields.DrapeUrlPattern),
                corners = ParseCorners(JsonFields.ObjectAt(o, "corners", p), p + ".corners"),
                widthPx = JsonFields.IntegerIn(o, "widthPx", p, 1, 16384),
                heightPx = JsonFields.IntegerIn(o, "heightPx", p, 1, 16384),
                clip = clip,
                kind = o["kind"] == null ? null : JsonFields.OneOf(o, "kind", p, DrapeDto.KindPlate, DrapeDto.KindAerial),
            };
        }

        private static DrapeCornersDto ParseCorners(JObject o, string p)
        {
            JsonFields.Exactly(o, p, "topLeft", "topRight", "bottomRight", "bottomLeft");
            return new DrapeCornersDto
            {
                topLeft = JsonFields.PositionAt(o, "topLeft", p),
                topRight = JsonFields.PositionAt(o, "topRight", p),
                bottomRight = JsonFields.PositionAt(o, "bottomRight", p),
                bottomLeft = JsonFields.PositionAt(o, "bottomLeft", p),
            };
        }

        private static SceneSetDepthPayload ParseSceneSetDepth(JObject o)
        {
            const string p = "payload";
            JsonFields.Exactly(o, p, "depth");
            return new SceneSetDepthPayload { depth = JsonFields.NumberIn(o, "depth", p, 0.0, 64.0) };
        }

        private static SceneFocusLotPayload ParseSceneFocusLot(JObject o)
        {
            const string p = "payload";
            JsonFields.Exactly(o, p, "lot");
            return new SceneFocusLotPayload { lot = ParseGeometry(o["lot"], p + ".lot", true) };
        }

        private static SceneClearLotPayload ParseSceneClearLot(JObject o)
        {
            JsonFields.Exactly(o, "payload");
            return new SceneClearLotPayload();
        }

        private static SceneSetDrapeModePayload ParseSceneSetDrapeMode(JObject o)
        {
            const string p = "payload";
            JsonFields.ExactlyWithOptional(o, p, new[] { "mode" }, new[] { "sourceId" });
            return new SceneSetDrapeModePayload
            {
                mode = JsonFields.OneOf(o, "mode", p, SceneSetDrapeModePayload.Lit, SceneSetDrapeModePayload.Original),
                sourceId = o["sourceId"] == null ? null : JsonFields.Matching(o, "sourceId", p, JsonFields.SourceIdPattern),
            };
        }

        private static DebugMarkersPayload ParseDebugMarkers(JObject o)
        {
            const string p = "payload";
            JsonFields.Exactly(o, p, "markers");
            var result = new DebugMarkersPayload { markers = new List<MarkerEntry>() };
            JArray markers = JsonFields.ArrayAt(o, "markers", p, 0, 16);
            for (int i = 0; i < markers.Count; i++)
            {
                string mp = p + ".markers[" + i + "]";
                JObject m = JsonFields.Object(markers[i], mp);
                JsonFields.Exactly(m, mp, "id", "position");
                result.markers.Add(new MarkerEntry
                {
                    id = JsonFields.String(m, "id", mp, 1, 64),
                    position = JsonFields.PositionAt(m, "position", mp),
                });
            }
            JsonFields.RequireUnique(result.markers.Select(m => m.id), p + ".markers", "marker id");
            return result;
        }

        // ---- Player to Shell ----

        private static ReadyPayload ParseReady(JObject o)
        {
            const string p = "payload";
            JsonFields.Exactly(o, p, "bridgeVersion", "unityVersion");
            return new ReadyPayload
            {
                bridgeVersion = ReadBridgeVersion(o, p),
                unityVersion = JsonFields.String(o, "unityVersion", p, 1, 64),
            };
        }

        private static string ReadBridgeVersion(JObject o, string p)
        {
            string version = JsonFields.String(o, "bridgeVersion", p);
            if (version != BridgeVersion.Value)
            {
                throw new BridgeValidationException(
                    BridgeErrorCodes.BridgeVersionMismatch,
                    p + ".bridgeVersion: the Player speaks " + BridgeVersion.Value + ", the message says " + version);
            }
            return version;
        }

        private static EraLoadedPayload ParseEraLoaded(JObject o)
        {
            const string p = "payload";
            JsonFields.Exactly(o, p, "eraId", "featureCount", "drapeCount", "failedDrapes");
            var result = new EraLoadedPayload
            {
                eraId = JsonFields.Matching(o, "eraId", p, JsonFields.EraIdPattern),
                featureCount = JsonFields.IntegerIn(o, "featureCount", p, 0, int.MaxValue),
                drapeCount = JsonFields.IntegerIn(o, "drapeCount", p, 0, int.MaxValue),
                failedDrapes = new List<string>(),
            };
            JArray failed = JsonFields.ArrayAt(o, "failedDrapes", p);
            for (int i = 0; i < failed.Count; i++)
            {
                string fp = p + ".failedDrapes[" + i + "]";
                if (failed[i].Type != JTokenType.String) throw JsonFields.Fail(fp, "must be a string");
                string id = failed[i].Value<string>();
                if (!JsonFields.SourceIdPattern.IsMatch(id)) throw JsonFields.Fail(fp, "is not a source id");
                result.failedDrapes.Add(id);
            }
            return result;
        }

        private static FeatureClickedPayload ParseFeatureClicked(JObject o)
        {
            const string p = "payload";
            JsonFields.Exactly(o, p, "featureId", "eraId");
            return new FeatureClickedPayload
            {
                featureId = JsonFields.Matching(o, "featureId", p, JsonFields.FeatureIdPattern),
                eraId = JsonFields.Matching(o, "eraId", p, JsonFields.EraIdPattern),
            };
        }

        private static CameraChangedPayload ParseCameraChanged(JObject o)
        {
            const string p = "payload";
            JsonFields.Exactly(o, p, "eye", "target", "fovDeg", "viewProjection", "canvas");
            var result = new CameraChangedPayload
            {
                eye = ParseCameraPoint(JsonFields.ObjectAt(o, "eye", p), p + ".eye"),
                target = ParseCameraPoint(JsonFields.ObjectAt(o, "target", p), p + ".target"),
                fovDeg = JsonFields.NumberExclusiveRange(o, "fovDeg", p, 0.0, 180.0),
            };
            JArray vp = JsonFields.ArrayAt(o, "viewProjection", p, 16, 16);
            result.viewProjection = new double[16];
            for (int i = 0; i < 16; i++) result.viewProjection[i] = JsonFields.NumberValue(vp[i], p + ".viewProjection[" + i + "]");

            string cp = p + ".canvas";
            JObject canvas = JsonFields.ObjectAt(o, "canvas", p);
            JsonFields.Exactly(canvas, cp, "widthPx", "heightPx");
            result.canvas = new CanvasSize
            {
                widthPx = JsonFields.IntegerIn(canvas, "widthPx", cp, 1, 16384),
                heightPx = JsonFields.IntegerIn(canvas, "heightPx", cp, 1, 16384),
            };
            return result;
        }

        private static CameraPoint ParseCameraPoint(JObject o, string p)
        {
            JsonFields.Exactly(o, p, "easting", "northing", "heightM");
            return new CameraPoint
            {
                easting = JsonFields.NumberIn(o, "easting", p, JsonFields.MinEasting, JsonFields.MaxEasting),
                northing = JsonFields.NumberIn(o, "northing", p, JsonFields.MinNorthing, JsonFields.MaxNorthing),
                heightM = JsonFields.NumberIn(o, "heightM", p, -1000.0, 1.0e5),
            };
        }

        private static ErrorPayload ParseError(JObject o)
        {
            const string p = "payload";
            JsonFields.Exactly(o, p, "code", "message", "messageType");
            return new ErrorPayload
            {
                code = JsonFields.OneOf(o, "code", p, BridgeErrorCodes.All),
                message = JsonFields.String(o, "message", p, 0, 2000),
                messageType = JsonFields.NullableString(o, "messageType", p),
            };
        }

        // ---- Geometry ----

        private static GeometryDto ParseGeometry(JToken token, string p, bool polygonalOnly)
        {
            JObject o = JsonFields.Object(token, p);
            JsonFields.Exactly(o, p, "type", "coordinates");
            string type = JsonFields.OneOf(
                o, "type", p,
                GeometryDto.Polygon, GeometryDto.MultiPolygon, GeometryDto.LineString, GeometryDto.MultiLineString);
            if (polygonalOnly && type != GeometryDto.Polygon && type != GeometryDto.MultiPolygon)
            {
                throw JsonFields.Fail(p + ".type", "must be Polygon or MultiPolygon here");
            }

            var dto = new GeometryDto { type = type };
            string cp = p + ".coordinates";
            JToken coordinates = o["coordinates"];
            switch (type)
            {
                case GeometryDto.Polygon:
                    dto.polygons = new List<List<List<double[]>>> { ParsePolygon(coordinates, cp) };
                    break;
                case GeometryDto.MultiPolygon:
                    dto.polygons = new List<List<List<double[]>>>();
                    JArray polygons = JsonFields.ArrayValue(coordinates, cp, 1);
                    for (int i = 0; i < polygons.Count; i++) dto.polygons.Add(ParsePolygon(polygons[i], cp + "[" + i + "]"));
                    break;
                case GeometryDto.LineString:
                    dto.lines = new List<List<double[]>> { ParseLine(coordinates, cp) };
                    break;
                default:
                    dto.lines = new List<List<double[]>>();
                    JArray lines = JsonFields.ArrayValue(coordinates, cp, 1);
                    for (int i = 0; i < lines.Count; i++) dto.lines.Add(ParseLine(lines[i], cp + "[" + i + "]"));
                    break;
            }
            return dto;
        }

        private static List<List<double[]>> ParsePolygon(JToken token, string p)
        {
            JArray rings = JsonFields.ArrayValue(token, p, 1);
            var result = new List<List<double[]>>();
            for (int i = 0; i < rings.Count; i++)
            {
                string rp = p + "[" + i + "]";
                JArray ring = JsonFields.ArrayValue(rings[i], rp, 4);
                var positions = new List<double[]>();
                for (int j = 0; j < ring.Count; j++) positions.Add(JsonFields.Position(ring[j], rp + "[" + j + "]"));
                if (!JsonFields.Same(positions[0], positions[positions.Count - 1]))
                {
                    throw JsonFields.Fail(rp, "is not closed (first and last positions differ)");
                }
                result.Add(positions);
            }
            return result;
        }

        private static List<double[]> ParseLine(JToken token, string p)
        {
            JArray line = JsonFields.ArrayValue(token, p, 2);
            var positions = new List<double[]>();
            for (int j = 0; j < line.Count; j++) positions.Add(JsonFields.Position(line[j], p + "[" + j + "]"));
            return positions;
        }
    }
}
