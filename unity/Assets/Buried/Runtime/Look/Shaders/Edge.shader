// Thin lines on screen: the outline of a building (top ring, base ring, vertical corners).
// EdgeMeshBuilder emits one quad per segment. Each vertex carries its own end of the segment in
// the position, the other end in TANGENT.xyz, the side (+1 or -1) in TANGENT.w, the distance along
// the ring in uv0.x (for the dashes of task group 4) and which end it is in uv0.y (-1 start, +1 end).
// The quad is expanded in clip space to the line width plus a narrow glow on each side, so the
// width is in screen pixels whatever the distance (requirements 20.4 and 26.4). The glow is at most
// _GlowPx pixels wide. Nothing here reads the time.
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
        _PixelScale ("Device px per CSS px", Float) = 1
    }
    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Transparent+10" "RenderPipeline" = "UniversalPipeline" }

        Pass
        {
            Name "BuriedEdge"
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            ZTest LEqual
            Cull Off
            Offset -1, -1

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "BuriedCommon.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _Color;
                half _Alpha;
                half _Emission;
                float _WidthPx;
                float _GlowPx;
                half _GlowAlpha;
                float _PixelScale;
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
            };

            Varyings vert(Attributes input)
            {
                Varyings output;
                float3 here = TransformObjectToWorld(input.positionOS.xyz);
                float3 there = TransformObjectToWorld(input.other.xyz);
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
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                float core = 0.5 * _WidthPx * _PixelScale;
                float a = abs(input.across);
                float coreAlpha = saturate(core - a + 0.5);
                float glowAlpha = (1.0 - saturate((a - core) / max(_GlowPx * _PixelScale, 1e-3))) * _GlowAlpha;
                float alpha = max(coreAlpha, glowAlpha) * _Alpha;
                half3 rgb = _Color.rgb * _Emission;
                rgb = BuriedApplyFog(rgb, input.transmission);
                return half4(rgb, alpha);
            }
            ENDHLSL
        }
    }
}
