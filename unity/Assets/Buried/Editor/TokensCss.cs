using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using UnityEngine;

namespace Buried.Editor
{
    /// <summary>Reads the palette tokens from web/src/styles/tokens.css, the single source of the colours.</summary>
    public static class TokensCss
    {
        public static string DefaultPath
        {
            get
            {
                return Path.GetFullPath(
                    Path.Combine(Application.dataPath, "..", "..", "web", "src", "styles", "tokens.css"));
            }
        }

        /// <summary>Every "--name: #RRGGBB;" declaration, by name.</summary>
        public static Dictionary<string, Color32> Parse(string css)
        {
            var result = new Dictionary<string, Color32>();
            foreach (Match m in Regex.Matches(css, @"--([a-z0-9-]+)\s*:\s*#([0-9a-fA-F]{6})\s*;"))
            {
                string hex = m.Groups[2].Value;
                byte r = Convert.ToByte(hex.Substring(0, 2), 16);
                byte g = Convert.ToByte(hex.Substring(2, 2), 16);
                byte b = Convert.ToByte(hex.Substring(4, 2), 16);
                result[m.Groups[1].Value] = new Color32(r, g, b, 255);
            }
            return result;
        }
    }
}
