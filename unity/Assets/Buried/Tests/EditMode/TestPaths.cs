using System.IO;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>Locations of repository files the tests read. The repository root is two levels above Assets.</summary>
    public static class TestPaths
    {
        public static string RepositoryRoot
        {
            get { return Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..")); }
        }

        public static string UnityRoot
        {
            get { return Path.GetFullPath(Path.Combine(Application.dataPath, "..")); }
        }

        public static string BridgeSchema
        {
            get { return Path.Combine(RepositoryRoot, "data", "schema", "bridge.schema.json"); }
        }

        public static string FixturesRoot
        {
            get { return Path.Combine(RepositoryRoot, "data", "schema", "bridge_fixtures"); }
        }
    }
}
