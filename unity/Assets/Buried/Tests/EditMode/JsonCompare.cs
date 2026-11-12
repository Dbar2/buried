using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Buried.Tests
{
    /// <summary>
    /// Tree comparison for JSON that treats 1 and 1.0 as equal (JToken.DeepEquals does not), compares
    /// numbers exactly as doubles, and ignores property order.
    /// </summary>
    public static class JsonCompare
    {
        public static JToken Read(string text)
        {
            using (var reader = new JsonTextReader(new StringReader(text)))
            {
                reader.DateParseHandling = DateParseHandling.None;
                reader.FloatParseHandling = FloatParseHandling.Double;
                return JToken.ReadFrom(reader);
            }
        }

        public static bool Equal(JToken a, JToken b)
        {
            if (IsNumber(a) && IsNumber(b)) return a.Value<double>() == b.Value<double>();
            if (a.Type != b.Type) return false;

            switch (a.Type)
            {
                case JTokenType.Object:
                    var oa = (JObject)a;
                    var ob = (JObject)b;
                    if (oa.Count != ob.Count) return false;
                    return oa.Properties().All(p => ob[p.Name] != null && Equal(p.Value, ob[p.Name]));
                case JTokenType.Array:
                    var aa = (JArray)a;
                    var ab = (JArray)b;
                    if (aa.Count != ab.Count) return false;
                    for (int i = 0; i < aa.Count; i++)
                    {
                        if (!Equal(aa[i], ab[i])) return false;
                    }
                    return true;
                default:
                    return JToken.DeepEquals(a, b);
            }
        }

        private static bool IsNumber(JToken t)
        {
            return t.Type == JTokenType.Integer || t.Type == JTokenType.Float;
        }
    }
}
