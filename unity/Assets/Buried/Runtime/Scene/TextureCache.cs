using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;

namespace Buried.Scene
{
    /// <summary>
    /// Downloads drape images and decodes them to sRGB RGBA32 textures with a mip chain. Only the URLs
    /// the Shell sends are ever loaded; the Player never reads a file under data/ by itself.
    /// </summary>
    public sealed class TextureCache
    {
        private readonly Dictionary<string, Texture2D> _cache = new Dictionary<string, Texture2D>();

        /// <summary>
        /// When set, the bytes of an image come from here (null: not here, ask the network). For the editor, which has
        /// no page to download from: `Buried.Editor.Still.Render` reads the tile from data/tiles. Never set in a build.
        /// </summary>
        public static Func<string, byte[]> BytesOverride;

        /// <summary>Calls <paramref name="done"/> with the texture, or with null and a reason.</summary>
        public IEnumerator Load(string url, Action<Texture2D, string> done)
        {
            Texture2D cached;
            if (_cache.TryGetValue(url, out cached) && cached != null)
            {
                done(cached, null);
                yield break;
            }

            byte[] given = BytesOverride == null ? null : BytesOverride(url);
            if (given != null)
            {
                Decode(url, given, done);
                yield break;
            }

            using (UnityWebRequest request = UnityWebRequest.Get(ResolveUrl(url)))
            {
                yield return request.SendWebRequest();
                if (request.result != UnityWebRequest.Result.Success)
                {
                    done(null, request.error);
                    yield break;
                }

                Decode(url, request.downloadHandler.data, done);
            }
        }

        private void Decode(string url, byte[] bytes, Action<Texture2D, string> done)
        {
            var texture = new Texture2D(2, 2, TextureFormat.RGBA32, true, false);
            if (!texture.LoadImage(bytes, false))
            {
                SceneObjects.Destroy(texture);
                done(null, "the image could not be decoded");
                return;
            }

            texture.wrapMode = TextureWrapMode.Clamp;
            texture.filterMode = texture.mipmapCount > 1 ? FilterMode.Trilinear : FilterMode.Bilinear;
            texture.anisoLevel = 4;
            texture.Apply(true, true);
            _cache[url] = texture;
            done(texture, null);
        }

        public void Clear()
        {
            foreach (Texture2D texture in _cache.Values)
            {
                if (texture != null) UnityEngine.Object.Destroy(texture);
            }
            _cache.Clear();
        }

        /// <summary>A root-relative URL from the Shell, made absolute against the page that hosts the Player.</summary>
        public static string ResolveUrl(string url)
        {
            if (url.StartsWith("http://", StringComparison.Ordinal) || url.StartsWith("https://", StringComparison.Ordinal))
            {
                return url;
            }
            string page = Application.absoluteURL;
            if (!string.IsNullOrEmpty(page))
            {
                try
                {
                    return new Uri(new Uri(page), url).AbsoluteUri;
                }
                catch (UriFormatException)
                {
                    // Fall through and let the request report the problem.
                }
            }
            return url;
        }
    }
}
