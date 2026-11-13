using System.Collections.Generic;
using Buried.Geo;
using Buried.Interop;
using Buried.Look;
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

        /// <summary>The queue order of the Show Evidence patch: above every era drape, below the ghosts (queue 3000).</summary>
        public const int EvidenceOrder = 90;

        public string SourceId { get; private set; }

        private GameObject _root;
        private Mesh _mesh;
        private Material _material;
        private Texture2D _maskTexture;

        /// <summary>
        /// The ring that bounds a drape, in world x and z, not closed (the repeated last vertex is dropped):
        /// the exterior ring of <c>clip</c> when the drape has one, else its four corners. Holes in the clip
        /// are ignored; a plate's map area has none.
        /// </summary>
        public static List<Vec2d> Boundary(ProjectFrame frame, DrapeDto drape)
        {
            var ring = new List<Vec2d>();
            if (drape.clip != null && drape.clip.polygons != null && drape.clip.polygons.Count > 0)
            {
                List<double[]> exterior = drape.clip.polygons[0][0];
                for (int i = 0; i < exterior.Count - 1; i++) ring.Add(frame.ToLocal(exterior[i][0], exterior[i][1]));
                return ring;
            }
            DrapeCornersDto c = drape.corners;
            ring.Add(frame.ToLocal(c.topLeft[0], c.topLeft[1]));
            ring.Add(frame.ToLocal(c.topRight[0], c.topRight[1]));
            ring.Add(frame.ToLocal(c.bottomRight[0], c.bottomRight[1]));
            ring.Add(frame.ToLocal(c.bottomLeft[0], c.bottomLeft[1]));
            return ring;
        }

        public static DrapeLayer Create(Transform parent, ProjectFrame frame, DrapeDto drape, Texture2D texture, Shader shader, int order)
        {
            return Create(parent, frame, drape, texture, shader, order, null);
        }

        /// <summary>
        /// Creates the drape. With a palette it is lit by default (the Explorer's display, design.md
        /// "Draped rasters: the map sheet is lit"): the paper is `ink` and the line work `night`. A plate is
        /// toned toward paper; an aerial (<see cref="DrapeDto.KindAerial"/>) is lit but not recoloured.
        /// </summary>
        public static DrapeLayer Create(
            Transform parent, ProjectFrame frame, DrapeDto drape, Texture2D texture, Shader shader, int order, BuriedPalette palette)
        {
            DrapeCornersDto c = drape.corners;
            Vec2d topLeft = frame.ToLocal(c.topLeft[0], c.topLeft[1]);
            Vec2d topRight = frame.ToLocal(c.topRight[0], c.topRight[1]);
            Vec2d bottomRight = frame.ToLocal(c.bottomRight[0], c.bottomRight[1]);
            Vec2d bottomLeft = frame.ToLocal(c.bottomLeft[0], c.bottomLeft[1]);
            MeshData data = DrapeMeshBuilder.Build(topLeft, topRight, bottomRight, bottomLeft);

            // The boundary is the plate's map area when one is sent, else the four corners.
            DrapeMask mask = DrapeMaskBuilder.Build(Boundary(frame, drape));

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
            if (palette != null)
            {
                layer._material.SetColor("_PaperColor", palette.ink);
                layer._material.SetColor("_LineColor", palette.night);
                layer._material.SetFloat("_ToneLine", LookSettings.ToneLineLuminance);
                layer._material.SetFloat("_TonePaper", LookSettings.TonePaperLuminance);
                layer._material.SetFloat("_LightFloor", LookSettings.LightFloor);
                layer._material.SetFloat("_Recolour", drape.kind == DrapeDto.KindAerial ? 0f : 1f);
            }
            layer.SetLit(palette != null);

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

        /// <summary>True when the lit display is on; false shows the untouched scan ("view original scan").</summary>
        public bool IsLit { get; private set; }

        public void SetLit(bool lit)
        {
            IsLit = lit;
            _material.SetFloat("_Lit", lit ? 1f : 0f);
        }

        /// <summary>
        /// Show Evidence's patch: the untouched scan, shown by the mask's hard coverage channel instead of its fade
        /// and not thinned by the distance fog (the same switch the shader's _UseCoverage names).
        /// </summary>
        public void SetPatch()
        {
            SetLit(false);
            _material.SetFloat("_UseCoverage", 1f);
        }

        /// <summary>0 draws everywhere, 1 only inside the Lantern's lens, 2 only outside it.</summary>
        public void SetLensMode(int mode)
        {
            LensMaterial.SetMode(_material, mode);
        }

        public void Dispose()
        {
            SceneObjects.Destroy(_root);
            SceneObjects.Destroy(_mesh);
            SceneObjects.Destroy(_material);
            SceneObjects.Destroy(_maskTexture);
        }
    }
}
