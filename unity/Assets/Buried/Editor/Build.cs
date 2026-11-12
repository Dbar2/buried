using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Buried.Editor
{
    /// <summary>
    /// Headless WebGL build. Run with
    /// `Unity -batchmode -quit -projectPath unity -executeMethod Buried.Editor.Build.WebGL`
    /// (or `tools/unity.sh build`). Output: web/public/unity/ (gitignored).
    /// Any build error throws, so Unity exits with a non-zero status.
    /// </summary>
    public static class Build
    {
        [Serializable]
        private sealed class BuildFiles
        {
            public string loader;
            public string data;
            public string framework;
            public string wasm;
        }

        public static string OutputFolder
        {
            get
            {
                return Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "web", "public", "unity"));
            }
        }

        public static void WebGL()
        {
            Setup.Run();

            string output = OutputFolder;
            Directory.CreateDirectory(output);

            var options = new BuildPlayerOptions
            {
                scenes = new[] { Setup.ScenePath },
                locationPathName = output,
                target = BuildTarget.WebGL,
                targetGroup = BuildTargetGroup.WebGL,
                options = BuildOptions.None,
            };

            BuildReport report = BuildPipeline.BuildPlayer(options);
            BuildSummary summary = report.summary;
            Debug.Log("Build Finished: " + summary.result + ", " + summary.totalErrors + " errors, "
                      + summary.totalWarnings + " warnings, " + summary.totalSize + " bytes in the report.");
            if (summary.result != BuildResult.Succeeded)
            {
                throw new BuildFailedException("The WebGL build did not succeed: " + summary.result);
            }

            WriteBuildFiles(output);
            RemoveUnusedTemplateOutput(output);
        }

        /// <summary>
        /// Writes build.json next to the build, naming the four files the Shell hands to the loader.
        /// The extensions depend on the compression setting, so the Shell reads them from here instead
        /// of guessing.
        /// </summary>
        private static void WriteBuildFiles(string output)
        {
            string buildDir = Path.Combine(output, "Build");
            string[] files = Directory.GetFiles(buildDir).Select(p => Path.GetFileName(p)).OrderBy(f => f, StringComparer.Ordinal).ToArray();

            var result = new BuildFiles
            {
                loader = Find(files, f => f.EndsWith(".loader.js", StringComparison.Ordinal)),
                data = Find(files, f => f.Contains(".data")),
                framework = Find(files, f => f.Contains(".framework.js")),
                wasm = Find(files, f => f.Contains(".wasm")),
            };

            long total = files.Sum(f => new FileInfo(Path.Combine(buildDir, f)).Length);
            foreach (string f in files)
            {
                Debug.Log("Build file " + f + ": " + new FileInfo(Path.Combine(buildDir, f)).Length + " bytes");
            }
            Debug.Log("Build total: " + total + " bytes in Build/");

            File.WriteAllText(Path.Combine(output, "build.json"), JsonUtility.ToJson(result, true) + "\n");
        }

        private static string Find(string[] files, Func<string, bool> predicate)
        {
            string match = files.FirstOrDefault(predicate);
            if (match == null) throw new BuildFailedException("The build has no expected file; found: " + string.Join(", ", files));
            return "Build/" + match;
        }

        /// <summary>The Shell hosts the loader, so the template page and its assets are not needed.</summary>
        private static void RemoveUnusedTemplateOutput(string output)
        {
            string index = Path.Combine(output, "index.html");
            if (File.Exists(index)) File.Delete(index);
            string templateData = Path.Combine(output, "TemplateData");
            if (Directory.Exists(templateData)) Directory.Delete(templateData, true);
        }
    }
}
