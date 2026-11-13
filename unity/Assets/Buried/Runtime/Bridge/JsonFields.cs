using System;
using System.IO;
// Note: methods named String, Object, Boolean and Array exist below; use the keywords (string,
// object, bool) and System.Array in this file, never the type names.
using System.Linq;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Buried.Interop
{
    /// <summary>
    /// Typed, strict readers over Newtonsoft JToken. Every method throws BridgeValidationException
    /// with the path of the offending value. Used only by BridgeParser.
    /// </summary>
    internal static class JsonFields
    {
        // Valid EPSG:26917 ranges, the same as the "position" definition in evidence.schema.json.
        // Written in exponent form: these are range limits, not an origin.
        public const double MinEasting = 1.66e5;
        public const double MaxEasting = 8.34e5;
        public const double MinNorthing = 0.0;
        public const double MaxNorthing = 9.4e6;

        public static readonly Regex FeatureIdPattern =
            new Regex(@"^(bld|wtr|use)_[a-z0-9]+(_[a-z0-9]+)*_[0-9]{4}$", RegexOptions.CultureInvariant);

        public static readonly Regex SourceIdPattern =
            new Regex(@"^[a-z0-9]+(_[a-z0-9]+)*$", RegexOptions.CultureInvariant);

        public static readonly Regex EraIdPattern =
            new Regex(@"^[a-z0-9]+(_[a-z0-9]+)*$", RegexOptions.CultureInvariant);

        public static readonly Regex DrapeUrlPattern =
            new Regex(@"^/data/tiles/[a-z0-9_]+\.(jpg|png)$", RegexOptions.CultureInvariant);

        public static BridgeValidationException Fail(string path, string reason)
        {
            return new BridgeValidationException(path + ": " + reason);
        }

        public static JToken ReadJson(string text)
        {
            if (text == null) throw Fail("message", "is null");
            try
            {
                using (var stringReader = new StringReader(text))
                using (var reader = new JsonTextReader(stringReader))
                {
                    reader.DateParseHandling = DateParseHandling.None;
                    reader.FloatParseHandling = FloatParseHandling.Double;
                    var settings = new JsonLoadSettings
                    {
                        DuplicatePropertyNameHandling = DuplicatePropertyNameHandling.Error,
                        CommentHandling = CommentHandling.Ignore,
                    };
                    JToken token = JToken.ReadFrom(reader, settings);
                    while (reader.Read())
                    {
                        if (reader.TokenType != JsonToken.Comment)
                        {
                            throw Fail("message", "has content after the JSON value");
                        }
                    }
                    return token;
                }
            }
            catch (JsonException e)
            {
                throw Fail("message", "is not valid JSON (" + e.Message + ")");
            }
        }

        public static JObject Object(JToken token, string path)
        {
            var o = token as JObject;
            if (o == null) throw Fail(path, "must be an object");
            return o;
        }

        public static void Exactly(JObject o, string path, params string[] names)
        {
            foreach (string name in names)
            {
                if (o[name] == null) throw Fail(path, "is missing the property \"" + name + "\"");
            }
            foreach (JProperty p in o.Properties())
            {
                if (System.Array.IndexOf(names, p.Name) < 0)
                {
                    throw Fail(path, "has the property \"" + p.Name + "\", which the Bridge Schema does not define");
                }
            }
        }

        /// <summary>Like <see cref="Exactly"/>, but the properties in <paramref name="optional"/> may be absent.</summary>
        public static void ExactlyWithOptional(JObject o, string path, string[] required, string[] optional)
        {
            foreach (string name in required)
            {
                if (o[name] == null) throw Fail(path, "is missing the property \"" + name + "\"");
            }
            foreach (JProperty p in o.Properties())
            {
                if (System.Array.IndexOf(required, p.Name) < 0 && System.Array.IndexOf(optional, p.Name) < 0)
                {
                    throw Fail(path, "has the property \"" + p.Name + "\", which the Bridge Schema does not define");
                }
            }
        }

        public static JToken Get(JObject o, string name)
        {
            return o[name];
        }

        public static JObject ObjectAt(JObject o, string name, string path)
        {
            return Object(o[name], path + "." + name);
        }

        public static string String(JObject o, string name, string path, int minLength = 0, int maxLength = int.MaxValue)
        {
            JToken t = o[name];
            if (t == null || t.Type != JTokenType.String) throw Fail(path + "." + name, "must be a string");
            string s = (string)((JValue)t).Value;
            if (s.Length < minLength) throw Fail(path + "." + name, "is shorter than " + minLength);
            if (s.Length > maxLength) throw Fail(path + "." + name, "is longer than " + maxLength);
            return s;
        }

        public static string NullableString(JObject o, string name, string path)
        {
            JToken t = o[name];
            if (t != null && t.Type == JTokenType.Null) return null;
            return String(o, name, path);
        }

        public static string Matching(JObject o, string name, string path, Regex pattern)
        {
            string s = String(o, name, path);
            if (!pattern.IsMatch(s)) throw Fail(path + "." + name, "\"" + s + "\" does not match " + pattern);
            return s;
        }

        public static string OneOf(JObject o, string name, string path, params string[] allowed)
        {
            string s = String(o, name, path);
            if (System.Array.IndexOf(allowed, s) < 0)
            {
                throw Fail(path + "." + name, "\"" + s + "\" is not one of " + string.Join(", ", allowed));
            }
            return s;
        }

        public static string Const(JObject o, string name, string path, string value)
        {
            string s = String(o, name, path);
            if (s != value) throw Fail(path + "." + name, "must be \"" + value + "\", got \"" + s + "\"");
            return s;
        }

        public static double NumberValue(JToken t, string path)
        {
            if (t == null || (t.Type != JTokenType.Integer && t.Type != JTokenType.Float))
            {
                throw Fail(path, "must be a number");
            }
            double v = t.Value<double>();
            if (double.IsNaN(v) || double.IsInfinity(v)) throw Fail(path, "must be a finite number");
            return v;
        }

        public static double Number(JObject o, string name, string path)
        {
            return NumberValue(o[name], path + "." + name);
        }

        public static double NumberIn(
            JObject o, string name, string path, double min, double max, bool exclusiveMin = false)
        {
            double v = Number(o, name, path);
            if (exclusiveMin ? v <= min : v < min) throw Fail(path + "." + name, "is below the allowed minimum");
            if (v > max) throw Fail(path + "." + name, "is above the allowed maximum");
            return v;
        }

        public static double NumberExclusiveRange(JObject o, string name, string path, double min, double max)
        {
            double v = Number(o, name, path);
            if (v <= min || v >= max) throw Fail(path + "." + name, "is outside the allowed range");
            return v;
        }

        public static int IntegerIn(JObject o, string name, string path, int min, int max)
        {
            JToken t = o[name];
            string where = path + "." + name;
            double v = NumberValue(t, where);
            if (v != Math.Floor(v)) throw Fail(where, "must be an integer");
            if (v < min || v > max) throw Fail(where, "must be between " + min + " and " + max);
            return (int)v;
        }

        public static bool Boolean(JObject o, string name, string path)
        {
            JToken t = o[name];
            if (t == null || t.Type != JTokenType.Boolean) throw Fail(path + "." + name, "must be true or false");
            return t.Value<bool>();
        }

        public static JArray ArrayAt(JObject o, string name, string path, int minItems = 0, int maxItems = int.MaxValue)
        {
            return ArrayValue(o[name], path + "." + name, minItems, maxItems);
        }

        public static JArray ArrayValue(JToken t, string path, int minItems = 0, int maxItems = int.MaxValue)
        {
            var a = t as JArray;
            if (a == null) throw Fail(path, "must be an array");
            if (a.Count < minItems) throw Fail(path, "has fewer than " + minItems + " items");
            if (a.Count > maxItems) throw Fail(path, "has more than " + maxItems + " items");
            return a;
        }

        /// <summary>A position: exactly [easting, northing], inside the valid EPSG:26917 range.</summary>
        public static double[] Position(JToken t, string path)
        {
            JArray a = ArrayValue(t, path, 2, 2);
            double e = NumberValue(a[0], path + "[0]");
            double n = NumberValue(a[1], path + "[1]");
            if (e < MinEasting || e > MaxEasting) throw Fail(path + "[0]", "is not an EPSG:26917 easting");
            if (n < MinNorthing || n > MaxNorthing) throw Fail(path + "[1]", "is not an EPSG:26917 northing");
            return new[] { e, n };
        }

        public static double[] PositionAt(JObject o, string name, string path)
        {
            return Position(o[name], path + "." + name);
        }

        public static void RequireUnique(System.Collections.Generic.IEnumerable<string> values, string path, string what)
        {
            var seen = new System.Collections.Generic.HashSet<string>();
            foreach (string v in values)
            {
                if (!seen.Add(v)) throw Fail(path, "has the " + what + " \"" + v + "\" more than once");
            }
        }

        public static bool Same(double[] a, double[] b)
        {
            return a.Length == b.Length && a.Zip(b, (x, y) => x == y).All(same => same);
        }
    }
}
