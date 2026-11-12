using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>
    /// Requirement 2.5: the Player has no Canvas, no UI Toolkit, no TextMeshPro and draws no text.
    /// The runtime assembly and the packages must not pull any of them in.
    /// </summary>
    public class AssemblyReferenceTests
    {
        private static readonly string[] Forbidden =
        {
            "UnityEngine.UI", "Unity.TextMeshPro", "TMPro", "UnityEngine.UIElements", "Unity.ugui",
        };

        private static string RuntimeFolder
        {
            get { return Path.Combine(Application.dataPath, "Buried", "Runtime"); }
        }

        [Test]
        public void TheRuntimeAssemblyDefinitionReferencesNoUi()
        {
            JObject asmdef = JObject.Parse(File.ReadAllText(Path.Combine(RuntimeFolder, "Buried.Runtime.asmdef")));
            string[] references = asmdef["references"].Select(r => (string)r).ToArray();
            string[] precompiled = asmdef["precompiledReferences"].Select(r => (string)r).ToArray();
            foreach (string bad in Forbidden)
            {
                Assert.IsFalse(references.Any(r => r.Contains(bad)), "references " + bad);
                Assert.IsFalse(precompiled.Any(r => r.Contains(bad)), "precompiled references " + bad);
            }
        }

        [Test]
        public void NoRuntimeSourceUsesUiNamespaces()
        {
            foreach (string file in Directory.GetFiles(RuntimeFolder, "*.cs", SearchOption.AllDirectories))
            {
                string text = File.ReadAllText(file);
                foreach (string bad in Forbidden)
                {
                    Assert.IsFalse(text.Contains("using " + bad), Path.GetFileName(file) + " uses " + bad);
                }
                Assert.IsFalse(text.Contains("OnGUI"), Path.GetFileName(file) + " draws immediate-mode UI");
            }
        }

        [Test]
        public void TheManifestHasNoUiPackages()
        {
            string manifest = File.ReadAllText(Path.Combine(TestPaths.UnityRoot, "Packages", "manifest.json"));
            Assert.IsFalse(manifest.Contains("com.unity.ugui"));
            Assert.IsFalse(manifest.Contains("textmeshpro"));
            Assert.IsFalse(manifest.Contains("com.unity.modules.uielements"));
        }

        [Test]
        public void OnlyTheBridgeFolderImportsFromJavaScript()
        {
            string bridgeFolder = Path.Combine(RuntimeFolder, "Bridge") + Path.DirectorySeparatorChar;
            foreach (string file in Directory.GetFiles(RuntimeFolder, "*.cs", SearchOption.AllDirectories))
            {
                if (file.StartsWith(bridgeFolder)) continue;
                Assert.IsFalse(File.ReadAllText(file).Contains("DllImport"), Path.GetFileName(file) + " imports native code");
            }
        }
    }
}
