#ifndef BURIED_COMMON_INCLUDED
#define BURIED_COMMON_INCLUDED

// Set globally by SceneController when scene/init arrives. The colours are already linear.
float4 _BuriedFogColor;    // the `fog` colour
float4 _BuriedNightColor;  // the `night` colour: what the haze becomes far away
float4 _BuriedFogRamp;     // x: transmission at or below which the haze is `night`; y: at or above which it is `fog`
float _BuriedFogDensity;

// Exponential distance fog: the share of the surface colour that survives at this point.
float BuriedTransmission(float3 positionWS)
{
    return exp(-_BuriedFogDensity * distance(_WorldSpaceCameraPos, positionWS));
}

// Fogs a colour. Near the block the haze is the `fog` colour; far away, where the coverage area
// dissolves, it darkens to `night`, the colour at the top of the sky, so the far ground meets the
// sky with no visible horizon line.
float3 BuriedApplyFog(float3 rgb, float transmission)
{
    float3 haze = lerp(_BuriedNightColor.rgb, _BuriedFogColor.rgb, smoothstep(_BuriedFogRamp.x, _BuriedFogRamp.y, transmission));
    return lerp(haze, rgb, saturate(transmission));
}

#endif
