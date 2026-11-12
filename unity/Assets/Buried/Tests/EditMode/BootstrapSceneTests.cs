using System.Linq;
using Buried.Editor;
using Buried.Interop;
using Buried.Scene;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>
    /// Requirement 1.4, 2.1 and 2.5: the build has exactly one scene, Bootstrap, and it holds one root
    /// GameObject named Bridge and nothing else. These tests need the scene that
    /// `tools/unity.sh exec Buried.Editor.Setup.Run` writes.
    /// </summary>
    public class BootstrapSceneTests
    {
        private const string Hint = " Run `tools/unity.sh exec Buried.Editor.Setup.Run` first.";

        [Test]
        public void TheBuildHasExactlyTheBootstrapScene()
        {
            EditorBuildSettingsScene[] scenes = EditorBuildSettings.scenes;
            Assert.AreEqual(1, scenes.Length, "exactly one scene in the build" + Hint);
            Assert.AreEqual(Setup.ScenePath, scenes[0].path);
            Assert.IsTrue(scenes[0].enabled);
        }

        [Test]
        public void BootstrapHasOneRootGameObjectCalledBridge()
        {
            var scene = EditorSceneManager.OpenScene(Setup.ScenePath, OpenSceneMode.Single);
            Assert.IsTrue(scene.IsValid(), "the scene opens" + Hint);

            GameObject[] roots = scene.GetRootGameObjects();
            Assert.AreEqual(1, roots.Length, "one root GameObject");
            Assert.AreEqual("Bridge", roots[0].name);
            Assert.AreEqual(0, roots[0].transform.childCount, "no children");

            string[] components = roots[0].GetComponents<Component>().Select(c => c.GetType().Name).OrderBy(n => n).ToArray();
            Assert.AreEqual(new[] { "Bridge", "SceneBootstrap", "Transform" }, components);
        }

        [Test]
        public void BootstrapHasNoCameraLightMeshOrCollider()
        {
            var scene = EditorSceneManager.OpenScene(Setup.ScenePath, OpenSceneMode.Single);
            foreach (GameObject root in scene.GetRootGameObjects())
            {
                Assert.AreEqual(0, root.GetComponentsInChildren<Camera>(true).Length, "no camera");
                Assert.AreEqual(0, root.GetComponentsInChildren<Light>(true).Length, "no light");
                Assert.AreEqual(0, root.GetComponentsInChildren<Renderer>(true).Length, "no renderer");
                Assert.AreEqual(0, root.GetComponentsInChildren<MeshFilter>(true).Length, "no mesh");
                Assert.AreEqual(0, root.GetComponentsInChildren<Collider>(true).Length, "no collider");
            }
        }

        [Test]
        public void BootstrapReferencesThePaletteAndTheShaders()
        {
            var scene = EditorSceneManager.OpenScene(Setup.ScenePath, OpenSceneMode.Single);
            var bootstrap = scene.GetRootGameObjects()[0].GetComponent<SceneBootstrap>();
            Assert.IsNotNull(bootstrap.palette, "palette" + Hint);
            Assert.IsNotNull(bootstrap.ghostShader, "ghost shader");
            Assert.IsNotNull(bootstrap.drapeShader, "drape shader");
            Assert.IsNotNull(bootstrap.markerShader, "marker shader");
        }
    }
}
