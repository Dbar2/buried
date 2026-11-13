using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Buried.Interop;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace Buried.Tests
{
    /// <summary>
    /// Requirement 4.5: each DTO has one public field per property of its Bridge Schema definition,
    /// with the same name, the same required-ness and the same JSON type. Schema entries that are
    /// not objects with properties (the geometry oneOf, rings, envelopes) have no DTO to compare.
    /// </summary>
    public class BridgeSchemaReflectionTests
    {
        private JObject _defs;
        private Dictionary<string, Type> _dtoByDef;

        private static readonly Dictionary<string, string[]> OptionalProperties = new Dictionary<string, string[]>
        {
            { "drape", new[] { "clip", "kind" } },
            { "sceneFeature", new[] { "storeys" } },
            { "sceneLoadEraPayload", new[] { "held" } },
            { "sceneSetDrapeModePayload", new[] { "sourceId" } },
            { "sceneShowEvidencePayload", new[] { "drape" } },
        };

        [SetUp]
        public void Load()
        {
            _defs = (JObject)JObject.Parse(File.ReadAllText(TestPaths.BridgeSchema))["$defs"];
            _dtoByDef = typeof(SchemaDefAttribute).Assembly.GetTypes()
                .Where(t => t.GetCustomAttribute<SchemaDefAttribute>() != null)
                .ToDictionary(t => t.GetCustomAttribute<SchemaDefAttribute>().Name);
        }

        private static bool IsDtoCandidate(string name, JObject def)
        {
            if (name.EndsWith("Message", StringComparison.Ordinal)) return false;   // envelopes
            if (name.EndsWith("Geometry", StringComparison.Ordinal)) return false;  // GeometryDto covers these
            return def["properties"] != null && (string)def["type"] == "object";
        }

        [Test]
        public void EveryDtoHasASchemaDefinition()
        {
            foreach (KeyValuePair<string, Type> pair in _dtoByDef)
            {
                Assert.IsNotNull(_defs[pair.Key], pair.Value.Name + " names the schema definition \"" + pair.Key + "\", which does not exist");
            }
        }

        [Test]
        public void EverySchemaObjectDefinitionHasADto()
        {
            foreach (JProperty def in _defs.Properties())
            {
                if (!IsDtoCandidate(def.Name, (JObject)def.Value)) continue;
                Assert.IsTrue(_dtoByDef.ContainsKey(def.Name), "the schema definition \"" + def.Name + "\" has no DTO");
            }
        }

        [Test]
        public void DtoFieldsMatchSchemaPropertiesNamesRequirednessAndTypes()
        {
            foreach (KeyValuePair<string, Type> pair in _dtoByDef)
            {
                var def = (JObject)_defs[pair.Key];
                if (def["oneOf"] != null) continue; // geometry: a oneOf, compared by the parser tests

                var properties = (JObject)def["properties"];
                Assert.IsNotNull(properties, pair.Key + " has no properties");
                string[] schemaNames = properties.Properties().Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal).ToArray();
                string[] required = ((JArray)def["required"]).Select(r => (string)r).OrderBy(n => n, StringComparer.Ordinal).ToArray();
                FieldInfo[] fields = pair.Value.GetFields(BindingFlags.Public | BindingFlags.Instance);
                string[] fieldNames = fields.Select(f => f.Name).OrderBy(n => n, StringComparer.Ordinal).ToArray();

                Assert.AreEqual(schemaNames, fieldNames, pair.Value.Name + ": field names differ from the schema properties");
                // A DTO field cannot say "optional", so the schema's optional properties are listed here:
                // each is null (or 0 for storeys, whose schema minimum is 1) when the property is absent.
                string[] optional = OptionalProperties.ContainsKey(pair.Key) ? OptionalProperties[pair.Key] : new string[0];
                string[] expectedRequired = schemaNames.Where(n => !optional.Contains(n)).ToArray();
                Assert.AreEqual(expectedRequired, required, pair.Key + ": every property but the listed optional ones must be required");

                foreach (FieldInfo field in fields)
                {
                    Type expected = ExpectedClrType((JObject)properties[field.Name]);
                    Assert.AreEqual(expected, field.FieldType, pair.Value.Name + "." + field.Name + " has the wrong type");
                }
            }
        }

        [Test]
        public void EveryPayloadDefinitionBelongsToOneMessage()
        {
            string[] payloads = _defs.Properties().Select(p => p.Name).Where(n => n.EndsWith("Payload", StringComparison.Ordinal)).ToArray();
            Assert.AreEqual(BridgeMessageTypes.ShellToPlayer.Length + BridgeMessageTypes.PlayerToShell.Length, payloads.Length);
            foreach (string payload in payloads)
            {
                string messageDef = payload.Substring(0, payload.Length - "Payload".Length) + "Message";
                Assert.IsNotNull(_defs[messageDef], payload + " has no message envelope " + messageDef);
                Assert.AreEqual("#/$defs/" + payload, (string)_defs[messageDef]["properties"]["payload"]["$ref"]);
            }
        }

        private Type ExpectedClrType(JObject node)
        {
            JToken reference = node["$ref"];
            if (reference != null)
            {
                string target = (string)reference;
                string name = target.Substring(target.LastIndexOf('/') + 1);
                if (target.Contains("evidence.schema.json"))
                {
                    switch (name)
                    {
                        case "position": return typeof(double[]);
                        case "featureId":
                        case "sourceId": return typeof(string);
                        default: throw new AssertionException("unmapped evidence definition " + name);
                    }
                }

                var def = (JObject)_defs[name];
                Assert.IsNotNull(def, "dangling $ref " + target);
                // Both geometry unions are read into one DTO.
                if (name == "polygonalGeometry" || name == "polygonGeometry") return _dtoByDef["geometry"];
                if (_dtoByDef.ContainsKey(name)) return _dtoByDef[name];
                return ExpectedClrType(def);
            }

            if (node["const"] != null || node["enum"] != null) return typeof(string);

            JToken typeToken = node["type"];
            string type = typeToken is JArray
                ? string.Join("|", typeToken.Select(t => (string)t).OrderBy(t => t, StringComparer.Ordinal))
                : (string)typeToken;
            switch (type)
            {
                case "string":
                case "null|string": return typeof(string);
                case "number": return typeof(double);
                case "integer": return typeof(int);
                case "boolean": return typeof(bool);
                case "array":
                    if (node["prefixItems"] != null) return typeof(double[]);
                    Type item = ExpectedClrType((JObject)node["items"]);
                    if (item == typeof(double)) return typeof(double[]);
                    return typeof(List<>).MakeGenericType(item);
                default:
                    throw new AssertionException("unmapped schema type \"" + type + "\" in " + node.ToString(Newtonsoft.Json.Formatting.None));
            }
        }
    }
}
