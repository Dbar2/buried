// Thin lines on screen: the outline of a building (top ring, base ring, vertical corners, and one
// ring per recorded storey). EdgeMeshBuilder emits one quad per segment. Each vertex carries its own
// end of the segment in the position, the other end in TANGENT.xyz, the side (+1 or -1) in
// TANGENT.w, the distance along the ring in uv0.x (for the dashes) and which end it is in uv0.y
// (-1 start, +1 end).
// The quad is expanded in clip space to the line width plus a narrow glow on each side, so the
// width is in screen pixels whatever the distance (requirements 20.4 and 26.4). The glow is at most
// _GlowPx pixels wide. Nothing here reads the time.
//
// Dashes (the estimated class): with _DashPeriod above 0 the line is drawn in dashes. The dash
// coordinate is the distance along the ring plus the height of the vertex, so a vertical corner
// dashes too. The period is the larger of _DashPeriod metres and _DashPeriodPx pixels at the
// vertex's distance, so the pattern reads at any zoom. Each dash is _DashOn of its period.
Shader "Buried/Edge"
{
    Properties
    {
        _Color ("Colour", Color) = (1, 1, 1, 1)
        _Alpha ("Alpha", Range(0, 1)) = 1
        _Emission ("Emission", Range(0, 4)) = 1.2
        _WidthPx ("Width (CSS px)", Float) = 1.5
        _GlowPx ("Glow each side (CSS px)", Float) = 1
        _GlowAlpha ("Glow alpha", Range(0, 1)) = 0.35
        _GlowColor ("Glow colour", Color) = (0, 0, 0, 1)
        _GlowMix ("Glow takes its own colour (0 or 1)", Range(0, 1)) = 0
        _PixelScale ("Device px per CSS px", Float) = 1
        _Rise ("Vertical scale about y = 0", Range(0, 1)) = 1
        _DashPeriod ("Dash period, least (m); 0 is a solid line", Float) = 0
        _DashPeriodPx ("Dash period, least (CSS px)", Float) = 11
        _DashOn ("Dash share of its period", Range(0.05, 0.95)) = 0.55
        [HideInInspector] _LensMode ("Lantern lens: 0 everywhere, 1 inside, 2 outside", Float) = 0
        [HideInInspector] _ZTest ("Z test", Float) = 4
        _Fogged ("Distance fog applies (1) or not (0)", Range(0, 1)) = 1
    }
    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Transparent+10" "RenderPipeline" = "UniversalPipeline" }

        Pass
        {
            Name "BuriedEdge"
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            ZTest [_ZTest]
            Cull Off
            Offset -1, -1

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_local_fragment _ _BURIED_LENS
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "BuriedCommon.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _Color;
                half _Alpha;
                half _Emission;
                float _WidthPx;
                float _GlowPx;
                half _GlowAlpha;
                half4 _GlowColor;
                half _GlowMix;
                float _PixelScale;
                float _Rise;
                float _DashPeriod;
                float _DashPeriodPx;
                half _DashOn;
                half _Fogged;
                half _LensMode;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float4 other : TANGENT;
                float2 uv : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float across : TEXCOORD0;
                float transmission : TEXCOORD1;
                float dashPhase : TEXCOORD2;
            };

            Varyings vert(Attributes input)
            {
                Varyings output;
                float3 hereOS = input.positionOS.xyz;
                float3 thereOS = input.other.xyz;
                float dashCoordinate = input.uv.x + hereOS.y; // before the rise: a corner dashes as it grows
                hereOS.y *= _Rise; // ghosts rise from the ground (requirement 10.5); 1 for everything else
                thereOS.y *= _Rise;
                float3 here = TransformObjectToWorld(hereOS);
                float3 there = TransformObjectToWorld(thereOS);
                float4 clipHere = TransformWorldToHClip(here);
                float4 clipThere = TransformWorldToHClip(there);

                float2 sHere = clipHere.xy / clipHere.w * 0.5 * _ScreenParams.xy;
                float2 sThere = clipThere.xy / clipThere.w * 0.5 * _ScreenParams.xy;
                float2 toOther = sThere - sHere;
                float len = length(toOther);
                float2 dir = len > 1e-4 ? toOther / len : float2(1.0, 0.0);
                float endSign = input.uv.y;
                if (endSign > 0.0) dir = -dir; // dir now always runs from the start to the end of the segment
                float2 normal = float2(-dir.y, dir.x);

                float core = 0.5 * _WidthPx * _PixelScale;
                float halfWidth = core + _GlowPx * _PixelScale;
                float side = input.other.w;
                float2 offsetPx = normal * (side * halfWidth) + dir * (endSign * halfWidth);

                clipHere.xy += offsetPx * 2.0 / _ScreenParams.xy * clipHere.w;
                output.positionCS = clipHere;
                output.across = side * halfWidth;
                output.transmission = BuriedTransmission(here);

                // Metres per device pixel at this vertex, from the projection's vertical scale.
                float tanHalfFov = 1.0 / max(abs(UNITY_MATRIX_P._m11), 1e-4);
                float metresPerPixel = distance(_WorldSpaceCameraPos, here) * 2.0 * tanHalfFov / _ScreenParams.y;
                float period = max(_DashPeriod, _DashPeriodPx * _PixelScale * metresPerPixel);
                output.dashPhase = dashCoordinate / max(period, 1e-3);
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                BuriedLensClip(input.positionCS, _LensMode);
                if (_DashPeriod > 0.0 && frac(input.dashPhase) > _DashOn) discard;

                float core = 0.5 * _WidthPx * _PixelScale;
                float a = abs(input.across);
                float coreAlpha = saturate(core - a + 0.5);
                float glowAlpha = (1.0 - saturate((a - core) / max(_GlowPx * _PixelScale, 1e-3))) * _GlowAlpha;
                // With its own glow colour the ring is a flat casing, soft only at its outer pixel, so a
                // 1 to 2 px ring stays visible instead of fading away across its width.
                float casing = saturate(core + _GlowPx * _PixelScale - a + 0.5) * _GlowAlpha;
                glowAlpha = lerp(glowAlpha, casing, step(0.5, _GlowMix));
                float alpha = max(coreAlpha, glowAlpha) * _Alpha;
                half3 rgb = _Color.rgb * _Emission;
                // The glow ring can take its own colour (_GlowMix 1): a ghost's `night` casing keeps its
                // `ink` line readable over a pale draped plate. Nothing else sets it, so 0 is the old look.
                float inGlow = step(core, a) * _GlowMix;
                rgb = lerp(rgb, _GlowColor.rgb, inGlow);
                rgb = lerp(rgb, BuriedApplyFog(rgb, input.transmission), _Fogged);
                return half4(rgb, alpha);
            }
            ENDHLSL
        }
    }
}
