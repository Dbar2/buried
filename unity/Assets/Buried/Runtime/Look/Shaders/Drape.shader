// A source raster draped on the ground. Unlit, sampled as sRGB, no tint, no fog colour, no tone
// mapping: only the opacity changes (design.md "Draped rasters"; requirement 20.5). The opacity is
// the drape's opacity times its mask (which removes what is outside the plate's map area and fades
// the drape into the ground at its boundary, requirements 8.8 and 8.9) times the distance fog's
// transmission. The mask is sampled at the fragment's world (x, z).
Shader "Buried/Drape"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
        _MaskTex ("Mask (R fade, G coverage)", 2D) = "black" {}
        _MaskRect ("Mask origin x, z and 1 / size x, z", Vector) = (0, 0, 1, 1)
        _Opacity ("Opacity", Range(0, 1)) = 1
        _UseCoverage ("Use the coverage channel (Show Evidence)", Range(0, 1)) = 0
    }
    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Transparent-100" "RenderPipeline" = "UniversalPipeline" }

        Pass
        {
            Name "BuriedDrape"
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            Cull Off

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "BuriedCommon.hlsl"

            TEXTURE2D(_MainTex);
            SAMPLER(sampler_MainTex);
            TEXTURE2D(_MaskTex);
            SAMPLER(sampler_MaskTex);

            CBUFFER_START(UnityPerMaterial)
                float4 _MainTex_ST;
                float4 _MaskRect;
                half _Opacity;
                half _UseCoverage;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 positionWS : TEXCOORD1;
            };

            Varyings vert(Attributes input)
            {
                Varyings output;
                output.positionWS = TransformObjectToWorld(input.positionOS.xyz);
                output.positionCS = TransformWorldToHClip(output.positionWS);
                output.uv = TRANSFORM_TEX(input.uv, _MainTex);
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                half4 c = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, input.uv);
                float2 maskUv = (input.positionWS.xz - _MaskRect.xy) * _MaskRect.zw;
                half2 m = SAMPLE_TEXTURE2D(_MaskTex, sampler_MaskTex, maskUv).rg;
                half mask = lerp(m.r, m.g, _UseCoverage);
                half fog = lerp(saturate(BuriedTransmission(input.positionWS)), 1.0, _UseCoverage);
                return half4(c.rgb, _Opacity * mask * fog);
            }
            ENDHLSL
        }
    }
}
