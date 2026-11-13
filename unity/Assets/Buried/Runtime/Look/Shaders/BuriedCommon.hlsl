#ifndef BURIED_COMMON_INCLUDED
#define BURIED_COMMON_INCLUDED

// Set globally by SceneController when scene/init arrives. The colours are already linear.
float4 _BuriedFogColor;    // the `fog` colour
float _BuriedFogDensity;

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
