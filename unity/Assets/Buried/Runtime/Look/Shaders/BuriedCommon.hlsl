#ifndef BURIED_COMMON_INCLUDED
#define BURIED_COMMON_INCLUDED

// Set globally by SceneController when scene/init arrives. The colours are already linear.
float4 _BuriedFogColor;    // the `haze` colour
float _BuriedFogDensity;

// The one lamp: the unit direction from a surface toward it (xyz). Set by SceneController from LookSettings.
float4 _BuriedLampDir;

// The lit map sheet's one light pool: x and z of its centre in world space, its radius in metres.
float4 _BuriedLightPool;

// The Lantern's lens (session 028). x, y: its centre in fragment pixels (the units of SV_POSITION), z: its
// radius in pixels, w: 1 while the Lantern is on. A material's _LensMode says how it meets the lens:
// 0 draws everywhere, 1 only inside the lens, 2 only outside it.
//
// The clip is compiled only into the variant a material uses while the lens is on (_BURIED_LENS, set with
// the mode by LensMaterial.SetMode). A shader that can discard costs a tile-based GPU its hidden-surface
// removal, which the opaque present buildings need, so with the lens off no shader may contain it.
float4 _BuriedLens;

// "Raise the past" (bridge 0.8.0, RaiseSchedule.cs says the same in C#): a ghost material with _RaiseOn 1 reads its
// feature's centre from TEXCOORD1 (MeshData.uvs2) and stands up after a delay that grows with that point's distance from
// the first find's. `raise` is the material's _RaiseParams: x, y: the first find's footprint centre on the ground (scene x, z),
// z: seconds since the raise started (negative while the era is held down), w: the distance of the farthest ghost
// from that centre (m). The constants below are RaiseSchedule.FirstStartS, LastStartS and RiseS.
#define BURIED_RAISE_FIRST 0.3
#define BURIED_RAISE_LAST 1.5
#define BURIED_RAISE_S 0.7

// A ghost's progress (0 to 1) in the raise: RaiseSchedule.StartDelay and GhostProgress.
float BuriedRaiseProgress(float2 centre, float4 raise)
{
    float farthest = raise.w;
    float delay = farthest <= 1e-4 ? BURIED_RAISE_FIRST
        : BURIED_RAISE_FIRST + (BURIED_RAISE_LAST - BURIED_RAISE_FIRST) * saturate(distance(centre, raise.xy) / farthest);
    return saturate((raise.z - delay) / BURIED_RAISE_S);
}

float BuriedSmooth(float t)
{
    t = saturate(t);
    return t * t * (3.0 - 2.0 * t);
}

void BuriedLensClip(float4 positionCS, half mode)
{
#if defined(_BURIED_LENS)
    if (_BuriedLens.w < 0.5 || mode < 0.5) return;
    float2 d = positionCS.xy - _BuriedLens.xy;
    bool inside = dot(d, d) < _BuriedLens.z * _BuriedLens.z;
    if (mode < 1.5 ? !inside : inside) discard;
#endif
}

// Exponential distance fog: the share of the surface colour that survives at this point.
float BuriedTransmission(float3 positionWS)
{
    return exp(-_BuriedFogDensity * distance(_WorldSpaceCameraPos, positionWS));
}

// Fogs a colour toward the `fog` colour, which is also the colour of the ground and of the sky at
// the horizon, so distant buildings dissolve into it before they reach the sky.
float3 BuriedApplyFog(float3 rgb, float transmission)
{
    return lerp(_BuriedFogColor.rgb, rgb, saturate(transmission));
}

#endif
