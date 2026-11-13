using System;
using System.Collections;
using System.Collections.Generic;
using Buried.Geo;
using Buried.Interop;
using Buried.Look;
using Buried.Meshing;
using UnityEngine;
using UnityEngine.Rendering;

namespace Buried.Scene
{
    /// <summary>
    /// Handles the Shell's messages and builds the scene from them. It draws what it is told: it never
    /// computes dates, confidence or lot relations, and it never filters the features of an era.
    /// Bridge 0.4.0: scene/init, scene/loadEra, scene/addFeatures, scene/setDepth, debug/markers and debug/setCamera.
    /// The depth is a fraction while the Shell tweens between eras; each era is drawn at its weight
    /// (DepthBlend) and the present buildings drain to a faint outline.
    /// </summary>
    public sealed class SceneController : MonoBehaviour
    {
        private const float CameraReportIntervalS = 0.1f;

        private Bridge _bridge;
        private BuriedPalette _palette;
        private ShaderSet _shaders;
        private CameraRig _rig;
        private Camera _camera;

        private readonly TextureCache _textures = new TextureCache();
        private readonly Picker _picker = new Picker();
        private readonly Dictionary<string, int> _eraIndexById = new Dictionary<string, int>();
        private readonly Dictionary<string, EraLayer> _layers = new Dictionary<string, EraLayer>();
        private readonly Dictionary<string, int> _loadGeneration = new Dictionary<string, int>();

        private bool _initialised;
        private bool _debug;
        private bool _reducedMotion;
        private int _sceneEpoch;
        private int _eraCount;
        private int _shownIndex;
        private double _depth;
        private ProjectFrame _frame;

        private GameObject _ground;
        private Mesh _groundMesh;
        private Material _groundMaterial;
        private Material _skyMaterial;
        private Material _ghostFill;
        private Material _ghostEdge;
        private PresentLayer _present;
        private DebugMarkers _markers;

        private bool _cameraDirty;
        private float _lastCameraSent = float.NegativeInfinity;
        private Vector2 _pointerDown;

        public void Configure(Bridge bridge, BuriedPalette palette, ShaderSet shaders, CameraRig rig)
        {
            _bridge = bridge;
            _palette = palette;
            _shaders = shaders;
            _rig = rig;
            _camera = rig.Camera;
            _bridge.MessageReceived += OnMessage;
        }

        private void OnDestroy()
        {
            if (_bridge != null) _bridge.MessageReceived -= OnMessage;
        }

        // ---- Messages ----

        private void OnMessage(ParsedMessage message)
        {
            try
            {
                if (message.type == BridgeMessageTypes.SceneInit)
                {
                    HandleInit((SceneInitPayload)message.payload);
                    return;
                }

                if (!_initialised)
                {
                    _bridge.SendError(
                        BridgeErrorCodes.EraNotInitialised, "scene/init has not been received yet", message.type);
                    return;
                }

                switch (message.type)
                {
                    case BridgeMessageTypes.SceneLoadEra:
                        StartCoroutine(LoadEra((SceneLoadEraPayload)message.payload));
                        break;
                    case BridgeMessageTypes.SceneAddFeatures:
                        HandleAddFeatures((SceneAddFeaturesPayload)message.payload);
                        break;
                    case BridgeMessageTypes.SceneSetDepth:
                        HandleSetDepth((SceneSetDepthPayload)message.payload);
                        break;
                    case BridgeMessageTypes.DebugMarkers:
                        HandleMarkers((DebugMarkersPayload)message.payload);
                        break;
                    case BridgeMessageTypes.DebugSetCamera:
                        HandleSetCamera((DebugSetCameraPayload)message.payload);
                        break;
                    default:
                        _bridge.SendError(BridgeErrorCodes.UnknownType, "not handled by this Player: " + message.type, message.type);
                        break;
                }
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                _bridge.SendError(BridgeErrorCodes.InvalidMessage, "could not apply " + message.type + ": " + e.Message, message.type);
            }
        }

        private void HandleInit(SceneInitPayload init)
        {
            var frame = new ProjectFrame(init.origin.easting, init.origin.northing);
            if (!frame.BoundsWithinRange(init.bounds.minE, init.bounds.minN, init.bounds.maxE, init.bounds.maxN))
            {
                _bridge.SendError(
                    BridgeErrorCodes.BoundsTooFar,
                    "a corner of the bounds is more than " + ProjectFrame.MaxDistanceM + " m from the origin",
                    BridgeMessageTypes.SceneInit);
                return;
            }

            ClearScene();
            _frame = frame;
            _debug = init.debug;
            _reducedMotion = init.reducedMotion;
            _eraCount = init.eras.Count;
            foreach (EraRef era in init.eras) _eraIndexById[era.id] = era.index;

            BuildEnvironment(init);
            _present = new PresentLayer(
                transform,
                init.present,
                _frame,
                _palette,
                _shaders.present,
                _shaders.edge,
                PixelScale(),
                (id, reason) => _bridge.SendError(
                    BridgeErrorCodes.MeshBuildFailed, "present building " + id + ": " + reason, BridgeMessageTypes.SceneInit));
            ApplyDepth(0.0);

            _initialised = true;
            _shownIndex = 0;
            RequestCameraReport();
        }

        /// <summary>Device pixels per CSS pixel, as far as the browser tells Unity (1 when it does not).</summary>
        private static float PixelScale()
        {
            return Screen.dpi > 96f ? Mathf.Min(Screen.dpi / 96f, 3f) : 1f;
        }

        private void ClearScene()
        {
            _sceneEpoch++;
            foreach (EraLayer layer in _layers.Values) layer.Dispose();
            _layers.Clear();
            _loadGeneration.Clear();
            _eraIndexById.Clear();
            _textures.Clear();
            if (_markers != null)
            {
                _markers.Dispose();
                _markers = null;
            }
            if (_present != null)
            {
                _present.Dispose();
                _present = null;
            }
            if (_ground != null) Destroy(_ground);
            if (_groundMesh != null) Destroy(_groundMesh);
            if (_groundMaterial != null) Destroy(_groundMaterial);
            if (_skyMaterial != null) Destroy(_skyMaterial);
            if (_ghostFill != null) Destroy(_ghostFill);
            if (_ghostEdge != null) Destroy(_ghostEdge);
            _ground = null;
            _initialised = false;
        }

        private void BuildEnvironment(SceneInitPayload init)
        {
            SceneBounds b = init.bounds;
            Vec2d min = _frame.ToLocal(b.minE, b.minN);
            Vec2d max = _frame.ToLocal(b.maxE, b.maxN);
            var centre = new Vec2d((min.X + max.X) * 0.5, (min.Y + max.Y) * 0.5);

            double radius = 0.0;
            foreach (double x in new[] { min.X, max.X })
            {
                foreach (double y in new[] { min.Y, max.Y })
                {
                    radius = Math.Max(radius, Math.Sqrt((x - centre.X) * (x - centre.X) + (y - centre.Y) * (y - centre.Y)));
                }
            }
            float fogRadius = LookSettings.FogRadius(radius);

            Color fog = _palette.fog;
            // A vector, not a colour: Unity does not convert vectors, so the fog colour is exactly the
            // linear value of the palette colour that the materials get through their Color property.
            Color fogLinear = fog.linear;
            Shader.SetGlobalVector("_BuriedFogColor", new Vector4(fogLinear.r, fogLinear.g, fogLinear.b, 1f));
            Shader.SetGlobalFloat("_BuriedFogDensity", LookSettings.FogDensity(fogRadius));

            // Sky: night at the top, a lighter grey-blue band just above the horizon, and the `fog`
            // colour at and below the horizon, which is the colour the fogged ground reaches far
            // away, so the ground meets the sky without a hard line.
            _skyMaterial = new Material(_shaders.sky) { name = "Sky" };
            _skyMaterial.SetColor("_Zenith", _palette.night);
            _skyMaterial.SetColor("_Band", Color.Lerp(_palette.night, _palette.muted, LookSettings.HorizonMix));
            _skyMaterial.SetColor("_Haze", _palette.fog);
            _skyMaterial.SetFloat("_BandElevation", LookSettings.SkyBandElevation);
            _skyMaterial.SetFloat("_ZenithElevation", LookSettings.SkyZenithElevation);
            RenderSettings.skybox = _skyMaterial;

            // Ground: one big quad in the fog colour, so the edge of the coverage area dissolves.
            _groundMesh = GroundBuilder.Build((float)centre.X, (float)centre.Y, LookSettings.GroundHalfExtent(fogRadius)).ToMesh("Ground");
            _groundMaterial = new Material(_shaders.ghost) { name = "Ground" };
            _groundMaterial.SetColor("_Color", fog);
            _groundMaterial.SetFloat("_Shade", 0f);
            _groundMaterial.SetFloat("_Emission", 0f);
            _groundMaterial.SetFloat("_SrcBlend", (float)BlendMode.One);
            _groundMaterial.SetFloat("_DstBlend", (float)BlendMode.Zero);
            _groundMaterial.SetFloat("_ZWrite", 0f);
            _groundMaterial.SetFloat("_Cull", (float)CullMode.Off);
            _groundMaterial.renderQueue = 1000;

            _ground = new GameObject("Ground");
            _ground.transform.SetParent(transform, false);
            _ground.AddComponent<MeshFilter>().sharedMesh = _groundMesh;
            MeshRenderer groundRenderer = _ground.AddComponent<MeshRenderer>();
            groundRenderer.sharedMaterial = _groundMaterial;
            groundRenderer.shadowCastingMode = ShadowCastingMode.Off;
            groundRenderer.receiveShadows = false;

            // The documented ghost: `ink` fill at alpha 0.35 with a little self-illumination, and
            // thin `ink` edges with emission above 1.
            Color ink = _palette.ink;
            Color fill = ink;
            fill.a = LookSettings.GhostFillAlpha;
            _ghostFill = new Material(_shaders.ghost) { name = "Ghost fill" };
            _ghostFill.SetColor("_Color", fill);
            _ghostFill.SetFloat("_Shade", 0.35f);
            _ghostFill.SetFloat("_Emission", LookSettings.GhostEmission);
            _ghostFill.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            _ghostFill.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            _ghostFill.SetFloat("_ZWrite", 0f);
            _ghostFill.SetFloat("_Cull", (float)CullMode.Back);
            _ghostFill.renderQueue = 3000;

            _ghostEdge = new Material(_shaders.edge) { name = "Ghost edge" };
            _ghostEdge.SetColor("_Color", ink);
            _ghostEdge.SetFloat("_Alpha", 1f);
            _ghostEdge.SetFloat("_Emission", LookSettings.EdgeEmission);
            _ghostEdge.SetFloat("_WidthPx", LookSettings.EdgeWidthCssPx);
            _ghostEdge.SetFloat("_GlowPx", LookSettings.EdgeGlowPx);
            _ghostEdge.SetFloat("_GlowAlpha", LookSettings.EdgeGlowAlpha);
            _ghostEdge.SetFloat("_PixelScale", PixelScale());
            _ghostEdge.renderQueue = 3010;

            _markers = new DebugMarkers(transform, _shaders.marker);

            // The camera may roam over the project bounds and starts framing the initial view.
            _rig.SetLimits((float)min.X, (float)min.Y, (float)max.X, (float)max.Y);
            Vec2d viewMin = _frame.ToLocal(init.initialView.minE, init.initialView.minN);
            Vec2d viewMax = _frame.ToLocal(init.initialView.maxE, init.initialView.maxN);
            _rig.SetDefaultPose((float)viewMin.X, (float)viewMin.Y, (float)viewMax.X, (float)viewMax.Y);
        }

        private IEnumerator LoadEra(SceneLoadEraPayload payload)
        {
            int index;
            if (!_eraIndexById.TryGetValue(payload.eraId, out index))
            {
                _bridge.SendError(
                    BridgeErrorCodes.EraNotInitialised,
                    "era \"" + payload.eraId + "\" was not listed in scene/init",
                    BridgeMessageTypes.SceneLoadEra);
                yield break;
            }

            int epoch = _sceneEpoch;
            int generation;
            _loadGeneration.TryGetValue(payload.eraId, out generation);
            generation++;
            _loadGeneration[payload.eraId] = generation;

            var layer = new EraLayer(payload.eraId, index, transform);
            layer.SetWeight(0f, _reducedMotion);
            layer.AddFeatures(
                payload.features,
                _frame,
                _ghostFill,
                _ghostEdge,
                (featureId, reason) => _bridge.SendError(
                    BridgeErrorCodes.MeshBuildFailed, "feature " + featureId + ": " + reason, BridgeMessageTypes.SceneLoadEra));

            var failed = new List<string>();
            int order = 0;
            foreach (DrapeDto drape in payload.drapes)
            {
                Texture2D texture = null;
                string error = null;
                yield return _textures.Load(drape.url, (t, e) =>
                {
                    texture = t;
                    error = e;
                });

                if (epoch != _sceneEpoch || generation != _loadGeneration[payload.eraId])
                {
                    layer.Dispose();
                    yield break;
                }

                if (texture == null)
                {
                    failed.Add(drape.sourceId);
                    _bridge.SendError(
                        BridgeErrorCodes.TextureLoadFailed,
                        "the image for " + drape.sourceId + " could not be loaded (" + error + ")",
                        BridgeMessageTypes.SceneLoadEra);
                }
                else
                {
                    layer.AddDrape(DrapeLayer.Create(layer.Parent, _frame, drape, texture, _shaders.drape, order));
                }
                order++;
            }

            EraLayer previous;
            if (_layers.TryGetValue(payload.eraId, out previous)) previous.Dispose();
            _layers[payload.eraId] = layer;
            layer.SetWeight(DepthBlend.EraWeight(_depth, layer.Index), _reducedMotion);

            _bridge.Send(BridgeMessageTypes.EraLoaded, new EraLoadedPayload
            {
                eraId = payload.eraId,
                featureCount = layer.FeatureCount,
                drapeCount = layer.DrapeCount,
                failedDrapes = failed,
            });
        }

        private void HandleAddFeatures(SceneAddFeaturesPayload payload)
        {
            int index;
            if (!_eraIndexById.TryGetValue(payload.eraId, out index))
            {
                _bridge.SendError(
                    BridgeErrorCodes.EraNotInitialised,
                    "era \"" + payload.eraId + "\" was not listed in scene/init",
                    BridgeMessageTypes.SceneAddFeatures);
                return;
            }

            EraLayer layer;
            if (!_layers.TryGetValue(payload.eraId, out layer))
            {
                _bridge.SendError(
                    BridgeErrorCodes.EraNotInitialised,
                    "era \"" + payload.eraId + "\" has not been loaded with scene/loadEra",
                    BridgeMessageTypes.SceneAddFeatures);
                return;
            }

            layer.AddRising(
                payload.features,
                _frame,
                (featureId, reason) => _bridge.SendError(
                    BridgeErrorCodes.MeshBuildFailed, "feature " + featureId + ": " + reason, BridgeMessageTypes.SceneAddFeatures));
        }

        private void HandleSetDepth(SceneSetDepthPayload payload)
        {
            if (payload.depth > _eraCount - 1)
            {
                _bridge.SendError(
                    BridgeErrorCodes.InvalidMessage,
                    "depth " + payload.depth + " is past the last era (index " + (_eraCount - 1) + ")",
                    BridgeMessageTypes.SceneSetDepth);
                return;
            }

            ApplyDepth(payload.depth);

            // The camera does not move on a depth change. While a transition runs (a fraction) nothing
            // is reported; when the depth lands on an era the Shell and the tests get one report that
            // matches what is now on screen.
            if (DepthBlend.IsSettled(payload.depth)) RequestCameraReport();
        }

        /// <summary>
        /// Draws the whole scene at a depth (requirement 10): the present buildings drain, and each era
        /// is drawn at its weight. The Shell tweens; this applies each depth it is sent as it arrives.
        /// </summary>
        private void ApplyDepth(double depth)
        {
            _depth = depth;
            _shownIndex = (int)Math.Floor(depth + 0.5);
            if (_present != null) _present.SetStage(DepthBlend.Present(depth, _reducedMotion));
            foreach (EraLayer layer in _layers.Values) layer.SetWeight(DepthBlend.EraWeight(depth, layer.Index), _reducedMotion);
        }

        private void HandleMarkers(DebugMarkersPayload payload)
        {
            if (!_debug)
            {
                _bridge.SendError(
                    BridgeErrorCodes.DebugDisabled, "debug/markers needs debug: true in scene/init", BridgeMessageTypes.DebugMarkers);
                return;
            }
            _markers.Show(payload.markers, _frame);
        }

        private void HandleSetCamera(DebugSetCameraPayload payload)
        {
            if (!_debug)
            {
                _bridge.SendError(
                    BridgeErrorCodes.DebugDisabled, "debug/setCamera needs debug: true in scene/init", BridgeMessageTypes.DebugSetCamera);
                return;
            }
            Vec2d target = _frame.ToLocal(payload.target[0], payload.target[1]);
            _rig.SetPose((float)target.X, (float)target.Y, (float)payload.distanceM, (float)payload.pitchDeg, (float)payload.headingDeg);
            RequestCameraReport();
        }

        // ---- Frame loop ----

        private void Update()
        {
            if (!_initialised) return;

            foreach (EraLayer layer in _layers.Values)
            {
                if (layer.IsRising) layer.Tick(Time.unscaledTime);
            }

            if (Input.GetMouseButtonDown(0)) _pointerDown = Input.mousePosition;
            if (Input.GetMouseButtonUp(0))
            {
                Vector2 up = Input.mousePosition;
                if ((up - _pointerDown).magnitude <= Picker.ClickSlopPx)
                {
                    EraLayer shown = ShownLayer();
                    string featureId;
                    if (shown != null && _picker.TryPick(_camera, up, shown, out featureId))
                    {
                        _bridge.Send(BridgeMessageTypes.FeatureClicked, new FeatureClickedPayload
                        {
                            featureId = featureId,
                            eraId = shown.EraId,
                        });
                    }
                }
            }
        }

        private void LateUpdate()
        {
            if (!_initialised) return;
            if (_rig.ConsumeMoved()) _cameraDirty = true;
            if (_cameraDirty && Time.unscaledTime - _lastCameraSent >= CameraReportIntervalS)
            {
                SendCamera();
                _cameraDirty = false;
            }
        }

        private EraLayer ShownLayer()
        {
            foreach (EraLayer layer in _layers.Values)
            {
                if (layer.Index == _shownIndex) return layer;
            }
            return null;
        }

        private void RequestCameraReport()
        {
            _cameraDirty = true;
            _lastCameraSent = float.NegativeInfinity;
        }

        private void SendCamera()
        {
            _lastCameraSent = Time.unscaledTime;
            Matrix4x4 vp = _camera.projectionMatrix * _camera.worldToCameraMatrix;
            var columnMajor = new double[16];
            for (int column = 0; column < 4; column++)
            {
                for (int row = 0; row < 4; row++) columnMajor[column * 4 + row] = vp[row, column];
            }

            GeoPosition eye = _frame.ToData(_camera.transform.position);
            GeoPosition target = _frame.ToData(_rig.Target);
            _bridge.Send(BridgeMessageTypes.CameraChanged, new CameraChangedPayload
            {
                eye = new CameraPoint { easting = eye.Easting, northing = eye.Northing, heightM = eye.HeightM },
                target = new CameraPoint { easting = target.Easting, northing = target.Northing, heightM = target.HeightM },
                fovDeg = _camera.fieldOfView,
                viewProjection = columnMajor,
                canvas = new CanvasSize { widthPx = _camera.pixelWidth, heightPx = _camera.pixelHeight },
            });
        }
    }
}
