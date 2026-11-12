using System.Collections.Generic;
using System.IO;
using System.Linq;
using Buried.Interop;
using NUnit.Framework;

namespace Buried.Tests
{
    /// <summary>
    /// Property E2: every bridge message parses on the Player side. Every file under valid/ and
    /// generated/ is accepted by BridgeParser, and BridgeWriter writes it back as an equal JSON tree
    /// (so the Player-to-Shell writer is checked against what Ajv accepts); every file under invalid/
    /// is refused with BridgeValidationException.
    /// </summary>
    public class BridgeConformanceTests
    {
        private static string[] Files(string kind)
        {
            string folder = Path.Combine(TestPaths.FixturesRoot, kind);
            Assert.IsTrue(Directory.Exists(folder), "missing fixtures folder " + folder
                          + (kind == "generated" ? " (run `npm --prefix web run gen:bridge-samples`)" : ""));
            return Directory.GetFiles(folder, "*.json", SearchOption.AllDirectories).OrderBy(f => f, System.StringComparer.Ordinal).ToArray();
        }

        private static void AssertRoundTrip(string file)
        {
            string text = File.ReadAllText(file);
            ParsedMessage message;
            try
            {
                message = BridgeParser.Parse(text);
            }
            catch (BridgeValidationException e)
            {
                Assert.Fail(file + " should be accepted: " + e.Message);
                return;
            }

            string written = BridgeWriter.Write(message);
            Assert.IsTrue(
                JsonCompare.Equal(JsonCompare.Read(text), JsonCompare.Read(written)),
                file + " does not round-trip.\nfixture: " + text + "\nwritten: " + written);
        }

        [Test]
        public void ValidFixturesParseAndRoundTrip()
        {
            string[] files = Files("valid");
            Assert.Greater(files.Length, 0);
            foreach (string file in files) AssertRoundTrip(file);
        }

        [Test]
        public void GeneratedFixturesParseAndRoundTrip()
        {
            string[] files = Files("generated");
            Assert.Greater(files.Length, 0);
            foreach (string file in files) AssertRoundTrip(file);
        }

        [Test]
        public void InvalidFixturesAreRefused()
        {
            string[] files = Files("invalid");
            Assert.Greater(files.Length, 0);
            foreach (string file in files)
            {
                string text = File.ReadAllText(file);
                Assert.Throws<BridgeValidationException>(() => BridgeParser.Parse(text), file + " should be refused");
            }
        }

        [Test]
        public void EveryMessageTypeHasValidAndGeneratedFixtures()
        {
            IEnumerable<string> types = BridgeMessageTypes.ShellToPlayer.Concat(BridgeMessageTypes.PlayerToShell);
            foreach (string type in types)
            {
                string directory = type.Replace('/', '_');
                foreach (string kind in new[] { "valid", "generated" })
                {
                    string folder = Path.Combine(TestPaths.FixturesRoot, kind, directory);
                    Assert.IsTrue(Directory.Exists(folder) && Directory.GetFiles(folder, "*.json").Length > 0,
                        "no " + kind + " fixture for " + type);
                }
            }
        }

        [Test]
        public void EveryValidFixtureIsFiledUnderItsOwnMessageType()
        {
            foreach (string kind in new[] { "valid", "generated" })
            {
                foreach (string file in Files(kind))
                {
                    ParsedMessage message = BridgeParser.Parse(File.ReadAllText(file));
                    string directory = Path.GetFileName(Path.GetDirectoryName(file));
                    Assert.AreEqual(message.type.Replace('/', '_'), directory, file);
                }
            }
        }
    }
}
