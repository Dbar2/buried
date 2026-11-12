using System;
using System.Collections;
using System.Collections.Generic;
using Buried.Geo;
using Buried.Interop;
using Buried.Look;
using Buried.Meshing;
using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// Handles the Shell's messages and builds the scene from them. It draws what it is told: it never
    /// computes dates, confidence or lot relations, and it never filters the features of an era.
    /// Gate version (bridge 0.1.0): scene/init, scene/loadEra, scene/setDepth and debug/markers.
    /// Integer depths are a hard switch; the transitions come in task group 3.
    /// </summary>
    public sealed class SceneController : MonoBehaviour
    {
        private const float CameraReportIntervalS = 0.1f;

        private Bridge _bridge;
        private BuriedPalette _palette;
        private Shader _ghostShader;
        private Shader _drapeShader;
        private Shader _markerShader;
        private CameraRig _rig;
        private Camera _camera;

        private readonly TextureCache _textures = new TextureCache();
        private readonly Picker _picker = new Picker();
        private readonly Dictionary<string, int> _eraIndexById = new Dictionary<string, int>();
        private readonly Dictionary<string, EraLayer> _layers = new Dictionary<string, EraLayer>();
        private readonly Dictionary<string, int> _loadGeneration = new Dictionary<string, int>();

        private bool _initialised;
        private bool _debug;
        private int _sceneEpoch;
        private int _eraCount;
        private int _shownIndex;
        private ProjectFrame _frame;

        private GameObject _ground;
        private Mesh _groundMesh;
        private Material _groundMaterial;
        private Material _ghostMaterial;
        private DebugMarkers _markers;

        private bool _cameraDirty;
        private float _lastCameraSent = float.NegativeInfinity;
        private Vector2 _pointerDown;

        public void Configure(
            Bridge bridge, BuriedPalette palette, Shader ghost, Shader drape, Shader marker, CameraRig rig)
        {
            _bridge = bridge;
            _palette = palette;
            _ghostShader = ghost;
            _drapeShader = drape;
            _markerShader = marker;
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
                    case BridgeMessageTypes.SceneSetDepth:
                        HandleSetDepth((SceneSetDepthPayload)message.payload);
                        break;
                    case BridgeMessageTypes.DebugMarkers:
                        HandleMarkers((DebugMarkersPayload)message.payload);
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
            _eraCount = init.eras.Count;
            foreach (EraRef era in init.eras) _eraIndexById[era.id] = era.index;
            if (init.present.Count > 0)
            {
                Debug.Log("[scene] " + init.present.Count + " present buildings received; they are drawn from task group 3 on.");
            }

            BuildEnvironment(init);
            _initialised = true;
            _shownIndex = 0;
            RequestCameraReport();
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
            if (_ground != null) Destroy(_ground);
            if (_groundMesh != null) Destroy(_groundMesh);
            if (_groundMaterial != null) Destroy(_groundMaterial);
            if (_ghostMaterial != null) Destroy(_ghostMaterial);
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
            float fogRadius = (float)radius + LookSettings.FogRadiusMarginM;

            Color fog = _palette.fog;
            // A vector, not a colour: Unity does not convert vectors, so the fog colour is exactly the
            // linear value of the palette colour that the ground material gets through its Color property.
            Color fogLinear = fog.linear;
            Shader.SetGlobalVector("_BuriedFogColor", new Vector4(fogLinear.r, fogLinear.g, fogLinear.b, 1f));
            Shader.SetGlobalFloat("_BuriedFogDensity", LookSettings.FogDensity(fogRadius));

            // Ground: one big quad in the fog colour, so the edge of the coverage area dissolves.
            float extent = LookSettings.GroundExtentRadii * fogRadius;
            var ground = new MeshData();
            float cx = (float)centre.X;
            float cz = (float)centre.Y;
            int a = ground.AddVertex(new Vector3(cx - extent, 0f, cz - extent), Vector3.up, Vector2.zero);
            int bq = ground.AddVertex(new Vector3(cx - extent, 0f, cz + extent), Vector3.up, Vector2.zero);
            int c = ground.AddVertex(new Vector3(cx + extent, 0f, cz + extent), Vector3.up, Vector2.zero);
            int d = ground.AddVertex(new Vector3(cx + extent, 0f, cz - extent), Vector3.up, Vector2.zero);
            ground.AddTriangle(a, bq, c);
            ground.AddTriangle(a, c, d);
            _groundMesh = ground.ToMesh("Ground");

            _groundMaterial = new Material(_ghostShader) { name = "Ground" };
            _groundMaterial.SetColor("_Color", fog);
            _groundMaterial.SetFloat("_Shade", 0f);
            _groundMaterial.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.One);
            _groundMaterial.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.Zero);
            _groundMaterial.SetFloat("_ZWrite", 0f);
            _groundMaterial.SetFloat("_Cull", (float)UnityEngine.Rendering.CullMode.Off);
            _groundMaterial.renderQueue = 1000;

            _ground = new GameObject("Ground");
            _ground.transform.SetParent(transform, false);
            _ground.AddComponent<MeshFilter>().sharedMesh = _groundMesh;
            MeshRenderer groundRenderer = _ground.AddComponent<MeshRenderer>();
            groundRenderer.sharedMaterial = _groundMaterial;
            groundRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            groundRenderer.receiveShadows = false;

            // The plain ghost material of the gate: ink, translucent.
            Color ink = _palette.ink;
            ink.a = LookSettings.GhostFillAlpha;
            _ghostMaterial = new Material(_ghostShader) { name = "Ghost" };
            _ghostMaterial.SetColor("_Color", ink);
            _ghostMaterial.SetFloat("_Shade", 0.45f);
            _ghostMaterial.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            _ghostMaterial.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            _ghostMaterial.SetFloat("_ZWrite", 0f);
            _ghostMaterial.SetFloat("_Cull", (float)UnityEngine.Rendering.CullMode.Back);
            _ghostMaterial.renderQueue = 3000;

            _markers = new DebugMarkers(transform, _markerShader);
            _rig.SetDefaultPose((float)min.X, (float)min.Y, (float)max.X, (float)max.Y);
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
            layer.SetVisible(false);
            layer.AddFeatures(
                payload.features,
                _frame,
                _ghostMaterial,
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
                    layer.AddDrape(DrapeLayer.Create(layer.Parent, _frame, drape, texture, _drapeShader, order));
                }
                order++;
            }

            EraLayer previous;
            if (_layers.TryGetValue(payload.eraId, out previous)) previous.Dispose();
            _layers[payload.eraId] = layer;
            layer.SetVisible(layer.Index == _shownIndex);

            _bridge.Send(BridgeMessageTypes.EraLoaded, new EraLoadedPayload
            {
                eraId = payload.eraId,
                featureCount = layer.FeatureCount,
                drapeCount = layer.DrapeCount,
                failedDrapes = failed,
            });
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

            // Gate: a hard switch to the nearest era. Transitions come in task group 3.
            _shownIndex = Mathf.RoundToInt((float)payload.depth);
            foreach (EraLayer layer in _layers.Values) layer.SetVisible(layer.Index == _shownIndex);

            // The camera does not move on a depth change. The Shell and the gate test still want a
            // report that matches what is now on screen, so one is sent after every depth change.
            RequestCameraReport();
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

        // ---- Frame loop ----

        private void Update()
        {
            if (!_initialised) return;

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
