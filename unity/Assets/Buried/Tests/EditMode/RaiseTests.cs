using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Buried.Editor;
using Buried.Geo;
using Buried.Interop;
using Buried.Look;
using Buried.Scene;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>
    /// Session 040, U6: "Raise the past". The schedule, the clock, the order in which ghosts start and what the layer
    /// hands the shaders. design.md "Motion": today's blocks sink over 600 ms, ghosts start staggered nearest the first
    /// find first, the last starts by 1.5 s and everything has settled by 2.2 s.
    /// </summary>
    public class RaiseTests
    {
        private GhostMaterials _materials;
        private GameObject _holder;
        private ProjectFrame _frame;

        private static Shader Load(string name)
        {
            return AssetDatabase.LoadAssetAtPath<Shader>("Assets/Buried/Runtime/Look/Shaders/" + name);
        }

        [SetUp]
        public void SetUp()
        {
            var palette = AssetDatabase.LoadAssetAtPath<BuriedPalette>(Setup.PalettePath);
            Assert.IsNotNull(palette, "Run `tools/unity.sh exec Buried.Editor.Setup.Run` first.");
            var shaders = new ShaderSet
            {
                ghost = Load("Ghost.shader"),
                drape = Load("Drape.shader"),
                marker = Load("Marker.shader"),
                sky = Load("Sky.shader"),
                present = Load("Present.shader"),
                edge = Load("Edge.shader"),
            };
            Assert.IsTrue(shaders.Complete);
            _materials = new GhostMaterials(palette, shaders, 1f);
            _holder = new GameObject("raise tests");
            _frame = new ProjectFrame(632500.0, 4835000.0);
        }

        [TearDown]
        public void TearDown()
        {
            _materials.Dispose();
            Object.DestroyImmediate(_holder);
        }

        private static SceneFeatureDto Building(string id, double e, double n)
        {
            var ring = new List<double[]>
            {
                new[] { e, n }, new[] { e + 10.0, n }, new[] { e + 10.0, n + 10.0 }, new[] { e, n + 10.0 }, new[] { e, n },
            };
            return new SceneFeatureDto
            {
                id = id,
                kind = SceneFeatureDto.KindBuilding,
                confidence = "documented",
                heightM = 12.0,
                geometry = new GeometryDto
                {
                    type = GeometryDto.Polygon,
                    polygons = new List<List<List<double[]>>> { new List<List<double[]>> { ring } },
                },
            };
        }

        private EraLayer ThreeInARow()
        {
            var layer = new EraLayer("fip_1911", 1, _holder.transform);
            layer.AddFeatures(
                new[]
                {
                    Building("bld_x_0003", 632500.0 + 90.0, 4835000.0),
                    Building("bld_x_0001", 632500.0, 4835000.0),
                    Building("bld_x_0002", 632500.0 + 40.0, 4835000.0),
                },
                _frame, _materials, (id, reason) => Assert.Fail(id + ": " + reason));
            return layer;
        }

        // ---- The schedule ----

        [Test]
        public void EverythingHasSettledBy2Point2Seconds()
        {
            Assert.AreEqual(0.6f, RaiseSchedule.SinkS, 1e-6f);
            Assert.AreEqual(1.5f, RaiseSchedule.LastStartS, 1e-6f);
            Assert.AreEqual(2.2f, RaiseSchedule.TotalS, 1e-6f);
            Assert.AreEqual(1f, RaiseSchedule.GhostProgress(RaiseSchedule.TotalS, RaiseSchedule.StartDelay(100f, 100f)), 1e-6f);
        }

        [Test]
        public void TheNearestStartsFirstAndTheFarthestByOnePointFiveSeconds()
        {
            Assert.AreEqual(RaiseSchedule.FirstStartS, RaiseSchedule.StartDelay(0f, 80f), 1e-6f);
            Assert.AreEqual(RaiseSchedule.LastStartS, RaiseSchedule.StartDelay(80f, 80f), 1e-6f);
            float previous = -1f;
            for (float d = 0f; d <= 80f; d += 4f)
            {
                float start = RaiseSchedule.StartDelay(d, 80f);
                Assert.GreaterOrEqual(start, previous, "a farther ghost never starts before a nearer one");
                Assert.LessOrEqual(start, RaiseSchedule.LastStartS + 1e-6f);
                previous = start;
            }
            Assert.AreEqual(RaiseSchedule.FirstStartS, RaiseSchedule.StartDelay(0f, 0f), 1e-6f, "one ghost, or all in one place");
        }

        [Test]
        public void AGhostStandsUpOverSevenHundredMillisecondsFromItsOwnStart()
        {
            Assert.AreEqual(0f, RaiseSchedule.GhostProgress(0.5f, 0.5f), 1e-6f);
            Assert.AreEqual(0.5f, RaiseSchedule.GhostProgress(0.85f, 0.5f), 1e-5f);
            Assert.AreEqual(1f, RaiseSchedule.GhostProgress(1.2f, 0.5f), 1e-6f);
            Assert.AreEqual(0f, RaiseSchedule.GhostProgress(0f, 0.5f), 1e-6f, "before its start it has not begun");
        }

        [Test]
        public void TheEdgesLeadTheFillAndBothEndWhole()
        {
            for (float p = 0.05f; p < 1f; p += 0.05f)
            {
                Assert.GreaterOrEqual(RaiseSchedule.EdgeAlpha(p), RaiseSchedule.FillAlpha(p), "edges first, then the fill, at progress " + p);
            }
            Assert.AreEqual(0f, RaiseSchedule.EdgeAlpha(0f), 1e-6f);
            Assert.AreEqual(1f, RaiseSchedule.EdgeAlpha(1f), 1e-6f);
            Assert.AreEqual(0f, RaiseSchedule.FillAlpha(0f), 1e-6f);
            Assert.AreEqual(1f, RaiseSchedule.FillAlpha(1f), 1e-6f);
            Assert.AreEqual(0f, RaiseSchedule.Rise(0f), 1e-6f);
            Assert.AreEqual(1f, RaiseSchedule.Rise(1f), 1e-6f);
        }

        [Test]
        public void ThePlinthsSinkOverSixHundredMilliseconds()
        {
            Assert.AreEqual(0f, RaiseSchedule.Sink(0f), 1e-6f);
            Assert.AreEqual(0.5f, RaiseSchedule.Sink(0.3f), 1e-5f);
            Assert.AreEqual(1f, RaiseSchedule.Sink(0.6f), 1e-6f);
            Assert.AreEqual(1f, RaiseSchedule.Sink(5f), 1e-6f);
            Assert.AreEqual(1f, RaiseSchedule.PlinthM, "a plinth is 1 m high");
        }

        [Test]
        public void TheShadersUseTheSameConstantsAsTheSchedule()
        {
            string path = Path.Combine(TestPaths.UnityRoot, "Assets", "Buried", "Runtime", "Look", "Shaders", "BuriedCommon.hlsl");
            string hlsl = File.ReadAllText(path);
            Assert.AreEqual(RaiseSchedule.FirstStartS, Define(hlsl, "BURIED_RAISE_FIRST"), 1e-6f);
            Assert.AreEqual(RaiseSchedule.LastStartS, Define(hlsl, "BURIED_RAISE_LAST"), 1e-6f);
            Assert.AreEqual(RaiseSchedule.RiseS, Define(hlsl, "BURIED_RAISE_S"), 1e-6f);
        }

        private static float Define(string hlsl, string name)
        {
            Match m = Regex.Match(hlsl, @"#define\s+" + name + @"\s+([0-9.]+)");
            Assert.IsTrue(m.Success, name + " is not defined in BuriedCommon.hlsl");
            return float.Parse(m.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture);
        }

        // ---- The order ----

        [Test]
        public void GhostsStartNearestTheFirstFindFirstAndTiesGoById()
        {
            var centres = new Dictionary<string, Vector2>
            {
                { "bld_c_0003", new Vector2(30f, 0f) },
                { "bld_c_0001", new Vector2(0f, 0f) },
                { "bld_c_0002", new Vector2(0f, 30f) },
                { "bld_c_0004", new Vector2(-60f, 0f) },
            };
            List<string> order = RaiseSchedule.Order(centres, centres["bld_c_0001"]);
            Assert.AreEqual(new[] { "bld_c_0001", "bld_c_0002", "bld_c_0003", "bld_c_0004" }, order.ToArray());
        }

        [Test]
        public void TheOrderIsNondecreasingInDistanceForRandomLayouts()
        {
            var random = new System.Random(40);
            for (int run = 0; run < 200; run++)
            {
                var centres = new Dictionary<string, Vector2>();
                int n = random.Next(1, 25);
                for (int i = 0; i < n; i++)
                {
                    centres["bld_r_" + i.ToString("0000")] = new Vector2((float)random.NextDouble() * 400f - 200f, (float)random.NextDouble() * 400f - 200f);
                }
                var origin = new Vector2((float)random.NextDouble() * 400f - 200f, (float)random.NextDouble() * 400f - 200f);
                List<string> order = RaiseSchedule.Order(centres, origin);
                Assert.AreEqual(n, order.Count);
                float farthest = RaiseSchedule.Farthest(centres.Values, origin);
                float previousStart = -1f;
                foreach (string id in order)
                {
                    float start = RaiseSchedule.StartDelay((centres[id] - origin).magnitude, farthest);
                    Assert.GreaterOrEqual(start, previousStart - 1e-6f, "starts follow the order");
                    previousStart = start;
                }
            }
        }

        // ---- The clock ----

        [Test]
        public void TheClockSettlesOnceAtTwoPointTwoSecondsAndStaysPinnedUntilTheDepthMoves()
        {
            var state = new RaiseState();
            Assert.IsFalse(state.Used);
            state.Start("fip_1911", true);
            Assert.IsTrue(state.Used);
            Assert.IsTrue(state.Active);
            Assert.IsTrue(state.Pinned);
            Assert.AreEqual(0f, state.Sink, 1e-6f);

            int settled = 0;
            for (int i = 0; i < 300; i++)
            {
                if (state.Tick(0.01f)) settled++;
            }
            Assert.AreEqual(1, settled, "it settles once");
            Assert.AreEqual(RaiseSchedule.TotalS, state.Clock, 1e-6f);
            Assert.IsFalse(state.Active);
            Assert.AreEqual(1f, state.Sink, 1e-6f);
            Assert.IsTrue(state.Pinned, "the raised era stays whole until a scene/setDepth");

            state.Unpin();
            Assert.IsFalse(state.Pinned);
            Assert.IsTrue(state.Used, "plinths stay solid after a raise");
            state.Reset();
            Assert.IsFalse(state.Used);
        }

        [Test]
        public void WithoutAnimationTheRaiseIsOverAtOnce()
        {
            var state = new RaiseState();
            state.Start("fip_1911", false);
            Assert.IsFalse(state.Active);
            Assert.AreEqual(RaiseSchedule.TotalS, state.Clock, 1e-6f);
            Assert.AreEqual(1f, state.Sink, 1e-6f);
            Assert.IsFalse(state.Tick(1f), "nothing is left to settle");
        }

        // ---- The layer ----

        [Test]
        public void TheLayerKnowsEachFootprintCentreAndStartsTheStaggerFromTheFirstFind()
        {
            EraLayer layer = ThreeInARow();
            Vector2 first;
            Assert.IsTrue(layer.TryGetCentre("bld_x_0001", out first));
            Assert.AreEqual(5f, first.x, 1e-3f);
            Assert.AreEqual(5f, first.y, 1e-3f);
            Assert.AreEqual(first, layer.RaiseOrigin("bld_x_0001"));

            Vector2 middle = layer.RaiseOrigin(null);
            Assert.AreEqual(5f + 130f / 3f, middle.x, 1e-2f, "with no first find, the middle of the era's features");

            List<string> order = RaiseSchedule.Order(layer.Centres, layer.RaiseOrigin("bld_x_0001"));
            Assert.AreEqual(new[] { "bld_x_0001", "bld_x_0002", "bld_x_0003" }, order.ToArray());
            layer.Dispose();
        }

        [Test]
        public void HoldBeginAndEndSetTheGhostMaterialsTheShadersRead()
        {
            EraLayer layer = ThreeInARow();
            Material fill = _holder.transform.Find("Era fip_1911/Ghosts documented 0").GetComponent<MeshRenderer>().sharedMaterial;
            Material edge = _holder.transform.Find("Era fip_1911/Edges documented 0").GetComponent<MeshRenderer>().sharedMaterial;
            Assert.AreEqual(0f, fill.GetFloat("_RaiseOn"));

            layer.Hold();
            Assert.IsTrue(layer.Held);
            Assert.AreEqual(1f, fill.GetFloat("_RaiseOn"));
            Assert.AreEqual(1f, edge.GetFloat("_RaiseOn"));
            Assert.Less(fill.GetVector("_RaiseParams").z, 0f, "a held era's clock is negative: no ghost has started");

            layer.BeginRaise("bld_x_0001");
            Assert.IsFalse(layer.Held);
            Assert.IsTrue(layer.Raising);
            layer.SetRaiseClock(1.25f);
            Vector4 p = fill.GetVector("_RaiseParams");
            Assert.AreEqual(5f, p.x, 1e-3f);
            Assert.AreEqual(5f, p.y, 1e-3f);
            Assert.AreEqual(1.25f, p.z, 1e-6f);
            Assert.AreEqual(90f, p.w, 1e-2f, "the farthest ghost is 90 m from the first find");
            Assert.AreEqual(p, edge.GetVector("_RaiseParams"));

            layer.EndRaise();
            Assert.IsFalse(layer.Raising);
            Assert.AreEqual(0f, fill.GetFloat("_RaiseOn"), "the shaders stop reading the clock: every ghost is whole");
            Assert.AreEqual(0f, edge.GetFloat("_RaiseOn"));
            layer.Dispose();
        }

        [Test]
        public void EveryVertexOfAGhostCarriesItsFootprintCentreInTheSecondUv()
        {
            EraLayer layer = ThreeInARow();
            Mesh mesh = _holder.transform.Find("Era fip_1911/Ghosts documented 0").GetComponent<MeshFilter>().sharedMesh;
            var uv1 = new List<Vector2>();
            mesh.GetUVs(1, uv1);
            Assert.AreEqual(mesh.vertexCount, uv1.Count);
            Vector3[] vertices = mesh.vertices;
            for (int i = 0; i < vertices.Length; i++)
            {
                Vector2 centre = uv1[i];
                Assert.LessOrEqual(Mathf.Abs(vertices[i].x - centre.x), 5.01f, "the centre is within half a footprint of its own vertices");
                Assert.LessOrEqual(Mathf.Abs(vertices[i].z - centre.y), 5.01f);
            }
            layer.Dispose();
        }

        [Test]
        public void TheAnchorOfABuildingIsTheTopCentreAndOfAnAreaTheGroundCentroid()
        {
            EraLayer layer = ThreeInARow();
            Vector3 anchor;
            Assert.IsTrue(layer.TryGetAnchor("bld_x_0001", out anchor));
            Assert.AreEqual(5f, anchor.x, 1e-3f);
            Assert.AreEqual(12f, anchor.y, 1e-3f);
            Assert.AreEqual(5f, anchor.z, 1e-3f);
            Assert.IsFalse(layer.TryGetAnchor("bld_x_9999", out anchor));

            SceneFeatureDto area = Building("use_x_0001", 632500.0 + 200.0, 4835000.0);
            area.kind = SceneFeatureDto.KindLandUse;
            area.heightM = 0.05;
            layer.AddFeatures(new[] { area }, _frame, _materials, (id, reason) => Assert.Fail(id + ": " + reason));
            Assert.IsTrue(layer.TryGetAnchor("use_x_0001", out anchor));
            Assert.AreEqual(0f, anchor.y, 1e-6f, "an area's anchor is on the ground");
            Assert.AreEqual(205f, anchor.x, 1e-3f);
            layer.Dispose();
        }

        [Test]
        public void ThePresentSinksEveryBlockToAMetreWhateverItsHeight()
        {
            // The shader pulls y down to min(y, plinth) by the sink; the same arithmetic, for every height.
            foreach (float height in new[] { 0.5f, 1f, 3f, 12f, 80f })
            {
                foreach (float y in new[] { 0f, height * 0.5f, height })
                {
                    float sunk = Mathf.Lerp(y, Mathf.Min(y, RaiseSchedule.PlinthM), 1f);
                    Assert.LessOrEqual(sunk, RaiseSchedule.PlinthM + 1e-6f);
                    Assert.LessOrEqual(sunk, y + 1e-6f);
                    float half = Mathf.Lerp(y, Mathf.Min(y, RaiseSchedule.PlinthM), 0.5f);
                    Assert.GreaterOrEqual(half, sunk - 1e-6f, "halfway is between full height and the plinth");
                    Assert.LessOrEqual(half, y + 1e-6f);
                }
            }
        }
    }
}
