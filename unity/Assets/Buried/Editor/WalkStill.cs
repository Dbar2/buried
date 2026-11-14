using System;
using System.IO;
using Buried.Look;
using Buried.Walk;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace Buried.Editor
{
    /// <summary>
    /// `tools/unity.sh exec Buried.Editor.WalkStill.Render` (spec 07 task 9): five fixed views of the walk as JPEGs at 1600 by
    /// 1000 in `data/work/walk/`, drawn by the Player's own code (<see cref="WalkWorld"/>), so a still is a picture of what the
    /// Player draws at night. It needs a graphics device, so `tools/unity.sh` starts the editor without -nographics for this
    /// method only. Run `Buried.Editor.Setup.Run` first.
    /// </summary>
    public static class WalkStill
    {
        public const int Width = 1600;
        public const int Height = 1000;

        private struct View
        {
            public string File;
            public Vector3 Eye;
            public Vector3 LookAt;

            public View(string file, Vector3 eye, Vector3 lookAt)
            {
                File = file;
                Eye = eye;
                LookAt = lookAt;
            }
        }

        public static void Render()
        {
            WalkAsset asset = WalkSetup.Load();
            if (asset == null) throw new InvalidOperationException("Run `tools/unity.sh exec Buried.Editor.Setup.Run` first: there is no walk asset.");
            WalkManifest manifest = WalkManifest.Parse(asset.manifest.text);

            string output = Path.Combine(Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..")), "data", "work", "walk");
            Directory.CreateDirectory(output);

            Vector3 spawnEye = manifest.spawnPos + Vector3.up * WalkSettings.EyeHeightM;
            View[] views =
            {
                new View("walk-1-spawn.jpg", spawnEye, manifest.spawnLookAt),
                // The bank's corner, from the middle of the junction of Queen Street and River Street.
                new View("walk-2-bank-corner.jpg", new Vector3(21f, 1.62f, 123f), new Vector3(13.8f, 4.5f, 117.2f)),
                // The factory's north wall, from the sidewalk.
                new View("walk-3-factory-wall.jpg", new Vector3(-2f, 1.62f, 124f), new Vector3(-6f, 7f, 112.6f)),
                // West along Queen Street from the corner.
                new View("walk-4-queen-west.jpg", new Vector3(9f, 1.62f, 121.5f), new Vector3(-50f, 3f, 102f)),
                // The machine shop, from King Street.
                new View("walk-5-machine-shop.jpg", new Vector3(8f, 1.62f, 36f), new Vector3(-3f, 7f, 50f)),
            };

            var root = new GameObject("Walk still");
            var cameraObject = new GameObject("Camera") { tag = "MainCamera" };
            cameraObject.transform.SetParent(root.transform, false);
            Camera camera = cameraObject.AddComponent<Camera>();
            camera.fieldOfView = LookSettings.CameraFovDeg;
            camera.nearClipPlane = WalkSettings.NearClipM;
            camera.farClipPlane = WalkSettings.FarClipM;
            camera.allowHDR = true;
            camera.allowMSAA = false;
            PostProcessing.Install(root.transform, camera);

            WalkWorld world = null;
            var target = new RenderTexture(Width, Height, 24, RenderTextureFormat.ARGB32);
            try
            {
                world = WalkWorld.Build(asset, camera, true);
                camera.targetTexture = target;
                camera.aspect = (float)Width / Height;
                foreach (View view in views)
                {
                    camera.transform.SetPositionAndRotation(view.Eye, Quaternion.LookRotation(view.LookAt - view.Eye, Vector3.up));
                    camera.Render();
                    WriteJpeg(target, Path.Combine(output, view.File));
                }
                Debug.Log("WalkStill.Render wrote " + views.Length + " stills to " + output);
            }
            finally
            {
                camera.targetTexture = null;
                target.Release();
                UnityEngine.Object.DestroyImmediate(target);
                if (world != null) world.Dispose();
                UnityEngine.Object.DestroyImmediate(root);
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
            File.WriteAllBytes(file, texture.EncodeToJPG(90));
            UnityEngine.Object.DestroyImmediate(texture);
        }
    }
}
