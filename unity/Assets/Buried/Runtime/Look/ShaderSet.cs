using System;
using UnityEngine;

namespace Buried.Look
{
    /// <summary>
    /// The shaders the Player uses, stored as references in the Bootstrap scene by Buried.Editor.Setup
    /// so the build includes them without Shader.Find.
    /// </summary>
    [Serializable]
    public sealed class ShaderSet
    {
        public Shader ghost;
        public Shader drape;
        public Shader marker;
        public Shader sky;
        public Shader present;
        public Shader edge;

        public bool Complete
        {
            get { return ghost != null && drape != null && marker != null && sky != null && present != null && edge != null; }
        }
    }
}
