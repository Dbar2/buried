using System.Collections.Generic;
using Buried.Geo;
using Buried.Interop;
using Buried.Meshing;
using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// Pixel-sized crosses at given EPSG:26917 positions on the ground (y = 0). Only the gate test uses
    /// them, and only when scene/init said debug: true. Each marker is a quad whose four vertices
    /// share the marker's world position; the shader expands the quad in clip space.
    /// </summary>
    public sealed class DebugMarkers
    {
        private readonly GameObject _root;
        private readonly Material _material;
        private Mesh _mesh;

        public DebugMarkers(Transform parent, Shader shader)
        {
            _material = new Material(shader) { name = "Debug markers" };
            _root = new GameObject("Markers");
            _root.transform.SetParent(parent, false);
            _root.AddComponent<MeshFilter>();
            MeshRenderer renderer = _root.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = _material;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
        }

        public void Show(IList<MarkerEntry> markers, ProjectFrame frame)
        {
            Clear();
            var data = new MeshData();
            var corners = new[] { new Vector2(-1f, -1f), new Vector2(1f, -1f), new Vector2(1f, 1f), new Vector2(-1f, 1f) };
            foreach (MarkerEntry marker in markers)
            {
                Vector3 world = frame.ToWorld(marker.position[0], marker.position[1], 0.0);
                int first = data.VertexCount;
                foreach (Vector2 corner in corners) data.AddVertex(world, Vector3.up, corner);
                data.AddTriangle(first, first + 2, first + 1);
                data.AddTriangle(first, first + 3, first + 2);
            }
            _mesh = data.ToMesh("Debug markers");
            // The vertices sit at the marker positions, so the bounds are already right; widen them a
            // little so a marker at the edge of the view is not culled while its cross is still visible.
            Bounds b = _mesh.bounds;
            b.Expand(50f);
            _mesh.bounds = b;
            _root.GetComponent<MeshFilter>().sharedMesh = _mesh;
        }

        public void Clear()
        {
            if (_mesh != null) Object.Destroy(_mesh);
            _mesh = null;
            _root.GetComponent<MeshFilter>().sharedMesh = null;
        }

        public void Dispose()
        {
            Clear();
            if (_root != null) Object.Destroy(_root);
            if (_material != null) Object.Destroy(_material);
        }
    }
}
