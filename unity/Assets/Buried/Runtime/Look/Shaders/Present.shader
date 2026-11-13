// Today's buildings: matte `present` volumes lit by the sun only (cold light, no warm source), no
// texture, no windows (requirement 20.3). Opaque when fully drawn; the blend properties let a
// later depth transition fade the fill. Distance fog toward the fog colour.
Shader "Buried/Present"
{
    Properties
    {
        _Color ("Colour", Color) = (1, 1, 1, 1)
        _Ambient ("Leeward wall light", Range(0, 4)) = 1.5
        _SunGain ("Sun gain (sunward walls)", Range(0, 8)) = 4.5
        _RoofGain ("Roof gain (sky light)", Range(0, 4)) = 2.3
        _Alpha ("Alpha", Range(0, 1)) = 1
        [HideInInspector] _SrcBlend ("Src blend", Float) = 1
        [HideInInspector] _DstBlend ("Dst blend", Float) = 0
        [HideInInspector] _ZWrite ("Z write", Float) = 1
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry" "RenderPipeline" = "UniversalPipeline" }

        Pass
        {
            Name "BuriedPresent"
            Tags { "LightMode" = "UniversalForward" }
            Blend [_SrcBlend] [_DstBlend]
            ZWrite [_ZWrite]
            Cull Back

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "BuriedCommon.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _Color;
                half _Ambient;
                half _SunGain;
                half _RoofGain;
                half _Alpha;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 normalWS : TEXCOORD0;
                float transmission : TEXCOORD1;
            };

            Varyings vert(Attributes input)
            {
                Varyings output;
                float3 positionWS = TransformObjectToWorld(input.positionOS.xyz);
                output.positionCS = TransformWorldToHClip(positionWS);
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                output.transmission = BuriedTransmission(positionWS);
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                half3 n = normalize(input.normalWS);
                Light sun = GetMainLight();
                half lit = saturate(dot(n, sun.direction));
                // Three steps of one cold grey: walls facing away from the low west sun, walls
                // facing it (the sun term), and roofs (the sky term), lightest. Same hue, no warm light.
                half3 rgb = _Color.rgb * (_Ambient + _RoofGain * saturate(n.y) + sun.color * (lit * _SunGain));
                rgb = BuriedApplyFog(rgb, input.transmission);
                return half4(rgb, _Alpha);
            }
            ENDHLSL
        }
    }
}
