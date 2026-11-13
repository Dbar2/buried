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
                layer._material.SetColor("_PaperColor", palette.parchment);
                layer._material.SetColor("_LineColor", palette.ink);
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

        /// <summary>
        /// The lit display's brightness, 0 to 1. The first visit draws its sheet dim until Raise brightens it
        /// (<see cref="LookSettings.LandingSheetGain"/>). Only the lit display uses it.
        /// </summary>
        public void SetGain(float gain)
        {
            _material.SetFloat("_Gain", Mathf.Clamp01(gain));
        }

        /// <summary>0 draws everywhere, 1 only inside the Lantern's lens, 2 only outside it.</summary>
        public void SetLensMode(int mode)
        {
            LensMaterial.SetMode(_material, mode);
            if (_shadowMaterial != null) LensMaterial.SetMode(_shadowMaterial, mode);
            if (_wallMaterial != null) LensMaterial.SetMode(_wallMaterial, mode);
        }

        // ---- The page (session 043) ----

        private readonly List<GameObject> _pageObjects = new List<GameObject>();
        private readonly List<Mesh> _pageMeshes = new List<Mesh>();
        private Material _shadowMaterial;
        private Material _wallMaterial;

        /// <summary>
        /// Makes this drape the first visit's page: the whole tile with a crisp edge and a thin ink rule just inside it, about
        /// <see cref="LookSettings.SheetThicknessM"/> of paper below it (its four sides, shaded by the lamp) and a soft contact
        /// shadow on the table, thrown along the lamp's travel. The table must sit that far below the sheet (the caller lowers it).
        /// </summary>
        public void MakePage(Transform parent, ProjectFrame frame, DrapeDto drape, BuriedPalette palette, Shader ghostShader)
        {
            DrapeCornersDto c = drape.corners;
            Vec2d tl = frame.ToLocal(c.topLeft[0], c.topLeft[1]);
            Vec2d tr = frame.ToLocal(c.topRight[0], c.topRight[1]);
            Vec2d br = frame.ToLocal(c.bottomRight[0], c.bottomRight[1]);
            Vec2d bl = frame.ToLocal(c.bottomLeft[0], c.bottomLeft[1]);
            double width = System.Math.Sqrt((tr.X - tl.X) * (tr.X - tl.X) + (tr.Y - tl.Y) * (tr.Y - tl.Y));
            double height = System.Math.Sqrt((bl.X - tl.X) * (bl.X - tl.X) + (bl.Y - tl.Y) * (bl.Y - tl.Y));
            var uHat = new Vector2((float)((tr.X - tl.X) / width), (float)((tr.Y - tl.Y) / width));
            var vHat = new Vector2((float)((bl.X - tl.X) / height), (float)((bl.Y - tl.Y) / height));
            var origin = new Vector2((float)tl.X, (float)tl.Y);

            // The page itself: a crisp edge, an ink rule, and the lamp's warm light under the pool.
            _material.SetFloat("_SheetMode", 1f);
            _material.SetVector("_SheetSize", new Vector4((float)width, (float)height, 0f, 0f));
            _material.SetVector(
                "_SheetRule",
                new Vector4(LookSettings.SheetRuleInsetM, LookSettings.SheetRuleWidthM, LookSettings.SheetRuleAlpha, 0f));
            _material.SetColor("_WarmTint", Color.Lerp(Color.white, palette.lantern, 0.55f * LookSettings.SheetWarmth));
            // The shadow leans cool but keeps the paper's own hue: `copper` is green, and multiplied into a yellow paper it made khaki.
            _material.SetColor("_CoolTint", new Color(1f - 0.3f * LookSettings.SheetCoolness, 1f - LookSettings.SheetCoolness, 1f, 1f));
            _material.SetFloat("_WarmReach", LookSettings.SheetWarmReach);

            float t = LookSettings.SheetThicknessM;
            Vector3 Pt(float a, float b, float y)
            {
                Vector2 p = origin + uHat * a + vHat * b;
                return new Vector3(p.x, y, p.y);
            }

            // The sides of the paper, from the sheet down to the table: normals point out of the page.
            var walls = new MeshData();
            float w = (float)width, h = (float)height;
            AddWall(walls, Pt(0f, 0f, 0f), Pt(w, 0f, 0f), t, -vHat);
            AddWall(walls, Pt(w, 0f, 0f), Pt(w, h, 0f), t, uHat);
            AddWall(walls, Pt(w, h, 0f), Pt(0f, h, 0f), t, vHat);
            AddWall(walls, Pt(0f, h, 0f), Pt(0f, 0f, 0f), t, -uHat);
            Color side = (Color)palette.parchment * LookSettings.SheetSideBrightness;
            side.a = 1f;
            _wallMaterial = new Material(ghostShader) { name = "Page sides " + SourceId };
            _wallMaterial.SetColor("_Color", side);
            _wallMaterial.SetColor("_ShadeColor", palette.copper);
            _wallMaterial.SetFloat("_Shade", 0.6f);
            _wallMaterial.SetFloat("_ShadeMix", 0.7f);
            _wallMaterial.SetFloat("_Emission", 0f);
            _wallMaterial.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.One);
            _wallMaterial.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.Zero);
            _wallMaterial.SetFloat("_ZWrite", 1f);
            _wallMaterial.SetFloat("_Cull", (float)UnityEngine.Rendering.CullMode.Off);
            _wallMaterial.renderQueue = 2000;
            AddPageObject(parent, "Page sides", walls.ToMesh("Page sides " + SourceId), _wallMaterial);

            // The contact shadow: a quad on the table, a margin larger than the page, whose uv is metres from the page's corner.
            float m = LookSettings.SheetShadowMarginM;
            var shadow = new MeshData();
            Vector2[] ab = { new Vector2(-m, -m), new Vector2(w + m, -m), new Vector2(w + m, h + m), new Vector2(-m, h + m) };
            for (int i = 0; i < 4; i++) shadow.AddVertex(Pt(ab[i].x, ab[i].y, -t + 0.01f), Vector3.up, ab[i]);
            shadow.AddTriangle(0, 2, 1);
            shadow.AddTriangle(0, 3, 2);
            _shadowMaterial = new Material(_material.shader) { name = "Page shadow " + SourceId };
            _shadowMaterial.SetFloat("_SheetMode", 2f);
            _shadowMaterial.SetFloat("_Lit", 0f);
            _shadowMaterial.SetColor("_LineColor", Color.black);
            _shadowMaterial.SetVector("_SheetSize", new Vector4(w, h, 0f, 0f));
            // The throw is along the lamp's travel, in the page's own metres (u along the top edge, v down the side).
            Vector3 lamp = LookSettings.LampToward();
            var travel = new Vector2(-lamp.x, -lamp.z).normalized * LookSettings.SheetShadowThrowM;
            _shadowMaterial.SetVector(
                "_ShadowShift",
                new Vector4(Vector2.Dot(travel, uHat), Vector2.Dot(travel, vHat), LookSettings.SheetShadowAlpha, LookSettings.SheetShadowSoftM));
            _shadowMaterial.SetTexture("_MaskTex", _maskTexture);
            _shadowMaterial.renderQueue = BaseQueue - 5;
            AddPageObject(parent, "Page shadow", shadow.ToMesh("Page shadow " + SourceId), _shadowMaterial);
        }

        private static void AddWall(MeshData mesh, Vector3 a, Vector3 b, float thickness, Vector2 outward)
        {
            var n = new Vector3(outward.x, 0f, outward.y);
            int i0 = mesh.AddVertex(a, n, new Vector2(0f, 1f));
            int i1 = mesh.AddVertex(b, n, new Vector2(1f, 1f));
            int i2 = mesh.AddVertex(b + Vector3.down * thickness, n, new Vector2(1f, 0f));
            int i3 = mesh.AddVertex(a + Vector3.down * thickness, n, new Vector2(0f, 0f));
            mesh.AddTriangle(i0, i1, i2);
            mesh.AddTriangle(i0, i2, i3);
        }

        private void AddPageObject(Transform parent, string name, Mesh mesh, Material material)
        {
            var go = new GameObject(name + " " + SourceId);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            MeshRenderer renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            _pageObjects.Add(go);
            _pageMeshes.Add(mesh);
        }

        public void Dispose()
        {
            foreach (GameObject go in _pageObjects) SceneObjects.Destroy(go);
            foreach (Mesh mesh in _pageMeshes) SceneObjects.Destroy(mesh);
            _pageObjects.Clear();
            _pageMeshes.Clear();
            SceneObjects.Destroy(_shadowMaterial);
            SceneObjects.Destroy(_wallMaterial);
            SceneObjects.Destroy(_root);
            SceneObjects.Destroy(_mesh);
            SceneObjects.Destroy(_material);
            SceneObjects.Destroy(_maskTexture);
        }
    }
}
