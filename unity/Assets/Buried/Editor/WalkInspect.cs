using System.IO;
using System.Text;
using Buried.Walk;
using UnityEditor;
using UnityEngine;

namespace Buried.Editor
{
    /// <summary>
    /// `tools/unity.sh exec Buried.Editor.WalkInspect.Dump`: writes `data/work/walk/inspect.txt`, the imported corner's nodes (name,
    /// local position, meshes, materials, size), so the node names, the importer's axes and the road's material can be read
    /// without opening the editor. A diagnostic; nothing else reads it.
    /// </summary>
    public static class WalkInspect
    {
        public static void Dump()
        {
            var glb = AssetDatabase.LoadAssetAtPath<GameObject>(WalkSetup.GlbPath);
            if (glb == null) throw new FileNotFoundException(WalkSetup.GlbPath);
            var text = new StringBuilder();
            long vertices = 0;
            int meshes = 0;
            foreach (Transform t in glb.GetComponentsInChildren<Transform>(true))
            {
                int depth = 0;
                for (Transform p = t.parent; p != null; p = p.parent) depth++;
                text.Append(new string(' ', depth * 2)).Append(t.name)
                    .Append("  local=").Append(t.localPosition.ToString("F3")).Append("  rot=").Append(t.localRotation.eulerAngles.ToString("F1"));
                var filter = t.GetComponent<MeshFilter>();
                var renderer = t.GetComponent<Renderer>();
                if (filter != null && filter.sharedMesh != null)
                {
                    meshes++;
                    vertices += filter.sharedMesh.vertexCount;
                    text.Append("  mesh=").Append(filter.sharedMesh.vertexCount).Append("v readable=").Append(filter.sharedMesh.isReadable);
                }
                if (renderer != null)
                {
                    text.Append("  bounds=").Append(renderer.bounds.size.ToString("F2")).Append("  materials=");
                    foreach (Material m in renderer.sharedMaterials)
                    {
                        text.Append(m == null ? "null" : m.name + "[" + m.shader.name + "]").Append(';');
                    }
                }
                text.AppendLine();
            }
            text.AppendLine().Append("meshes=").Append(meshes).Append(" vertices=").Append(vertices).AppendLine();

            foreach (Material m in AssetDatabase.LoadAllAssetsAtPath(WalkSetup.GlbPath).Length > 0 ? CollectMaterials() : new Material[0])
            {
                text.Append("material ").Append(m.name).Append(" shader=").Append(m.shader.name).Append(" props=");
                for (int i = 0; i < m.shader.GetPropertyCount(); i++) text.Append(m.shader.GetPropertyName(i)).Append(',');
                text.AppendLine();
                break; // one is enough to read the property names; the rest share the shader
            }

            string folder = Path.Combine(Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..")), "data", "work", "walk");
            Directory.CreateDirectory(folder);
            File.WriteAllText(Path.Combine(folder, "inspect.txt"), text.ToString());
            Debug.Log("WalkInspect wrote " + Path.Combine(folder, "inspect.txt"));
        }

        private static Material[] CollectMaterials()
        {
            var list = new System.Collections.Generic.List<Material>();
            foreach (Object o in AssetDatabase.LoadAllAssetsAtPath(WalkSetup.GlbPath))
            {
                var m = o as Material;
                if (m != null) list.Add(m);
            }
            return list.ToArray();
        }
    }
}
