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
    /// Bridge 0.7.0: scene/init, scene/loadEra, scene/addFeatures, scene/setDepth, scene/focusLot, scene/clearLot,
    /// scene/setDrapeMode, scene/setLantern, scene/showEvidence, debug/markers and debug/setCamera.
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
        private GhostMaterials _ghostMaterials;
        private PresentLayer _present;
        private DebugMarkers _markers;

        private bool _cameraDirty;
        private float _lastCameraSent = float.NegativeInfinity;
        private Vector2 _pointerDown;

        // The lit map sheet: the drape display (lit unless asked for the original scan) and the one light pool.
        private bool _allLit = true;
        private readonly Dictionary<string, bool> _litBySource = new Dictionary<string, bool>();
        private float _poolX, _poolZ, _poolRadius;
        private Vector2 _defaultPoolCentre;
        private bool _poolTweening;
        private Vector3 _poolFrom, _poolTo;
        private float _poolStart, _poolDuration;
        private LotPin _pin;

        // The Lantern (session 028): the lens state, its rim, and whether the lens uniform is currently set.
        private readonly LanternController _lantern = new LanternController();
        private LanternRim _rim;
        private bool _lensPushed;

        // Show Evidence: the era whose ghost is drawn nearly transparent and the untouched scan patch beneath it.
        private EraLayer _evidenceEra;
        private DrapeLayer _evidencePatch;
        private int _evidenceGeneration;
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
                    case BridgeMessageTypes.SceneSetDrapeMode:
                        HandleSetDrapeMode((SceneSetDrapeModePayload)message.payload);
                        break;
                    case BridgeMessageTypes.SceneSetLantern:
                        HandleSetLantern((SceneSetLanternPayload)message.payload);
                        break;
                    case BridgeMessageTypes.SceneShowEvidence:
                        HandleShowEvidence((SceneShowEvidencePayload)message.payload);
                        break;
                    case BridgeMessageTypes.SceneFocusLot:
                        HandleFocusLot((SceneFocusLotPayload)message.payload);
                        break;
                    case BridgeMessageTypes.SceneClearLot:
                        HandleClearLot();
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
            if (_ghostMaterials != null)
            {
                _ghostMaterials.Dispose();
                _ghostMaterials = null;
            }
            _ground = null;
            DisposePin();
            ClearEvidence();
            _lantern.Reset();
            if (_rim != null)
            {
                _rim.Dispose();
                _rim = null;
            }
            PushLens();
            _poolTweening = false;
            _allLit = true;
            _litBySource.Clear();
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

            // The three confidence classes: documented, estimated (dashed, lighter) and unknown (soft).
            _ghostMaterials = new GhostMaterials(_palette, _shaders, PixelScale());

            _markers = new DebugMarkers(transform, _shaders.marker);
            _rim = new LanternRim(transform, _palette, _shaders.edge, PixelScale());

            // The camera may roam over the project bounds and starts framing the initial view.
            _rig.SetLimits((float)min.X, (float)min.Y, (float)max.X, (float)max.Y);
            Vec2d viewMin = _frame.ToLocal(init.initialView.minE, init.initialView.minN);
            Vec2d viewMax = _frame.ToLocal(init.initialView.maxE, init.initialView.maxN);
            _rig.SetDefaultPose((float)viewMin.X, (float)viewMin.Y, (float)viewMax.X, (float)viewMax.Y);

            // The lit map sheet's light pool starts at the middle of the default view.
            _defaultPoolCentre = new Vector2((float)(viewMin.X + viewMax.X) * 0.5f, (float)(viewMin.Y + viewMax.Y) * 0.5f);
            SetLightPool(_defaultPoolCentre.x, _defaultPoolCentre.y, LookSettings.LightPoolRadiusM);
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
                _ghostMaterials,
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
                    DrapeLayer created = DrapeLayer.Create(layer.Parent, _frame, drape, texture, _shaders.drape, order, _palette);
                    created.SetLit(IsLit(drape.sourceId));
                    layer.AddDrape(created);
                }
                order++;
            }

            EraLayer previous;
            if (_layers.TryGetValue(payload.eraId, out previous))
            {
                if (previous == _evidenceEra) ClearEvidence();
                previous.Dispose();
            }
            _layers[payload.eraId] = layer;
            layer.SetLensMode(LensModeFor(layer));
            layer.SetWeight(WeightFor(layer), _reducedMotion);

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
            if (depth > 0.0 && _lantern.Active)
            {
                _lantern.Reset(); // the Lantern works from Today only
                PushLens();
            }
            if (_present != null) _present.SetStage(DepthBlend.Present(depth, _reducedMotion));
            foreach (EraLayer layer in _layers.Values) layer.SetWeight(WeightFor(layer), _reducedMotion);
            RefreshLensModes();
            if (_evidencePatch != null && _evidenceEra != null) _evidencePatch.SetOpacity(_evidenceEra.Weight);
        }

        // ---- The Lantern (session 028) ----

        /// <summary>The weight an era is drawn at: its depth weight, except the Lantern's era, which is whole while the lens is on.</summary>
        private float WeightFor(EraLayer layer)
        {
            if (_lantern.Active && layer.EraId == _lantern.EraId) return 1f;
            return DepthBlend.EraWeight(_depth, layer.Index);
        }

        /// <summary>How an era meets the lens: the Lantern's era only inside it, Today only outside it, the others as they are.</summary>
        private int LensModeFor(EraLayer layer)
        {
            if (!_lantern.Active) return 0;
            if (layer.EraId == _lantern.EraId) return 1;
            return layer.Index == 0 ? 2 : 0;
        }

        private void RefreshLensModes()
        {
            foreach (EraLayer layer in _layers.Values) layer.SetLensMode(LensModeFor(layer));
            if (_present != null) _present.SetLensMode(_lantern.Active ? 2 : 0);
            if (_evidencePatch != null && _evidenceEra != null) _evidencePatch.SetLensMode(LensModeFor(_evidenceEra));
        }

        private void HandleSetLantern(SceneSetLanternPayload payload)
        {
            if (!_eraIndexById.ContainsKey(payload.eraId))
            {
                _bridge.SendError(
                    BridgeErrorCodes.EraNotInitialised,
                    "era \"" + payload.eraId + "\" was not listed in scene/init",
                    BridgeMessageTypes.SceneSetLantern);
                return;
            }
            if (payload.on && _depth > 0.0)
            {
                Debug.LogWarning("[player] scene/setLantern ignored: the Lantern works from Today");
                return;
            }

            _lantern.Set(payload, _reducedMotion);
            ApplyLantern();
        }

        /// <summary>Gives every layer its lens mode and weight for the current Lantern state.</summary>
        private void ApplyLantern()
        {
            foreach (EraLayer layer in _layers.Values) layer.SetWeight(WeightFor(layer), _reducedMotion);
            RefreshLensModes();
            PushLens();
        }

        /// <summary>
        /// Sets the lens uniform for this frame and draws the rim. While the Lantern is off the uniform is cleared once,
        /// so no material clips anything.
        /// </summary>
        private void PushLens()
        {
            if (!_lantern.Active || _camera == null)
            {
                if (_lensPushed)
                {
                    Shader.SetGlobalVector("_BuriedLens", Vector4.zero);
                    _lensPushed = false;
                }
                if (_rim != null) _rim.Hide();
                return;
            }

            int w = _camera.pixelWidth;
            int h = _camera.pixelHeight;
            float radius = LanternMask.RadiusPx(_lantern.Radius, h) * _lantern.Open;
            Vector2 fragment = LanternMask.FragmentCentre(_lantern.Centre, w, h, SystemInfo.graphicsUVStartsAtTop);
            Shader.SetGlobalVector("_BuriedLens", new Vector4(fragment.x, fragment.y, radius, 1f));
            _lensPushed = true;
            if (_rim != null) _rim.Show(_camera, LanternMask.ScreenCentre(_lantern.Centre, w, h), radius);
        }

        /// <summary>The layer a pick at a screen point reads: the Lantern's era inside the lens, the era shown outside it.</summary>
        private EraLayer LayerToPick(Vector2 screenPoint)
        {
            if (_lantern.Active && _lantern.Open > 0f
                && LanternMask.Contains(screenPoint, _lantern.Centre, _lantern.Radius * _lantern.Open, _camera.pixelWidth, _camera.pixelHeight))
            {
                EraLayer inside;
                if (_layers.TryGetValue(_lantern.EraId, out inside)) return inside;
            }
            return ShownLayer();
        }

        // ---- Show Evidence (session 028) ----

        private EraLayer FindEraWithFeature(string featureId)
        {
            EraLayer shown = ShownLayer();
            if (shown != null && shown.HasFeature(featureId)) return shown;
            foreach (EraLayer layer in _layers.Values)
            {
                if (layer.HasFeature(featureId)) return layer;
            }
            return null;
        }

        private void ClearEvidence()
        {
            _evidenceGeneration++;
            if (_evidencePatch != null)
            {
                _evidencePatch.Dispose();
                _evidencePatch = null;
            }
            if (_evidenceEra != null)
            {
                _evidenceEra.ClearEvidence();
                _evidenceEra = null;
            }
        }

        private void HandleShowEvidence(SceneShowEvidencePayload payload)
        {
            ClearEvidence();
            if (!payload.on) return;

            EraLayer era = FindEraWithFeature(payload.featureId);
            if (era == null)
            {
                _bridge.SendError(
                    BridgeErrorCodes.InvalidMessage,
                    "feature " + payload.featureId + " is not drawn in any loaded era",
                    BridgeMessageTypes.SceneShowEvidence);
                return;
            }
            if (!era.SetEvidence(payload.featureId, _frame))
            {
                _bridge.SendError(
                    BridgeErrorCodes.MeshBuildFailed,
                    "feature " + payload.featureId + " has no volume to make transparent",
                    BridgeMessageTypes.SceneShowEvidence);
                return;
            }
            _evidenceEra = era;
            StartCoroutine(LoadEvidencePatch(payload, era, _evidenceGeneration));
        }

        /// <summary>
        /// The untouched scan beneath the ghost: the source's tile, drawn with no tone curve and no light, inside the
        /// footprint's box grown by <see cref="LookSettings.EvidenceMarginM"/> and nowhere else. The rest of the lit sheet is as it was.
        /// </summary>
        private IEnumerator LoadEvidencePatch(SceneShowEvidencePayload payload, EraLayer era, int generation)
        {
            int epoch = _sceneEpoch;
            Texture2D texture = null;
            string error = null;
            yield return _textures.Load(payload.drape.url, (t, e) =>
            {
                texture = t;
                error = e;
            });
            if (epoch != _sceneEpoch || generation != _evidenceGeneration) yield break;

            if (texture == null)
            {
                _bridge.SendError(
                    BridgeErrorCodes.TextureLoadFailed,
                    "the image for " + payload.drape.sourceId + " could not be loaded (" + error + ")",
                    BridgeMessageTypes.SceneShowEvidence);
                yield break;
            }

            double minE, minN, maxE, maxN;
            if (!era.TryGetFeatureBox(payload.featureId, out minE, out minN, out maxE, out maxN)) yield break;
            double m = LookSettings.EvidenceMarginM;
            var ring = new List<double[]>
            {
                new[] { minE - m, minN - m }, new[] { maxE + m, minN - m }, new[] { maxE + m, maxN + m },
                new[] { minE - m, maxN + m }, new[] { minE - m, minN - m },
            };
            DrapeDto given = payload.drape;
            var patch = new DrapeDto
            {
                sourceId = given.sourceId,
                url = given.url,
                corners = given.corners,
                widthPx = given.widthPx,
                heightPx = given.heightPx,
                kind = given.kind,
                clip = new GeometryDto
                {
                    type = GeometryDto.Polygon,
                    polygons = new List<List<List<double[]>>> { new List<List<double[]>> { ring } },
                },
            };
            _evidencePatch = DrapeLayer.Create(era.Parent, _frame, patch, texture, _shaders.drape, DrapeLayer.EvidenceOrder, _palette);
            _evidencePatch.SetPatch();
            _evidencePatch.SetLensMode(LensModeFor(era));
            _evidencePatch.SetOpacity(era.Weight);
        }

        /// <summary>
        /// scene/setDrapeMode: the lit display (the default) or the untouched scan, for one drape or all of
        /// them. It is remembered, so a drape that loads later is shown the way it was last asked for.
        /// </summary>
        private void HandleSetDrapeMode(SceneSetDrapeModePayload payload)
        {
            bool lit = payload.mode == SceneSetDrapeModePayload.Lit;
            if (payload.sourceId == null)
            {
                _allLit = lit;
                _litBySource.Clear();
            }
            else
            {
                _litBySource[payload.sourceId] = lit;
            }

            foreach (EraLayer layer in _layers.Values)
            {
                foreach (DrapeLayer drape in layer.Drapes) drape.SetLit(IsLit(drape.SourceId));
            }
        }

        private bool IsLit(string sourceId)
        {
            bool lit;
            return _litBySource.TryGetValue(sourceId, out lit) ? lit : _allLit;
        }

        /// <summary>Puts the lit map sheet's one light pool at a ground point (Unity world x and z).</summary>
        private void SetLightPool(float x, float z, float radiusM)
        {
            _poolX = x;
            _poolZ = z;
            _poolRadius = radiusM;
            Shader.SetGlobalVector("_BuriedLightPool", new Vector4(x, z, radiusM, 0f));
        }

        /// <summary>Moves the light pool to a new place over <paramref name="durationS"/> seconds, on the camera flight's ease. 0 is a cut.</summary>
        private void MoveLightPool(float x, float z, float radiusM, float durationS)
        {
            if (durationS <= 0f)
            {
                _poolTweening = false;
                SetLightPool(x, z, radiusM);
                return;
            }
            _poolFrom = new Vector3(_poolX, _poolZ, _poolRadius);
            _poolTo = new Vector3(x, z, radiusM);
            _poolStart = Time.unscaledTime;
            _poolDuration = durationS;
            _poolTweening = true;
        }

        private void TickLightPool()
        {
            if (!_poolTweening) return;
            float t = Mathf.Clamp01((Time.unscaledTime - _poolStart) / _poolDuration);
            Vector3 p = Vector3.Lerp(_poolFrom, _poolTo, CameraRigMath.Ease(t));
            SetLightPool(p.x, p.y, p.z);
            if (t >= 1f) _poolTweening = false;
        }

        /// <summary>
        /// scene/focusLot: draws the lot's outline and its lamp, moves the light pool to it and flies the camera
        /// to frame it (eased, 900 ms; a cut under reduced motion). A second lot replaces the first.
        /// </summary>
        private void HandleFocusLot(SceneFocusLotPayload payload)
        {
            LotPin pin;
            try
            {
                pin = new LotPin(transform, payload.lot, _frame, _palette, _shaders, PixelScale());
            }
            catch (InvalidOperationException e)
            {
                _bridge.SendError(BridgeErrorCodes.MeshBuildFailed, "lot: " + e.Message, BridgeMessageTypes.SceneFocusLot);
                return;
            }

            DisposePin();
            _pin = pin;
            Rect b = pin.Bounds;
            float aspect = _camera.aspect > 0f ? _camera.aspect : 1f;
            CameraRigMath.Pose target = CameraRigMath.FramePose(
                b.xMin, b.yMin, b.xMax, b.yMax, LookSettings.LotPaddingM, LookSettings.LotPitchDeg, LookSettings.DefaultHeadingDeg,
                LookSettings.CameraFovDeg, aspect);
            float duration = _reducedMotion ? 0f : LookSettings.LotFlightS;
            _rig.FlyTo(target, duration);
            MoveLightPool(pin.Centre.x, pin.Centre.y, LookSettings.LightPoolRadiusPinnedM, duration);
            RequestCameraReport();
        }

        /// <summary>scene/clearLot: removes the outline and the lamp and restores the default view and the default light.</summary>
        private void HandleClearLot()
        {
            if (_pin == null) return;
            DisposePin();
            float duration = _reducedMotion ? 0f : LookSettings.LotFlightS;
            _rig.FlyTo(_rig.DefaultPose, duration);
            MoveLightPool(_defaultPoolCentre.x, _defaultPoolCentre.y, LookSettings.LightPoolRadiusM, duration);
            RequestCameraReport();
        }

        private void DisposePin()
        {
            if (_pin == null) return;
            _pin.Dispose();
            _pin = null;
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

            TickLightPool();
            if (_lantern.Active)
            {
                _lantern.Tick(Time.unscaledDeltaTime, _reducedMotion);
                if (!_lantern.Active) ApplyLantern(); // the lens has closed: every layer goes back to its depth weight and no mode
                else PushLens();
            }
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
                    EraLayer shown = LayerToPick(up);
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
