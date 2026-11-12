using System.Collections.Generic;
using System.IO;
using Buried.Editor;
using Buried.Look;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>Requirement 20.1: the Player's palette asset equals the CSS tokens in web/src/styles/tokens.css.</summary>
    public class PaletteTests
    {
        [Test]
        public void TheTokensFileDefinesAllEightColours()
        {
            Dictionary<string, Color32> tokens = TokensCss.Parse(File.ReadAllText(TokensCss.DefaultPath));
            foreach (string name in BuriedPalette.TokenNames)
            {
                Assert.IsTrue(tokens.ContainsKey(name), "tokens.css has no --" + name);
            }
        }

        [Test]
        public void ThePaletteAssetEqualsTheTokens()
        {
            Dictionary<string, Color32> tokens = TokensCss.Parse(File.ReadAllText(TokensCss.DefaultPath));
            var palette = AssetDatabase.LoadAssetAtPath<BuriedPalette>(Setup.PalettePath);
            Assert.IsNotNull(palette, "Run `tools/unity.sh exec Buried.Editor.Setup.Run` first.");
            foreach (string name in BuriedPalette.TokenNames)
            {
                Color32 expected = tokens[name];
                Color32 actual = palette.Get(name);
                Assert.AreEqual(
                    new[] { expected.r, expected.g, expected.b, expected.a },
                    new[] { actual.r, actual.g, actual.b, actual.a },
                    "palette token " + name);
            }
        }

        [Test]
        public void NoRuntimeSourceWritesAColourLiteral()
        {
            string runtime = Path.Combine(Application.dataPath, "Buried", "Runtime");
            foreach (string file in Directory.GetFiles(runtime, "*.cs", SearchOption.AllDirectories))
            {
                string text = File.ReadAllText(file);
                Assert.IsFalse(System.Text.RegularExpressions.Regex.IsMatch(text, "\"#[0-9a-fA-F]{6}\""), Path.GetFileName(file) + " has a hex colour literal");
            }
        }
    }
}
