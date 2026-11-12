using System;

namespace Buried.Interop
{
    /// <summary>
    /// Names the entry under "$defs" in data/schema/bridge.schema.json that a DTO type mirrors.
    /// The reflection test compares each DTO's public fields with that entry's properties.
    /// DTO field names are the schema's property names, character for character (lower camel case),
    /// so a field can never drift from the schema without the test failing.
    /// </summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class SchemaDefAttribute : Attribute
    {
        public string Name { get; }

        public SchemaDefAttribute(string name)
        {
            Name = name;
        }
    }
}
