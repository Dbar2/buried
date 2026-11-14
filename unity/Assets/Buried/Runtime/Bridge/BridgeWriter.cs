using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Buried.Interop
{
    /// <summary>
    /// Builds bridge messages from DTOs as a JObject tree and serialises it. No JSON text is ever
    /// assembled by string concatenation. Handles every message type so the conformance test can
    /// round-trip both directions.
    /// </summary>
    public static class BridgeWriter
    {
        public static string Write(ParsedMessage message)
        {
            return ToJson(message).ToString(Formatting.None);
        }

        public static string Write(string type, object payload)
        {
            return Write(new ParsedMessage(type, payload));
        }

        public static JObject ToJson(ParsedMessage message)
        {
            JObject payload;
            switch (message.type)
            {
                case BridgeMessageTypes.SceneInit: payload = Write((SceneInitPayload)message.payload); break;
                case BridgeMessageTypes.SceneLoadEra: payload = Write((SceneLoadEraPayload)message.payload); break;
                case BridgeMessageTypes.SceneAddFeatures: payload = Write((SceneAddFeaturesPayload)message.payload); break;
                case BridgeMessageTypes.SceneSetDepth: payload = Write((SceneSetDepthPayload)message.payload); break;
                case BridgeMessageTypes.SceneFocusLot: payload = Write((SceneFocusLotPayload)message.payload); break;
                case BridgeMessageTypes.SceneClearLot: payload = new JObject(); break;
                case BridgeMessageTypes.SceneSetDrapeMode: payload = Write((SceneSetDrapeModePayload)message.payload); break;
                case BridgeMessageTypes.SceneSetLantern: payload = Write((SceneSetLanternPayload)message.payload); break;
                case BridgeMessageTypes.SceneShowEvidence: payload = Write((SceneShowEvidencePayload)message.payload); break;
                case BridgeMessageTypes.SceneSetAnchors: payload = Write((SceneSetAnchorsPayload)message.payload); break;
                case BridgeMessageTypes.SceneRaise: payload = Write((SceneRaisePayload)message.payload); break;
                case BridgeMessageTypes.SceneRaised: payload = Write((SceneRaisedPayload)message.payload); break;
                case BridgeMessageTypes.SceneFrameFeature: payload = Write((SceneFrameFeaturePayload)message.payload); break;
                case BridgeMessageTypes.SceneSelectFeature: payload = Write((SceneSelectFeaturePayload)message.payload); break;
                case BridgeMessageTypes.SceneAnchors: payload = Write((SceneAnchorsPayload)message.payload); break;
                case BridgeMessageTypes.DebugMarkers: payload = Write((DebugMarkersPayload)message.payload); break;
                case BridgeMessageTypes.DebugSetCamera: payload = Write((DebugSetCameraPayload)message.payload); break;
                case BridgeMessageTypes.WalkEnter: payload = new JObject { ["reduced_motion"] = ((WalkEnterPayload)message.payload).reduced_motion }; break;
                case BridgeMessageTypes.WalkResume: payload = new JObject(); break;
                case BridgeMessageTypes.WalkExit: payload = new JObject(); break;
                case BridgeMessageTypes.WalkReady: payload = new JObject(); break;
                case BridgeMessageTypes.WalkTeleport:
                    var teleport = (WalkTeleportPayload)message.payload;
                    payload = new JObject { ["east"] = Num(teleport.east), ["north"] = Num(teleport.north), ["yaw_deg"] = Num(teleport.yaw_deg) };
                    break;
                case BridgeMessageTypes.WalkState:
                    var state = (WalkStatePayload)message.payload;
                    payload = new JObject { ["east"] = Num(state.east), ["north"] = Num(state.north), ["yaw_deg"] = Num(state.yaw_deg) };
                    break;
                case BridgeMessageTypes.WalkNearPlaque:
                    string near = ((WalkNearPlaquePayload)message.payload).slug;
                    payload = new JObject { ["slug"] = near == null ? JValue.CreateNull() : new JValue(near) };
                    break;
                case BridgeMessageTypes.WalkExhibit: payload = new JObject { ["slug"] = ((WalkExhibitPayload)message.payload).slug }; break;
                case BridgeMessageTypes.WalkPointerLock: payload = new JObject { ["locked"] = ((WalkPointerLockPayload)message.payload).locked }; break;
                case BridgeMessageTypes.Ready: payload = Write((ReadyPayload)message.payload); break;
                case BridgeMessageTypes.EraLoaded: payload = Write((EraLoadedPayload)message.payload); break;
                case BridgeMessageTypes.FeatureClicked: payload = Write((FeatureClickedPayload)message.payload); break;
                case BridgeMessageTypes.CameraChanged: payload = Write((CameraChangedPayload)message.payload); break;
                case BridgeMessageTypes.Error: payload = Write((ErrorPayload)message.payload); break;
                default: throw new ArgumentException("unknown message type " + message.type);
            }
            return new JObject { ["type"] = message.type, ["payload"] = payload };
        }

        private static JValue Num(double v)
        {
            if (double.IsNaN(v) || double.IsInfinity(v))
            {
                throw new ArgumentException("a non-finite number cannot be written to a bridge message");
            }
            return new JValue(v);
        }

        private static JArray Position(double[] p)
        {
            return new JArray(Num(p[0]), Num(p[1]));
        }

        private static JArray Positions(List<double[]> list)
        {
            var a = new JArray();
            foreach (double[] p in list) a.Add(Position(p));
            return a;
        }

        private static JObject Write(GeometryDto g)
        {
            JToken coordinates;
            switch (g.type)
            {
                case GeometryDto.Polygon:
                    coordinates = Polygon(g.polygons[0]);
                    break;
                case GeometryDto.MultiPolygon:
                    var polygons = new JArray();
                    foreach (List<List<double[]>> polygon in g.polygons) polygons.Add(Polygon(polygon));
                    coordinates = polygons;
                    break;
                case GeometryDto.LineString:
                    coordinates = Positions(g.lines[0]);
                    break;
                case GeometryDto.MultiLineString:
                    var lines = new JArray();
                    foreach (List<double[]> line in g.lines) lines.Add(Positions(line));
                    coordinates = lines;
                    break;
                default:
                    throw new ArgumentException("unknown geometry type " + g.type);
            }
            return new JObject { ["type"] = g.type, ["coordinates"] = coordinates };
        }

        private static JArray Polygon(List<List<double[]>> rings)
        {
            var a = new JArray();
            foreach (List<double[]> ring in rings) a.Add(Positions(ring));
            return a;
        }

        private static JObject Write(SceneInitPayload p)
        {
            var eras = new JArray();
            foreach (EraRef e in p.eras) eras.Add(new JObject { ["id"] = e.id, ["index"] = e.index });
            var present = new JArray();
            foreach (PresentBuildingDto b in p.present)
            {
                present.Add(new JObject { ["id"] = b.id, ["geometry"] = Write(b.geometry), ["heightM"] = Num(b.heightM) });
            }
            return new JObject
            {
                ["bridgeVersion"] = p.bridgeVersion,
                ["origin"] = new JObject { ["easting"] = Num(p.origin.easting), ["northing"] = Num(p.origin.northing) },
                ["bounds"] = new JObject
                {
                    ["minE"] = Num(p.bounds.minE),
                    ["minN"] = Num(p.bounds.minN),
                    ["maxE"] = Num(p.bounds.maxE),
                    ["maxN"] = Num(p.bounds.maxN),
                },
                ["initialView"] = new JObject
                {
                    ["minE"] = Num(p.initialView.minE),
                    ["minN"] = Num(p.initialView.minN),
                    ["maxE"] = Num(p.initialView.maxE),
                    ["maxN"] = Num(p.initialView.maxN),
                },
                ["eras"] = eras,
                ["present"] = present,
                ["reducedMotion"] = p.reducedMotion,
                ["debug"] = p.debug,
            };
        }

        private static JArray WriteFeatures(List<SceneFeatureDto> list)
        {
            var features = new JArray();
            foreach (SceneFeatureDto f in list)
            {
                var feature = new JObject
                {
                    ["id"] = f.id,
                    ["kind"] = f.kind,
                    ["geometry"] = Write(f.geometry),
                    ["confidence"] = f.confidence,
                    ["heightM"] = Num(f.heightM),
                };
                if (f.storeys > 0) feature["storeys"] = f.storeys;
                features.Add(feature);
            }
            return features;
        }

        private static JObject Write(SceneFocusLotPayload p)
        {
            return new JObject { ["lot"] = Write(p.lot) };
        }

        private static JObject Write(SceneSetDrapeModePayload p)
        {
            var o = new JObject { ["mode"] = p.mode };
            if (p.sourceId != null) o["sourceId"] = p.sourceId;
            return o;
        }

        private static JObject Write(SceneSetLanternPayload p)
        {
            return new JObject
            {
                ["on"] = p.on,
                ["center"] = new JObject { ["x"] = Num(p.center.x), ["y"] = Num(p.center.y) },
                ["radius"] = Num(p.radius),
                ["eraId"] = p.eraId,
            };
        }

        private static JObject Write(SceneSetAnchorsPayload p)
        {
            var ids = new JArray();
            foreach (string id in p.feature_ids) ids.Add(id);
            return new JObject { ["feature_ids"] = ids };
        }

        private static JObject Write(SceneAnchorsPayload p)
        {
            var anchors = new JArray();
            foreach (AnchorEntry a in p.anchors)
            {
                anchors.Add(new JObject
                {
                    ["feature_id"] = a.feature_id,
                    ["x"] = Num(a.x),
                    ["y"] = Num(a.y),
                    ["on_screen"] = a.on_screen,
                });
            }
            return new JObject { ["width"] = Num(p.width), ["height"] = Num(p.height), ["anchors"] = anchors };
        }

        private static JObject Write(SceneRaisePayload p)
        {
            return new JObject { ["era_id"] = p.era_id, ["first_feature_id"] = p.first_feature_id, ["animate"] = p.animate };
        }

        private static JObject Write(SceneRaisedPayload p)
        {
            return new JObject { ["era_id"] = p.era_id };
        }

        private static JObject Write(SceneFrameFeaturePayload p)
        {
            return new JObject { ["feature_id"] = p.feature_id };
        }

        private static JObject Write(SceneSelectFeaturePayload p)
        {
            var o = new JObject();
            if (p.feature_id != null) o["feature_id"] = p.feature_id;
            return o;
        }

        private static JObject Write(SceneShowEvidencePayload p)
        {
            var o = new JObject { ["featureId"] = p.featureId, ["on"] = p.on };
            if (p.drape != null) o["drape"] = WriteDrape(p.drape);
            return o;
        }

        private static JObject WriteDrape(DrapeDto d)
        {
            var drape = new JObject
            {
                ["sourceId"] = d.sourceId,
                ["url"] = d.url,
                ["corners"] = new JObject
                {
                    ["topLeft"] = Position(d.corners.topLeft),
                    ["topRight"] = Position(d.corners.topRight),
                    ["bottomRight"] = Position(d.corners.bottomRight),
                    ["bottomLeft"] = Position(d.corners.bottomLeft),
                },
                ["widthPx"] = d.widthPx,
                ["heightPx"] = d.heightPx,
            };
            if (d.clip != null) drape["clip"] = Write(d.clip);
            if (d.kind != null) drape["kind"] = d.kind;
            return drape;
        }

        private static JObject Write(SceneAddFeaturesPayload p)
        {
            return new JObject { ["eraId"] = p.eraId, ["features"] = WriteFeatures(p.features) };
        }

        private static JObject Write(SceneLoadEraPayload p)
        {
            JArray features = WriteFeatures(p.features);
            var drapes = new JArray();
            foreach (DrapeDto d in p.drapes) drapes.Add(WriteDrape(d));
            var loadEra = new JObject { ["eraId"] = p.eraId, ["features"] = features, ["drapes"] = drapes };
            if (p.held) loadEra["held"] = true;
            return loadEra;
        }

        private static JObject Write(SceneSetDepthPayload p)
        {
            return new JObject { ["depth"] = Num(p.depth) };
        }

        private static JObject Write(DebugMarkersPayload p)
        {
            var markers = new JArray();
            foreach (MarkerEntry m in p.markers)
            {
                markers.Add(new JObject { ["id"] = m.id, ["position"] = Position(m.position) });
            }
            return new JObject { ["markers"] = markers };
        }

        private static JObject Write(DebugSetCameraPayload p)
        {
            return new JObject
            {
                ["target"] = Position(p.target),
                ["distanceM"] = Num(p.distanceM),
                ["pitchDeg"] = Num(p.pitchDeg),
                ["headingDeg"] = Num(p.headingDeg),
            };
        }

        private static JObject Write(ReadyPayload p)
        {
            return new JObject { ["bridgeVersion"] = p.bridgeVersion, ["unityVersion"] = p.unityVersion };
        }

        private static JObject Write(EraLoadedPayload p)
        {
            var failed = new JArray();
            foreach (string id in p.failedDrapes) failed.Add(id);
            return new JObject
            {
                ["eraId"] = p.eraId,
                ["featureCount"] = p.featureCount,
                ["drapeCount"] = p.drapeCount,
                ["failedDrapes"] = failed,
            };
        }

        private static JObject Write(FeatureClickedPayload p)
        {
            return new JObject { ["featureId"] = p.featureId, ["eraId"] = p.eraId };
        }

        private static JObject Write(CameraPoint c)
        {
            return new JObject
            {
                ["easting"] = Num(c.easting),
                ["northing"] = Num(c.northing),
                ["heightM"] = Num(c.heightM),
            };
        }

        private static JObject Write(CameraChangedPayload p)
        {
            var vp = new JArray();
            foreach (double v in p.viewProjection) vp.Add(Num(v));
            return new JObject
            {
                ["eye"] = Write(p.eye),
                ["target"] = Write(p.target),
                ["fovDeg"] = Num(p.fovDeg),
                ["viewProjection"] = vp,
                ["canvas"] = new JObject { ["widthPx"] = p.canvas.widthPx, ["heightPx"] = p.canvas.heightPx },
            };
        }

        private static JObject Write(ErrorPayload p)
        {
            return new JObject
            {
                ["code"] = p.code,
                ["message"] = p.message,
                ["messageType"] = p.messageType == null ? JValue.CreateNull() : new JValue(p.messageType),
            };
        }
    }
}
