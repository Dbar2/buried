// A source raster draped on the ground. Unlit and sampled as sRGB. The opacity is the drape's
// opacity times its mask (which removes what is outside the plate's map area and fades the drape
// into the ground at its boundary, requirements 8.8 and 8.9) times the distance fog's transmission.
// The mask is sampled at the fragment's world (x, z).
//
// Two displays (design.md "Draped rasters: the map sheet is lit"):
//  * _Lit 0, "view original scan": the untouched raster, no tint, no tone curve, no light.
//  * _Lit 1, the Explorer's default: a tone curve on the greyscale scan (lines stay dark, paper goes
//    to `ink`; _Recolour 0 leaves an aerial's colours alone), multiplied by one soft light pool
//    (_BuriedLightPool: centre x, z and radius) that falls off to _LightFloor. No sharpening, no
//    other stylising.
Shader "Buried/Drape"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
        _MaskTex ("Mask (R fade, G coverage)", 2D) = "black" {}
        _MaskRect ("Mask origin x, z and 1 / size x, z", Vector) = (0, 0, 1, 1)
        _Opacity ("Opacity", Range(0, 1)) = 1
        _UseCoverage ("Use the coverage channel (Show Evidence)", Range(0, 1)) = 0
        _Lit ("Lit display (1) or the untouched scan (0)", Range(0, 1)) = 1
        _Recolour ("Tone the scan toward paper (plates 1, aerials 0)", Range(0, 1)) = 1
        _PaperColor ("Paper (ink)", Color) = (0.91, 0.87, 0.78, 1)
        _LineColor ("Line work (night)", Color) = (0.05, 0.06, 0.07, 1)
        _ToneLine ("Scan luminance that is line colour", Float) = 0.02
        _TonePaper ("Scan luminance that is paper", Float) = 0.6
        _LightFloor ("Light far from the pool", Range(0, 1)) = 0.38
        [HideInInspector] _LensMode ("Lantern lens: 0 everywhere, 1 inside, 2 outside", Float) = 0
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
            #pragma multi_compile_local_fragment _ _BURIED_LENS
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
                half _Lit;
                half _Recolour;
                half4 _PaperColor;
                half4 _LineColor;
                float _ToneLine;
                float _TonePaper;
                half _LightFloor;
                half _LensMode;
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
                BuriedLensClip(input.positionCS, _LensMode);
                half4 c = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, input.uv);
                half3 rgb = c.rgb;
                if (_Lit > 0.5)
                {
                    // The tone curve: the scan's luminance, smoothly, from line work to paper.
                    half luminance = dot(c.rgb, half3(0.2126, 0.7152, 0.0722));
                    half t = smoothstep(_ToneLine, _TonePaper, luminance);
                    half3 toned = lerp(_LineColor.rgb, _PaperColor.rgb, t);
                    rgb = lerp(rgb, toned, _Recolour);

                    // One light pool, brightest at its centre, falling off to the floor.
                    float2 fromPool = input.positionWS.xz - _BuriedLightPool.xy;
                    float radius = max(_BuriedLightPool.z, 1.0);
                    half pool = exp(-dot(fromPool, fromPool) / (radius * radius));
                    rgb *= lerp(_LightFloor, 1.0, pool);
                }
                float2 maskUv = (input.positionWS.xz - _MaskRect.xy) * _MaskRect.zw;
                half2 m = SAMPLE_TEXTURE2D(_MaskTex, sampler_MaskTex, maskUv).rg;
                half mask = lerp(m.r, m.g, _UseCoverage);
                half fog = lerp(saturate(BuriedTransmission(input.positionWS)), 1.0, _UseCoverage);
                if (_Lit > 0.5)
                {
                    // The lantern lights the sheet through the fog: under the pool the distance fog hardly
                    // thins it, and away from the pool the sheet falls off into the fog.
                    float2 fromLight = input.positionWS.xz - _BuriedLightPool.xy;
                    float lightRadius = max(_BuriedLightPool.z, 1.0);
                    half inPool = exp(-dot(fromLight, fromLight) / (lightRadius * lightRadius));
                    fog = lerp(fog, 1.0, inPool * 0.85);
                }
                return half4(rgb, _Opacity * mask * fog);
            }
            ENDHLSL
        }
    }
}
