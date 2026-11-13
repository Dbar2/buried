using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Buried.Geo;
using Buried.Meshing;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace Buried.Tests
{
    /// <summary>
    /// Property E15 (requirement 25.7): triangulation and extrusion hold on every real polygon. For every
    /// Polygon and MultiPolygon in the committed data/evidence/*.geojson and data/present/*.geojson
    /// files, taken through the same preparation, triangulation and extrusion the Player uses (at the
    /// project origin of data/project.json): no triangle is degenerate, the caps tile the polygon,
    /// cap normals are +y, wall normals point away from the solid, and each ring edge has one wall
    /// quad (MeshAssertions.AssertExtrusion, the checks of E4). The triangulator itself is Buried's own
    /// ear clipper with hole bridging; this test is why that decision stands (design.md "Decisions and
    /// reasons").
    ///
    /// A ring that preparation drops (fewer than three vertices, or under the minimum area after
    /// cleaning) is counted and listed, not tested: the Player drops it the same way and reports
    /// mesh_build_failed. The test fails if no polygon was tested at all.
    /// </summary>
    public class RealPolygonTests
    {
        private const float HeightM = 7f;

        private static IEnumerable<string> DataFiles()
        {
            string data = Path.Combine(TestPaths.RepositoryRoot, "data");
            foreach (string folder in new[] { "evidence", "present" })
            {
                string dir = Path.Combine(data, folder);
                if (!Directory.Exists(dir)) continue;
                foreach (string file in Directory.GetFiles(dir, "*.geojson").OrderBy(f => f, StringComparer.Ordinal)) yield return file;
            }
        }

        private static ProjectFrame Frame()
        {
            JObject project = JObject.Parse(File.ReadAllText(Path.Combine(TestPaths.RepositoryRoot, "data", "project.json")));
            return new ProjectFrame((double)project["origin"]["easting"], (double)project["origin"]["northing"]);
        }

        private static List<Vec2d> Ring(JToken ring, ProjectFrame frame)
        {
            var points = new List<Vec2d>();
            foreach (JToken p in ring) points.Add(frame.ToLocal((double)p[0], (double)p[1]));
            // GeoJSON rings repeat the first vertex at the end; the Player's preparation drops that repeat.
            if (points.Count > 1 && points[0].X == points[points.Count - 1].X && points[0].Y == points[points.Count - 1].Y)
            {
                points.RemoveAt(points.Count - 1);
            }
            return points;
        }

        private static IEnumerable<JToken> Polygons(JToken geometry)
        {
            if (geometry == null || geometry.Type != JTokenType.Object) yield break;
            string type = (string)geometry["type"];
            if (type == "Polygon") yield return geometry["coordinates"];
            else if (type == "MultiPolygon")
            {
                foreach (JToken polygon in geometry["coordinates"]) yield return polygon;
            }
        }

        [Test]
        public void ASliverEdgeFromTheCityOutlinesIsMergedAwayByPreparation()
        {
            // The 13 mm fold-back jog at the start of present building 306711: 39 -> 40 -> 0 -> 1.
            var ring = new List<Vec2d>
            {
                new Vec2d(-182.846, -17.197), new Vec2d(-180.779, -16.523), new Vec2d(-180.792, -16.525),
                new Vec2d(-161.396, -10.114), new Vec2d(-159.0, -30.0), new Vec2d(-182.0, -30.0),
            };
            PreparedPolygon prepared = PolygonPrep.Prepare(ring, null);
            Assert.IsNotNull(prepared);
            for (int i = 0; i < prepared.Outer.Count; i++)
            {
                Vec2d a = prepared.Outer[i];
                Vec2d b = prepared.Outer[(i + 1) % prepared.Outer.Count];
                double d = Math.Sqrt((a.X - b.X) * (a.X - b.X) + (a.Y - b.Y) * (a.Y - b.Y));
                Assert.GreaterOrEqual(d, PolygonPrep.MinEdgeM, "edge " + i + " is a sliver");
            }
        }

        [Test]
        public void E15_TriangulationAndExtrusionHoldOnEveryCommittedPolygon()
        {
            ProjectFrame frame = Frame();
            int tested = 0;
            int dropped = 0;
            int withHoles = 0;
            int files = 0;
            var droppedIds = new List<string>();

            foreach (string file in DataFiles())
            {
                files++;
                JObject collection = JObject.Parse(File.ReadAllText(file));
                var features = (JArray)collection["features"];
                for (int f = 0; f < features.Count; f++)
                {
                    string id = Path.GetFileName(file) + "#" + (features[f]["id"] != null ? (string)features[f]["id"] : f.ToString());
                    foreach (JToken polygon in Polygons(features[f]["geometry"]))
                    {
                        List<Vec2d> exterior = Ring(polygon[0], frame);
                        var holes = new List<IList<Vec2d>>();
                        for (int i = 1; i < polygon.Count(); i++) holes.Add(Ring(polygon[i], frame));

                        PreparedPolygon prepared = PolygonPrep.Prepare(exterior, holes);
                        if (prepared == null)
                        {
                            dropped++;
                            if (droppedIds.Count < 20) droppedIds.Add(id);
                            continue;
                        }

                        try
                        {
                            MeshData mesh = Extruder.Extrude(prepared, HeightM);
                            MeshAssertions.AssertExtrusion(prepared, mesh, HeightM);
                        }
                        catch (AssertionException e)
                        {
                            Assert.Fail("E15 failed on " + id + " (" + prepared.Outer.Count + " vertices, " + prepared.Holes.Count + " holes): " + e.Message);
                        }
                        tested++;
                        if (prepared.Holes.Count > 0) withHoles++;
                    }
                }
            }

            TestContext.WriteLine(
                "E15: " + tested + " polygons tested in " + files + " files (" + withHoles + " with holes); " + dropped
                + " dropped by preparation" + (dropped > 0 ? ": " + string.Join(", ", droppedIds) : ""));
            Assert.Greater(files, 0, "no committed data files were found");
            Assert.Greater(tested, 0, "no polygon was tested");
        }
    }
}
