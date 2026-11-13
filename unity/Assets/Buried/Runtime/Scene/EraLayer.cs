using System;
using System.Collections.Generic;
using Buried.Geo;
using Buried.Interop;
using Buried.Meshing;
using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// What one era draws: the extruded ghosts it was sent, their outlines and its drapes. It draws
    /// exactly the features it received; it never filters or adds any by a rule of its own.
    /// The features are drawn by confidence class (<see cref="GhostMaterials"/>): each class has its own
    /// meshes and its own copy of the class's materials, so a class costs one renderer per chunk.
    /// </summary>
    public sealed class EraLayer
    {
        public string EraId { get; private set; }
        public int Index { get; private set; }

        /// <summary>Features that were drawn (buildings that built without error).</summary>
        public int FeatureCount { get; private set; }

        public int DrapeCount
        {
            get { return _drapes.Count; }
        }

        private readonly GameObject _root;
        private readonly List<Mesh> _meshes = new List<Mesh>();
        private readonly List<DrapeLayer> _drapes = new List<DrapeLayer>();
        private readonly HashSet<string> _ids = new HashSet<string>();
        private readonly List<AddedBatch> _batches = new List<AddedBatch>();
        private readonly List<ClassGroup> _groups = new List<ClassGroup>();
        private readonly Dictionary<string, SceneFeatureDto> _features = new Dictionary<string, SceneFeatureDto>();
        private readonly Dictionary<MeshChunk, MeshFilter> _chunkFilters = new Dictionary<MeshChunk, MeshFilter>();
        private GhostMaterials _materials;
        private bool _reducedMotion;
        private int _lensMode;

        // Show Evidence: one feature's volume drawn separately at a low alpha while its chunk is drawn without it.
        private string _evidenceId;
        private Material _evidenceFill;
        private Mesh _evidenceMesh;
        private GameObject _evidenceObject;
        private MeshFilter _evidenceChunkFilter;
        private Mesh _evidenceChunkOriginal;
        private Mesh _evidenceChunkReplacement;
        private ClassGroup _evidenceGroup;

        /// <summary>
        /// The features of one confidence class in one scene/loadEra or scene/addFeatures call: their
        /// meshes, chunked, and this group's own copies of the class's materials.
        /// </summary>
        private sealed class ClassGroup
        {
            public readonly string Class;
            /// <summary>True for land-use areas: hatched sheets, not volumes.</summary>
            public readonly bool Area;
            public readonly List<MeshChunk> Chunks = new List<MeshChunk>();
            public readonly List<MeshData> EdgeChunks = new List<MeshData>();
            public readonly Material Fill;
            public readonly Material Edge;
            private MeshChunk _chunk;
            private MeshData _edgeChunk;

            public ClassGroup(string cls, GhostMaterials materials, string name, bool area)
            {
                Class = cls;
                Area = area;
                Material fill = area ? materials.AreaFillOf(cls) : materials.FillOf(cls);
                Fill = new Material(fill) { name = fill.name + " " + name };
                Material edge = area ? materials.AreaEdgeOf(cls) : materials.EdgeOf(cls);
                if (edge != null) Edge = new Material(edge) { name = edge.name + " " + name };
            }

            public void Add(string featureId, FootprintBuilder.Result built)
            {
                if (_chunk == null || !_chunk.CanTake(built.Fill))
                {
                    _chunk = new MeshChunk();
                    Chunks.Add(_chunk);
                }
                _chunk.Add(featureId, built.Fill);

                if (Edge == null || built.Edges.VertexCount == 0) return;
                if (_edgeChunk == null || _edgeChunk.VertexCount + built.Edges.VertexCount > MeshChunk.MaxVertices)
                {
                    _edgeChunk = new MeshData();
                    EdgeChunks.Add(_edgeChunk);
                }
                _edgeChunk.Append(built.Edges);
            }

            public void Apply(float alpha, float rise)
            {
                Fill.SetFloat("_Weight", alpha);
                Fill.SetFloat("_Rise", rise);
                if (Edge == null) return;
                Edge.SetFloat("_Alpha", alpha);
                Edge.SetFloat("_Rise", rise);
            }

            public void Dispose()
            {
                SceneObjects.Destroy(Fill);
                SceneObjects.Destroy(Edge);
            }
        }

        /// <summary>
        /// One scene/addFeatures call: its own meshes and material copies, so that it can rise on its
        /// own clock while the era sits at any weight (requirement 22.2).
        /// </summary>
        private sealed class AddedBatch
        {
            public readonly List<ClassGroup> Groups = new List<ClassGroup>();
            public float Start = float.NaN;
            public float Progress;
        }

        /// <summary>The weight last set (0 to 1); 1 at rest on this era.</summary>
        public float Weight { get; private set; }

        public EraLayer(string eraId, int index, Transform parent)
        {
            EraId = eraId;
            Index = index;
            _root = new GameObject("Era " + eraId);
            _root.transform.SetParent(parent, false);
        }

        public Transform Parent
        {
            get { return _root.transform; }
        }

        /// <summary>
        /// Builds a volume and, for every class but unknown, an outline for each building feature. A
        /// feature that cannot be built is reported through <paramref name="onFailure"/> and skipped; the
        /// others are still drawn. Water is not drawn yet. The layer draws with its own copies of the
        /// class materials.
        /// </summary>
        public void AddFeatures(
            IEnumerable<SceneFeatureDto> features,
            ProjectFrame frame,
            GhostMaterials materials,
            Action<string, string> onFailure)
        {
            _materials = materials;
            var groups = new Dictionary<string, ClassGroup>();
            FeatureCount += Build(features, frame, groups, EraId, onFailure, false);
            foreach (string key in GroupKeys)
            {
                ClassGroup group;
                if (!groups.TryGetValue(key, out group)) continue;
                _groups.Add(group);
                AddRenderers(group, "");
            }
        }

        /// <summary>The key of a group: the confidence class, with a prefix for land-use areas (which draw with other materials).</summary>
        private static string KeyOf(string cls, bool area)
        {
            return area ? AreaKeyPrefix + cls : cls;
        }

        private const string AreaKeyPrefix = "area ";

        /// <summary>Every group key in draw order: the buildings' classes, then the areas'.</summary>
        private static IEnumerable<string> GroupKeys
        {
            get
            {
                foreach (string cls in GhostMaterials.Classes) yield return KeyOf(cls, false);
                foreach (string cls in GhostMaterials.Classes) yield return KeyOf(cls, true);
            }
        }

        /// <summary>
        /// The height a feature is built to. A land-use area is a flat sheet whatever height it was sent
        /// (<see cref="Buried.Look.LookSettings.AreaHeightM"/>): nothing of it rises.
        /// </summary>
        private static float HeightOf(SceneFeatureDto feature)
        {
            return feature.kind == SceneFeatureDto.KindLandUse ? Buried.Look.LookSettings.AreaHeightM : (float)feature.heightM;
        }

        /// <summary>Builds the features into per-class groups. Returns how many were drawn.</summary>
        private int Build(
            IEnumerable<SceneFeatureDto> features,
            ProjectFrame frame,
            Dictionary<string, ClassGroup> groups,
            string groupName,
            Action<string, string> onFailure,
            bool skipKnownIds)
        {
            int added = 0;
            foreach (SceneFeatureDto feature in features)
            {
                bool area = feature.kind == SceneFeatureDto.KindLandUse;
                if (feature.kind != SceneFeatureDto.KindBuilding && !area) continue;
                if (skipKnownIds && _ids.Contains(feature.id))
                {
                    onFailure(feature.id, "the era already draws this feature");
                    continue;
                }

                string cls = GhostMaterials.ClassOf(feature.confidence);
                var options = FootprintBuilder.Options.Default;
                options.Outline = GhostMaterials.HasOutline(cls);
                options.Storeys = area ? 0 : feature.storeys; // 0 when none is recorded: no storey lines, and no count is invented

                FootprintBuilder.Result built;
                try
                {
                    built = FootprintBuilder.Build(feature.geometry, HeightOf(feature), frame, options);
                }
                catch (InvalidOperationException e)
                {
                    onFailure(feature.id, e.Message);
                    continue;
                }
                if (built == null)
                {
                    onFailure(feature.id, "the footprint has no area after cleaning");
                    continue;
                }

                ClassGroup group;
                string key = KeyOf(cls, area);
                if (!groups.TryGetValue(key, out group))
                {
                    group = new ClassGroup(cls, _materials, groupName, area);
                    groups[key] = group;
                }
                // The centre of the footprint, on every vertex of the feature (second UV): the raise staggers by it.
                Vector2 centre = built.Fill.BoxCentreXZ();
                built.Fill.SetUv2ForAll(centre);
                built.Edges.SetUv2ForAll(centre);
                _centres[feature.id] = centre;
                group.Add(feature.id, built);
                _ids.Add(feature.id);
                _features[feature.id] = feature;
                added++;
            }
            return added;
        }

        private void AddRenderers(ClassGroup group, string prefix)
        {
            SetLensMode(group);
            string fillName = group.Area ? "Areas " : "Ghosts ";
            string edgeName = group.Area ? "Area edges " : "Edges ";
            int n = 0;
            foreach (MeshChunk c in group.Chunks)
            {
                MeshFilter filter = AddRenderer(prefix + fillName + group.Class + " " + n, c.BuildMesh(fillName + EraId + " " + group.Class + " " + n), group.Fill);
                _chunkFilters[c] = filter;
                n++;
            }
            n = 0;
            foreach (MeshData e in group.EdgeChunks)
            {
                AddRenderer(prefix + edgeName + group.Class + " " + n, e.ToMesh(edgeName + EraId + " " + group.Class + " " + n), group.Edge);
                n++;
            }
        }

        /// <summary>
        /// Adds features to a loaded era (scene/addFeatures). They rise from the ground over 900 ms
        /// once the era is visible, or only fade under reduced motion. A feature whose id the era
        /// already draws is reported and skipped: the Shell sends only new features. Returns the number
        /// of features drawn.
        /// </summary>
        public int AddRising(
            IEnumerable<SceneFeatureDto> features,
            ProjectFrame frame,
            Action<string, string> onFailure)
        {
            var batch = new AddedBatch();
            var groups = new Dictionary<string, ClassGroup>();
            int added = Build(features, frame, groups, EraId + " added", onFailure, true);
            if (added == 0)
            {
                foreach (ClassGroup unused in groups.Values) unused.Dispose();
                return 0;
            }

            foreach (string key in GroupKeys)
            {
                ClassGroup group;
                if (!groups.TryGetValue(key, out group)) continue;
                batch.Groups.Add(group);
                AddRenderers(group, "Added ");
            }
            _batches.Add(batch);
            FeatureCount += added;
            if (Held) ApplyRaise(true, Vector2.zero, -1f, 0f);
            ApplyBatch(batch);
            return added;
        }

        /// <summary>True while a batch added by scene/addFeatures is still rising.</summary>
        public bool IsRising
        {
            get
            {
                foreach (AddedBatch b in _batches)
                {
                    if (b.Progress < 1f) return true;
                }
                return false;
            }
        }

        /// <summary>Advances the rise of added batches. A batch starts when the era first has weight.</summary>
        public void Tick(float now)
        {
            foreach (AddedBatch batch in _batches)
            {
                if (batch.Progress >= 1f) continue;
                if (float.IsNaN(batch.Start))
                {
                    if (Weight <= DepthBlend.VisibleWeight) continue;
                    batch.Start = now;
                }
                batch.Progress = DepthBlend.AddedProgress(now - batch.Start);
                ApplyBatch(batch);
            }
        }

        private void ApplyBatch(AddedBatch batch)
        {
            float alpha = DepthBlend.GhostAlpha(Weight) * DepthBlend.AddedAlpha(batch.Progress);
            float rise = DepthBlend.Rise(Weight, _reducedMotion) * DepthBlend.AddedRise(batch.Progress, _reducedMotion);
            foreach (ClassGroup group in batch.Groups) group.Apply(alpha, rise);
            FollowEvidenceGroup();
        }

        private MeshFilter AddRenderer(string name, Mesh mesh, Material material)
        {
            var go = new GameObject(name);
            go.transform.SetParent(_root.transform, false);
            MeshFilter filter = go.AddComponent<MeshFilter>();
            filter.sharedMesh = mesh;
            MeshRenderer renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            _meshes.Add(mesh);
            return filter;
        }

        public void AddDrape(DrapeLayer drape)
        {
            drape.SetLensMode(_lensMode);
            _drapes.Add(drape);
        }

        /// <summary>
        /// How this era meets the Lantern's lens (session 028): 0 draws everywhere, 1 only inside the lens, 2 only
        /// outside it. It reaches every fill, outline and drape of the era, including ones added later.
        /// </summary>
        public void SetLensMode(int mode)
        {
            _lensMode = mode;
            foreach (ClassGroup group in _groups) SetLensMode(group);
            foreach (AddedBatch batch in _batches)
            {
                foreach (ClassGroup group in batch.Groups) SetLensMode(group);
            }
            foreach (DrapeLayer drape in _drapes) drape.SetLensMode(mode);
            if (_evidenceFill != null) LensMaterial.SetMode(_evidenceFill, mode);
            if (_selectedFill != null)
            {
                LensMaterial.SetMode(_selectedFill, mode);
                LensMaterial.SetMode(_selectedEdge, mode);
                if (_selectedGlow != null) LensMaterial.SetMode(_selectedGlow, mode);
            }
        }

        private void SetLensMode(ClassGroup group)
        {
            LensMaterial.SetMode(group.Fill, _lensMode);
            LensMaterial.SetMode(group.Edge, _lensMode);
        }

        // ---- Raise the past (bridge 0.8.0) ----

        /// <summary>
        /// True while the era is held for the first visit's landing: its ghosts are held down (not drawn and not clickable)
        /// and its sheet is drawn dim, until scene/raise.
        /// </summary>
        public bool Held { get; private set; }

        /// <summary>True from the start of a raise until it has settled: the ghosts stand up on their own clocks.</summary>
        public bool Raising { get; private set; }

        private readonly Dictionary<string, Vector2> _centres = new Dictionary<string, Vector2>();

        /// <summary>The centre of a feature's footprint on the ground, in scene metres (x east, y north), if the era draws it.</summary>
        public bool TryGetCentre(string featureId, out Vector2 centre)
        {
            return _centres.TryGetValue(featureId, out centre);
        }

        /// <summary>The centre of every feature this era draws (ghosts and areas), by id.</summary>
        public IDictionary<string, Vector2> Centres
        {
            get { return _centres; }
        }

        /// <summary>The ground point the stagger starts from: the first find's centre, or the middle of the era's features when it has none.</summary>
        public Vector2 RaiseOrigin(string firstFeatureId)
        {
            Vector2 centre;
            if (firstFeatureId != null && _centres.TryGetValue(firstFeatureId, out centre)) return centre;
            if (_centres.Count == 0) return Vector2.zero;
            Vector2 sum = Vector2.zero;
            foreach (Vector2 c in _centres.Values) sum += c;
            return sum / _centres.Count;
        }

        /// <summary>The landing look: every ghost of this era is held down until <see cref="BeginRaise"/>.</summary>
        public void Hold()
        {
            Held = true;
            Raising = false;
            ApplyRaise(true, Vector2.zero, -1f, 0f);
            ApplySelection();
        }

        /// <summary>Starts the raise from the first find's centre. The clock is then set with <see cref="SetRaiseClock"/>.</summary>
        public void BeginRaise(string firstFeatureId)
        {
            Held = false;
            Raising = true;
            _raiseOrigin = RaiseOrigin(firstFeatureId);
            _raiseFarthest = RaiseSchedule.Farthest(_centres.Values, _raiseOrigin);
            ApplyRaise(true, _raiseOrigin, 0f, _raiseFarthest);
            ApplySelection();
        }

        private Vector2 _raiseOrigin;
        private float _raiseFarthest;

        /// <summary>Seconds since the raise started: each ghost is as far up as its own start says.</summary>
        public void SetRaiseClock(float clockS)
        {
            if (Raising) ApplyRaise(true, _raiseOrigin, clockS, _raiseFarthest);
        }

        /// <summary>The raise has settled: every ghost is at full height and the shaders stop reading the clock.</summary>
        public void EndRaise()
        {
            Held = false;
            Raising = false;
            ApplyRaise(false, Vector2.zero, -1f, 0f);
            ApplySelection();
        }

        private void ApplyRaise(bool on, Vector2 origin, float clock, float farthest)
        {
            var parameters = new Vector4(origin.x, origin.y, clock, farthest);
            foreach (ClassGroup group in AllGroups())
            {
                foreach (Material material in new[] { group.Fill, group.Edge })
                {
                    if (material == null) continue;
                    material.SetFloat("_RaiseOn", on ? 1f : 0f);
                    material.SetVector("_RaiseParams", parameters);
                }
            }
        }

        /// <summary>The height of a feature's volume (the anchor's y), or 0 for a land-use area, which is flat on the ground.</summary>
        public bool TryGetAnchor(string featureId, out Vector3 world)
        {
            world = Vector3.zero;
            SceneFeatureDto feature;
            Vector2 centre;
            if (!_features.TryGetValue(featureId, out feature) || !_centres.TryGetValue(featureId, out centre)) return false;
            world = new Vector3(centre.x, feature.kind == SceneFeatureDto.KindLandUse ? 0f : HeightOf(feature), centre.y);
            return true;
        }

        // ---- Selection (bridge 0.8.0, scene/selectFeature) ----

        private string _selectedId;
        private Material _selectedFill;
        private Material _selectedEdge;
        private Material _selectedGlow;
        private Mesh _selectedFillMesh;
        private Mesh _selectedEdgeMesh;
        private Mesh _selectedGlowMesh;
        private GameObject _selectedObject;

        /// <summary>The id of the selected feature of this era, or null.</summary>
        public string SelectedId
        {
            get { return _selectedId; }
        }

        /// <summary>
        /// Draws the feature selected: its edges again in `lantern`, thicker and with a faint emission, and a faint `lantern`
        /// tint over its volume. A land-use area gets the same on the ground. The overlay waits (is not drawn) while the
        /// era is held or being raised. Returns false when the era does not draw the feature or it cannot be built.
        /// </summary>
        public bool SetSelected(string featureId, ProjectFrame frame)
        {
            ClearSelected();
            SceneFeatureDto feature;
            if (!_features.TryGetValue(featureId, out feature) || _materials == null) return false;

            var options = FootprintBuilder.Options.Default;
            options.Outline = true;
            options.Storeys = feature.kind == SceneFeatureDto.KindLandUse ? 0 : feature.storeys;
            FootprintBuilder.Result built = FootprintBuilder.Build(feature.geometry, HeightOf(feature), frame, options);
            if (built == null) return false;

            _selectedId = featureId;
            _selectedObject = new GameObject("Selected " + featureId);
            _selectedObject.transform.SetParent(_root.transform, false);
            _selectedFill = new Material(_materials.SelectedFill) { name = "Selected fill" };
            _selectedEdge = new Material(_materials.SelectedEdge) { name = "Selected edge" };
            _selectedFillMesh = built.Fill.ToMesh("Selected fill " + featureId);
            _selectedEdgeMesh = built.Edges.ToMesh("Selected edges " + featureId);
            AddSelectedRenderer("Fill", _selectedFillMesh, _selectedFill);
            AddSelectedRenderer("Edges", _selectedEdgeMesh, _selectedEdge);
            LensMaterial.SetMode(_selectedFill, _lensMode);
            LensMaterial.SetMode(_selectedEdge, _lensMode);

            // A soft pool of `lantern` light on the paper around the foot (a land-use area is flat and gets the same pool).
            double minE, minN, maxE, maxN;
            Vector2 centre;
            if (TryGetFeatureBox(featureId, out minE, out minN, out maxE, out maxN) && _centres.TryGetValue(featureId, out centre))
            {
                Vec2d lo = frame.ToLocal(minE, minN);
                Vec2d hi = frame.ToLocal(maxE, maxN);
                float reach = 0.5f * (float)Math.Max(Math.Abs(hi.X - lo.X), Math.Abs(hi.Y - lo.Y)) * 1.2f
                    + Buried.Look.LookSettings.SelectedGlowReachM;
                var quad = new MeshData();
                Vector2[] corners = { new Vector2(-1f, -1f), new Vector2(1f, -1f), new Vector2(1f, 1f), new Vector2(-1f, 1f) };
                foreach (Vector2 c in corners) quad.AddVertex(new Vector3(centre.x + c.x * reach, 0.06f, centre.y + c.y * reach), Vector3.up, c);
                quad.AddTriangle(0, 2, 1);
                quad.AddTriangle(0, 3, 2);
                quad.SetUv2ForAll(centre);
                _selectedGlow = new Material(_materials.SelectedGlow) { name = "Selected glow" };
                _selectedGlow.SetFloat("_GlowRadius", reach * 1.41f);
                _selectedGlowMesh = quad.ToMesh("Selected glow " + featureId);
                AddSelectedRenderer("Glow", _selectedGlowMesh, _selectedGlow);
                LensMaterial.SetMode(_selectedGlow, _lensMode);
            }
            ApplySelection();
            return true;
        }

        private void AddSelectedRenderer(string name, Mesh mesh, Material material)
        {
            var go = new GameObject(name);
            go.transform.SetParent(_selectedObject.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            MeshRenderer renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
        }

        /// <summary>Takes the selection off.</summary>
        public void ClearSelected()
        {
            if (_selectedId == null) return;
            SceneObjects.Destroy(_selectedFillMesh);
            SceneObjects.Destroy(_selectedEdgeMesh);
            SceneObjects.Destroy(_selectedGlowMesh);
            SceneObjects.Destroy(_selectedFill);
            SceneObjects.Destroy(_selectedEdge);
            SceneObjects.Destroy(_selectedGlow);
            SceneObjects.Destroy(_selectedObject);
            _selectedId = null;
            _selectedFill = null;
            _selectedEdge = null;
            _selectedGlow = null;
            _selectedFillMesh = null;
            _selectedEdgeMesh = null;
            _selectedGlowMesh = null;
            _selectedObject = null;
        }

        /// <summary>The overlay follows the era's weight and rise, and waits while the era is held or rising.</summary>
        private void ApplySelection()
        {
            if (_selectedId == null) return;
            _selectedObject.SetActive(!Held && !Raising);
            float alpha = DepthBlend.GhostAlpha(Weight);
            float rise = DepthBlend.Rise(Weight, _reducedMotion);
            _selectedFill.SetFloat("_Weight", alpha);
            _selectedFill.SetFloat("_Rise", rise);
            _selectedEdge.SetFloat("_Alpha", alpha);
            _selectedEdge.SetFloat("_Rise", rise);
            if (_selectedGlow != null) _selectedGlow.SetFloat("_Weight", alpha);
        }

        // ---- Show Evidence ----

        /// <summary>True when this era draws the feature.</summary>
        public bool HasFeature(string featureId)
        {
            return _features.ContainsKey(featureId);
        }

        /// <summary>The feature's footprint box in EPSG:26917 (easting and northing), over every ring of its geometry.</summary>
        public bool TryGetFeatureBox(string featureId, out double minE, out double minN, out double maxE, out double maxN)
        {
            minE = minN = double.PositiveInfinity;
            maxE = maxN = double.NegativeInfinity;
            SceneFeatureDto feature;
            if (!_features.TryGetValue(featureId, out feature) || feature.geometry.polygons == null) return false;
            foreach (List<List<double[]>> polygon in feature.geometry.polygons)
            {
                foreach (double[] p in polygon[0])
                {
                    minE = Math.Min(minE, p[0]);
                    maxE = Math.Max(maxE, p[0]);
                    minN = Math.Min(minN, p[1]);
                    maxN = Math.Max(maxN, p[1]);
                }
            }
            return minE <= maxE;
        }

        /// <summary>The id of the feature whose volume is drawn nearly transparent, or null.</summary>
        public string EvidenceFeatureId
        {
            get { return _evidenceId; }
        }

        /// <summary>
        /// Draws one feature's volume at <see cref="Buried.Look.LookSettings.EvidenceFillAlpha"/> and leaves its outline
        /// as it was. The chunk that holds the feature is drawn without it, and the feature is built again on its own,
        /// so no other feature changes. Returns false when the era does not draw the feature or it has no volume.
        /// </summary>
        public bool SetEvidence(string featureId, ProjectFrame frame)
        {
            ClearEvidence();
            SceneFeatureDto feature;
            if (!_features.TryGetValue(featureId, out feature)) return false;

            ClassGroup group = null;
            MeshChunk chunk = null;
            foreach (ClassGroup candidate in AllGroups())
            {
                foreach (MeshChunk c in candidate.Chunks)
                {
                    if (!c.Contains(featureId)) continue;
                    group = candidate;
                    chunk = c;
                }
            }
            MeshFilter filter;
            if (group == null || !_chunkFilters.TryGetValue(chunk, out filter)) return false;

            var options = FootprintBuilder.Options.Default;
            options.Outline = false;
            FootprintBuilder.Result built = FootprintBuilder.Build(feature.geometry, HeightOf(feature), frame, options);
            if (built == null) return false;

            _evidenceId = featureId;
            _evidenceGroup = group;
            _evidenceChunkFilter = filter;
            _evidenceChunkOriginal = filter.sharedMesh;
            _evidenceChunkReplacement = chunk.BuildMeshWithout("Ghosts without " + featureId, featureId);
            filter.sharedMesh = _evidenceChunkReplacement;

            _evidenceFill = new Material(group.Fill) { name = group.Fill.name + " evidence" };
            Color color = _evidenceFill.GetColor("_Color");
            color.a = Buried.Look.LookSettings.EvidenceFillAlpha;
            _evidenceFill.SetColor("_Color", color);
            LensMaterial.SetMode(_evidenceFill, _lensMode);
            _evidenceMesh = built.Fill.ToMesh("Evidence " + featureId);
            _evidenceObject = new GameObject("Evidence " + featureId);
            _evidenceObject.transform.SetParent(_root.transform, false);
            _evidenceObject.AddComponent<MeshFilter>().sharedMesh = _evidenceMesh;
            MeshRenderer renderer = _evidenceObject.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = _evidenceFill;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            return true;
        }

        /// <summary>Puts the feature's volume back into its chunk at its own alpha.</summary>
        public void ClearEvidence()
        {
            if (_evidenceId == null) return;
            if (_evidenceChunkFilter != null) _evidenceChunkFilter.sharedMesh = _evidenceChunkOriginal;
            SceneObjects.Destroy(_evidenceChunkReplacement);
            SceneObjects.Destroy(_evidenceMesh);
            SceneObjects.Destroy(_evidenceFill);
            SceneObjects.Destroy(_evidenceObject);
            _evidenceId = null;
            _evidenceFill = null;
            _evidenceMesh = null;
            _evidenceObject = null;
            _evidenceChunkFilter = null;
            _evidenceChunkOriginal = null;
            _evidenceChunkReplacement = null;
            _evidenceGroup = null;
        }

        private IEnumerable<ClassGroup> AllGroups()
        {
            foreach (ClassGroup group in _groups) yield return group;
            foreach (AddedBatch batch in _batches)
            {
                foreach (ClassGroup group in batch.Groups) yield return group;
            }
        }

        /// <summary>The evidence volume follows the weight and rise of the group it came from.</summary>
        private void FollowEvidenceGroup()
        {
            if (_evidenceFill == null || _evidenceGroup == null) return;
            _evidenceFill.SetFloat("_Weight", _evidenceGroup.Fill.GetFloat("_Weight"));
            _evidenceFill.SetFloat("_Rise", _evidenceGroup.Fill.GetFloat("_Rise"));
        }

        /// <summary>The drapes of this era, in draw order.</summary>
        public IEnumerable<DrapeLayer> Drapes
        {
            get { return _drapes; }
        }

        public void SetVisible(bool visible)
        {
            _root.SetActive(visible);
        }

        /// <summary>
        /// Draws the era at <paramref name="weight"/> (requirements 10.5 and 10.6): ghosts rise from the
        /// ground and fade in, drapes fade in, and an era with no weight draws nothing. Reduced motion
        /// skips the rise and only fades.
        /// </summary>
        public void SetWeight(float weight, bool reducedMotion)
        {
            Weight = Mathf.Clamp01(weight);
            _root.SetActive(Weight > DepthBlend.VisibleWeight);
            float alpha = DepthBlend.GhostAlpha(Weight);
            float rise = DepthBlend.Rise(Weight, reducedMotion);
            foreach (ClassGroup group in _groups) group.Apply(alpha, rise);
            float opacity = DepthBlend.DrapeOpacity(Weight);
            foreach (DrapeLayer drape in _drapes) drape.SetOpacity(opacity);
            _reducedMotion = reducedMotion;
            foreach (AddedBatch batch in _batches) ApplyBatch(batch);
            FollowEvidenceGroup();
            ApplySelection();
        }

        public bool Raycast(Ray ray, out float distance, out string featureId)
        {
            distance = float.PositiveInfinity;
            featureId = null;
            foreach (ClassGroup group in _groups) RaycastGroup(group, ray, ref distance, ref featureId);
            foreach (AddedBatch batch in _batches)
            {
                foreach (ClassGroup group in batch.Groups) RaycastGroup(group, ray, ref distance, ref featureId);
            }
            return featureId != null;
        }

        private static void RaycastGroup(ClassGroup group, Ray ray, ref float distance, ref string featureId)
        {
            foreach (MeshChunk chunk in group.Chunks)
            {
                float d;
                string id;
                if (chunk.Raycast(ray, out d, out id) && d < distance)
                {
                    distance = d;
                    featureId = id;
                }
            }
        }

        public void Dispose()
        {
            ClearSelected();
            ClearEvidence();
            foreach (DrapeLayer drape in _drapes) drape.Dispose();
            _drapes.Clear();
            foreach (Mesh mesh in _meshes) SceneObjects.Destroy(mesh);
            _meshes.Clear();
            foreach (ClassGroup group in _groups) group.Dispose();
            _groups.Clear();
            foreach (AddedBatch batch in _batches)
            {
                foreach (ClassGroup group in batch.Groups) group.Dispose();
            }
            _batches.Clear();
            SceneObjects.Destroy(_root);
        }
    }
}
