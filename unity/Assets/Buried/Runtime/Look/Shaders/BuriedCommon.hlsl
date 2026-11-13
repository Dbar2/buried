#ifndef BURIED_COMMON_INCLUDED
#define BURIED_COMMON_INCLUDED

// Set globally by SceneController when scene/init arrives. The colours are already linear.
float4 _BuriedFogColor;    // the `fog` colour
float _BuriedFogDensity;

// The lit map sheet's one light pool: x and z of its centre in world space, its radius in metres.
float4 _BuriedLightPool;

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
