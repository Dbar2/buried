using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Buried.Walk
{
    /// <summary>
    /// `corner_1911.json`, read. Positions are [east, up, north] in project-local metres, which is Unity's own frame
    /// (x east, y up, z north), so a manifest position is a Unity world position. `walk_bounds` is [east, north].
    /// </summary>
    public sealed class WalkManifest
    {
        public sealed class Plaque
        {
            public string slug;
            public string featureId;
            public Vector3 pos;
            public Vector3 facing;
        }

        public sealed class Named
        {
            public string name;
            public Vector3 pos;
        }

        public readonly List<Plaque> plaques = new List<Plaque>();
        public readonly List<Named> lamps = new List<Named>();
        public readonly List<Named> refs = new List<Named>();
        public readonly List<Named> hydrants = new List<Named>();
        public Vector3 spawnPos;
        public Vector3 spawnLookAt;
        public Vector2[] walkBounds = new Vector2[0];

        public static WalkManifest Parse(string json)
        {
            JObject root = JObject.Parse(json);
            var manifest = new WalkManifest();
            foreach (JToken p in (JArray)root["plaques"])
            {
                manifest.plaques.Add(new Plaque
                {
                    slug = (string)p["slug"],
                    featureId = (string)p["feature_id"],
                    pos = Vec3(p["pos"]),
                    facing = Vec3(p["facing"]),
                });
            }
            ReadNamed(root["lamps"], manifest.lamps);
            ReadNamed(root["refs"], manifest.refs);
            ReadNamed(root["hydrants"], manifest.hydrants);
            manifest.spawnPos = Vec3(root["spawn"]["pos"]);
            manifest.spawnLookAt = Vec3(root["spawn"]["look_at"]);
            var bounds = new List<Vector2>();
            foreach (JToken b in (JArray)root["walk_bounds"]) bounds.Add(new Vector2((float)b[0], (float)b[1]));
            if (bounds.Count < 3) throw new FormatException("walk_bounds needs at least three points");
            manifest.walkBounds = bounds.ToArray();
            return manifest;
        }

        public Plaque PlaqueFor(string slug)
        {
            foreach (Plaque p in plaques)
            {
                if (p.slug == slug) return p;
            }
            return null;
        }

        private static void ReadNamed(JToken array, List<Named> into)
        {
            if (array == null) return;
            foreach (JToken n in (JArray)array) into.Add(new Named { name = (string)n["name"], pos = Vec3(n["pos"]) });
        }

        private static Vector3 Vec3(JToken t)
        {
            return new Vector3((float)t[0], (float)t[1], (float)t[2]);
        }
    }
}
