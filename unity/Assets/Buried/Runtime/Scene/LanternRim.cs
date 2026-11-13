using Buried.Look;
using Buried.Meshing;
using UnityEngine;
using UnityEngine.Rendering;

namespace Buried.Scene
{
    /// <summary>
    /// The lens's edge: a thin `ink` ring with a `night` casing, drawn over everything. It is the Buried/Edge
    /// shader's line, so the width is in screen pixels. The ring is a polyline of points a short way in front of
    /// the camera, rebuilt each frame the lens is on, so it lands on the pixels the lens test uses. No glass,
    /// no glow beyond the casing.
    /// </summary>
    public sealed class LanternRim
    {
        private readonly GameObject _root;
        private readonly MeshFilter _filter;
        private readonly Material _material;
        private Mesh _mesh;

        public LanternRim(Transform parent, BuriedPalette palette, Shader edgeShader, float pixelScale)
        {
            _material = new Material(edgeShader) { name = "Lantern rim" };
            _material.SetColor("_Color", palette.ink);
            _material.SetFloat("_Alpha", LookSettings.LensRimAlpha);
            _material.SetFloat("_Emission", 1f);
            _material.SetFloat("_WidthPx", LookSettings.LensRimWidthCssPx);
            _material.SetFloat("_PixelScale", pixelScale);
            _material.SetColor("_GlowColor", palette.night);
            _material.SetFloat("_GlowPx", 1f);
            _material.SetFloat("_GlowAlpha", 1f);
            _material.SetFloat("_GlowMix", 1f);
            _material.SetFloat("_Fogged", 0f);
            _material.SetFloat("_ZTest", (float)CompareFunction.Always);
            _material.renderQueue = 3030;

            _root = new GameObject("Lantern rim");
            _root.transform.SetParent(parent, false);
            _filter = _root.AddComponent<MeshFilter>();
            MeshRenderer renderer = _root.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = _material;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            _root.SetActive(false);
        }

        /// <summary>Whether the ring is drawn.</summary>
        public bool Visible
        {
            get { return _root.activeSelf; }
        }

        /// <summary>The ring's corner points in Unity screen coordinates, for tests.</summary>
        public static Vector2[] RingPoints(Vector2 centre, float radiusPx, int segments)
        {
            var points = new Vector2[segments];
            for (int i = 0; i < segments; i++)
            {
                float angle = 2f * Mathf.PI * i / segments;
                points[i] = new Vector2(centre.x + radiusPx * Mathf.Cos(angle), centre.y + radiusPx * Mathf.Sin(angle));
            }
            return points;
        }

        /// <summary>Draws the ring around a centre (Unity screen coordinates, pixels) at a radius in pixels.</summary>
        public void Show(Camera camera, Vector2 centre, float radiusPx)
        {
            if (radiusPx < 1f)
            {
                Hide();
                return;
            }
            Vector2[] points = RingPoints(centre, radiusPx, LookSettings.LensRimSegments);
            float distance = Mathf.Max(camera.nearClipPlane + 0.5f, LookSettings.LensRimDistanceM);
            var mesh = new MeshData();
            Vector3 first = camera.ScreenToWorldPoint(new Vector3(points[0].x, points[0].y, distance));
            Vector3 previous = first;
            for (int i = 1; i <= points.Length; i++)
            {
                Vector3 next = i == points.Length
                    ? first
                    : camera.ScreenToWorldPoint(new Vector3(points[i].x, points[i].y, distance));
                mesh.Append(EdgeMeshBuilder.BuildLine(previous, next));
                previous = next;
            }
            Mesh built = mesh.ToMesh("Lantern rim"); // its bounds come from its own vertices, a couple of metres from the camera
            _filter.sharedMesh = built;
            SceneObjects.Destroy(_mesh);
            _mesh = built;
            _root.SetActive(true);
        }

        public void Hide()
        {
            _root.SetActive(false);
        }

        public void Dispose()
        {
            SceneObjects.Destroy(_mesh);
            SceneObjects.Destroy(_material);
            SceneObjects.Destroy(_root);
        }
    }
}
