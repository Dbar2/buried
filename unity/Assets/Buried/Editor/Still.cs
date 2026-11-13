using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using Buried.Interop;
using Buried.Look;
using Buried.Scene;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace Buried.Editor
{
    /// <summary>
    /// Renders the Stills of the first visit (spec 06 task U9, requirement 2.1): the opening scene as the Player draws it
    /// (<see cref="BlockCamera"/>, before Raise), as `web/public/still/block-wide.jpg` (1600 by 1000) and `block-tall.jpg`
    /// (780 by 1600), each under 250 KB, plus `block.json` with the finds' anchors in image pixels. The Shell maps those
    /// anchors through the image's object-fit cover arithmetic, so tags sit on the Still before the Player loads.
    ///
    /// The scene is built by the Player's own code (<see cref="SceneBootstrap.Build"/>) from the messages the Shell sends
    /// (data/work/still/scene.json, written by `npm --prefix web run gen:still-scene`), so a Still is a picture of what the
    /// Player draws. Run it with `tools/unity.sh exec Buried.Editor.Still.Render`. It needs a graphics device, so that
    /// command starts the editor without -nographics for this method only.
    /// </summary>
    public static class Still
    {
        public const string OutputFolder = "web/public/still";
        public const int WideWidth = 1600;
        public const int WideHeight = 1000;
        public const int TallWidth = 780;
        public const int TallHeight = 1600;
        public const int MaxBytes = 250 * 1000;

        public static string RepositoryRoot
        {
            get { return Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..")); }
        }

        public static void Render()
        {
            string scenePath = Path.Combine(RepositoryRoot, "data", "work", "still", "scene.json");
            if (!File.Exists(scenePath))
            {
                throw new FileNotFoundException("Run `npm --prefix web run gen:still-scene` first: " + scenePath);
            }
            JObject scene = JObject.Parse(File.ReadAllText(scenePath));

            var palette = AssetDatabase.LoadAssetAtPath<BuriedPalette>(Setup.PalettePath);
            if (palette == null) throw new InvalidOperationException("Run `tools/unity.sh exec Buried.Editor.Setup.Run` first.");
            var shaders = new ShaderSet
            {
                ghost = Load("Ghost.shader"),
                drape = Load("Drape.shader"),
                marker = Load("Marker.shader"),
                sky = Load("Sky.shader"),
                present = Load("Present.shader"),
                edge = Load("Edge.shader"),
            };
            if (!shaders.Complete) throw new InvalidOperationException("a shader is missing");

            string output = Path.Combine(RepositoryRoot, OutputFolder);
            Directory.CreateDirectory(output);

            TextureCache.BytesOverride = url =>
            {
                string path = Path.Combine(RepositoryRoot, url.TrimStart('/'));
                return File.Exists(path) ? File.ReadAllBytes(path) : null;
            };
            try
            {
                var anchorIds = new List<string>();
                foreach (JToken id in (JArray)scene["anchors"]) anchorIds.Add((string)id);

                JObject wide = RenderOne(scene, anchorIds, palette, shaders, WideWidth, WideHeight, Path.Combine(output, "block-wide.jpg"));
                JObject tall = RenderOne(scene, anchorIds, palette, shaders, TallWidth, TallHeight, Path.Combine(output, "block-tall.jpg"));
                var json = new JObject { ["wide"] = wide, ["tall"] = tall };
                File.WriteAllText(Path.Combine(output, "block.json"), json.ToString(Newtonsoft.Json.Formatting.Indented) + "\n");
                Debug.Log("Still.Render wrote block-wide.jpg, block-tall.jpg and block.json to " + output);
            }
            finally
            {
                TextureCache.BytesOverride = null;
            }
        }

        private static Shader Load(string name)
        {
            return AssetDatabase.LoadAssetAtPath<Shader>("Assets/Buried/Runtime/Look/Shaders/" + name);
        }

        private static JObject RenderOne(
            JObject scene, List<string> anchorIds, BuriedPalette palette, ShaderSet shaders, int width, int height, string file)
        {
            var bridgeObject = new GameObject("Still bridge");
            Bridge bridge = bridgeObject.AddComponent<Bridge>();
            SceneAnchorsPayload anchors = null;
            bridge.Sent += (type, payload) =>
            {
                if (type == BridgeMessageTypes.SceneAnchors) anchors = (SceneAnchorsPayload)payload;
            };
            SceneBootstrap.Built built = SceneBootstrap.Build(palette, shaders, bridge);
            var target = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32);
            built.Camera.targetTexture = target;
            built.Camera.aspect = (float)width / height;

            try
            {
                foreach (JToken message in (JArray)scene["messages"])
                {
                    string json = message.ToString(Newtonsoft.Json.Formatting.None);
                    ParsedMessage parsed = BridgeParser.Parse(json);
                    if (parsed.type == BridgeMessageTypes.SceneLoadEra)
                    {
                        // The coroutine of scene/loadEra does not run outside play mode: step it by hand.
                        Drive(built.Controller.LoadEra((SceneLoadEraPayload)parsed.payload));
                    }
                    else
                    {
                        bridge.Receive(json);
                    }
                }

                var ids = new JArray();
                foreach (string id in anchorIds) ids.Add(id);
                bridge.Receive(new JObject
                {
                    ["type"] = BridgeMessageTypes.SceneSetAnchors,
                    ["payload"] = new JObject { ["feature_ids"] = ids },
                }.ToString(Newtonsoft.Json.Formatting.None));
                built.Controller.FlushAnchors();

                built.Camera.Render();
                WriteJpeg(target, file);

                var entries = new JArray();
                if (anchors != null)
                {
                    foreach (AnchorEntry a in anchors.anchors)
                    {
                        entries.Add(new JObject
                        {
                            ["feature_id"] = a.feature_id,
                            ["x"] = Math.Round(a.x / anchors.width * width, 1),
                            ["y"] = Math.Round(a.y / anchors.height * height, 1),
                            ["on_screen"] = a.on_screen,
                        });
                    }
                }
                return new JObject { ["width"] = width, ["height"] = height, ["anchors"] = entries };
            }
            finally
            {
                built.Camera.targetTexture = null;
                target.Release();
                UnityEngine.Object.DestroyImmediate(target);
                UnityEngine.Object.DestroyImmediate(built.Root);
                UnityEngine.Object.DestroyImmediate(bridgeObject);
            }
        }

        /// <summary>Steps a scene/loadEra coroutine to its end. Nested enumerators are stepped too; there is nothing to wait for (the tile comes from disk).</summary>
        private static void Drive(IEnumerator steps)
        {
            var stack = new Stack<IEnumerator>();
            stack.Push(steps);
            while (stack.Count > 0)
            {
                IEnumerator top = stack.Peek();
                if (!top.MoveNext())
                {
                    stack.Pop();
                    continue;
                }
                var inner = top.Current as IEnumerator;
                if (inner != null) stack.Push(inner);
            }
        }

        private static void WriteJpeg(RenderTexture target, string file)
        {
            RenderTexture previous = RenderTexture.active;
            RenderTexture.active = target;
            var texture = new Texture2D(target.width, target.height, TextureFormat.RGB24, false);
            texture.ReadPixels(new Rect(0, 0, target.width, target.height), 0, 0);
            texture.Apply();
            RenderTexture.active = previous;

            byte[] bytes = null;
            for (int quality = 88; quality >= 40; quality -= 4)
            {
                bytes = texture.EncodeToJPG(quality);
                if (bytes.Length <= MaxBytes) break;
            }
            UnityEngine.Object.DestroyImmediate(texture);
            if (bytes.Length > MaxBytes)
            {
                throw new InvalidOperationException(Path.GetFileName(file) + " is " + bytes.Length + " bytes; the limit is " + MaxBytes);
            }
            File.WriteAllBytes(file, bytes);
        }
    }
}
