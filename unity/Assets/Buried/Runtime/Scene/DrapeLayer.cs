using Buried.Geo;
using Buried.Interop;
using Buried.Meshing;
using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// One source raster draped on the ground by its four corners. Shown with its original colours;
    /// only the opacity can change.
    /// </summary>
    public sealed class DrapeLayer
    {
        /// <summary>Render queue of the first drape. Later drapes draw on top.</summary>
        private const int BaseQueue = 2900;

        public string SourceId { get; private set; }

        private GameObject _root;
        private Mesh _mesh;
        private Material _material;

        public static DrapeLayer Create(Transform parent, ProjectFrame frame, DrapeDto drape, Texture2D texture, Shader shader, int order)
        {
            DrapeCornersDto c = drape.corners;
            MeshData data = DrapeMeshBuilder.Build(
                frame.ToLocal(c.topLeft[0], c.topLeft[1]),
                frame.ToLocal(c.topRight[0], c.topRight[1]),
                frame.ToLocal(c.bottomRight[0], c.bottomRight[1]),
                frame.ToLocal(c.bottomLeft[0], c.bottomLeft[1]));

            var layer = new DrapeLayer { SourceId = drape.sourceId };
            layer._mesh = data.ToMesh("Drape " + drape.sourceId);
            layer._material = new Material(shader) { name = "Drape " + drape.sourceId, mainTexture = texture };
            layer._material.SetFloat("_Opacity", 1f);
            layer._material.renderQueue = BaseQueue + order;

            layer._root = new GameObject("Drape " + drape.sourceId);
            layer._root.transform.SetParent(parent, false);
            layer._root.AddComponent<MeshFilter>().sharedMesh = layer._mesh;
            MeshRenderer renderer = layer._root.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = layer._material;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            return layer;
        }

        public void SetOpacity(float opacity)
        {
            _material.SetFloat("_Opacity", Mathf.Clamp01(opacity));
        }

        public void Dispose()
        {
            if (_root != null) Object.Destroy(_root);
            if (_mesh != null) Object.Destroy(_mesh);
            if (_material != null) Object.Destroy(_material);
        }
    }
}
