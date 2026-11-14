using System;
using System.Collections.Generic;
using UnityEngine;

namespace Buried.Walk
{
    /// <summary>
    /// Puts the imported corner on the manifest and gives it its colliders (spec 07 requirements 1.2 and 2). The importer's
    /// axes are never assumed: the `marker_ref_*` nodes are read where they are, compared with the manifest's `refs`, and the
    /// rigid transform that carries one onto the other is applied to the model's root. Nodes are found by name only.
    /// </summary>
    public static class WalkPlacement
    {
        public const string RefPrefix = "marker_ref_";
        public const string LampPrefix = "marker_lamp_";
        public const string PlaquePrefix = "marker_plaque_";
        public const string SpawnName = "marker_spawn";
        public const string HandLanternName = "hand_lantern";

        /// <summary>The model's nodes by name (the first of a name wins).</summary>
        public static Dictionary<string, Transform> Index(Transform root)
        {
            var index = new Dictionary<string, Transform>();
            foreach (Transform t in root.GetComponentsInChildren<Transform>(true))
            {
                if (!index.ContainsKey(t.name)) index[t.name] = t;
            }
            return index;
        }

        /// <summary>
        /// Places <paramref name="root"/> so that its `marker_ref_*` nodes sit on the manifest's `refs`. Returns the worst
        /// remaining distance in metres. Safe to call again on a model that is already placed (the fit is then the identity).
        /// </summary>
        public static float Place(GameObject root, WalkManifest manifest)
        {
            Dictionary<string, Transform> nodes = Index(root.transform);
            var source = new List<Vector3>();
            var target = new List<Vector3>();
            foreach (WalkManifest.Named reference in manifest.refs)
            {
                Transform node;
                if (!nodes.TryGetValue(reference.name, out node))
                {
                    throw new InvalidOperationException("the model has no node named " + reference.name);
                }
                source.Add(node.position);
                target.Add(reference.pos);
            }

            float error;
            WalkMath.Rigid fit = WalkMath.FitRigid(source, target, out error);
            Transform t = root.transform;
            if (fit.Mirror) t.localScale = new Vector3(-t.localScale.x, t.localScale.y, t.localScale.z);
            // The root's own turn and position are replaced by the fit applied to where it stood: the markers are read
            // with the root as it is, so the new world transform is (fit after the old one).
            Quaternion turn = Quaternion.Euler(0f, fit.YawDeg, 0f);
            Vector3 position = fit.Mirror ? MirrorX(t.position) : t.position;
            t.SetPositionAndRotation(turn * position + fit.Translation, turn * (fit.Mirror ? MirrorRotation(t.rotation) : t.rotation));
            return MaxMarkerError(root, manifest, out string unused);
        }

        private static Vector3 MirrorX(Vector3 v)
        {
            return new Vector3(-v.x, v.y, v.z);
        }

        private static Quaternion MirrorRotation(Quaternion q)
        {
            // Reflecting in x: the rotation about y and z axes change sign, rotation about x does not.
            return new Quaternion(q.x, -q.y, -q.z, q.w);
        }

        /// <summary>
        /// The worst distance between a node and its manifest position over every `marker_ref_*`, `marker_lamp_*`,
        /// `marker_plaque_*` and `marker_spawn` the manifest names. A node the model lacks is reported as an error of
        /// infinity and named in <paramref name="worst"/>.
        /// </summary>
        public static float MaxMarkerError(GameObject root, WalkManifest manifest, out string worst)
        {
            Dictionary<string, Transform> nodes = Index(root.transform);
            float max = 0f;
            string worstName = null;
            var expected = new List<KeyValuePair<string, Vector3>>();
            foreach (WalkManifest.Named r in manifest.refs) expected.Add(new KeyValuePair<string, Vector3>(r.name, r.pos));
            foreach (WalkManifest.Named l in manifest.lamps) expected.Add(new KeyValuePair<string, Vector3>(l.name, l.pos));
            foreach (WalkManifest.Plaque p in manifest.plaques) expected.Add(new KeyValuePair<string, Vector3>(PlaquePrefix + p.slug, p.pos));
            expected.Add(new KeyValuePair<string, Vector3>(SpawnName, manifest.spawnPos));
            foreach (KeyValuePair<string, Vector3> e in expected)
            {
                Transform node;
                float d = nodes.TryGetValue(e.Key, out node) ? (node.position - e.Value).magnitude : float.PositiveInfinity;
                if (worstName == null || d > max)
                {
                    max = d;
                    worstName = e.Key;
                }
            }
            worst = worstName;
            return max;
        }

        // ---- Colliders ----

        private static bool IsSurface(string name)
        {
            return name.StartsWith("ground_", StringComparison.Ordinal)
                   || name.StartsWith("bld_", StringComparison.Ordinal)
                   || name.StartsWith("fence_", StringComparison.Ordinal);
        }

        private static bool IsPost(string name)
        {
            return name.StartsWith("prop_lamp_", StringComparison.Ordinal)
                   || name.StartsWith("prop_pole_", StringComparison.Ordinal)
                   || name.StartsWith("prop_hydrant_", StringComparison.Ordinal)
                   || name.StartsWith("plaque_", StringComparison.Ordinal);
        }

        /// <summary>
        /// Mesh colliders on `ground_*`, `bld_*` and `fence_*`; a capsule around each `prop_*` post and `plaque_*`;
        /// nothing on `sign_*`, `rail_*`, the hand lantern or the markers (their renderers are switched off). A node that
        /// already has a collider keeps it, so running this twice changes nothing.
        /// </summary>
        public static int AddColliders(GameObject root)
        {
            int added = 0;
            foreach (Transform node in root.GetComponentsInChildren<Transform>(true))
            {
                string name = node.name;
                if (name.StartsWith("marker_", StringComparison.Ordinal))
                {
                    foreach (Renderer r in node.GetComponentsInChildren<Renderer>(true)) r.enabled = false;
                }
                else if (IsSurface(name))
                {
                    foreach (MeshFilter filter in node.GetComponentsInChildren<MeshFilter>(true))
                    {
                        if (filter.sharedMesh == null || filter.GetComponent<Collider>() != null) continue;
                        filter.gameObject.AddComponent<MeshCollider>().sharedMesh = filter.sharedMesh;
                        added++;
                    }
                }
                else if (IsPost(name) && node.GetComponent<Collider>() == null)
                {
                    if (AddPostCollider(node)) added++;
                }
            }
            return added;
        }

        private static bool AddPostCollider(Transform node)
        {
            Renderer[] renderers = node.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0) return false;
            Bounds bounds = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++) bounds.Encapsulate(renderers[i].bounds);

            Vector3 scale = node.lossyScale;
            float horizontal = Mathf.Max(Mathf.Abs(scale.x), Mathf.Abs(scale.z), 1e-4f);
            float vertical = Mathf.Max(Mathf.Abs(scale.y), 1e-4f);
            var capsule = node.gameObject.AddComponent<CapsuleCollider>();
            capsule.direction = 1;
            capsule.center = node.InverseTransformPoint(bounds.center);
            capsule.radius = Mathf.Max(Mathf.Min(bounds.extents.x, bounds.extents.z), 0.08f) / horizontal;
            capsule.height = Mathf.Max(bounds.size.y / vertical, capsule.radius * 2f);
            return true;
        }
    }
}
