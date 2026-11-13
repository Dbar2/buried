using System.Collections.Generic;
using Buried.Geo;
using Buried.Interop;
using Buried.Meshing;
using UnityEngine;

namespace Buried.Scene
{
    /// <summary>
    /// One source raster draped on the ground by its four corners. Shown with its original colours;
    /// only the opacity changes: the drape's mask (design.md "Drape mask") removes what is outside its
    /// boundary and fades it into the ground, and distance fog thins it. No tint, no sharpening.
    /// </summary>
    public sealed class DrapeLayer
    {
        /// <summary>Render queue of the first drape. Later drapes draw on top.</summary>
        private const int BaseQueue = 2900;

        public string SourceId { get; private set; }

        private GameObject _root;
        private Mesh _mesh;
        private Material _material;
        private Texture2D _maskTexture;

        public static DrapeLayer Create(Transform parent, ProjectFrame frame, DrapeDto drape, Texture2D texture, Shader shader, int order)
        {
            DrapeCornersDto c = drape.corners;
            Vec2d topLeft = frame.ToLocal(c.topLeft[0], c.topLeft[1]);
            Vec2d topRight = frame.ToLocal(c.topRight[0], c.topRight[1]);
            Vec2d bottomRight = frame.ToLocal(c.bottomRight[0], c.bottomRight[1]);
            Vec2d bottomLeft = frame.ToLocal(c.bottomLeft[0], c.bottomLeft[1]);
            MeshData data = DrapeMeshBuilder.Build(topLeft, topRight, bottomRight, bottomLeft);

            // The boundary is the four corners until a plate's map area is sent (task 17.1).
            DrapeMask mask = DrapeMaskBuilder.Build(new List<Vec2d> { topLeft, topRight, bottomRight, bottomLeft });

            var layer = new DrapeLayer { SourceId = drape.sourceId };
            layer._mesh = data.ToMesh("Drape " + drape.sourceId);
            layer._maskTexture = ToTexture(mask, drape.sourceId);
            layer._material = new Material(shader) { name = "Drape " + drape.sourceId, mainTexture = texture };
            layer._material.SetFloat("_Opacity", 1f);
            layer._material.SetFloat("_UseCoverage", 0f);
            layer._material.SetTexture("_MaskTex", layer._maskTexture);
            layer._material.SetVector(
                "_MaskRect",
                new Vector4((float)mask.MinX, (float)mask.MinZ, (float)(1.0 / mask.SizeX), (float)(1.0 / mask.SizeZ)));
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

        /// <summary>The mask as a linear two-channel texture: R is the fade, G the coverage.</summary>
        private static Texture2D ToTexture(DrapeMask mask, string sourceId)
        {
            var texture = new Texture2D(mask.Width, mask.Height, TextureFormat.RGBA32, false, true)
            {
                name = "Drape mask " + sourceId,
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
            };
            var pixels = new Color32[mask.Width * mask.Height];
            for (int i = 0; i < pixels.Length; i++)
            {
                pixels[i] = new Color32(
                    (byte)Mathf.RoundToInt(mask.Fade[i] * 255f), (byte)Mathf.RoundToInt(mask.Coverage[i] * 255f), 0, 255);
            }
            texture.SetPixels32(pixels);
            texture.Apply(false, true);
            return texture;
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
            if (_maskTexture != null) Object.Destroy(_maskTexture);
        }
    }
}
