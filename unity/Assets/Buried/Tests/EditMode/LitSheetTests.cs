using System.Collections.Generic;
using Buried.Editor;
using Buried.Geo;
using Buried.Interop;
using Buried.Look;
using Buried.Scene;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Buried.Tests
{
    /// <summary>
    /// Session 023, item 3: the lit map sheet. The shader applies the colours and the floor tested here;
    /// the browser test (web/e2e/art.spec.ts) measures the same contrast on the rendered canvas.
    /// </summary>
    public class LitSheetTests
    {
        private BuriedPalette _palette;

        [SetUp]
        public void SetUp()
        {
            _palette = AssetDatabase.LoadAssetAtPath<BuriedPalette>(Setup.PalettePath);
            Assert.IsNotNull(_palette, "Run `tools/unity.sh exec Buried.Editor.Setup.Run` first.");
        }

        [Test]
        public void TheLineWorkKeepsFourAndAHalfToOneAgainstThePaperEvenFarFromTheLight()
        {
            // Paper is `parchment`, line work is `ink`; the dimmest light a point on the sheet gets is the floor.
            float atFloor = DrapeTone.Contrast(_palette.parchment, _palette.ink, LookSettings.LightFloor);
            float atPool = DrapeTone.Contrast(_palette.parchment, _palette.ink, 1f);
            Assert.GreaterOrEqual(atFloor, 4.5f, "line work against paper at the floor light");
            Assert.Greater(atPool, atFloor, "the pool is where the sheet reads best");
        }

        [Test]
        public void TheLandingSheetIsDimmerThanTheRaisedSheetButTheLineWorkStillReadsAtFourAndAHalfToOne()
        {
            Assert.Less(LookSettings.LandingSheetGain, 1f, "Raise brightens the sheet");
            float dimmest = LookSettings.LightFloor * LookSettings.LandingSheetGain;
            Assert.GreaterOrEqual(DrapeTone.Contrast(_palette.parchment, _palette.ink, dimmest), 4.5f, "the dim landing sheet at the floor light");
        }

        [Test]
        public void TheContrastMeasureIsTheWcagRatio()
        {
            Assert.AreEqual(21f, DrapeTone.Contrast(new Color32(255, 255, 255, 255), new Color32(0, 0, 0, 255), 1f), 1e-3f);
            Assert.AreEqual(1f, DrapeTone.Contrast(new Color32(90, 90, 90, 255), new Color32(90, 90, 90, 255), 1f), 1e-6f);
            Assert.AreEqual(1f, DrapeTone.RelativeLuminance(new Color32(255, 255, 255, 255)), 1e-4f);
        }

        [Test]
        public void ThePaperIsWarmerThanTheLineWorkAndNeitherIsLantern()
        {
            Color paper = _palette.parchment;
            Assert.Greater(paper.r, paper.b, "paper is `parchment`, a warm cream");
            Assert.AreNotEqual((Color32)_palette.parchment, (Color32)_palette.lantern, "the sheet must not take the pinned lot's colour");
            Assert.Greater(LookSettings.TonePaperLuminance, LookSettings.ToneLineLuminance);
            Assert.Greater(LookSettings.LightFloor, 0f);
            Assert.Less(LookSettings.LightFloor, 1f);
            Assert.Less(LookSettings.LightPoolRadiusPinnedM, LookSettings.LightPoolRadiusM, "a pinned lot gets a tighter pool");
        }

        private static DrapeDto Drape(string kind)
        {
            return new DrapeDto
            {
                sourceId = "fip_v3_1911_229",
                url = "/data/tiles/fip_v3_1911_229.jpg",
                widthPx = 2,
                heightPx = 2,
                kind = kind,
                corners = new DrapeCornersDto
                {
                    topLeft = new[] { 632400.0, 4835100.0 },
                    topRight = new[] { 632500.0, 4835100.0 },
                    bottomRight = new[] { 632500.0, 4835000.0 },
                    bottomLeft = new[] { 632400.0, 4835000.0 },
                },
            };
        }

        [Test]
        public void ADrapeIsLitByDefaultWithAPaletteAndCanShowTheOriginalScan()
        {
            var shader = AssetDatabase.LoadAssetAtPath<Shader>("Assets/Buried/Runtime/Look/Shaders/Drape.shader");
            var holder = new GameObject("drape test");
            var texture = new Texture2D(2, 2);
            try
            {
                var frame = new ProjectFrame(632500.0, 4835000.0);
                DrapeLayer plate = DrapeLayer.Create(holder.transform, frame, Drape(null), texture, shader, 0, _palette);
                Assert.IsTrue(plate.IsLit, "lit by default");
                plate.SetLit(false);
                Assert.IsFalse(plate.IsLit, "view original scan");
                plate.SetLit(true);
                Assert.IsTrue(plate.IsLit);
                plate.Dispose();

                DrapeLayer unlit = DrapeLayer.Create(holder.transform, frame, Drape(null), texture, shader, 0);
                Assert.IsFalse(unlit.IsLit, "with no palette the drape is shown as it always was");
                unlit.Dispose();
            }
            finally
            {
                Object.DestroyImmediate(texture);
                Object.DestroyImmediate(holder);
            }
        }
    }
}
