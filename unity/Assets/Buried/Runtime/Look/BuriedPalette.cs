using UnityEngine;

namespace Buried.Look
{
    /// <summary>
    /// The eleven palette tokens of design.md "Palette tokens". The asset (Palette.asset) is written by Buried.Editor.Setup
    /// from web/src/styles/tokens.css, and an EditMode test compares the two. No colour in the Player is written as a
    /// literal anywhere else. The names are the CSS names without the dashes (`parchment-dim` is <see cref="parchmentDim"/>).
    ///
    /// The old names moved on 2026-11 (spec 06 W1): night is soot, fog is haze, present is block, the old pale ink and
    /// text are parchment, muted is parchment-dim, and `ink` now means the dark line colour.
    /// </summary>
    public sealed class BuriedPalette : ScriptableObject
    {
        public static readonly string[] TokenNames =
        {
            "soot", "haze", "block", "parchment", "parchment-dim", "ink", "ink-soft", "rule", "copper", "lantern", "water",
        };

        /// <summary>The table, the sky, the page background.</summary>
        public Color32 soot;
        /// <summary>Ground fog and distance fog.</summary>
        public Color32 haze;
        /// <summary>Today's buildings and their plinths.</summary>
        public Color32 block;
        /// <summary>The sheet, and the ghosts' fill.</summary>
        public Color32 parchment;
        public Color32 parchmentDim;
        /// <summary>Lines on parchment: ghost edges, storey lines, hatching.</summary>
        public Color32 ink;
        public Color32 inkSoft;
        public Color32 rule;
        /// <summary>The ghosts' shaded faces.</summary>
        public Color32 copper;
        /// <summary>The selected find, the pinned lot, and the lamp's warmth.</summary>
        public Color32 lantern;
        /// <summary>Documented water.</summary>
        public Color32 water;

        public Color32 Get(string token)
        {
            switch (token)
            {
                case "soot": return soot;
                case "haze": return haze;
                case "block": return block;
                case "parchment": return parchment;
                case "parchment-dim": return parchmentDim;
                case "ink": return ink;
                case "ink-soft": return inkSoft;
                case "rule": return rule;
                case "copper": return copper;
                case "lantern": return lantern;
                case "water": return water;
                default: throw new System.ArgumentException("unknown palette token " + token);
            }
        }

        public void Set(string token, Color32 value)
        {
            switch (token)
            {
                case "soot": soot = value; break;
                case "haze": haze = value; break;
                case "block": block = value; break;
                case "parchment": parchment = value; break;
                case "parchment-dim": parchmentDim = value; break;
                case "ink": ink = value; break;
                case "ink-soft": inkSoft = value; break;
                case "rule": rule = value; break;
                case "copper": copper = value; break;
                case "lantern": lantern = value; break;
                case "water": water = value; break;
                default: throw new System.ArgumentException("unknown palette token " + token);
            }
        }
    }
}
