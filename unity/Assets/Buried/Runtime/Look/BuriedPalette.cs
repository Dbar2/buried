using UnityEngine;

namespace Buried.Look
{
    /// <summary>
    /// The eight palette tokens. The asset (Palette.asset) is written by Buried.Editor.Setup from
    /// web/src/styles/tokens.css, and an EditMode test compares the two. No colour in the Player is
    /// written as a literal anywhere else.
    /// </summary>
    public sealed class BuriedPalette : ScriptableObject
    {
        public static readonly string[] TokenNames =
            { "night", "fog", "present", "ink", "lantern", "water", "text", "muted" };

        public Color32 night;
        public Color32 fog;
        public Color32 present;
        public Color32 ink;
        public Color32 lantern;
        public Color32 water;
        public Color32 text;
        public Color32 muted;

        public Color32 Get(string token)
        {
            switch (token)
            {
                case "night": return night;
                case "fog": return fog;
                case "present": return present;
                case "ink": return ink;
                case "lantern": return lantern;
                case "water": return water;
                case "text": return text;
                case "muted": return muted;
                default: throw new System.ArgumentException("unknown palette token " + token);
            }
        }

        public void Set(string token, Color32 value)
        {
            switch (token)
            {
                case "night": night = value; break;
                case "fog": fog = value; break;
                case "present": present = value; break;
                case "ink": ink = value; break;
                case "lantern": lantern = value; break;
                case "water": water = value; break;
                case "text": text = value; break;
                case "muted": muted = value; break;
                default: throw new System.ArgumentException("unknown palette token " + token);
            }
        }
    }
}
