using System;
using System.IO;
using System.Reflection;
using Buried.Interop;
using Buried.Look;
using Buried.Scene;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Buried.Editor
{
    /// <summary>
    /// Creates everything the Unity project needs that Unity normally generates in its editor: the
    /// palette asset, the URP pipeline and renderer assets, the player settings, and the Bootstrap
    /// scene. Run it once with `tools/unity.sh exec Buried.Editor.Setup.Run`; `Build.WebGL` runs it
    /// again first, so it is safe to repeat (it reuses existing assets and rewrites the scene).
    /// </summary>
    public static class Setup
    {
        public const string ScenePath = "Assets/Buried/Scenes/Bootstrap.unity";
        public const string PalettePath = "Assets/Buried/Runtime/Look/Palette.asset";
        public const string RenderingFolder = "Assets/Buried/Rendering";
        public const string RendererPath = RenderingFolder + "/BuriedRenderer.asset";
        public const string PipelinePath = RenderingFolder + "/BuriedPipeline.asset";
        private const string ShaderFolder = "Assets/Buried/Runtime/Look/Shaders/";

        public static void Run()
        {
            AssetDatabase.Refresh();

            BuriedPalette palette = WritePalette();
            Shader ghost = LoadShader("Ghost.shader");
            Shader drape = LoadShader("Drape.shader");
            Shader marker = LoadShader("Marker.shader");

            UniversalRenderPipelineAsset pipeline = EnsurePipeline();
            AssignPipeline(pipeline);
            EnsureGlobalSettings();
            ApplyPlayerSettings();
            UseOldInputManager();
            WriteBootstrapScene(palette, ghost, drape, marker);

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("Buried setup finished: palette, shaders, URP assets, player settings and the Bootstrap scene are in place.");
        }

        // ---- Palette ----

        private static BuriedPalette WritePalette()
        {
            string full = TokensCss.DefaultPath;
            if (!File.Exists(full)) throw new FileNotFoundException("The palette tokens file is missing: " + full);
            var tokens = TokensCss.Parse(File.ReadAllText(full));

            EnsureFolder(Path.GetDirectoryName(PalettePath));
            var palette = AssetDatabase.LoadAssetAtPath<BuriedPalette>(PalettePath);
            if (palette == null)
            {
                palette = ScriptableObject.CreateInstance<BuriedPalette>();
                AssetDatabase.CreateAsset(palette, PalettePath);
            }
            foreach (string name in BuriedPalette.TokenNames)
            {
                Color32 value;
                if (!tokens.TryGetValue(name, out value))
                {
                    throw new InvalidOperationException("tokens.css has no --" + name + " colour");
                }
                palette.Set(name, value);
            }
            EditorUtility.SetDirty(palette);
            return palette;
        }

        // ---- Shaders ----

        private static Shader LoadShader(string fileName)
        {
            string path = ShaderFolder + fileName;
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
            var shader = AssetDatabase.LoadAssetAtPath<Shader>(path);
            if (shader == null) throw new FileNotFoundException("Shader not found: " + path);
            if (!shader.isSupported)
            {
                throw new InvalidOperationException(
                    "Shader " + shader.name + " is not supported by the editor. Look for 'Shader error' lines in unity/Logs/exec.log.");
            }
            return shader;
        }

        // ---- URP ----

        private static UniversalRenderPipelineAsset EnsurePipeline()
        {
            EnsureFolder(RenderingFolder);

            var rendererData = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererPath);
            if (rendererData == null)
            {
                rendererData = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(rendererData, RendererPath);
            }

            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath);
            if (pipeline == null)
            {
                pipeline = UniversalRenderPipelineAsset.Create(rendererData);
                AssetDatabase.CreateAsset(pipeline, PipelinePath);
            }

            // Gate settings: no HDR, no MSAA (exact flat colours for the debug markers and the plate),
            // no shadows (the dusk light is soft and the cost matters on WebGL).
            pipeline.supportsHDR = false;
            pipeline.msaaSampleCount = 1;
            pipeline.renderScale = 1f;
            var serialized = new SerializedObject(pipeline);
            SetBool(serialized, "m_MainLightShadowsSupported", false);
            SetBool(serialized, "m_AdditionalLightShadowsSupported", false);
            SetBool(serialized, "m_SoftShadowsSupported", false);
            serialized.ApplyModifiedProperties();
            EditorUtility.SetDirty(pipeline);
            EditorUtility.SetDirty(rendererData);
            return pipeline;
        }

        private static void SetBool(SerializedObject serialized, string property, bool value)
        {
            SerializedProperty p = serialized.FindProperty(property);
            if (p == null)
            {
                Debug.LogWarning("The URP asset has no property " + property + "; left at its default.");
                return;
            }
            p.boolValue = value;
        }

        private static void AssignPipeline(UniversalRenderPipelineAsset pipeline)
        {
            GraphicsSettings.defaultRenderPipeline = pipeline;
            int current = QualitySettings.GetQualityLevel();
            for (int i = 0; i < QualitySettings.names.Length; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                QualitySettings.renderPipeline = pipeline;
            }
            QualitySettings.SetQualityLevel(current, false);
        }

        /// <summary>
        /// URP 17 keeps its shared resources in a global settings asset. Unity normally creates it when
        /// the editor opens with a pipeline assigned; ask for it explicitly in case this run is headless.
        /// Called by reflection so a change in that internal API cannot break compilation.
        /// </summary>
        private static void EnsureGlobalSettings()
        {
            Type type = typeof(UniversalRenderPipelineAsset).Assembly.GetType(
                "UnityEngine.Rendering.Universal.UniversalRenderPipelineGlobalSettings");
            if (type == null)
            {
                Debug.LogWarning("UniversalRenderPipelineGlobalSettings was not found; relying on Unity to create it.");
                return;
            }

            foreach (MethodInfo method in type.GetMethods(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic))
            {
                if (method.Name != "Ensure") continue;
                ParameterInfo[] parameters = method.GetParameters();
                var args = new object[parameters.Length];
                for (int i = 0; i < parameters.Length; i++)
                {
                    ParameterInfo p = parameters[i];
                    args[i] = p.HasDefaultValue
                        ? p.DefaultValue
                        : (p.ParameterType.IsValueType ? Activator.CreateInstance(p.ParameterType) : null);
                }
                try
                {
                    method.Invoke(null, args);
                    Debug.Log("URP global settings ensured.");
                    return;
                }
                catch (Exception e)
                {
                    Debug.LogWarning("UniversalRenderPipelineGlobalSettings.Ensure failed: " + e.Message);
                }
            }
        }

        // ---- Player settings ----

        public static void ApplyPlayerSettings()
        {
            PlayerSettings.companyName = "Buried";
            PlayerSettings.productName = "Buried";
            PlayerSettings.colorSpace = ColorSpace.Linear;

            // WebGL 2 only.
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WebGL, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, new[] { GraphicsDeviceType.OpenGLES3 });

            // The Shell hosts the loader, so the template is the bare one.
            PlayerSettings.WebGL.template = "APPLICATION:Minimal";

            // Hosting is not decided, so the server may not send Content-Encoding: br. Keep the
            // JavaScript decompression fallback on.
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Brotli;
            PlayerSettings.WebGL.decompressionFallback = true;

            PlayerSettings.WebGL.initialMemorySize = 256;
            PlayerSettings.WebGL.maximumMemorySize = 2048;
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;

            NamedBuildTarget webgl = NamedBuildTarget.WebGL;
            PlayerSettings.SetScriptingBackend(webgl, ScriptingImplementation.IL2CPP);
            PlayerSettings.SetManagedStrippingLevel(webgl, ManagedStrippingLevel.Medium);
            PlayerSettings.SetIl2CppCodeGeneration(webgl, Il2CppCodeGeneration.OptimizeSize);
            PlayerSettings.stripEngineCode = true;
        }

        /// <summary>
        /// The runtime reads the mouse and keyboard with UnityEngine.Input. Make sure the project
        /// uses the Input Manager (value 0), not only the Input System package.
        /// </summary>
        private static void UseOldInputManager()
        {
            UnityEngine.Object[] all = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset");
            if (all == null || all.Length == 0) return;
            var serialized = new SerializedObject(all[0]);
            SerializedProperty handler = serialized.FindProperty("activeInputHandler");
            if (handler != null && handler.intValue != 0)
            {
                handler.intValue = 0;
                serialized.ApplyModifiedProperties();
            }
        }

        // ---- Scene ----

        private static void WriteBootstrapScene(BuriedPalette palette, Shader ghost, Shader drape, Shader marker)
        {
            EnsureFolder(Path.GetDirectoryName(ScenePath));
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var go = new GameObject("Bridge");
            go.AddComponent<Interop.Bridge>();
            var bootstrap = go.AddComponent<SceneBootstrap>();
            bootstrap.palette = palette;
            bootstrap.ghostShader = ghost;
            bootstrap.drapeShader = drape;
            bootstrap.markerShader = marker;

            if (!EditorSceneManager.SaveScene(scene, ScenePath))
            {
                throw new InvalidOperationException("Could not save " + ScenePath);
            }
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        private static void EnsureFolder(string assetPath)
        {
            string root = Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
            Directory.CreateDirectory(Path.Combine(root, assetPath));
        }
    }
}
